'use strict';
window.App = window.App || {};

/**
 * @module SettingsUI
 * Renders and manages the Settings Panel (slide-in drawer).
 * Allows editing: financial parameters, disciplines, collaborators, indirect costs.
 * Syncs changes to App.Store and Supabase.
 */
App.SettingsUI = (function () {
  const moeda = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ── Render All Sections ──────────────────────────────────────────────────────
  function render() {
    const state = App.Store.getState();
    _renderFinancial(state.settings);
    _renderDisciplinas();
    _renderCollaborators(state.collaborators);
    _renderIndirectCosts(state.indirectCosts);
  }

  // ── Section 1: Financial Parameters ──────────────────────────────────────────
  function _renderFinancial(settings) {
    const el = document.getElementById('settings-financial-body');
    if (!el) return;
    el.innerHTML = `
      <div class="settings-form-grid">
        <div class="form-group">
          <label for="cfg-meta-mensal">Meta Mensal (R$)</label>
          <input type="number" id="cfg-meta-mensal" value="${settings.metaMensal}" min="0" step="500" />
        </div>
        <div class="form-group">
          <label for="cfg-imposto">Imposto Simples (%)</label>
          <input type="number" id="cfg-imposto" value="${(settings.impostoSimples * 100).toFixed(1)}" min="0" max="100" step="0.1" />
        </div>
        <div class="form-group">
          <label for="cfg-multiplicador">Multiplicador Mínimo de Custo</label>
          <input type="number" id="cfg-multiplicador" value="${settings.multiplicadorMinimo}" min="1" max="5" step="0.05" />
        </div>
      </div>`;
  }

  // ── Section 2: Disciplines ────────────────────────────────────────────────────
  function _renderDisciplinas() {
    const el = document.getElementById('settings-disciplinas-body');
    if (!el) return;
    const disciplinas = App.Config.DISCIPLINAS;
    const rows = Object.entries(disciplinas).map(([key, d]) => `
      <tr>
        <td><span class="tag-disc">${d.nome}</span></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="areaRef" value="${d.areaRef}" min="0" step="10" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="horasRef" value="${d.horasRef}" min="0" step="1" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="valorBase" value="${d.valorBase}" min="0" step="50" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="ticketMinimo" value="${d.ticketMinimo}" min="0" step="50" /></td>
      </tr>`).join('');

    el.innerHTML = `
      <div class="settings-table-wrapper">
        <table class="settings-table">
          <thead>
            <tr>
              <th>Disciplina</th>
              <th>Área Ref. (m²)</th>
              <th>Horas Ref.</th>
              <th>Valor Base (R$)</th>
              <th>Ticket Mín. (R$)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // Bind live update to Config (in-memory, not persisted in Supabase — Config is frozen)
    // We unfreeze a mutable copy for runtime edits
    el.querySelectorAll('.cfg-disc-input').forEach(input => {
      input.addEventListener('change', () => {
        const key   = input.dataset.key;
        const field = input.dataset.field;
        const val   = parseFloat(input.value) || 0;
        // Update runtime config (we use a mutable overlay stored in Store)
        const state = App.Store.getState();
        const disciplinas = state.disciplinas || {};
        if (!disciplinas[key]) disciplinas[key] = { ...App.Config.DISCIPLINAS[key] };
        disciplinas[key][field] = val;
        App.Store.setState({ disciplinas });
      });
    });
  }

  // ── Section 3: Collaborators ──────────────────────────────────────────────────
  function _renderCollaborators(collaborators) {
    const el = document.getElementById('settings-colabs-body');
    if (!el) return;
    const rows = collaborators.map((c, i) => `
      <tr data-colab-index="${i}">
        <td><input type="text"   class="cfg-colab-input" data-index="${i}" data-field="nome"        value="${c.nome  || ''}" placeholder="Nome" /></td>
        <td><input type="text"   class="cfg-colab-input" data-index="${i}" data-field="cargo"       value="${c.cargo || ''}" placeholder="Cargo" /></td>
        <td><input type="number" class="cfg-colab-input" data-index="${i}" data-field="custoMensal"  value="${c.custoMensal}"  min="0" step="100" /></td>
        <td><input type="number" class="cfg-colab-input" data-index="${i}" data-field="horasMensais" value="${c.horasMensais}" min="1" step="5" /></td>
        <td><input type="number" class="cfg-colab-input" data-index="${i}" data-field="produtividade" value="${c.produtividade}" min="0" max="100" /></td>
        <td>
          <button class="btn-icon-sm btn-danger-sm" data-action="remove-colab" data-index="${i}" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <div class="settings-table-wrapper">
        <table class="settings-table">
          <thead>
            <tr>
              <th>Nome</th><th>Cargo</th><th>Custo Mensal (R$)</th><th>Horas/Mês</th><th>Produt. (%)</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <button id="btn-add-colab" class="btn btn-ghost btn-sm mt-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Adicionar Colaborador</button>
      </div>`;

    // Bind events
    el.querySelectorAll('.cfg-colab-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx   = parseInt(input.dataset.index);
        const field = input.dataset.field;
        const val   = input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
        const state = App.Store.getState();
        const colabs = [...state.collaborators];
        colabs[idx] = { ...colabs[idx], [field]: val };
        App.Store.setState({ collaborators: colabs });
      });
    });

    el.querySelectorAll('[data-action="remove-colab"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx   = parseInt(btn.dataset.index);
        const state = App.Store.getState();
        const colabs = state.collaborators.filter((_, i) => i !== idx);
        App.Store.setState({ collaborators: colabs });
        _renderCollaborators(App.Store.getState().collaborators);
      });
    });

    document.getElementById('btn-add-colab')?.addEventListener('click', () => {
      const state  = App.Store.getState();
      const newId  = 'colab_' + Date.now();
      const colabs = [...state.collaborators, {
        id: newId, nome: 'Novo', cargo: 'Técnico',
        custoMensal: 1500, horasMensais: 160, produtividade: 100,
      }];
      App.Store.setState({ collaborators: colabs });
      _renderCollaborators(App.Store.getState().collaborators);
    });
  }

  // ── Section 4: Indirect Costs ─────────────────────────────────────────────────
  function _renderIndirectCosts(costs) {
    const el = document.getElementById('settings-indirect-body');
    if (!el) return;
    const rows = costs.map((c, i) => `
      <tr>
        <td><input type="text"   class="cfg-indirect-input" data-index="${i}" data-field="nome"  value="${c.nome  || ''}" placeholder="Descrição" /></td>
        <td><input type="number" class="cfg-indirect-input" data-index="${i}" data-field="valor" value="${c.valor || 0}"   min="0" step="50" /></td>
        <td>
          <button class="btn-icon-sm btn-danger-sm" data-action="remove-indirect" data-index="${i}" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>`).join('');

    const total = costs.reduce((s, c) => s + (c.valor || 0), 0);

    el.innerHTML = `
      <div class="settings-table-wrapper">
        <table class="settings-table">
          <thead>
            <tr><th>Descrição</th><th>Valor Mensal (R$)</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>${moeda(total)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <button id="btn-add-indirect" class="btn btn-ghost btn-sm mt-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Adicionar Custo Indireto</button>
      </div>`;

    el.querySelectorAll('.cfg-indirect-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx   = parseInt(input.dataset.index);
        const field = input.dataset.field;
        const val   = input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
        const state = App.Store.getState();
        const arr   = [...state.indirectCosts];
        arr[idx]    = { ...arr[idx], [field]: val };
        App.Store.setState({ indirectCosts: arr });
        // Update total footer
        const newTotal = arr.reduce((s, c) => s + (c.valor || 0), 0);
        const tfoot = el.querySelector('tfoot td:nth-child(2) strong');
        if (tfoot) tfoot.textContent = moeda(newTotal);
      });
    });

    el.querySelectorAll('[data-action="remove-indirect"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx   = parseInt(btn.dataset.index);
        const state = App.Store.getState();
        const arr   = state.indirectCosts.filter((_, i) => i !== idx);
        App.Store.setState({ indirectCosts: arr });
        _renderIndirectCosts(App.Store.getState().indirectCosts);
      });
    });

    document.getElementById('btn-add-indirect')?.addEventListener('click', () => {
      const state = App.Store.getState();
      const arr   = [...state.indirectCosts, {
        id: 'indirect_' + Date.now(), nome: 'Novo custo', valor: 0,
      }];
      App.Store.setState({ indirectCosts: arr });
      _renderIndirectCosts(App.Store.getState().indirectCosts);
    });
  }

  // ── Save All to Cloud ─────────────────────────────────────────────────────────
  async function _handleSave() {
    const btn = document.getElementById('btn-settings-save');
    if (!btn) return;

    // Read financial inputs
    const metaMensal          = parseFloat(document.getElementById('cfg-meta-mensal')?.value) || 30000;
    const impostoSimplesPct   = parseFloat(document.getElementById('cfg-imposto')?.value) || 6;
    const multiplicadorMinimo = parseFloat(document.getElementById('cfg-multiplicador')?.value) || 1.80;

    App.Store.setState({
      settings: {
        metaMensal,
        impostoSimples: impostoSimplesPct / 100,
        multiplicadorMinimo,
      },
    });

    // Save to Supabase
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando…';

    const state = App.Store.getState();
    const ok    = await App.Supabase.saveAllToCloud(state);

    btn.disabled = false;
    btn.innerHTML = '💾 Salvar Configurações';

    if (ok) {
      App.UI.toast('✅ Configurações salvas na nuvem!', 'success');
    } else {
      App.UI.toast('⚠️ Salvo localmente. Verifique a conexão.', 'warning');
    }
  }

  // ── Tab Navigation inside Settings Panel ─────────────────────────────────────
  function _bindTabs() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.target);
        if (target) target.classList.add('active');
      });
    });
  }


  // ── Initialize ─────────────────────────────────────────────────────────────
  function init() {
    // Save button
    document.getElementById('btn-settings-save')?.addEventListener('click', _handleSave);
    // Tabs
    _bindTabs();
  }

  return { init, render };
})();
