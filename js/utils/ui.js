'use strict';
window.App = window.App || {};

/**
 * @module UI
 * All DOM rendering and component factories.
 * Pure rendering — no business logic, no direct state mutation.
 */
App.UI = (function () {
  const Config = App.Config;

  // ── Formatters ─────────────────────────────────────────────────────────────
  function moeda(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function pct(v) { return `${(v || 0).toFixed(1)}%`; }
  function horas(v) { return `${(v || 0).toFixed(2)}h`; }
  function num(v, d = 3) { return (v || 0).toFixed(d); }

  function unmask(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  }

  function initMasks(container = document) {
    container.querySelectorAll('.mask-money').forEach(input => {
      if (input.dataset.masked) return;
      input.dataset.masked = 'true';
      
      // Format initial value if present
      if (input.value && !input.value.includes(',')) {
        input.value = (Number(input.value)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }

      input.addEventListener('input', e => {
        let val = e.target.value.replace(/\D/g, '');
        if (!val) {
          e.target.value = '';
          return;
        }
        e.target.value = (parseInt(val, 10) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        // Dispatch synthetic change to trigger state updates in main.js if needed
        e.target.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    container.querySelectorAll('.mask-number').forEach(input => {
      if (input.dataset.masked) return;
      input.dataset.masked = 'true';
      
      // Format initial value if present
      if (input.value && input.value.includes('.')) {
        input.value = input.value.replace('.', ',');
      }

      input.addEventListener('input', e => {
        let val = e.target.value.replace(/[^0-9,]/g, '');
        const parts = val.split(',');
        if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');
        e.target.value = val;
      });
    });
  }

  function renderMetric(label, value, extraClass = '') {
    return `<div class="metric ${extraClass}"><small>${label}</small><strong>${value}</strong></div>`;
  }

  // ── Stepper ────────────────────────────────────────────────────────────────
  function updateStepper(currentStep) {
    document.querySelectorAll('.step-item, .calc-step').forEach((el, i) => {
      el.classList.toggle('active', i === currentStep);
      el.classList.toggle('completed', i < currentStep);
    });
    
    // Update progress bar & counters
    const progress = Math.round((currentStep / 7) * 100);
    const bar = document.getElementById('wizard-progress-bar');
    if (bar) bar.style.width = progress + '%';
    
    const lblCurrent = document.getElementById('wizard-step-current');
    const lblPct = document.getElementById('wizard-pct');
    if (lblCurrent) lblCurrent.textContent = currentStep + 1;
    if (lblPct) lblPct.textContent = progress + '% concluído';

    document.querySelectorAll('.step-panel').forEach((el, i) => {
      el.classList.toggle('active', i === currentStep);
    });
    // Scroll to top of main
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Select Builder ─────────────────────────────────────────────────────
  // Utilitário para escapar valores antes de inserir em HTML (previne XSS)
  function _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildOptions(map, selected) {
    if (!map) return '';
    return Object.entries(map)
      .map(([val, label]) => `<option value="${_escapeHtml(val)}" ${String(val) === String(selected) ? 'selected' : ''}>${_escapeHtml(label)}</option>`)
      .join('');
  }

  // ── Metric Card ───────────────────────────────────  // ── Step 1: Project Data Form (Basic Setup) ────────────────────────────────
  function renderStep1(state) {
    const p = state.project;
    const el = document.getElementById('step1-content');
    if (!el) return;
    el.innerHTML = `
      <div class="calc-category" style="margin-top:0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <h3>Informações Gerais</h3>
      </div>
      <div class="grid-2">
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-nome">Nome do Projeto</label>
            <div class="stt-input-wrap"><input type="text" id="proj-nome" class="stt-input" value="${p.nome || ''}" placeholder="Ex: Residência Silva - Elétrico" maxlength="80" /></div>
            <div class="stt-hint">Identificação principal do orçamento</div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-cliente">Cliente</label>
            <div class="stt-input-wrap"><input type="text" id="proj-cliente" class="stt-input" value="${p.cliente || ''}" placeholder="Nome do cliente" maxlength="80" /></div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-data">Data do Projeto</label>
            <div class="stt-input-wrap"><input type="date" id="proj-data" class="stt-input" value="${p.data || ''}" /></div>
          </div>
        </div>
      </div>
    `;
    initMasks(el);
  }

  // ── Step 2: Team ───────────────────────────────────────────────────────────
  function renderStep2(state, result) {
    const el = document.getElementById('step2-content');
    if (!el) return;

    el.innerHTML = `
      <div class="calc-panel-header" style="margin-bottom: 24px;">
        <div class="calc-panel-icon calc-icon-purple">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h2 class="calc-panel-title">Equipe do Projeto</h2>
          <p class="calc-panel-sub">Informe as horas de cada colaborador neste projeto</p>
        </div>
        <button id="add-team-member-btn" class="btn btn-secondary btn-sm" style="margin-left: auto;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: text-bottom;">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Adicionar Colaborador
        </button>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h2>📌 Alocação no Projeto
          <span class="badge badge-primary" id="team-count-badge">${state.team.length} membros</span>
        </h2>
        <div class="hint" style="margin-bottom: 16px; font-size: 13px; color: var(--text-muted);">
          💡 As horas da equipe têm <strong>prioridade máxima</strong> sobre área e horas manuais. Se informadas, ditarão o tempo total do projeto.
        </div>
        <div id="step2-team-list"></div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <h2 style="margin-bottom:0; border:none; padding:0;">🧑‍💼 Cadastro de Colaboradores</h2>
          <button id="add-collaborator-btn" class="btn btn-secondary btn-sm">+ Novo Colaborador</button>
        </div>
        <div class="table-wrapper">
          <table aria-label="Colaboradores cadastrados">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Custo Mensal</th>
                <th>Horas/Mês</th>
                <th>Produtividade</th>
                <th>Custo Direto/h</th>
                <th>Rateio/h</th>
                <th>Custo Real/h</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="colabs-table-body">
              <tr>
                <td colspan="9" class="table-empty">Carregando...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const container = document.getElementById('step2-team-list');

    const colabOptions = state.collaborators
      .map(c => `<option value="${c.id}">${c.nome} — ${c.cargo}</option>`)
      .join('');

    container.innerHTML = state.team.length === 0
      ? `<div class="stt-empty-state"><svg class="stt-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><h4 class="stt-empty-title">Nenhum Colaborador</h4><p class="stt-empty-desc">Adicione membros da equipe para distribuir as horas e calcular os custos.</p></div>`
      : state.team.map((membro, idx) => {
          const colab = state.collaborators.find(c => c.id === membro.colaboradorId);
          const custoHora = colab
            ? App.Calculator.custoRealHoraPorColaborador(colab, state.indirectCosts, state.collaborators)
            : 0;
          const custoTotal = (membro.horas || 0) * custoHora;
          return `
          <div class="team-row" data-idx="${idx}">
            <div class="form-group">
              <label>Colaborador</label>
              <select class="team-colab-select" data-idx="${idx}">
                ${state.collaborators.map(c =>
                  `<option value="${c.id}" ${c.id === membro.colaboradorId ? 'selected' : ''}>${c.nome} — ${c.cargo}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Horas no Projeto</label>
              <input type="number" class="team-horas-input" data-idx="${idx}" value="${membro.horas || 0}" min="0" step="0.5" />
            </div>
            <div class="form-group">
              <label>Custo Real/h</label>
              <input type="text" disabled value="${moeda(custoHora)}" class="input-readonly" />
            </div>
            <div class="form-group">
              <label>Custo no Projeto</label>
              <input type="text" disabled value="${moeda(custoTotal)}" class="input-readonly highlight" />
            </div>
            <button class="btn-icon btn-danger team-remove-btn" data-idx="${idx}" aria-label="Remover colaborador" title="Remover">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg>
            </button>
          </div>`;
        }).join('');

    // Hours preview card has been moved to a later step in the new flow
    const previewEl = document.getElementById('step2-hours-preview');
    if (previewEl) {
      previewEl.style.display = 'none';
    }

    // Render collaborator master data table
    renderColaboradoresTable(state);
  }

  function _fonteLabel(fonte) {
    const map = {
      equipe: '👥 Horas da Equipe',
      manual: '✏️ Horas Manuais',
      area: '📐 Cálculo por Área',
      nenhum: '⚠️ Não definida',
      erro: '❌ Erro',
    };
    return map[fonte] || fonte;
  }

  function renderColaboradoresTable(state) {
    const tbody = document.getElementById('colabs-table-body');
    if (!tbody) return;
    const rateio = App.Calculator.rateioIndiretoHora(state.indirectCosts, state.collaborators);
    if (state.collaborators.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><div class="stt-empty-state" style="border:none;background:transparent;padding:2rem;"><svg class="stt-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><h4 class="stt-empty-title">Nenhum Colaborador</h4><p class="stt-empty-desc">Cadastre sua equipe para calcular custos e precificar projetos.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = state.collaborators.map(c => {
      const direto = c.horasMensais > 0 ? c.custoMensal / c.horasMensais : 0;
      const real = App.Calculator.custoRealHoraPorColaborador(c, state.indirectCosts, state.collaborators);
      return `
        <tr>
          <td><strong>${c.nome}</strong></td>
          <td>${c.cargo}</td>
          <td>${moeda(c.custoMensal)}</td>
          <td>${c.horasMensais}h</td>
          <td>${c.produtividade}%</td>
          <td>${moeda(direto)}</td>
          <td>${moeda(rateio)}</td>
          <td><strong class="text-accent">${moeda(real)}</strong></td>
          <td>
            <div class="action-btns">
              <button class="btn-icon btn-secondary colab-edit-btn" data-id="${c.id}" title="Editar">✏️</button>
              <button class="btn-icon btn-danger colab-delete-btn" data-id="${c.id}" title="Excluir">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Step 3: Estimativa Base ────────────────────────────────────────────────
  function renderStep3(state) {
    const p = state.project;
    const el = document.getElementById('step3-content');
    if (!el) return;
    el.innerHTML = `
      <div class="calc-category" style="margin-top:0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        <h3>Referência de Cálculo</h3>
      </div>
      <div class="grid-2">
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-disciplina">Disciplina</label>
            <div class="stt-input-wrap">
              <select id="proj-disciplina" class="stt-input">${buildOptions(Object.fromEntries(Object.entries(state.disciplinas || {}).map(([k, v]) => [k, v.nome])), p.disciplina)}</select>
            </div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4M9 7h6M9 11h6M9 15h6"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-edificacao">Tipo de Edificação</label>
            <div class="stt-input-wrap">
              <select id="proj-edificacao" class="stt-input">${buildOptions(Config.LABELS_EDIFICACAO, p.tipoEdificacao)}</select>
            </div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-area">Área do Projeto (Estimativa)</label>
            <div class="stt-input-wrap"><input type="text" id="proj-area" class="stt-input mask-number" value="${p.area || ''}" placeholder="0" /><div class="stt-suffix">m²</div></div>
            <div class="stt-hint">Usada se não houver equipe ou horas manuais</div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-orange"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-horas-manuais">Horas Manuais (Opcional)</label>
            <div class="stt-input-wrap"><input type="text" id="proj-horas-manuais" class="stt-input mask-number" value="${p.horasManuais || ''}" placeholder="Deixe em branco" /><div class="stt-suffix">h</div></div>
            <div class="stt-hint">Substitui o cálculo por m² e as horas da equipe</div>
          </div>
        </div>
      </div>
    `;
    initMasks(el);
  }

  // ── Step 4: Complexidade e Fatores ─────────────────────────────────────────
  function renderStep4(state) {
    const p = state.project;
    const el = document.getElementById('step4-content');
    if (!el) return;
    el.innerHTML = `
      <div class="calc-category" style="margin-top:0;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <h3>Fatores de Esforço e Multiplicadores</h3>
      </div>
      <div class="grid-2">
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-complexidade">Complexidade (CMP)</label>
            <div class="stt-input-wrap">
              <select id="proj-complexidade" class="stt-input">${buildOptions(Config.LABELS_COMPLEXIDADE, p.complexidade)}</select>
            </div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-tipo-comercial">Tipo Comercial</label>
            <div class="stt-input-wrap">
              <select id="proj-tipo-comercial" class="stt-input">${buildOptions(Config.LABELS_TIPO, p.tipoComercial)}</select>
            </div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-yellow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-revisao">Fator de Revisão</label>
            <div class="stt-input-wrap">
              <select id="proj-revisao" class="stt-input">${buildOptions(Config.LABELS_REVISAO, p.revisao)}</select>
            </div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-yellow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="proj-aprovacao">Fator de Aprovação</label>
            <div class="stt-input-wrap">
              <select id="proj-aprovacao" class="stt-input">${buildOptions(Config.LABELS_APROVACAO, p.aprovacao)}</select>
            </div>
          </div>
        </div>
      </div>
      <div id="step4-hours-preview"></div>
    `;

    const result = App.Calculator ? App.Calculator.calcularResultado(state) : null;
    const previewEl = document.getElementById('step4-hours-preview');
    if (previewEl && result) {
      const f = result.fatores || {};
      const pct = v => v === 1 ? '<span class="factor-neutral">1.00×</span>' : v > 1 ? `<span class="factor-up">+${((v-1)*100).toFixed(0)}% (${v.toFixed(2)}×)</span>` : `<span class="factor-down">${((v-1)*100).toFixed(0)}% (${v.toFixed(2)}×)</span>`;
      previewEl.innerHTML = `
        <div class="card card-accent" style="margin-top: 24px;">
          <div class="hours-preview-grid">
            ${renderMetric('Fonte das Horas', _fonteLabel(result.fonteHoras), 'metric-info')}
            ${renderMetric('Horas Base', horas(result.horasBase))}
            ${renderMetric('Fator de Esforço Total', '×' + result.fatorEsforco.toFixed(3), 'metric-accent')}
            ${renderMetric('Horas Finais', horas(result.horasFinais), 'metric-accent')}
          </div>
          <div class="factors-breakdown">
            <p class="factors-title">📊 Detalhamento do Fator de Esforço</p>
            <div class="factors-grid">
              <div class="factor-item"><span class="factor-label">🏠 Edificação</span>${pct(f.edificacao || 1)}</div>
              <div class="factor-item"><span class="factor-label">🔄 Revisão</span>${pct(f.revisao || 1)}</div>
              <div class="factor-item"><span class="factor-label">📋 Aprovação</span>${pct(f.aprovacao || 1)}</div>
              <div class="factor-item"><span class="factor-label">⚙️ Complexidade</span>${pct(f.complexidade || 1)}</div>
              <div class="factor-item factor-tipo"><span class="factor-label">💼 Tipo Comercial</span>${pct(f.tipoComercial || 1)}</div>
            </div>
          </div>
        </div>`;
    }

    initMasks(el);
  }

  // ── Step 5: Costs ──────────────────────────────────────────────────────────
  function renderStep5(state) {
    const costsEl = document.getElementById('step5-content');
    if (!costsEl) return;

    const costs = state.costs || {};
    const indirectCosts = Array.isArray(state.indirectCosts) ? state.indirectCosts : [];
    const settings = state.settings || {};
    const impostoPct = (settings.impostoSimples || 0) * 100;
    costsEl.innerHTML = `
      <div class="calc-panel-header">
        <div class="calc-panel-icon calc-icon-green">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <h2 class="calc-panel-title">Custos e Margens</h2>
          <p class="calc-panel-sub">Despesas diretas, custos indiretos e margem de lucro desejada</p>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="cost-art">Taxa ART/RRT</label>
            <div class="stt-input-wrap"><div class="stt-prefix">R$</div><input type="text" id="cost-art" class="stt-input mask-money" value="${costs.art || 0}" /></div>
            <div class="stt-hint">Taxa de responsabilidade técnica</div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="cost-outros">Outros (Plotagem/Visitas)</label>
            <div class="stt-input-wrap"><div class="stt-prefix">R$</div><input type="text" id="cost-outros" class="stt-input mask-money" value="${costs.outros || 0}" /></div>
            <div class="stt-hint">Despesas diretas variáveis</div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="cost-margem">Margem de Lucro Desejada</label>
            <div class="stt-input-wrap"><input type="text" id="cost-margem" class="stt-input mask-number" value="${costs.margemLucro || 20}" /><div class="stt-suffix">%</div></div>
            <div class="stt-hint">Usada na precificação individual por colaborador</div>
          </div>
        </div>
        <div class="stt-field-card">
          <div class="stt-field-icon stt-icon-green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M7 15h0M2 9h20M7 11h0"/></svg></div>
          <div class="stt-field-body">
            <label class="stt-label" for="cost-imposto">Imposto (Simples Nacional)</label>
            <div class="stt-input-wrap"><input type="text" id="cost-imposto" class="stt-input mask-number" value="${impostoPct}" /><div class="stt-suffix">%</div></div>
            <div class="stt-hint">Imposto sobre a nota fiscal</div>
          </div>
        </div>
      </div>
      <div class="calc-category">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <h3>Custos Indiretos do Escritório</h3>
        <button class="btn btn-secondary btn-sm" id="add-indirect-btn" style="margin-left:auto;">+ Adicionar Item</button>
      </div>
      <div id="indirect-costs-list">
        ${indirectCosts.map((c, i) => {
          if (!c) return '';
          return `
          <div class="indirect-row" data-idx="${i}">
            <div class="form-group">
              <label>Descrição</label>
              <input type="text" class="indirect-nome" data-idx="${i}" value="${c.nome || ''}" placeholder="Ex: Aluguel" />
            </div>
            <div class="form-group">
              <label>Valor Mensal (R$)</label>
              <input type="text" class="indirect-valor mask-money" data-idx="${i}" value="${c.valor || 0}" />
            </div>
            <button class="btn-icon btn-danger indirect-remove-btn" data-idx="${i}" title="Remover">🗑️</button>
          </div>`;
        }).join('')}
      </div>
      <div class="indirect-total-box">
        <span>Total Custos Indiretos/mês:</span>
        <strong>${moeda(indirectCosts.reduce((s, c) => s + ((c && c.valor) || 0), 0))}</strong>
        <span class="muted">→ Rateio: ${moeda(App.Calculator.rateioIndiretoHora(indirectCosts, Array.isArray(state.collaborators) ? state.collaborators : []))}/h</span>
      </div>`;
    initMasks(costsEl);
  }

  // ── Step 6: Result Dashboard ───────────────────────────────────────────────
  function renderStep6(state, result) {
    if (!result) {
      document.getElementById('step6-content').innerHTML =
        `<div class="stt-empty-state"><svg class="stt-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h4 class="stt-empty-title">Faltam Informações</h4><p class="stt-empty-desc">Preencha os dados básicos do projeto para visualizar os resultados do orçamento.</p></div>`;
      return;
    }
    document.getElementById('step6-content').innerHTML = `
      <div class="calc-panel-header" style="margin-bottom: 24px;">
        <div class="calc-panel-icon calc-icon-yellow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <div>
          <h2 class="calc-panel-title">Dashboard de Resultado</h2>
          <p class="calc-panel-sub">Indicadores financeiros completos do projeto</p>
        </div>
      </div>

      <!-- Main KPIs -->
      <div class="kpi-grid" style="margin-bottom: 24px;">
        <div class="kpi-block kpi-final" id="kpi-block-final">
          <small>Preço Final Sugerido</small>
          <strong id="kpi-valor-final">R$ —</strong>
          <div class="kpi-sub" id="kpi-determinante">—</div>
        </div>
        <div class="kpi-block"><small>Custo Interno Total</small><strong id="kpi-custo-total">R$ —</strong>
        </div>
        <div class="kpi-block"><small>Lucro Bruto</small><strong id="kpi-lucro-bruto">R$ —</strong></div>
        <div class="kpi-block"><small>Lucro Líquido</small><strong id="kpi-lucro-liq">R$ —</strong></div>
        <div class="kpi-block kpi-success"><small>Margem Bruta</small><strong id="kpi-margem-bruta">—</strong>
        </div>
        <div class="kpi-block"><small>Mark-up</small><strong id="kpi-markup">—</strong></div>
        <div class="kpi-block"><small>Rentabilidade</small><strong id="kpi-rentabilidade">—</strong></div>
        <div class="kpi-block kpi-info"><small>Preço Mínimo/hora</small><strong id="kpi-ponto-eq">—</strong>
        </div>
      </div>

      <div id="kpi-alertas" style="margin-bottom: 20px;"></div>

      <div class="grid-2" style="margin-bottom: 24px;">
        <div class="card">
          <h2>⏱️ Análise de Horas</h2>
          <div class="grid-2" style="gap: 14px;">
            <div class="metric"><small>Fonte das Horas</small><strong id="kpi-fonte-horas">—</strong></div>
            <div class="metric"><small>Horas Base</small><strong id="kpi-horas-base">—</strong></div>
            <div class="metric"><small>Fator de Esforço</small><strong id="kpi-fator-esforco">—</strong></div>
            <div class="metric metric-accent"><small>Horas Finais</small><strong
                id="kpi-horas-finais">—</strong></div>
          </div>
        </div>
        <div class="card">
          <h2>💵 Candidatos de Preço</h2>
          <div class="grid-2" style="gap: 14px;">
            <div class="metric"><small>Ref. Comercial</small><strong id="kpi-ref-comercial">—</strong></div>
            <div class="metric"><small>Custo × 1.8</small><strong id="kpi-custo-min">—</strong></div>
            <div class="metric"><small>Ticket Mínimo</small><strong id="kpi-ticket-min">—</strong></div>
            <div class="metric"><small>Impostos (6%)</small><strong id="kpi-imposto">—</strong></div>
          </div>
          <div class="determinant-banner" style="margin-top: 14px; font-size: 13px;"
            id="kpi-determinante-banner">
            <span id="kpi-valor-liq">Valor líquido: R$ —</span>
          </div>
        </div>
      </div>

      <div class="charts-grid" style="margin-bottom: 24px;">
        <div class="chart-card">
          <h3>🍩 Composição de Custos</h3>
          <div class="chart-container">
            <canvas id="chart-custo-composicao" aria-label="Gráfico de composição de custos"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <h3>📊 Candidatos de Preço</h3>
          <div class="chart-container">
            <canvas id="chart-candidatos" aria-label="Gráfico comparativo de candidatos de preço"></canvas>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h2>👥 Composição de Custo da Equipe</h2>
        <div class="table-wrapper">
          <table aria-label="Composição de custo da equipe no projeto">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Horas Informadas</th>
                <th>Horas Ajustadas (fator)</th>
                <th>Custo Real/h</th>
                <th>Custo no Projeto</th>
              </tr>
            </thead>
            <tbody id="result-team-body">
              <tr>
                <td colspan="6" class="table-empty">Calcule o projeto para ver os resultados.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <h2>👤 Precificação por Colaborador Individual</h2>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Preço sugerido caso o projeto seja executado individualmente por cada colaborador, com a margem de
          lucro configurada na etapa anterior.
        </p>
        <div class="table-wrapper">
          <table aria-label="Precificação individual por colaborador">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo</th>
                <th>Custo Real/h</th>
                <th>Custo Total Interno</th>
                <th>Preço Sugerido</th>
              </tr>
            </thead>
            <tbody id="individual-pricing-body">
              <tr>
                <td colspan="5" class="table-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="office-strip">
        <div class="office-strip-item"><small>Custo Mensal</small><strong id="office-custo-mensal">—</strong>
        </div>
        <div class="office-strip-item"><small>Horas Prod./Mês</small><strong id="office-horas-prod">—</strong>
        </div>
        <div class="office-strip-item"><small>Rateio/h</small><strong id="office-rateio-hora">—</strong></div>
        <div class="office-strip-item"><small>Custos Indiretos</small><strong id="office-custos-ind">—</strong>
        </div>
        <div class="office-strip-item"><small>Meta Mensal</small><strong id="office-meta-mensal">—</strong>
        </div>
        <div class="office-strip-item"><small>Meta Semanal</small><strong id="office-meta-semanal">—</strong>
        </div>
        <div class="office-strip-item"><small>Meta Diária</small><strong id="office-meta-diaria">—</strong>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <h2>📐 Base de Disciplinas</h2>
        <div class="table-wrapper">
          <table aria-label="Base de referência de disciplinas">
            <thead>
              <tr>
                <th>Disciplina</th>
                <th>Área Ref.</th>
                <th>Horas Ref.</th>
                <th>Horas/m²</th>
                <th>Valor Base</th>
                <th>Ticket Mínimo</th>
              </tr>
            </thead>
            <tbody id="disciplines-table-body">
              <tr>
                <td colspan="6" class="table-empty">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Main KPIs
    document.getElementById('kpi-valor-final').textContent  = moeda(result.valorFinal);
    document.getElementById('kpi-custo-total').textContent  = moeda(result.custoInternoTotal);
    document.getElementById('kpi-margem-bruta').textContent = pct(result.margemBruta);
    document.getElementById('kpi-markup').textContent       = `${result.markup.toFixed(2)}×`;
    document.getElementById('kpi-lucro-bruto').textContent  = moeda(result.lucrobruto);
    document.getElementById('kpi-lucro-liq').textContent    = moeda(result.lucroLiquido);
    document.getElementById('kpi-rentabilidade').textContent= pct(result.rentabilidade);
    document.getElementById('kpi-ponto-eq').textContent     = `${moeda(result.pontoEquilibrio)}/h`;
    document.getElementById('kpi-horas-finais').textContent = horas(result.horasFinais);
    document.getElementById('kpi-horas-base').textContent   = horas(result.horasBase);
    document.getElementById('kpi-fator-esforco').textContent= `×${result.fatorEsforco.toFixed(3)}`;
    document.getElementById('kpi-fonte-horas').textContent  = _fonteLabel(result.fonteHoras);
    document.getElementById('kpi-imposto').textContent      = moeda(result.imposto);
    document.getElementById('kpi-valor-liq').textContent    = moeda(result.valorLiquido);
    document.getElementById('kpi-ref-comercial').textContent= moeda(result.valorReferenciaComercial);
    document.getElementById('kpi-custo-min').textContent    = moeda(result.valorMinimoPorCusto);
    document.getElementById('kpi-ticket-min').textContent   = moeda(result.ticketMinimoComDespesas);
    document.getElementById('kpi-determinante').textContent = result.determinante;

    // ── Factors Breakdown Panel (step 4) ──────────────────────────────────────
    const factorsEl = document.getElementById('kpi-fatores-breakdown');
    if (factorsEl && result.fatores) {
      const f = result.fatores;
      const fmtFator = (v) => {
        if (v === 1)   return `<span class="factor-neutral">neutro (×1.00)</span>`;
        if (v > 1)     return `<span class="factor-up">+${((v - 1) * 100).toFixed(0)}% (×${v.toFixed(2)})</span>`;
        return             `<span class="factor-down">${((v - 1) * 100).toFixed(0)}% (×${v.toFixed(2)})</span>`;
      };
      factorsEl.innerHTML = `
        <table class="factors-table">
          <thead><tr><th>Parâmetro</th><th>Seleção</th><th>Impacto nas Horas</th></tr></thead>
          <tbody>
            <tr><td>🏠 Tipo de Edificação</td><td>${Config.LABELS_EDIFICACAO[state.project.tipoEdificacao] || '—'}</td><td>${fmtFator(f.edificacao)}</td></tr>
            <tr><td>🔄 Fator de Revisão</td><td>${Config.LABELS_REVISAO[state.project.revisao] || '—'}</td><td>${fmtFator(f.revisao)}</td></tr>
            <tr><td>📋 Fator de Aprovação</td><td>${Config.LABELS_APROVACAO[state.project.aprovacao] || '—'}</td><td>${fmtFator(f.aprovacao)}</td></tr>
            <tr><td>⚙️ Complexidade</td><td>${Config.LABELS_COMPLEXIDADE[state.project.complexidade] || '—'}</td><td>${fmtFator(f.complexidade)}</td></tr>
            <tr><td>⚠️ Fator de Risco</td><td>${Config.LABELS_RISCO[state.project.fatorRisco] || '—'}</td><td>${fmtFator(f.risco)}</td></tr>
            <tr><td>⏱️ Fator de Urgência</td><td>${Config.LABELS_URGENCIA[state.project.fatorUrgencia] || '—'}</td><td>${fmtFator(f.urgencia)}</td></tr>
            <tr class="factor-row-tipo"><td>💼 Tipo Comercial</td><td>${Config.LABELS_TIPO[state.project.tipoComercial] || '—'}</td><td><span class="factor-comercial">${fmtFator(f.tipoComercial)} no Valor Ref.</span></td></tr>
          </tbody>
          <tfoot>
            <tr><td colspan="2"><strong>Fator de Esforço Total</strong></td><td><strong>×${result.fatorEsforco.toFixed(3)}</strong></td></tr>
          </tfoot>
        </table>`;
    }

    // Color highlight based on margin
    const finalKpiEl = document.getElementById('kpi-block-final');
    if (finalKpiEl) {
      finalKpiEl.className = 'kpi-block kpi-final ' + (result.margemBruta >= 20 ? 'kpi-success' : result.margemBruta >= 10 ? 'kpi-warning' : 'kpi-danger');
    }

    // Financial health alerts (from calculator.js alertas[])
    const alertasEl = document.getElementById('kpi-alertas');
    if (alertasEl && result.alertas) {
      if (result.alertas.length === 0) {
        alertasEl.innerHTML = '';
      } else {
        alertasEl.innerHTML = result.alertas.map(a => `
          <div class="alert-banner alert-${a.tipo}" role="alert">
            ${a.msg}
          </div>`).join('');
      }
    }

    // Color the lucro-líquido KPI block
    const kpiLucroLiq = document.getElementById('kpi-lucro-liq');
    if (kpiLucroLiq) {
      kpiLucroLiq.className = result.lucroLiquido < 0 ? 'text-danger' : result.lucroLiquido < result.custoInternoTotal * 0.1 ? 'text-warning' : 'text-success';
    }


    // Team table
    const tbody = document.getElementById('result-team-body');
    if (tbody) {
      if (result.detalhesEquipe.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Usando custo médio do escritório (sem equipe informada).</td></tr>`;
      } else {
        tbody.innerHTML = result.detalhesEquipe.map(d => `
          <tr>
            <td><strong>${d.nome}</strong></td>
            <td>${d.cargo}</td>
            <td>${horas(d.horas)}</td>
            <td>${horas(d.horasAjustadas)}</td>
            <td>${moeda(d.custoHora)}</td>
            <td><strong>${moeda(d.custoTotal)}</strong></td>
          </tr>`).join('');
      }
    }

    // Individual pricing table
    const pricingBody = document.getElementById('individual-pricing-body');
    if (pricingBody) {
      pricingBody.innerHTML = result.precificacaoIndividual.map(p => `
        <tr>
          <td><strong>${p.nome}</strong></td>
          <td>${p.cargo}</td>
          <td>${moeda(p.custoHora)}</td>
          <td>${moeda(p.custoTotalInt)}</td>
          <td class="text-success"><strong>${moeda(p.precoSugerido)}</strong></td>
        </tr>`).join('');
    }

    // Disciplines table (office baseline)
    const discBody = document.getElementById('disciplines-table-body');
    if (discBody) {
      discBody.innerHTML = Object.entries(state.disciplinas || {}).map(([key, d]) => {
        const hM2 = d.horasRef / d.areaRef;
        return `
          <tr class="${key === state.project.disciplina ? 'row-highlighted' : ''}">
            <td><strong>${d.nome}</strong></td>
            <td>${d.areaRef} m²</td>
            <td>${d.horasRef}h</td>
            <td>${hM2.toFixed(3)}h/m²</td>
            <td>${moeda(d.valorBase)}</td>
            <td>${moeda(d.ticketMinimo)}</td>
          </tr>`;
      }).join('');
    }

    // Office summary
    document.getElementById('office-custo-mensal').textContent   = moeda(result.custoMensalTotal);
    document.getElementById('office-horas-prod').textContent     = `${result.totalHorasProdutivas}h`;
    document.getElementById('office-rateio-hora').textContent    = moeda(result.rateioHora);
    document.getElementById('office-meta-mensal').textContent    = moeda(result.metaMensal);
    document.getElementById('office-meta-semanal').textContent   = moeda(result.metaSemanal);
    document.getElementById('office-meta-diaria').textContent    = moeda(result.metaDiaria);
    document.getElementById('office-custos-ind').textContent     = moeda(result.totalCustosIndiretos);
  }

  // ── Step 7: Fechamento Comercial (Ajuste Fino) ─────────────────────────────
  function renderStep7(state, result) {
    const el = document.getElementById('step7-content');
    if (!el || !result) return;
    
    const p = state.project;
    const a = p.ajusteComercial || { desconto: 0, acrescimo: 0, valorFechado: null };

    // Determinar classes de alerta para a margem real
    let margemClass = 'text-success';
    if (result.margemReal < 10) margemClass = 'text-danger';
    else if (result.margemReal < 20) margemClass = 'text-warning';

    // Se a tabela já existir no DOM, faça um update cirúrgico para não perder foco
    if (document.getElementById('sim-custo-final')) {
      document.getElementById('sim-custo-final').innerHTML = `<strong>${moeda(result.custoInternoTotal)}</strong>`;
      document.getElementById('sim-preco-base').textContent = moeda(result.valorFinalBase);
      document.getElementById('sim-preco-fechado').innerHTML = `<strong style="font-size:24px; color: var(--primary);">${moeda(result.valorFinal)}</strong>`;
      document.getElementById('sim-lucro').innerHTML = `Lucro Líquido Projetado: <strong>${moeda(result.lucroLiquido)}</strong>`;
      document.getElementById('sim-margem').innerHTML = `Margem Líquida Real: <strong class="${margemClass}">${pct(result.margemReal)}</strong>`;
      
      document.getElementById('sim-risco-pct').textContent = pct((p.fatorRisco || 0) * 100);
      document.getElementById('sim-urgencia-pct').textContent = pct((p.fatorUrgencia || 0) * 100);
      
      return;
    }

    el.innerHTML = `
      <div class="grid-2" style="margin-bottom: 24px; align-items: start;">
        <!-- Bloco Esquerdo: Painel de Controles -->
        <div class="card" style="margin:0;">
          <h2>🎛️ Ajustes Manuais</h2>
          <div class="form-group">
            <label>Desconto Concedido (R$)</label>
            <input type="number" id="comercial-desconto" value="${a.desconto}" min="0" step="50" placeholder="Ex: 500" />
          </div>
          <div class="form-group">
            <label>Acréscimo Estratégico (R$)</label>
            <input type="number" id="comercial-acrescimo" value="${a.acrescimo}" min="0" step="50" placeholder="Ex: 1000" />
          </div>
          <div class="form-group" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <label style="color: var(--primary);">Forçar Fechamento (Arredondamento)</label>
            <input type="number" id="comercial-fechado" value="${a.valorFechado || ''}" min="0" step="100" placeholder="Ex: 5000" style="border-color: var(--primary-dim);" />
            <small class="muted" style="display:block; margin-top:4px;">Se preenchido, ignora desconto/acréscimo e crava o preço final.</small>
          </div>
          
          <div class="form-group" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <label>Ajuste de Risco (+%)</label>
            <input type="range" id="comercial-risco" value="${p.fatorRisco || 0}" min="0" max="0.5" step="0.05" />
            <div style="display:flex; justify-content:space-between; font-size:12px;"><span>0%</span><span id="sim-risco-pct">${pct((p.fatorRisco || 0) * 100)}</span></div>
          </div>
          <div class="form-group">
            <label>Ajuste de Urgência (+%)</label>
            <input type="range" id="comercial-urgencia" value="${p.fatorUrgencia || 0}" min="0" max="0.5" step="0.05" />
            <div style="display:flex; justify-content:space-between; font-size:12px;"><span>0%</span><span id="sim-urgencia-pct">${pct((p.fatorUrgencia || 0) * 100)}</span></div>
          </div>
          <div style="margin-top:16px;">
             <button id="btn-limpar-ajuste" class="btn btn-ghost btn-sm" style="width:100%; color:var(--text-muted);">Limpar Ajustes Manuais</button>
          </div>
        </div>

        <!-- Bloco Direito: Painel de Resultados em Tempo Real -->
        <div class="card" style="margin:0; position: sticky; top: 16px; background: var(--bg-base);">
          <h2>📈 Simulação do Negócio</h2>
          <table class="summary-table" style="margin-top: 16px; font-size: 15px;">
            <tr>
               <td>Custo Interno Final</td>
               <td id="sim-custo-final" style="text-align:right;"><strong>${moeda(result.custoInternoTotal)}</strong></td>
            </tr>
            <tr>
               <td>Preço Analítico Original</td>
               <td id="sim-preco-base" style="text-align:right; color: var(--text-muted); text-decoration: line-through;">${moeda(result.valorFinalBase)}</td>
            </tr>
            <tr style="border-top: 1px solid var(--border);">
               <td style="padding-top: 16px;"><strong style="font-size:18px;">Preço Fechado</strong></td>
               <td id="sim-preco-fechado" style="padding-top: 16px; text-align:right;"><strong style="font-size:24px; color: var(--primary);">${moeda(result.valorFinal)}</strong></td>
            </tr>
            <tr>
               <td colspan="2" id="sim-lucro" style="padding-top: 16px; font-size: 14px;">
                 Lucro Líquido Projetado: <strong>${moeda(result.lucroLiquido)}</strong>
               </td>
            </tr>
            <tr>
               <td colspan="2" id="sim-margem" style="font-size: 14px;">
                 Margem Líquida Real: <strong class="${margemClass}">${pct(result.margemReal)}</strong>
               </td>
            </tr>
          </table>
          <div style="margin-top: 24px; padding: 12px; background: rgba(76,139,245,0.05); border-radius: 8px; border: 1px solid rgba(76,139,245,0.2);">
            <small style="color: var(--text-muted);">O preço fechado ajustado será levado ao relatório e histórico.</small>
          </div>
        </div>
      </div>`;
  }

  // ── Step 5: Report ─────────────────────────────────────────────────────────
  function renderOldStep5(state, result) {
    const el = document.getElementById('step5-summary');
    if (!el || !result) return;

    el.innerHTML = `
      <div class="report-summary-grid">
        <div class="report-info-block">
          <h3>📋 Resumo do Projeto</h3>
          <table class="summary-table">
            <tr><td>Projeto</td><td><strong>${state.project.nome || '—'}</strong></td></tr>
            <tr><td>Cliente</td><td>${state.project.cliente || '—'}</td></tr>
            <tr><td>Disciplina</td><td>${(state.disciplinas || {})[state.project.disciplina]?.nome || '—'}</td></tr>
            <tr><td>Horas Finais</td><td>${horas(result.horasFinais)}</td></tr>
            <tr><td>Custo Interno</td><td>${moeda(result.custoInternoTotal)}</td></tr>
            <tr><td>Mark-up</td><td>${result.markup.toFixed(2)}×</td></tr>
            <tr><td>Margem Bruta</td><td>${pct(result.margemBruta)}</td></tr>
            <tr><td>Rentabilidade</td><td>${pct(result.rentabilidade)}</td></tr>
          </table>
        </div>
        <div class="report-price-block">
          <small>PREÇO FINAL SUGERIDO</small>
          <div class="price-hero">${moeda(result.valorFinal)}</div>
          <div class="price-detail">${result.determinante}</div>
          <div class="price-sub">Líquido (após imposto): <strong>${moeda(result.valorLiquido)}</strong></div>
        </div>
      </div>`;
  }

  // ── History Table ──────────────────────────────────────────────────────────
  function renderHistory(history) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    const state = window.App?.Store?.getState() || {};

    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><div class="stt-empty-state" style="border:none;background:transparent;padding:2rem;"><svg class="stt-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><h4 class="stt-empty-title">Nenhum projeto salvo</h4><p class="stt-empty-desc">Após calcular, clique em "Salvar no Histórico".</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = history.map(h => {
      const hasRealized = h.aiPayload?.horasRealizadas !== null && h.aiPayload?.horasRealizadas !== undefined;
      const diff = hasRealized
        ? ((h.aiPayload.horasRealizadas - h.result.horasFinais) / h.result.horasFinais * 100)
        : null;
      return `
        <tr>
          <td>${new Date(h.savedAt).toLocaleDateString('pt-BR')}</td>
          <td><strong>${h.project.nome || '—'}</strong></td>
          <td>${h.project.cliente || '—'}</td>
          <td>${(state.disciplinas || {})[h.project.disciplina]?.nome || h.project.disciplina}</td>
          <td>${horas(h.result.horasFinais)}</td>
          <td>${hasRealized ? horas(h.aiPayload.horasRealizadas) : `<input type="number" class="history-realized-input input-inline" data-id="${h.id}" placeholder="Informar" min="0" step="0.5" />`}</td>
          <td>${diff !== null ? `<span class="diff-badge ${diff > 0 ? 'diff-over' : 'diff-under'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>` : '—'}</td>
          <td><strong class="text-success">${moeda(h.result.valorFinal)}</strong></td>
          <td>
            <div class="action-btns">
              <button class="btn-icon history-load-btn" data-id="${h.id}" title="Carregar projeto">📂</button>
              <button class="btn-icon btn-danger history-delete-btn" data-id="${h.id}" title="Excluir">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Collaborator Modal ─────────────────────────────────────────────────────
  function openCollaboratorModal(colab = null) {
    const isEdit = !!colab;
    document.getElementById('modal-colab-title').textContent = isEdit ? 'Editar Colaborador' : 'Novo Colaborador';
    document.getElementById('modal-colab-id').value    = colab?.id || '';
    document.getElementById('modal-colab-nome').value  = colab?.nome || '';
    document.getElementById('modal-colab-cargo').value = colab?.cargo || '';
    document.getElementById('modal-colab-custo').value = colab?.custoMensal || '';
    document.getElementById('modal-colab-horas').value = colab?.horasMensais || 160;
    document.getElementById('modal-colab-prod').value  = colab?.produtividade || 100;
    document.getElementById('modal-collaborator').classList.add('open');
    document.getElementById('modal-colab-nome').focus();
  }

  function closeCollaboratorModal() {
    document.getElementById('modal-collaborator').classList.remove('open');
  }

  // ── Toast Notifications ────────────────────────────────────────────────────
  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-visible'));
    setTimeout(() => {
      el.classList.remove('toast-visible');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Validation Feedback ────────────────────────────────────────────────────
  function showValidationError(fieldId, message) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.add('input-error');
    let hint = el.parentElement.querySelector('.validation-msg');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'validation-msg';
      el.parentElement.appendChild(hint);
    }
    hint.textContent = message;
    el.addEventListener('input', () => clearValidationError(fieldId), { once: true });
  }

  function clearValidationError(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.classList.remove('input-error');
    const hint = el.parentElement.querySelector('.validation-msg');
    if (hint) hint.remove();
  }

  // ── Step 8: Relatório ──────────────────────────────────────────────────────
  function renderStep8(state, result) {
    const el = document.getElementById('step8-content');
    if (!el || !result) return;
    
    el.innerHTML = `
      <div class="report-header" style="text-align: center; margin-bottom: 2rem;">
        <h2>Relatório de Orçamento</h2>
        <p style="color: var(--text-muted);">Projeto: <strong>${state.project.nome || 'Não informado'}</strong> | Cliente: <strong>${state.project.cliente || 'Não informado'}</strong></p>
        <p style="color: var(--text-muted);">Data: <strong>${state.project.data ? new Date(state.project.data).toLocaleDateString() : new Date().toLocaleDateString()}</strong></p>
      </div>

      <div class="kpi-grid" style="margin-bottom: 2rem;">
        <div class="kpi-block kpi-final kpi-success" style="grid-column: 1 / -1;">
          <span class="kpi-label" style="font-size: 1.2rem;">Valor Final Fechado</span>
          <strong class="kpi-value" style="font-size: 2.5rem;">${moeda(result.valorFinal)}</strong>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Indicadores Chave</h3>
          <ul style="list-style: none; padding: 0; line-height: 2;">
            <li>Custo Interno Total: <strong>${moeda(result.custoInternoTotal)}</strong></li>
            <li>Margem Líquida Real: <strong>${pct(result.margemReal)}</strong></li>
            <li>Lucro Líquido Projetado: <strong>${moeda(result.lucroLiquido)}</strong></li>
            <li>Horas Totais: <strong>${horas(result.horasFinais)}</strong></li>
          </ul>
        </div>
        <div class="card">
          <h3>Resumo da Equipe</h3>
          <ul style="list-style: none; padding: 0; line-height: 2;">
            ${result.detalhesEquipe.length > 0 ? 
              result.detalhesEquipe.map(d => `<li>${d.nome}: <strong>${horas(d.horas)}</strong> (${moeda(d.custoTotal)})</li>`).join('') :
              '<li>Custo médio do escritório utilizado (sem equipe informada)</li>'
            }
          </ul>
        </div>
      </div>

      <div class="actions" style="margin-top: 2rem; display: flex; gap: 1rem; justify-content: center;">
         <button class="btn btn-primary" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Imprimir PDF
         </button>
         <button class="btn btn-secondary" id="btn-save-history-step8">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            Salvar Projeto na Nuvem
         </button>
      </div>
    `;

    // Bind event for saving project in Step 8
    document.getElementById('btn-save-history-step8')?.addEventListener('click', () => {
      document.getElementById('btn-save-history')?.click();
    });
  }

  // ── Dashboard Layout Functions ─────────────────────────────────────────────
  function populateDashboardSelects(state) {
    const elDisciplina = document.getElementById('proj-disciplina');
    let disciplinasMap = {};
    try {
      if (state && state.disciplinas) {
        if (Array.isArray(state.disciplinas)) {
           state.disciplinas.forEach(d => disciplinasMap[d.id || d.nome] = d.nome);
        } else {
           Object.keys(state.disciplinas).forEach(k => {
             disciplinasMap[k] = state.disciplinas[k].nome || state.disciplinas[k];
           });
        }
      }
    } catch(e) { console.error('Erro ao formatar disciplinas', e); }

    if (elDisciplina) elDisciplina.innerHTML = buildOptions(disciplinasMap, state?.project?.disciplina);
    
    const elEdificacao = document.getElementById('proj-edificacao');
    if (elEdificacao) elEdificacao.innerHTML = buildOptions(Config.LABELS_EDIFICACAO || {}, state?.project?.tipoEdificacao);

    // Mantem o formulario sincronizado com o estado (inclusive no primeiro
    // carregamento e depois de iniciar um novo projeto).
    const values = {
      'proj-cliente': state?.project?.cliente || '',
      'proj-nome': state?.project?.nome || '',
      'proj-area': state?.project?.area || '',
      'proj-cidade': state?.project?.cidade || '',
      'cost-art': state?.costs?.art || '',
      'cost-outros': state?.costs?.outros || '',
      'dash-preco-fechado': state?.project?.ajusteComercial?.valorFechado || '',
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && el !== document.activeElement) el.value = value;
    });

    const checkedValues = {
      'proj-complexidade': state?.project?.complexidade ?? 1,
      'proj-revisao': state?.project?.revisao ?? 0,
      'proj-urgencia': state?.project?.fatorUrgencia ?? 0,
    };
    Object.entries(checkedValues).forEach(([name, value]) => {
      document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
        el.checked = String(el.value) === String(value);
      });
    });

    const approvalCount = Math.max(0, Number(state?.project?.aprovacao) || 0);
    const savedApprovalNames = Array.isArray(state?.project?.aprovacoesSelecionadas)
      ? state.project.aprovacoesSelecionadas
      : null;
    const approvalOptions = [
      { id: 'aprov-prefeitura', name: 'Prefeitura' },
      { id: 'aprov-bombeiros', name: 'Bombeiros' },
      { id: 'aprov-vigilancia', name: 'Vigilância Sanitária' },
    ];
    // Old budgets stored only the count. An empty names array combined with a
    // positive count therefore uses the legacy first-N fallback.
    const restoreByName = savedApprovalNames && (savedApprovalNames.length > 0 || approvalCount === 0);
    approvalOptions.forEach((option, index) => {
      const checkbox = document.getElementById(option.id);
      if (!checkbox) return;
      checkbox.checked = restoreByName
        ? savedApprovalNames.includes(option.name)
        : index < approvalCount;
    });
  }

  function renderDashboardTeam(state) {
    const container = document.getElementById('dash-team-list');
    if (!container) return;

    if (state.team.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 1rem; color:var(--text-muted); font-size:13px;">Nenhum membro na equipe.</div>`;
      return;
    }

    container.innerHTML = state.team.map((membro, idx) => {
      const colab = state.collaborators.find(c => c.id === membro.colaboradorId);
      const custoHora = colab
        ? App.Calculator.custoRealHoraPorColaborador(
            colab, state.indirectCosts, state.collaborators
          )
        : 0;
      const horasMensais = Number(colab?.horasMensais) || 0;
      const custoDiretoHora = horasMensais > 0
        ? Math.max(0, Number(colab?.custoMensal) || 0) / horasMensais
        : 0;
      const custoParticipacao = custoHora * (Number(membro.horas) || 0);
      return `
        <div class="team-member-row" data-idx="${idx}">
          <div style="flex: 2; min-width: 180px;">
            <select class="dash-team-select stt-input" data-idx="${idx}" style="width: 100%; padding: 0.4rem; font-size: 13px;">
              ${state.collaborators.map(c => 
                `<option value="${c.id}" ${c.id === membro.colaboradorId ? 'selected' : ''}>${c.nome} — ${c.cargo}</option>`
              ).join('')}
            </select>
            <div class="team-cost-breakdown" title="Custo real por hora: remuneracao, rateio dos custos indiretos e produtividade">
              <span>Direto/h: <strong>${moeda(custoDiretoHora)}</strong></span>
              <span>Real/h: <strong data-team-cost-hour>${moeda(custoHora)}</strong></span>
              <span>Participacao: <strong data-team-cost-total>${moeda(custoParticipacao)}</strong></span>
            </div>
          </div>
          <div style="flex: 1; display:flex; align-items:center; gap: 8px;">
            <input type="number" class="dash-team-hours stt-input" data-idx="${idx}" value="${membro.horas || 0}" min="0" step="1" style="width: 60px; padding: 0.4rem; text-align:center;" /> <span style="font-size:12px;color:var(--text-secondary);">h</span>
          </div>
          <button type="button" class="btn-remove-team-member" data-idx="${idx}" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }).join('');
  }

  function updateDashboardTeamCosts(state) {
    document.querySelectorAll('.team-member-row').forEach((row, idx) => {
      const membro = state.team[idx];
      const colab = membro
        ? state.collaborators.find(c => c.id === membro.colaboradorId)
        : null;
      const custoHora = colab
        ? App.Calculator.custoRealHoraPorColaborador(
            colab, state.indirectCosts, state.collaborators
          )
        : 0;
      const total = custoHora * Math.max(0, Number(membro?.horas) || 0);
      const hourEl = row.querySelector('[data-team-cost-hour]');
      const totalEl = row.querySelector('[data-team-cost-total]');
      if (hourEl) hourEl.textContent = moeda(custoHora);
      if (totalEl) totalEl.textContent = moeda(total);
    });
  }

  function updateDashboardResults(state, result) {
    // O calculador pode retornar null enquanto os dados mestres (disciplinas)
    // ainda estao sendo carregados do Supabase.
    if (!result) return;

    const elHoras = document.getElementById('dash-horas');
    if (elHoras) elHoras.textContent = horas(result.horasFinais);

    const elCusto = document.getElementById('dash-custo');
    if (elCusto) elCusto.textContent = moeda(result.custoInternoTotal);

    const elPreco = document.getElementById('dash-preco-sugerido');
    if (elPreco) elPreco.textContent = moeda(result.valorFinal);

    const elMargem = document.getElementById('dash-margem');
    if (elMargem) {
      elMargem.textContent = pct(result.margemLiquida);
      elMargem.style.color = result.margemLiquida < 0 ? 'var(--danger)' : 'inherit';
    }

    const elLucro = document.getElementById('dash-lucro');
    if (elLucro) {
      elLucro.textContent = moeda(result.lucroLiquido);
      elLucro.style.color = result.lucroLiquido < 0 ? 'var(--danger)' : 'inherit';
    }

    const indirectList = document.getElementById('dash-indirect-costs-list');
    if (indirectList) {
      const custos = Array.isArray(state.indirectCosts) ? state.indirectCosts : [];
      indirectList.innerHTML = custos.length
        ? custos.map(c => `
            <div class="indirect-cost-row">
              <span>${_escapeHtml(c.nome || 'Custo indireto')}</span>
              <strong>${moeda(Number(c.valor) || 0)}/mês</strong>
            </div>
          `).join('')
        : '<div class="indirect-cost-empty">Nenhum custo indireto configurado.</div>';
    }
    const indirectMonthly = document.getElementById('dash-indirect-monthly');
    const indirectHour = document.getElementById('dash-indirect-hour');
    const indirectProject = document.getElementById('dash-indirect-project');
    if (indirectMonthly) indirectMonthly.textContent = moeda(result.totalCustosIndiretos);
    if (indirectHour) indirectHour.textContent = moeda(result.rateioHora);
    if (indirectProject) indirectProject.textContent = moeda(result.custoIndiretoRateadoProjeto);

    // Modal Transparência Content
    const modalBody = document.getElementById('transparency-body');
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="transparency-step">
          <span>Horas Totais (Equipe)</span>
          <span class="transparency-val">${horas(result.horasFinais)}</span>
        </div>
        <div class="transparency-step">
          <span>Custo Direto da Equipe</span>
          <span class="transparency-val">${moeda(result.custoDiretoEquipe)}</span>
        </div>
        <div class="transparency-step">
          <span>Custos Indiretos Rateados</span>
          <span class="transparency-val">${moeda(result.custoIndiretoRateadoProjeto)}</span>
        </div>
        <div class="transparency-step">
          <span>Despesas Extras</span>
          <span class="transparency-val">${moeda(result.despesasExtras)}</span>
        </div>
        <div class="transparency-step">
          <span><strong>Custo Total Interno</strong></span>
          <span class="transparency-val"><strong>${moeda(result.custoInternoTotal)}</strong></span>
        </div>
        <hr style="border: 0; border-bottom: 1px dashed var(--border-subtle); margin: 12px 0;">
        <div class="transparency-step">
          <span>Origem das Horas</span>
          <span class="transparency-val">${result.fonteHoras === 'equipe' ? 'Equipe' : result.fonteHoras === 'manual' ? 'Manual' : 'Estimativa por área'}</span>
        </div>
        <div class="transparency-step">
          <span>Fator Técnico do Escopo</span>
          <span class="transparency-val">x${num(result.fatorTecnicoEscopo, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Fator Aplicado nas Horas</span>
          <span class="transparency-val">x${num(result.fatorEsforco, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Tipo de Edificação</span>
          <span class="transparency-val">x${num(result.fatores.edificacao, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Nível Técnico</span>
          <span class="transparency-val">x${num(result.fatores.complexidade, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Aprovações</span>
          <span class="transparency-val">x${num(result.fatores.aprovacao, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Revisões</span>
          <span class="transparency-val">x${num(result.fatores.revisao, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Urgência Comercial</span>
          <span class="transparency-val">x${num(result.fatores.urgencia, 2)}</span>
        </div>
        <div class="transparency-step">
          <span>Multiplicador Mínimo do Custo</span>
          <span class="transparency-val">x${num(result.multiplicadorMinimoAplicado, 2)}</span>
        </div>
        ${result.precoManualAplicado ? `
        <div class="transparency-step" style="color: var(--warning);">
          <span>Preço Manual</span>
          <span class="transparency-val">Substituindo o valor calculado</span>
        </div>` : ''}
        ${result.ajusteEdificacaoLimitado ? `
        <div class="transparency-step" style="color: var(--warning);">
          <span>Limite do desconto/acréscimo</span>
          <span class="transparency-val">${result.determinante}</span>
        </div>` : ''}
        <div class="transparency-step">
          <span>Markup Real</span>
          <span class="transparency-val">${num(result.markup, 2)}x</span>
        </div>
        <div class="transparency-step">
          <span>Impostos Estimados</span>
          <span class="transparency-val">${pct((state.settings?.impostoSimples || 0) * 100)}</span>
        </div>
        <div class="transparency-step" style="font-size: 1.1rem; color: var(--primary); margin-top: 12px;">
          <span><strong>Preço Final Sugerido</strong></span>
          <span class="transparency-val"><strong>${moeda(result.valorFinal)}</strong></span>
        </div>
      `;
    }
  }

  return {
    moeda, pct, horas, num, unmask, initMasks,
    populateDashboardSelects, renderDashboardTeam, updateDashboardTeamCosts, updateDashboardResults,
    updateStepper,
    renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7, renderStep8,
    renderColaboradoresTable,
    renderHistory,
    openCollaboratorModal, closeCollaboratorModal,
    toast,
    showValidationError, clearValidationError,
  };
})();
