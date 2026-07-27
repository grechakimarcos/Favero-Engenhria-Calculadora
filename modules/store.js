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

      // Master data — editable by user
      collaborators: Config.COLABORADORES_DEFAULT.map(c => ({ ...c })),
      indirectCosts: Config.CUSTOS_INDIRETOS_DEFAULT.map(c => ({ ...c })),

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
        collaborators: _state.collaborators,
        indirectCosts: _state.indirectCosts,
        settings: _state.settings,
        history: _state.history,
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
      // Merge persisted user data into default state
      _state.collaborators  = saved.collaborators  || _state.collaborators;
      _state.indirectCosts  = saved.indirectCosts  || _state.indirectCosts;
      _state.settings       = { ..._state.settings, ...(saved.settings || {}) };
      _state.history        = saved.history         || [];
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

  /**
   * Saves current project calculation to history.
   * @param {object} result - The calculated result object
   */
  function saveToHistory(result) {
    const state = getState();
    const entry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      project: { ...state.project },
      team: [...state.team],
      costs: { ...state.costs },
      result: {
        valorFinal: result.valorFinal,
        horasFinais: result.horasFinais,
        custoInternoTotal: result.custoInternoTotal,
        margemBruta: result.margemBruta,
        determinante: result.determinante,
      },
      // AI-ready: store raw inputs for future ML training
      aiPayload: {
        disciplina: state.project.disciplina,
        area: state.project.area,
        complexidade: state.project.complexidade,
        horasFinais: result.horasFinais,
        valorFinal: result.valorFinal,
        horasRealizadas: null, // filled later by user
      },
    };

    setState(s => ({
      history: [entry, ...s.history].slice(0, 100), // keep last 100 projects
    }));

    return entry.id;
  }

  /**
   * Updates realized hours for a history entry (for AI learning).
   * @param {string} id
   * @param {number} horasRealizadas
   */
  function updateHistoryRealized(id, horasRealizadas) {
    setState(s => ({
      history: s.history.map(h =>
        h.id === id
          ? { ...h, aiPayload: { ...h.aiPayload, horasRealizadas } }
          : h
      ),
    }));
  }

  /**
   * Removes a history entry.
   * @param {string} id
   */
  function deleteHistoryEntry(id) {
    setState(s => ({ history: s.history.filter(h => h.id !== id) }));
  }

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
    saveToHistory,
    updateHistoryRealized,
    deleteHistoryEntry,
    resetProject,
  };
})();
