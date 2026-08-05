'use strict';
window.App = window.App || {};

/**
 * @module App
 * Main orchestrator. Wires together Store, Calculator, Charts, Reports and UI.
 * Handles all event delegation and step navigation.
 */
App.Main = (function () {

  const Store    = App.Store;
  const Calc     = App.Calculator;
  const Charts   = App.Charts;
  const Reports  = App.Reports;
  const UI       = App.UI;
  const Config   = App.Config;

  // ── Cached last result ────────────────────────────────────────────────────
  let _lastResult = null;

  // ── Guard: prevents store subscriber from re-rendering while user types ──
  // Store.setState() calls listeners synchronously, so setting this flag
  // immediately before setState() and clearing it right after is safe.
  let _suppressStoreRerender = false;

  // ── Calculate and Render ──────────────────────────────────────────────────
  function recalculateDashboard() {
    const state = Store.getState();
    _lastResult = Calc.calcularResultado(state);
    if (!_lastResult) return;
    UI.updateDashboardTeamCosts(state);
    UI.updateDashboardResults(state, _lastResult);
    
    // Update charts if needed
    requestAnimationFrame(() => {
      if (document.getElementById('chart-candidatos')) {
        Charts.renderCandidatosPreco('chart-candidatos', _lastResult);
      }
      if (document.getElementById('chart-custo-composicao')) {
        Charts.renderCustoComposicao('chart-custo-composicao', _lastResult);
      }
    });
  }

  function renderDashboard() {
    const state = Store.getState();
    UI.populateDashboardSelects(state);
    UI.renderDashboardTeam(state);
    recalculateDashboard();
  }

  // ── Dashboard Event Delegation ──────────────────────────────────────────────
  function readDashboardAndSave() {
    const form = document.getElementById('dashboard-form');
    if (!form) return;

    // Team extraction
    const teamSelects = document.querySelectorAll('.dash-team-select');
    const teamHours = document.querySelectorAll('.dash-team-hours');
    let team = [];
    teamSelects.forEach((sel, idx) => {
      team.push({
        colaboradorId: sel.value,
        horas: Number(teamHours[idx].value) || 0
      });
    });

    // Approvals extraction
    let aprovacoes = 0;
    if (document.getElementById('aprov-prefeitura')?.checked) aprovacoes += 1;
    if (document.getElementById('aprov-bombeiros')?.checked) aprovacoes += 1;
    if (document.getElementById('aprov-vigilancia')?.checked) aprovacoes += 1;
    
    // Extracted
    const complexidadeEl = document.querySelector('input[name="proj-complexidade"]:checked');
    const urgenciaEl = document.querySelector('input[name="proj-urgencia"]:checked');
    const revisaoEl = document.querySelector('input[name="proj-revisao"]:checked');

    Store.setState(s => ({
      project: {
        ...s.project,
        cliente: document.getElementById('proj-cliente')?.value || '',
        nome: document.getElementById('proj-nome')?.value || '',
        disciplina: document.getElementById('proj-disciplina')?.value || '',
        tipoEdificacao: document.getElementById('proj-edificacao')?.value || '',
        area: App.UI.unmask(document.getElementById('proj-area')?.value) || 0,
        cidade: document.getElementById('proj-cidade')?.value || '',
        complexidade: complexidadeEl ? Number(complexidadeEl.value) : 1,
        revisao: revisaoEl ? Number(revisaoEl.value) : 0,
        fatorUrgencia: urgenciaEl ? Number(urgenciaEl.value) : 0,
        aprovacao: aprovacoes,
        ajusteComercial: {
          ...s.project.ajusteComercial,
          valorFechado: App.UI.unmask(document.getElementById('dash-preco-fechado')?.value) || null
        }
      },
      team: team,
      costs: {
        ...s.costs,
        art: App.UI.unmask(document.getElementById('cost-art')?.value) || 0,
        outros: App.UI.unmask(document.getElementById('cost-outros')?.value) || 0,
      }
    }));
  }

  function _bindDashboardEvents() {
    const form = document.getElementById('dashboard-form');
    if (!form) return;
    const resultModal = document.getElementById('modal-transparency');

    const openResultModal = () => {
      readDashboardAndSave();
      recalculateDashboard();
      resultModal?.classList.add('open');
      requestAnimationFrame(() => {
        resultModal?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };

    const closeResultModal = () => {
      resultModal?.classList.remove('open');
      document.getElementById('btn-gerar-orcamento')?.focus();
    };

    document.getElementById('btn-close-result-modal')?.addEventListener('click', closeResultModal);
    resultModal?.addEventListener('click', e => {
      if (e.target === resultModal) closeResultModal();
    });

    form.addEventListener('input', e => {
      if (e.target.matches('.dash-team-hours')) {
        _suppressStoreRerender = true;
        readDashboardAndSave();
        _suppressStoreRerender = false;
        recalculateDashboard();
      } else {
        readDashboardAndSave();
      }
    });

    form.addEventListener('change', e => {
      if (e.target.matches('.dash-team-select, select, input[type="radio"], input[type="checkbox"]')) {
        readDashboardAndSave();
      }
    });

    // Handle Team Members Add/Remove and other clicks
    form.addEventListener('click', e => {
      if (e.target.closest('#btn-add-team-member')) {
        const state = Store.getState();
        const defaultColab = state.collaborators[0];
        if (!defaultColab) return;
        Store.setState(s => ({
          team: [...s.team, { colaboradorId: defaultColab.id, horas: 0 }],
        }));
        UI.renderDashboardTeam(Store.getState());
        recalculateDashboard();
      }
      if (e.target.closest('.btn-remove-team-member')) {
        const btn = e.target.closest('.btn-remove-team-member');
        const idx = parseInt(btn.dataset.idx);
        Store.setState(s => ({ team: s.team.filter((_, i) => i !== idx) }));
        UI.renderDashboardTeam(Store.getState());
        recalculateDashboard();
      }
      if (e.target.closest('#btn-show-transparency')) {
        openResultModal();
      }
      if (e.target.closest('#btn-gerar-orcamento')) {
        openResultModal();
      }
    });
  }

  // ── Collaborator Modal Events ──────────────────────────────────────────────
  function _bindModalEvents() {
    const modal = document.getElementById('modal-collaborator');
    if (!modal) return;

    document.getElementById('modal-colab-cancel')?.addEventListener('click', UI.closeCollaboratorModal);
    modal.addEventListener('click', e => { if (e.target === modal) UI.closeCollaboratorModal(); });

    document.getElementById('modal-colab-save')?.addEventListener('click', () => {
      const id    = document.getElementById('modal-colab-id').value;
      const nome  = document.getElementById('modal-colab-nome').value.trim();
      const cargo = document.getElementById('modal-colab-cargo').value.trim();
      const custo = Number(document.getElementById('modal-colab-custo').value);
      const horas = Number(document.getElementById('modal-colab-horas').value);
      const prod  = Number(document.getElementById('modal-colab-prod').value);

      if (!nome) { UI.showValidationError('modal-colab-nome', 'Nome é obrigatório'); return; }
      if (custo < 0) { UI.showValidationError('modal-colab-custo', 'Custo deve ser ≥ 0'); return; }
      if (horas <= 0) { UI.showValidationError('modal-colab-horas', 'Horas devem ser > 0'); return; }
      if (prod <= 0 || prod > 150) { UI.showValidationError('modal-colab-prod', '1–150%'); return; }

      const updated = { id: id || `colab_${Date.now()}`, nome, cargo, custoMensal: custo, horasMensais: horas, produtividade: prod };
      Store.setState(s => {
        const existing = s.collaborators.findIndex(c => c.id === updated.id);
        const collaborators = [...s.collaborators];
        if (existing >= 0) collaborators[existing] = updated;
        else collaborators.push(updated);
        return { collaborators };
      });

      UI.closeCollaboratorModal();
      _renderCurrentStep();
      UI.toast(`Colaborador "${nome}" ${id ? 'atualizado' : 'adicionado'} com sucesso.`);
    });

    // Add new collaborator button (in step 2)
    document.getElementById('add-collaborator-btn')?.addEventListener('click', () => {
      UI.openCollaboratorModal(null);
    });
  }



  // ── History Events ─────────────────────────────────────────────────────────
  function _bindHistoryEvents() {
    const historyPanel = document.getElementById('history-section');
    if (!historyPanel) return;

    historyPanel.addEventListener('click', async e => {
      if (e.target.closest('.history-delete-btn')) {
        const id = e.target.closest('.history-delete-btn').dataset.id;
        if (confirm('Excluir este projeto permanentemente da nuvem?')) {
          e.target.closest('.history-delete-btn').disabled = true;
          UI.toast('Excluindo...', 'info');
          const ok = await App.Supabase.deleteProjectHistory(id);
          if (ok) {
            const newHistory = await App.Supabase.fetchHistory();
            Store.setState({ history: newHistory });
            UI.renderHistory(Store.getState().history);
            Charts.renderCustosLucro('chart-custo-lucro', Store.getState().history);
            Charts.renderHorasColaborador('chart-horas-colaborador', Store.getState().history);
            UI.toast('Projeto excluído do histórico.', 'success');
          } else {
            UI.toast('Erro ao excluir projeto.', 'error');
            e.target.closest('.history-delete-btn').disabled = false;
          }
        }
      }
    });

    historyPanel.addEventListener('change', async e => {
      if (e.target.matches('.history-realized-input')) {
        const id  = e.target.dataset.id;
        const val = Number(e.target.value);
        if (val > 0) {
          e.target.disabled = true;
          const ok = await App.Supabase.updateProjectRealizedHours(id, val);
          if (ok) {
            const newHistory = await App.Supabase.fetchHistory();
            Store.setState({ history: newHistory });
            UI.renderHistory(Store.getState().history);
            Charts.renderHorasColaborador('chart-horas-colaborador', Store.getState().history);
            UI.toast('Horas realizadas registradas na nuvem!');
          } else {
            UI.toast('Erro ao atualizar horas', 'error');
            e.target.disabled = false;
          }
        }
      }
    });
  }

  // ── Export Events ──────────────────────────────────────────────────────────
  function _bindExportEvents() {
    document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
      if (!_lastResult) { UI.toast('Calcule o projeto primeiro.', 'error'); return; }
      try {
        Reports.exportarPDF(Store.getState(), _lastResult);
        UI.toast('PDF gerado com sucesso!');
      } catch (e) { UI.toast('Erro ao gerar PDF. Verifique o console.', 'error'); console.error(e); }
    });

    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
      if (!_lastResult) { UI.toast('Calcule o projeto primeiro.', 'error'); return; }
      try {
        Reports.exportarExcel(Store.getState(), _lastResult, Store.getState().history);
        UI.toast('Excel exportado com sucesso!');
      } catch (e) { UI.toast('Erro ao gerar Excel. Verifique o console.', 'error'); console.error(e); }
    });

    document.getElementById('btn-save-history')?.addEventListener('click', async () => {
      if (!_lastResult) { UI.toast('Calcule o projeto primeiro.', 'error'); return; }
      
      const btn = document.getElementById('btn-save-history');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Salvando na nuvem...';

      // Cria a estrutura padrão de payload
      const state = Store.getState();
      const entry = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        project: { ...state.project },
        team: [...state.team],
        costs: { ...state.costs },
        settings: { ...state.settings },
        result: {
          valorFinal: _lastResult.valorFinal,
          valorFinalBase: _lastResult.valorFinalBase,
          horasFinais: _lastResult.horasFinais,
          custoInternoTotal: _lastResult.custoInternoTotal,
          margemBruta: _lastResult.margemBruta,
          margemReal: _lastResult.margemReal,
          determinante: _lastResult.determinante,
        },
        aiPayload: {
          disciplina: state.project.disciplina,
          area: state.project.area,
          complexidade: state.project.complexidade,
          horasFinais: _lastResult.horasFinais,
          valorFinal: _lastResult.valorFinal,
          horasRealizadas: null,
        },
      };
      
      // Envia pra nuvem
      const ok = await App.Supabase.saveProjectHistory(entry);
      if (ok) {
        // Atualiza UI lendo da nuvem de volta pra garantir espelhamento
        const newHistory = await App.Supabase.fetchHistory();
        Store.setState({ history: newHistory });
        UI.renderHistory(Store.getState().history);
        Charts.renderCustosLucro('chart-custo-lucro', Store.getState().history);
        Charts.renderHorasColaborador('chart-horas-colaborador', Store.getState().history);
        UI.toast('Projeto salvo com sucesso na nuvem!');
      } else {
        UI.toast('Falha ao salvar o projeto.', 'error');
      }

      btn.innerHTML = originalText;
      btn.disabled = false;
    });

    document.getElementById('btn-new-project')?.addEventListener('click', () => {
      if (confirm('Iniciar novo projeto? Os dados atuais não salvos serão perdidos.')) {
        Store.resetProject();
        _renderCurrentStep();
        goToStep(0);
        UI.toast('Novo projeto iniciado.');
      }
    });
  }

  // ── Global Keyboard Shortcuts ──────────────────────────────────────────────
  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      const modalOpen = document.getElementById('modal-collaborator')?.classList.contains('open');
      const resultModal = document.getElementById('modal-transparency');
      const resultOpen = resultModal?.classList.contains('open');

      if (e.key === 'Escape' && resultOpen) {
        resultModal.classList.remove('open');
        document.getElementById('btn-gerar-orcamento')?.focus();
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape' && modalOpen) {
        UI.closeCollaboratorModal();
        e.preventDefault();
        return;
      }

      if (modalOpen && e.key === 'Tab') {
        _trapFocus(document.getElementById('modal-collaborator'), e);
        return;
      }
    });
  }

  // ── Modal Focus Trap ───────────────────────────────────────────────────────
  function _trapFocus(modal, e) {
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  // ── History Charts Section ─────────────────────────────────────────────────
  function _initHistoryCharts() {
    const state = Store.getState();
    Charts.renderCustosLucro('chart-custo-lucro', state.history);
    Charts.renderHorasColaborador('chart-horas-colaborador', state.history);
  }

  // ── Sidebar Toggle ─────────────────────────────────────────────────────────
  function _bindSidebarEvents() {
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  function init() {
    renderDashboard();

    // Bind all events
    _bindDashboardEvents();
    _bindModalEvents();
    _bindHistoryEvents();
    _bindExportEvents();
    _bindKeyboard();        
    _initHistoryCharts();
    // Sidebar events are owned by App.Router to avoid duplicate handlers.

    // Initialize Settings Panel
    App.SettingsUI.init();
    
    // Initialize Users UI
    if (App.UsersUI) App.UsersUI.init();

    // Subscribe to store changes for live recalc
    Store.subscribe(state => {
      if (_suppressStoreRerender) return;
      renderDashboard();
    });

    console.info('[Fávero ERP] Dashboard inicializado. v4.0.0 + Supabase Auth');
  }

  return { init, renderDashboard, recalculateDashboard };
})();

// Bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  // Initialize auth first — gates the entire app
  App.Auth.init(function (user) {
    // Called on successful login or restored session
    // App.Main.init() wires all events — safe to call multiple times
    // (guard prevents double initialization)
    if (!window._appInitialized) {
      window._appInitialized = true;
      App.Router.init();
      App.Main.init();
    }
  });
});
