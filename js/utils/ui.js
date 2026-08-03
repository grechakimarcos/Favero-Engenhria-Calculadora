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

  // ── Stepper ────────────────────────────────────────────────────────────────
  function updateStepper(currentStep) {
    document.querySelectorAll('.step-item').forEach((el, i) => {
      el.classList.toggle('active', i === currentStep);
      el.classList.toggle('completed', i < currentStep);
    });
    document.querySelectorAll('.step-panel').forEach((el, i) => {
      el.classList.toggle('active', i === currentStep);
    });
    // Scroll to top of main
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Select Builder ─────────────────────────────────────────────────────────
  function buildOptions(map, selected) {
    return Object.entries(map)
      .map(([val, label]) => `<option value="${val}" ${String(val) === String(selected) ? 'selected' : ''}>${label}</option>`)
      .join('');
  }

  // ── Metric Card ────────────────────────────────────────────────────────────
  function renderMetric(label, value, variant = '', id = '') {
    return `
      <div class="metric ${variant}" ${id ? `id="${id}"` : ''}>
        <small>${label}</small>
        <strong>${value}</strong>
      </div>`;
  }

  // ── Badge ──────────────────────────────────────────────────────────────────
  function badge(text, color = 'primary') {
    return `<span class="badge badge-${color}">${text}</span>`;
  }

  // ── Step 1: Project Data Form ──────────────────────────────────────────────
  function renderStep1(state) {
    const p = state.project;
    const el = document.getElementById('step1-content');
    if (!el) return;
    el.innerHTML = `
      <div class="form-grid-2">
        <div class="form-group">
          <label for="proj-nome">Nome do Projeto</label>
          <input type="text" id="proj-nome" value="${p.nome || ''}" placeholder="Ex: Residência Silva - Elétrico" maxlength="80" />
        </div>
        <div class="form-group">
          <label for="proj-cliente">Cliente</label>
          <input type="text" id="proj-cliente" value="${p.cliente || ''}" placeholder="Nome do cliente" maxlength="80" />
        </div>
        <div class="form-group">
          <label for="proj-disciplina">Disciplina</label>
          <select id="proj-disciplina">${buildOptions(
            Object.fromEntries(Object.entries(Config.DISCIPLINAS).map(([k, v]) => [k, v.nome])),
            p.disciplina
          )}</select>
        </div>
        <div class="form-group">
          <label for="proj-edificacao">Tipo de Edificação</label>
          <select id="proj-edificacao">${buildOptions(Config.LABELS_EDIFICACAO, p.tipoEdificacao)}</select>
        </div>
        <div class="form-group">
          <label for="proj-area">Área do Projeto (m²) <span class="label-hint">— Referência para estimativa</span></label>
          <input type="number" id="proj-area" value="${p.area || ''}" min="0" placeholder="0" />
        </div>
        <div class="form-group">
          <label for="proj-horas-manuais">Horas Manuais <span class="label-hint">— Sobrescreve a área</span></label>
          <input type="number" id="proj-horas-manuais" value="${p.horasManuais || ''}" min="0" step="0.5" placeholder="Deixe em branco para usar m²" />
        </div>
        <div class="form-group">
          <label for="proj-data">Data do Projeto</label>
          <input type="date" id="proj-data" value="${p.data || ''}" />
        </div>
        <div class="form-group">
          <label for="proj-tipo-comercial">Tipo Comercial</label>
          <select id="proj-tipo-comercial">${buildOptions(Config.LABELS_TIPO, p.tipoComercial)}</select>
        </div>
        <div class="form-group">
          <label for="proj-complexidade">Complexidade (CMP)</label>
          <select id="proj-complexidade">${buildOptions(Config.LABELS_COMPLEXIDADE, p.complexidade)}</select>
        </div>
        <div class="form-group">
          <label for="proj-revisao">Fator de Revisão</label>
          <select id="proj-revisao">${buildOptions(Config.LABELS_REVISAO, p.revisao)}</select>
        </div>
        <div class="form-group">
          <label for="proj-aprovacao">Fator de Aprovação</label>
          <select id="proj-aprovacao">${buildOptions(Config.LABELS_APROVACAO, p.aprovacao)}</select>
        </div>
        <div class="form-group">
          <label for="proj-risco">Fator de Risco</label>
          <select id="proj-risco">${buildOptions(Config.LABELS_RISCO, p.fatorRisco)}</select>
        </div>
        <div class="form-group">
          <label for="proj-urgencia">Fator de Urgência</label>
          <select id="proj-urgencia">${buildOptions(Config.LABELS_URGENCIA, p.fatorUrgencia)}</select>
        </div>
      </div>`;
  }

  // ── Step 2: Team ───────────────────────────────────────────────────────────
  function renderStep2(state, result) {
    const container = document.getElementById('step2-team-list');
    if (!container) return;

    const colabOptions = state.collaborators
      .map(c => `<option value="${c.id}">${c.nome} — ${c.cargo}</option>`)
      .join('');

    container.innerHTML = state.team.length === 0
      ? `<div class="empty-state"><p>Nenhum colaborador adicionado. Clique em "+ Adicionar" para começar.</p></div>`
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

    // Hours preview card
    const previewEl = document.getElementById('step2-hours-preview');
    if (previewEl && result) {
      const f = result.fatores || {};
      const pct = v => v === 1 ? '<span class="factor-neutral">1.00×</span>' : v > 1 ? `<span class="factor-up">+${((v-1)*100).toFixed(0)}% (${v.toFixed(2)}×)</span>` : `<span class="factor-down">${((v-1)*100).toFixed(0)}% (${v.toFixed(2)}×)</span>`;
      previewEl.innerHTML = `
        <div class="hours-preview-grid">
          ${renderMetric('Fonte das Horas', _fonteLabel(result.fonteHoras), 'metric-info')}
          ${renderMetric('Horas Base', horas(result.horasBase))}
          ${renderMetric('Fator de Esforço Total', `×${result.fatorEsforco.toFixed(3)}`, 'metric-accent')}
          ${renderMetric('Horas Finais', horas(result.horasFinais), 'metric-accent')}
        </div>
        <div class="factors-breakdown">
          <p class="factors-title">📊 Detalhamento do Fator de Esforço</p>
          <div class="factors-grid">
            <div class="factor-item"><span class="factor-label">🏠 Edificação</span>${pct(f.edificacao || 1)}</div>
            <div class="factor-item"><span class="factor-label">🔄 Revisão</span>${pct(f.revisao || 1)}</div>
            <div class="factor-item"><span class="factor-label">📋 Aprovação</span>${pct(f.aprovacao || 1)}</div>
            <div class="factor-item"><span class="factor-label">⚙️ Complexidade</span>${pct(f.complexidade || 1)}</div>
            <div class="factor-item"><span class="factor-label">⚠️ Risco</span>${pct(f.risco || 1)}</div>
            <div class="factor-item"><span class="factor-label">⏱️ Urgência</span>${pct(f.urgencia || 1)}</div>
            <div class="factor-item factor-tipo"><span class="factor-label">💼 Tipo Comercial</span>${pct(f.tipoComercial || 1)}</div>
          </div>
        </div>`;
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

  // ── Step 3: Costs ──────────────────────────────────────────────────────────
  function renderStep3(state) {
    const costsEl = document.getElementById('step3-content');
    if (!costsEl) return;

    const { costs, indirectCosts } = state;
    costsEl.innerHTML = `
      <div class="form-grid-2">
        <div class="form-group">
          <label for="cost-art">Taxa ART/RRT (R$)</label>
          <input type="number" id="cost-art" value="${costs.art || 0}" min="0" step="10" />
        </div>
        <div class="form-group">
          <label for="cost-outros">Outros (Plotagem/Visitas) (R$)</label>
          <input type="number" id="cost-outros" value="${costs.outros || 0}" min="0" step="10" />
        </div>
        <div class="form-group">
          <label for="cost-margem">Margem de Lucro Desejada (%)</label>
          <input type="number" id="cost-margem" value="${costs.margemLucro || 20}" min="0" max="90" step="1" />
          <span class="field-hint">Usada na precificação individual por colaborador</span>
        </div>
      </div>
      <div class="section-divider">
        <h3 class="section-subtitle">Custos Indiretos do Escritório</h3>
        <button class="btn-secondary btn-sm" id="add-indirect-btn">+ Adicionar Item</button>
      </div>
      <div id="indirect-costs-list">
        ${indirectCosts.map((c, i) => `
          <div class="indirect-row" data-idx="${i}">
            <div class="form-group">
              <label>Descrição</label>
              <input type="text" class="indirect-nome" data-idx="${i}" value="${c.nome}" placeholder="Ex: Aluguel" />
            </div>
            <div class="form-group">
              <label>Valor Mensal (R$)</label>
              <input type="number" class="indirect-valor" data-idx="${i}" value="${c.valor}" min="0" step="50" />
            </div>
            <button class="btn-icon btn-danger indirect-remove-btn" data-idx="${i}" title="Remover">🗑️</button>
          </div>`).join('')}
      </div>
      <div class="indirect-total-box">
        <span>Total Custos Indiretos/mês:</span>
        <strong>${moeda(indirectCosts.reduce((s, c) => s + (c.valor || 0), 0))}</strong>
        <span class="muted">→ Rateio: ${moeda(App.Calculator.rateioIndiretoHora(indirectCosts, state.collaborators))}/h</span>
      </div>`;
  }

  // ── Step 4: Result Dashboard ───────────────────────────────────────────────
  function renderStep4(result, state) {
    if (!result) {
      document.getElementById('step4-content').innerHTML =
        '<div class="empty-state"><p>⚠️ Preencha os dados do projeto para ver os resultados.</p></div>';
      return;
    }

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
      discBody.innerHTML = Object.entries(Config.DISCIPLINAS).map(([key, d]) => {
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

  // ── Step 4.5: Fechamento Comercial (Ajuste Fino) ───────────────────────────
  function renderStep4Comercial(state, result) {
    const el = document.getElementById('step4-comercial-content');
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
  function renderStep5(state, result) {
    const el = document.getElementById('step5-summary');
    if (!el || !result) return;

    el.innerHTML = `
      <div class="report-summary-grid">
        <div class="report-info-block">
          <h3>📋 Resumo do Projeto</h3>
          <table class="summary-table">
            <tr><td>Projeto</td><td><strong>${state.project.nome || '—'}</strong></td></tr>
            <tr><td>Cliente</td><td>${state.project.cliente || '—'}</td></tr>
            <tr><td>Disciplina</td><td>${Config.DISCIPLINAS[state.project.disciplina]?.nome || '—'}</td></tr>
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

    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Nenhum projeto salvo ainda. Clique em "Salvar no Histórico" após calcular.</td></tr>`;
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
          <td>${Config.DISCIPLINAS[h.project.disciplina]?.nome || h.project.disciplina}</td>
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

  return {
    moeda, pct, horas, num,
    updateStepper,
    renderStep1, renderStep2, renderStep3, renderStep4, renderStep4Comercial, renderStep5,
    renderColaboradoresTable,
    renderHistory,
    openCollaboratorModal, closeCollaboratorModal,
    toast,
    showValidationError, clearValidationError,
  };
})();
