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
  function recalculate() {
    const state = Store.getState();
    _lastResult = Calc.calcularResultado(state);

    const step = state.currentStep;
    if (step === 1) UI.renderStep2(state, _lastResult);
    if (step === 2) UI.renderStep3(state, _lastResult);
    if (step === 3) UI.renderStep4(state, _lastResult);
    if (step === 4) UI.renderStep5(state, _lastResult);
    if (step === 5) UI.renderStep6(state, _lastResult);
    if (step === 6) UI.renderStep7(state, _lastResult);
    if (step === 7) UI.renderStep8(state, _lastResult);
  }

  // ── Step Navigation ────────────────────────────────────────────────────────
  function goToStep(target) {
    const state = Store.getState();
    const from = state.currentStep;

    // Validate before leaving step
    if (target > from) {
      const valid = _validateStep(from);
      if (!valid) return;
    }

    Store.setState({ currentStep: target });
    UI.updateStepper(target);
    _renderCurrentStep();
  }

  function _renderCurrentStep() {
    const state = Store.getState();
    const step = state.currentStep;

    if (step === 0) UI.renderStep1(state);
    if (step === 1) { _lastResult = Calc.calcularResultado(state); UI.renderStep2(state, _lastResult); }
    if (step === 2) { _lastResult = Calc.calcularResultado(state); UI.renderStep3(state, _lastResult); }
    if (step === 3) { _lastResult = Calc.calcularResultado(state); UI.renderStep4(state, _lastResult); }
    if (step === 4) { _lastResult = Calc.calcularResultado(state); UI.renderStep5(state, _lastResult); }
    if (step === 5) {
      _lastResult = Calc.calcularResultado(state);
      UI.renderStep6(state, _lastResult);
      requestAnimationFrame(() => {
        Charts.renderCandidatosPreco('chart-candidatos', _lastResult);
      });
    }
    if (step === 6) {
      _lastResult = Calc.calcularResultado(state);
      UI.renderStep7(state, _lastResult);
    }
    if (step === 7) {
      _lastResult = Calc.calcularResultado(state);
      UI.renderStep8(state, _lastResult);
      requestAnimationFrame(() => {
        Charts.renderCustoComposicao('chart-custo-composicao', _lastResult);
      });
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function _validateStep(step) {
    const state = Store.getState();
    if (step === 0) {
      // Project name and client are recommended but not required
      return true;
    }
    if (step === 1) {
      const horasEquipe = state.team.reduce((s, t) => s + (Number(t.horas) || 0), 0);
      const area = Number(state.project.area) || 0;
      const horasManuais = Number(state.project.horasManuais) || 0;
      if (horasEquipe === 0 && area === 0 && horasManuais === 0) {
        UI.toast('Informe a área, horas manuais ou horas da equipe para continuar.', 'error');
        return false;
      }
      return true;
    }
    if (step === 2) {
      const { costs } = state;
      const margem = Number(costs.margemLucro);
      if (margem >= 94) {
        UI.toast('Margem de lucro inválida. Use um valor menor que 94%.', 'error');
        UI.showValidationError('cost-margem', 'Máximo: 93%');
        return false;
      }
      return true;
    }
    return true;
  }

  // ── Read Step 1 Inputs ─────────────────────────────────────────────────────
  function _readStep1Inputs() {
    return {
      project: {
        nome:           document.getElementById('proj-nome')?.value || '',
        cliente:        document.getElementById('proj-cliente')?.value || '',
        disciplina:     document.getElementById('proj-disciplina')?.value || 'eletrico',
        tipoEdificacao: document.getElementById('proj-edificacao')?.value || 'casa',
        area:           App.UI.unmask(document.getElementById('proj-area')?.value) || 0,
        horasManuais:   document.getElementById('proj-horas-manuais')?.value ? App.UI.unmask(document.getElementById('proj-horas-manuais')?.value) : '',
        data:           document.getElementById('proj-data')?.value || '',
        tipoComercial:  document.getElementById('proj-tipo-comercial')?.value || 'padrao',
        complexidade:   Number(document.getElementById('proj-complexidade')?.value) || 1,
        revisao:        Number(document.getElementById('proj-revisao')?.value) || 0,
        aprovacao:      Number(document.getElementById('proj-aprovacao')?.value) || 0,
        fatorRisco:     Number(document.getElementById('proj-risco')?.value) || 0,
        fatorUrgencia:  Number(document.getElementById('proj-urgencia')?.value) || 0,
      },
    };
  }

  // ── Event Delegation — Step 1 ──────────────────────────────────────────────
  function _bindStep1Events() {
    const panel = document.getElementById('panel-0');
    if (!panel) return;
    panel.addEventListener('change', e => {
      if (e.target.matches('select, input[type="date"]')) {
        Store.setState(_readStep1Inputs());
      }
    });
    panel.addEventListener('input', e => {
      if (e.target.matches('input[type="text"], input[type="number"]')) {
        Store.setState(_readStep1Inputs());
      }
    });
  }

  // ── Event Delegation — Step 2 (Team) ──────────────────────────────────────
  function _bindStep2Events() {
    const panel = document.getElementById('panel-1');
    if (!panel) return;

    panel.addEventListener('change', e => {
      if (e.target.matches('.team-colab-select')) {
        const idx = parseInt(e.target.dataset.idx);
        Store.setState(s => {
          const team = [...s.team];
          team[idx] = { ...team[idx], colaboradorId: e.target.value };
          return { team };
        });
        _renderCurrentStep();
      }
    });

    panel.addEventListener('input', e => {
      if (e.target.matches('.team-horas-input')) {
        const idx   = parseInt(e.target.dataset.idx);
        const horas = Number(e.target.value) || 0;

        // Block the global subscriber from triggering UI.renderStep2()
        // while the user is actively typing — it would destroy the focused input.
        _suppressStoreRerender = true;
        Store.setState(s => {
          const team = [...s.team];
          team[idx] = { ...team[idx], horas };
          return { team };
        });
        _suppressStoreRerender = false;

        // Surgical DOM update: only the readonly cost cells of this row
        const state = Store.getState();
        _lastResult = Calc.calcularResultado(state);

        const row = document.querySelector(`.team-row[data-idx="${idx}"]`);
        if (row) {
          const membro = state.team[idx];
          const colab  = membro
            ? state.collaborators.find(c => c.id === membro.colaboradorId)
            : null;
          if (colab) {
            const custoHora  = Calc.custoRealHoraPorColaborador(colab, state.indirectCosts, state.collaborators);
            const custoTotal = horas * custoHora;
            const [inputCustoHora, inputCustoTotal] = row.querySelectorAll('.input-readonly');
            if (inputCustoHora)  inputCustoHora.value  = UI.moeda(custoHora);
            if (inputCustoTotal) inputCustoTotal.value = UI.moeda(custoTotal);
          }
        }

        // Refresh the hours-preview block: delegate to UI so the
        // factors-breakdown stays in sync with the full renderStep2 output.
        if (_lastResult) {
          const state = Store.getState();
          UI.renderStep2(state, _lastResult);
        }
      }
    });

    panel.addEventListener('click', e => {
      if (e.target.closest('.team-remove-btn')) {
        const btn = e.target.closest('.team-remove-btn');
        const idx = parseInt(btn.dataset.idx);
        const teamLen = Store.getState().team.length;
        Store.setState(s => ({ team: s.team.filter((_, i) => i !== idx) }));
        _renderCurrentStep();
        // Return focus: previous row's hours input, or Add Member button
        requestAnimationFrame(() => {
          const horasInputs = document.querySelectorAll('.team-horas-input');
          if (horasInputs.length > 0) {
            const targetIdx = Math.min(idx, horasInputs.length - 1);
            horasInputs[targetIdx].focus();
          } else {
            document.getElementById('add-team-member-btn')?.focus();
          }
        });
      }
      if (e.target.matches('#add-team-member-btn') || e.target.closest('#add-team-member-btn')) {
        const state = Store.getState();
        const defaultColab = state.collaborators[0];
        if (!defaultColab) return;
        Store.setState(s => ({
          team: [...s.team, { colaboradorId: defaultColab.id, horas: 0 }],
        }));
        _renderCurrentStep();
        // Auto-focus the hours input of the newly added row
        requestAnimationFrame(() => {
          const horasInputs = document.querySelectorAll('.team-horas-input');
          if (horasInputs.length) {
            const last = horasInputs[horasInputs.length - 1];
            last.focus();
            last.select();
          }
        });
      }
      if (e.target.closest('.colab-edit-btn')) {
        const id = e.target.closest('.colab-edit-btn').dataset.id;
        const colab = Store.getState().collaborators.find(c => c.id === id);
        UI.openCollaboratorModal(colab);
      }
      if (e.target.closest('.colab-delete-btn')) {
        const id = e.target.closest('.colab-delete-btn').dataset.id;
        if (confirm('Remover este colaborador?')) {
          Store.setState(s => ({
            collaborators: s.collaborators.filter(c => c.id !== id),
            team: s.team.filter(t => t.colaboradorId !== id),
          }));
          _renderCurrentStep();
          UI.toast('Colaborador removido.', 'info');
        }
      }
    });
  }

  // ── Event Delegation — Step 3 (Estimativa) ─────────────────────────────────────
  function _bindStep3Events() {
    const panel = document.getElementById('panel-2');
    if (!panel) return;
    panel.addEventListener('input', e => {
      if (e.target.matches('#proj-area, #proj-horas-manuais')) {
        Store.setState(s => ({
          project: {
            ...s.project,
            area: App.UI.unmask(document.getElementById('proj-area')?.value),
            horasManuais: App.UI.unmask(document.getElementById('proj-horas-manuais')?.value)
          }
        }));
      }
    });
    panel.addEventListener('change', e => {
      if (e.target.matches('#proj-disciplina')) {
        Store.setState(s => ({
          project: { ...s.project, disciplina: e.target.value }
        }));
        _renderCurrentStep();
      }
    });
  }

  // ── Event Delegation — Step 4 (Complexidade) ─────────────────────────────────────
  function _bindStep4Events() {
    const panel = document.getElementById('panel-3');
    if (!panel) return;
    panel.addEventListener('change', e => {
      if (e.target.matches('#proj-complexidade')) {
        Store.setState({ project: { ...Store.getState().project, complexidade: parseInt(e.target.value, 10) }});
      }
      if (e.target.matches('#proj-revisao')) {
        Store.setState({ project: { ...Store.getState().project, revisao: parseInt(e.target.value, 10) }});
      }
      if (e.target.matches('#proj-aprovacao')) {
        Store.setState({ project: { ...Store.getState().project, aprovacao: parseInt(e.target.value, 10) }});
      }
      _renderCurrentStep();
    });
  }

  // ── Event Delegation — Step 5 (Custos) ─────────────────────────────────────
  function _bindStep5Events() {
    const panel = document.getElementById('panel-4');
    if (!panel) return;

    panel.addEventListener('input', e => {
      if (e.target.matches('#cost-art, #cost-outros, #cost-margem, #cost-imposto')) {
        const impostoRaw = App.UI.unmask(document.getElementById('cost-imposto')?.value) || 0;
        Store.setState({
          costs: {
            ...Store.getState().costs,
            art:        App.UI.unmask(document.getElementById('cost-art')?.value),
            outros:     App.UI.unmask(document.getElementById('cost-outros')?.value),
            margemLucro:App.UI.unmask(document.getElementById('cost-margem')?.value),
          },
          settings: {
            ...Store.getState().settings,
            impostoSimples: impostoRaw / 100
          }
        });
      }
      if (e.target.matches('.indirect-nome, .indirect-valor')) {
        const idx = parseInt(e.target.dataset.idx);
        Store.setState(s => {
          const ic = [...s.indirectCosts];
          ic[idx] = {
            ...ic[idx],
            nome:  panel.querySelector(`.indirect-nome[data-idx="${idx}"]`)?.value || '',
            valor: App.UI.unmask(panel.querySelector(`.indirect-valor[data-idx="${idx}"]`)?.value),
          };
          return { indirectCosts: ic };
        });
        // Live update totals
        const total = Store.getState().indirectCosts.reduce((s, c) => s + (c.valor || 0), 0);
        const rateio = App.Calculator.rateioIndiretoHora(
          Store.getState().indirectCosts, Store.getState().collaborators
        );
        const totalEl = panel.querySelector('.indirect-total-box strong');
        const rateioEl = panel.querySelector('.indirect-total-box .muted');
        if (totalEl) totalEl.textContent = UI.moeda(total);
        if (rateioEl) rateioEl.textContent = `→ Rateio: ${UI.moeda(rateio)}/h`;
      }
    });

    panel.addEventListener('click', e => {
      if (e.target.matches('#add-indirect-btn') || e.target.closest('#add-indirect-btn')) {
        Store.setState(s => ({
          indirectCosts: [...s.indirectCosts, { id: `ci_${Date.now()}`, nome: '', valor: 0 }],
        }));
        _lastResult = Calc.calcularResultado(Store.getState());
        UI.renderStep5(Store.getState(), _lastResult);
      }
      if (e.target.closest('.indirect-remove-btn')) {
        const idx = parseInt(e.target.closest('.indirect-remove-btn').dataset.idx);
        Store.setState(s => ({ indirectCosts: s.indirectCosts.filter((_, i) => i !== idx) }));
        _lastResult = Calc.calcularResultado(Store.getState());
        UI.renderStep5(Store.getState(), _lastResult);
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

  // ── Event Delegation — Step 6 (Comercial/Preço) ───────────────────────────────
  function _bindStep6Events() {
    const panel = document.getElementById('panel-5');
    if (!panel) return;
    
    panel.addEventListener('input', e => {
      if (e.target.matches('#comercial-desconto, #comercial-acrescimo, #comercial-fechado')) {
        Store.setState(s => ({
          project: {
            ...s.project,
            ajusteComercial: {
              ...s.project.ajusteComercial,
              desconto: Number(document.getElementById('comercial-desconto')?.value) || 0,
              acrescimo: Number(document.getElementById('comercial-acrescimo')?.value) || 0,
              valorFechado: document.getElementById('comercial-fechado')?.value 
                ? Number(document.getElementById('comercial-fechado').value) : null
            }
          }
        }));
        _lastResult = Calc.calcularResultado(Store.getState());
        UI.renderStep6(Store.getState(), _lastResult);
      }
      
      // Real-time factor adjustments
      if (e.target.matches('#comercial-risco, #comercial-urgencia')) {
        Store.setState(s => ({
          project: {
            ...s.project,
            fatorRisco: Number(document.getElementById('comercial-risco')?.value) || 0,
            fatorUrgencia: Number(document.getElementById('comercial-urgencia')?.value) || 0
          }
        }));
        _lastResult = Calc.calcularResultado(Store.getState());
        UI.renderStep6(Store.getState(), _lastResult);
      }
    });

    panel.addEventListener('click', e => {
      if (e.target.matches('#btn-limpar-ajuste')) {
        Store.setState(s => ({
          project: {
            ...s.project,
            fatorRisco: 0,
            fatorUrgencia: 0,
            ajusteComercial: { desconto: 0, acrescimo: 0, valorFechado: null }
          }
        }));
        
        // Reset the input values in DOM since we are doing surgical updates
        document.getElementById('comercial-desconto').value = '';
        document.getElementById('comercial-acrescimo').value = '';
        document.getElementById('comercial-fechado').value = '';
        document.getElementById('comercial-risco').value = 0;
        document.getElementById('comercial-urgencia').value = 0;

        _lastResult = Calc.calcularResultado(Store.getState());
        UI.renderStep6(Store.getState(), _lastResult);
      }
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

  // ── Stepper Navigation Buttons ─────────────────────────────────────────────
  function _bindStepperEvents() {
    // Step items: click + keyboard (Enter/Space)
    document.querySelectorAll('.step-item, .calc-step').forEach((el, i) => {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('click', () => goToStep(i));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToStep(i);
        }
      });
    });

    // Prev/Next buttons inside panels
    document.querySelectorAll('.btn-next-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = parseInt(btn.dataset.next);
        goToStep(next);
      });
    });

    document.querySelectorAll('.btn-prev-step').forEach(btn => {
      btn.addEventListener('click', () => {
        const prev = parseInt(btn.dataset.prev);
        goToStep(prev);
      });
    });
  }

  // ── Global Keyboard Shortcuts ──────────────────────────────────────────────
  //   Alt + →        → Próximo passo
  //   Alt + ←        → Passo anterior
  //   Ctrl + Enter   → Ir para Resultado (passo 3)
  //   Alt + A        → Adicionar colaborador à equipe
  //   Escape         → Fechar modal aberto
  function _bindKeyboard() {
    const TOTAL_STEPS = 6;

    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      const inTextField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
      const modalOpen = document.getElementById('modal-collaborator')?.classList.contains('open');

      // ── Escape → close modal ─────────────────────────────────────────────
      if (e.key === 'Escape') {
        if (modalOpen) {
          UI.closeCollaboratorModal();
          e.preventDefault();
        }
        return;
      }

      // ── Modal focus trap ─────────────────────────────────────────────────
      if (modalOpen && e.key === 'Tab') {
        _trapFocus(document.getElementById('modal-collaborator'), e);
        return;
      }

      // ── Alt + → / Alt + ← : navigate steps ──────────────────────────────
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const cur = Store.getState().currentStep;
          if (cur < TOTAL_STEPS - 1) goToStep(cur + 1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const cur = Store.getState().currentStep;
          if (cur > 0) goToStep(cur - 1);
          return;
        }
        // Alt + A → Add team member (only on step 2)
        if (e.key === 'a' || e.key === 'A') {
          if (Store.getState().currentStep === 1) {
            e.preventDefault();
            const state = Store.getState();
            const defaultColab = state.collaborators[0];
            if (defaultColab) {
              Store.setState(s => ({
                team: [...s.team, { colaboradorId: defaultColab.id, horas: 0 }],
              }));
              _renderCurrentStep();
              // Focus the hours input of the new row after render
              requestAnimationFrame(() => {
                const rows = document.querySelectorAll('.team-horas-input');
                if (rows.length) rows[rows.length - 1].focus();
              });
              UI.toast('Colaborador adicionado (Alt+A)', 'info');
            }
          }
          return;
        }
      }

      // ── Ctrl + Enter → jump to results ───────────────────────────────────
      if (e.ctrlKey && e.key === 'Enter' && !inTextField) {
        e.preventDefault();
        goToStep(3);
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
    // Render initial step
    _renderCurrentStep();
    UI.updateStepper(0);

    // Bind all events
    _bindStep1Events();
    _bindStep2Events();
    _bindStep3Events();
    _bindStep4Events();
    _bindStep5Events();
    _bindStep6Events();
    // _bindStep7Events() e _bindStep8Events() caso existam listeners futuros
    _bindModalEvents();
    _bindHistoryEvents();
    _bindExportEvents();
    _bindStepperEvents();
    _bindKeyboard();        // ← keyboard shortcuts
    _initHistoryCharts();

    // Initialize Settings Panel
    App.SettingsUI.init();
    
    // Initialize Users UI
    if (App.UsersUI) App.UsersUI.init();

    // Subscribe to store changes for live recalc.
    // The _suppressStoreRerender flag prevents this from firing
    // while the user is actively typing in a team hours input.
    Store.subscribe(state => {
      if (_suppressStoreRerender) return;
      if (state.currentStep === 1) recalculate();
    });

    console.info('[Fávero ERP] Sistema inicializado. v3.0.0 + Supabase Auth');
  }

  return { init, goToStep, recalculate };
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
