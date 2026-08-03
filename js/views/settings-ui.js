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

  // ── Section 1: Financial Parameters ──────────────────────────────────────────────────
  function _renderFinancial(settings) {
    const el = document.getElementById('settings-financial-body');
    if (!el) return;
    el.innerHTML = `
      <div class="stt-fields-grid">

        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div class="stt-field-body">
            <label class="stt-label" for="cfg-meta-mensal">Meta Mensal</label>
            <div class="stt-input-wrap">
              <span class="stt-prefix">R$</span>
              <input class="stt-input" type="number" id="cfg-meta-mensal"
                value="${settings.metaMensal}" min="0" step="500"
                aria-label="Meta mensal em reais" />
            </div>
            <p class="stt-hint">Valor da meta financeira mensal utilizada como base dos cálculos.</p>
          </div>
        </div>

        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="5" x2="5" y2="19"/>
              <circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
            </svg>
          </div>
          <div class="stt-field-body">
            <label class="stt-label" for="cfg-imposto">Imposto Simples</label>
            <div class="stt-input-wrap">
              <input class="stt-input" type="number" id="cfg-imposto"
                value="${(settings.impostoSimples * 100).toFixed(1)}" min="0" max="100" step="0.1"
                aria-label="Imposto simples em percentual" />
              <span class="stt-suffix">%</span>
            </div>
            <p class="stt-hint">Percentual utilizado para cálculo dos impostos sobre os serviços.</p>
          </div>
        </div>

        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div class="stt-field-body">
            <label class="stt-label" for="cfg-multiplicador">Multiplicador Mínimo de Custo</label>
            <div class="stt-input-wrap">
              <span class="stt-prefix">×</span>
              <input class="stt-input" type="number" id="cfg-multiplicador"
                value="${settings.multiplicadorMinimo}" min="1" max="5" step="0.05"
                aria-label="Multiplicador mínimo de custo" />
            </div>
            <p class="stt-hint">Fator mínimo aplicado sobre os custos diretos para garantir margem.</p>
          </div>
        </div>

      </div>`;
  }

  // ── Section 2: Disciplines ────────────────────────────────────────────────────
  function _renderDisciplinas() {
    const el = document.getElementById('settings-disciplinas-body');
    if (!el) return;
    const disciplinas = App.Store.getState().disciplinas || {};
    const rows = Object.entries(disciplinas).map(([key, d]) => `
      <tr>
        <td><input type="text" class="cfg-disc-input" data-key="${key}" data-field="nome" value="${d.nome}" style="width: 100%" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="areaRef" value="${d.areaRef}" min="0" step="10" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="horasRef" value="${d.horasRef}" min="0" step="1" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="valorBase" value="${d.valorBase}" min="0" step="50" /></td>
        <td><input type="number" class="cfg-disc-input" data-key="${key}" data-field="ticketMinimo" value="${d.ticketMinimo}" min="0" step="50" /></td>
        <td>
          <button class="btn-icon-sm btn-danger-sm" data-action="remove-disc" data-key="${key}" title="Remover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
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
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <button id="btn-add-disc" class="btn btn-ghost btn-sm mt-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Adicionar Disciplina</button>
      </div>`;

    // Bind live update to Store
    el.querySelectorAll('.cfg-disc-input').forEach(input => {
      input.addEventListener('change', () => {
        const key   = input.dataset.key;
        const field = input.dataset.field;
        const val   = input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
        const state = App.Store.getState();
        const disciplinas = { ...state.disciplinas };
        if (!disciplinas[key]) disciplinas[key] = { nome: key, areaRef: 0, horasRef: 0, valorBase: 0, ticketMinimo: 0 };
        disciplinas[key][field] = val;
        App.Store.setState({ disciplinas });
        
        // If the user modifies the name, the key remains the old internal ID, which is fine
        // for references. We only change the visual name.
      });
    });

    el.querySelectorAll('[data-action="remove-disc"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const state = App.Store.getState();
        const disciplinas = { ...state.disciplinas };
        delete disciplinas[key];
        App.Store.setState({ disciplinas });
        _renderDisciplinas();
      });
    });

    document.getElementById('btn-add-disc')?.addEventListener('click', () => {
      const state = App.Store.getState();
      const disciplinas = { ...state.disciplinas };
      const newKey = 'disc_' + crypto.randomUUID().split('-')[0];
      disciplinas[newKey] = {
        nome: 'Nova Disciplina',
        areaRef: 100,
        horasRef: 10,
        valorBase: 1000,
        ticketMinimo: 1000
      };
      App.Store.setState({ disciplinas });
      _renderDisciplinas();
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

  // ── Save All to Cloud ────────────────────────────────────────────────────────────
  async function _handleSave() {
    const btn    = document.getElementById('btn-settings-save');
    const status = document.getElementById('stt-save-status');
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

    // Visual feedback
    btn.disabled = true;
    btn.classList.add('stt-saving');
    btn.innerHTML = `<span class="stt-spin">↻</span> Salvando…`;
    if (status) { status.textContent = ''; status.className = 'stt-footer-hint'; }

    const state = App.Store.getState();
    const ok    = await App.Supabase.saveAllToCloud(state);

    btn.disabled = false;
    btn.classList.remove('stt-saving');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar Configurações`;

    if (ok) {
      if (status) { status.textContent = '✔ Configurações salvas com sucesso.'; status.className = 'stt-footer-hint stt-hint-ok'; }
      App.UI.toast('✅ Configurações salvas na nuvem!', 'success');
    } else {
      if (status) { status.textContent = '⚠️ Falha ao sincronizar com a nuvem.'; status.className = 'stt-footer-hint stt-hint-warn'; }
      App.UI.toast('⚠️ Salvo localmente. Verifique a conexão.', 'warning');
    }

    setTimeout(() => { if (status) status.textContent = ''; }, 5000);
  }

  // ── Tab Navigation inside Settings Panel ────────────────────────────────────────────
  function _bindTabs() {
    // Support both old class (.settings-tab) and new class (.stt-tab)
    document.querySelectorAll('.settings-tab, .stt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab, .stt-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
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
