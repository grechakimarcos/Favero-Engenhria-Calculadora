'use strict';
window.App = window.App || {};

/**
 * @module Store
 * Global reactive state management with localStorage persistence.
 * Implements a lightweight Observer pattern.
 */
App.Store = (function () {
  const Config = App.Config;

  // ── Default State Factory ──────────────────────────────────────────────────
  function createDefaultState() {
    return {
      currentStep: 0,

      project: {
        nome: '',
        cliente: '',
        data: new Date().toISOString().split('T')[0],
        disciplina: 'eletrico',
        tipoEdificacao: 'casa',
        area: 200,
        horasManuais: '',
        revisao: 0,
        aprovacao: 0,
        complexidade: 1,
        tipoComercial: 'padrao',
        fatorRisco: 0,
        fatorUrgencia: 0,
        ajusteComercial: {
          desconto: 0,
          acrescimo: 0,
          valorFechado: null
        }
      },

      team: [
        { colaboradorId: 'lucas',    horas: 8 },
        { colaboradorId: 'adriel',   horas: 3 },
        { colaboradorId: 'reinaldo', horas: 1 },
      ],

      costs: {
        art: 0,
        outros: 0,
        margemLucro: 20,
      },

      // Master data — loaded from Supabase exclusively
      collaborators: [],
      indirectCosts: [],
      disciplinas: {},

      settings: {
        metaMensal: Config.META_MENSAL,
        impostoSimples: Config.IMPOSTO_SIMPLES,
        multiplicadorMinimo: Config.MULTIPLICADOR_MINIMO_CUSTO,
      },

      // Saved projects history
      history: [],
    };
  }

  // ── Internal State & Listeners ─────────────────────────────────────────────
  let _state = createDefaultState();
  let _listeners = [];

  // ── Persistence ────────────────────────────────────────────────────────────
  function _persist() {
    try {
      const snapshot = {
        // Master data (collaborators, indirectCosts, disciplinas) is managed by Supabase only
        settings: _state.settings,
      };
      localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('[Store] Persist failed:', e);
    }
  }

  function _load() {
    try {
      const raw = localStorage.getItem(Config.STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      
      // Settings only — master data (collaborators, indirectCosts, disciplinas)
      // are now loaded exclusively from Supabase after login.
      _state.settings = { ..._state.settings, ...(saved.settings || {}) };
      
      // History is loaded exclusively from the cloud
      _state.history = [];

      // ── Migration: remove legacy master data keys from localStorage ──────────
      // Old versions saved collaborators/indirectCosts in localStorage, which caused
      // duplication when the same data came from Supabase. Detect and wipe them.
      if (saved.collaborators || saved.indirectCosts) {
        const clean = { settings: _state.settings };
        localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(clean));
        console.info('[Store] Migrated: removed legacy master data from localStorage.');
      }
    } catch (e) {
      console.warn('[Store] Load failed:', e);
    }
  }

  // ── Notification ───────────────────────────────────────────────────────────
  function _notify() {
    _listeners.forEach(fn => {
      try { fn(_state); }
      catch (e) { console.error('[Store] Listener error:', e); }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function getState() {
    return _state;
  }

  /**
   * Updates state. Accepts a partial object or updater function.
   * @param {object|function} updater
   */
  function setState(updater) {
    const patch = typeof updater === 'function' ? updater(_state) : updater;
    _state = _deepMerge(_state, patch);
    _persist();
    _notify();
  }

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   * @param {function} fn
   * @returns {function}
   */
  function subscribe(fn) {
    _listeners.push(fn);
    return function unsubscribe() {
      _listeners = _listeners.filter(l => l !== fn);
    };
  }

  // Mutating history is no longer handled synchronously in store.
  // Instead, the UI calls App.Supabase.saveProjectHistory(), waits for DB success,
  // then updates the store array (by refetching or concatenating) via setState.

  /**
   * Resets project data to default (preserves master data and history).
   */
  function resetProject() {
    const defaults = createDefaultState();
    setState({
      currentStep: 0,
      project: defaults.project,
      team: defaults.team,
      costs: defaults.costs,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = _deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // Initialize
  _load();

  return {
    getState,
    setState,
    subscribe,
    resetProject,
  };
})();
