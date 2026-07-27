'use strict';
window.App = window.App || {};

/**
 * @module Calculator
 * Pure calculation engine — ZERO DOM access.
 * All functions are stateless and testable in isolation.
 * Following Single Responsibility and Open/Closed principles.
 */
App.Calculator = (function () {
  const Config = App.Config;

  // ── Office-Level Aggregations ──────────────────────────────────────────────

  function totalHorasProdutivas(collaborators) {
    return collaborators.reduce((s, c) => s + (c.horasMensais || 0), 0);
  }

  function totalCustosDiretos(collaborators) {
    return collaborators.reduce((s, c) => s + (c.custoMensal || 0), 0);
  }

  function totalCustosIndiretos(indirectCosts) {
    return indirectCosts.reduce((s, c) => s + (c.valor || 0), 0);
  }

  function rateioIndiretoHora(indirectCosts, collaborators) {
    const totalH = totalHorasProdutivas(collaborators);
    if (totalH === 0) return 0;
    return totalCustosIndiretos(indirectCosts) / totalH;
  }

  function custoRealHoraPorColaborador(colab, indirectCosts, collaborators) {
    if (!colab || colab.horasMensais === 0) return 0;
    const direto = colab.custoMensal / colab.horasMensais;
    const rateio = rateioIndiretoHora(indirectCosts, collaborators);
    const fatorProd = (colab.produtividade || 100) / 100;
    // Productivity factor: lower productivity = higher effective cost per hour
    return (direto + rateio) / fatorProd;
  }

  function custoMedioHora(collaborators, indirectCosts) {
    const totalH = totalHorasProdutivas(collaborators);
    if (totalH === 0) return 0;
    const totalC = totalCustosDiretos(collaborators) + totalCustosIndiretos(indirectCosts);
    return totalC / totalH;
  }

  // ── Hours Base Calculation (Hierarchy) ────────────────────────────────────
  // Priority: 1) Team hours  2) Manual override  3) Area-based estimate

  function calcularHorasBase(project, team) {
    const d = Config.DISCIPLINAS[project.disciplina];
    if (!d) return { horasBase: 0, fonte: 'erro', horasPorM2: 0 };

    const horasPorM2 = d.horasRef / d.areaRef;
    const horasEquipe = team.reduce((s, t) => s + (Number(t.horas) || 0), 0);

    if (horasEquipe > 0) {
      return { horasBase: horasEquipe, fonte: 'equipe', horasPorM2 };
    }

    const horasManuais = Number(project.horasManuais) || 0;
    if (horasManuais > 0) {
      return { horasBase: horasManuais, fonte: 'manual', horasPorM2 };
    }

    const area = Number(project.area) || 0;
    if (area > 0) {
      // Economies of scale for large areas
      let fatorEscala = 1.0;
      if (area > 1000) fatorEscala = 0.70;
      else if (area > 300) fatorEscala = 0.85;

      const fatorEdif = Config.FATORES_EDIFICACAO[project.tipoEdificacao] || 1.0;
      const horasBase = area * horasPorM2 * fatorEscala * fatorEdif;
      return { horasBase, fonte: 'area', horasPorM2 };
    }

    return { horasBase: 0, fonte: 'nenhum', horasPorM2 };
  }

  // ── Effort Multiplier ─────────────────────────────────────────────────────

  function calcularFatorEsforco(project) {
    const fRev   = Config.FATORES_REVISAO[project.revisao]          || 1;
    const fAprov = Config.FATORES_APROVACAO[project.aprovacao]      || 1;
    const fCmp   = Config.FATORES_COMPLEXIDADE[project.complexidade] || 1;
    const fRisco = 1 + (Config.FATORES_RISCO[project.fatorRisco]    || 0);
    const fUrg   = 1 + (Config.FATORES_URGENCIA[project.fatorUrgencia] || 0);
    return fRev * fAprov * fCmp * fRisco * fUrg;
  }

  // ── Main Calculation Engine ────────────────────────────────────────────────

  /**
   * Calculates all financial indicators for a project.
   * @param {object} state - Full app state
   * @returns {object} result - Complete calculation result
   */
  function calcularResultado(state) {
    const { project, team, costs, collaborators, indirectCosts, settings } = state;
    const d = Config.DISCIPLINAS[project.disciplina];

    if (!d) return null;

    // 1. Hours
    const { horasBase, fonte, horasPorM2 } = calcularHorasBase(project, team);
    const fatorEsforco = calcularFatorEsforco(project);
    const horasFinais = horasBase * fatorEsforco;

    // 2. Team cost breakdown
    const horasEquipe = team.reduce((s, t) => s + (Number(t.horas) || 0), 0);
    const fatorDistribuicao = horasEquipe > 0 ? horasFinais / horasEquipe : 1;
    const rateio = rateioIndiretoHora(indirectCosts, collaborators);

    let custoInternoEquipe = 0;
    const detalhesEquipe = [];

    if (team.length > 0 && horasEquipe > 0) {
      team.forEach(membro => {
        const colab = collaborators.find(c => c.id === membro.colaboradorId);
        if (!colab) return;
        const horasAjustadas = (Number(membro.horas) || 0) * fatorDistribuicao;
        const custoHora = custoRealHoraPorColaborador(colab, indirectCosts, collaborators);
        const custoTotal = horasAjustadas * custoHora;
        custoInternoEquipe += custoTotal;
        detalhesEquipe.push({
          nome: colab.nome,
          cargo: colab.cargo,
          horas: Number(membro.horas) || 0,
          horasAjustadas,
          custoHora,
          custoTotal,
          percentual: 0, // filled below
        });
      });
      // Calculate % of total for each member
      detalhesEquipe.forEach(d => {
        d.percentual = custoInternoEquipe > 0 ? (d.custoTotal / custoInternoEquipe) * 100 : 0;
      });
    } else {
      // Fallback: use office average
      const media = custoMedioHora(collaborators, indirectCosts);
      custoInternoEquipe = horasFinais * media;
    }

    // 3. Extra costs
    const despesasExtras = (Number(costs.art) || 0) + (Number(costs.outros) || 0);
    const custoInternoTotal = custoInternoEquipe + despesasExtras;

    // 4. Pricing candidates
    const valorHoraComercial = d.valorBase / d.horasRef;
    const fatorTipo = Config.FATORES_TIPO[project.tipoComercial] || 1.0;

    // 5. Final price (max of three candidates)
    // NOTE: valorMinimoPorCusto now includes despesasExtras in the multiplied base
    // so that extras also go through the safety multiplier.
    const valorMinimoPorCusto      = custoInternoTotal * settings.multiplicadorMinimo;
    const ticketMinimoComDespesas  = d.ticketMinimo + despesasExtras;
    const valorReferenciaComercial = (horasFinais * valorHoraComercial * fatorTipo) + despesasExtras;

    const valorFinal    = Math.max(valorReferenciaComercial, valorMinimoPorCusto, ticketMinimoComDespesas);
    const imposto       = valorFinal * settings.impostoSimples;
    const valorLiquido  = valorFinal - imposto;

    // 6. KPI Indicators
    const lucrobruto    = valorFinal - custoInternoTotal;
    const lucroLiquido  = valorLiquido - custoInternoTotal;
    const margemBruta   = valorFinal > 0 ? (lucrobruto   / valorFinal) * 100 : 0;
    const margemLiquida = valorFinal > 0 ? (lucroLiquido  / valorFinal) * 100 : 0;
    const rentabilidade = custoInternoTotal > 0 ? (lucroLiquido / custoInternoTotal) * 100 : 0;
    const markup        = custoInternoTotal > 0 ? valorFinal / custoInternoTotal : 0;

    // Renamed from 'pontoEquilibrio': this is the minimum price per hour,
    // not the classic break-even point (which would be the monthly fixed costs).
    const custoHoraMinimo = horasFinais > 0 ? custoInternoTotal / horasFinais : 0;

    // Financial health alerts
    const alertas = [];
    if (lucroLiquido < 0)        alertas.push({ tipo: 'danger',  msg: '⛔ Lucro líquido negativo — o preço não cobre os custos após impostos.' });
    else if (margemBruta < 10)   alertas.push({ tipo: 'warning', msg: '⚠️ Margem bruta abaixo de 10% — projeto com rentabilidade muito baixa.' });
    if (margemBruta >= 0 && lucroLiquido >= 0 && margemBruta >= 20)
                                 alertas.push({ tipo: 'success', msg: '✅ Projeto com margem saudável.' });

    // 7. Pricing by individual collaborator (new model)
    const margem = Number(costs.margemLucro) || 0;
    const precificacaoIndividual = collaborators.map(colab => {
      const custoHora = custoRealHoraPorColaborador(colab, indirectCosts, collaborators);
      const custoTotalInt = horasFinais * custoHora;
      const divisor = 1 - settings.impostoSimples - (margem / 100);
      const precoSugerido = divisor > 0.01 ? custoTotalInt / divisor : 0;
      return { id: colab.id, nome: colab.nome, cargo: colab.cargo, custoHora, custoTotalInt, precoSugerido };
    });

    // 8. Determine which pricing candidate won
    // Use epsilon comparison to avoid float precision errors.
    const EPS = 0.005; // half a cent tolerance
    let determinante = '📊 Valor Comercial de Referência';
    if (Math.abs(valorFinal - valorMinimoPorCusto) < EPS && valorMinimoPorCusto > 0) {
      determinante = `🎯 Custo da Equipe (x${settings.multiplicadorMinimo})`;
    } else if (Math.abs(valorFinal - ticketMinimoComDespesas) < EPS) {
      determinante = '🛡️ Ticket Mínimo da Disciplina';
    }

    // 9. Office summary
    const totalH = totalHorasProdutivas(collaborators);
    const totalCD = totalCustosDiretos(collaborators);
    const totalCI = totalCustosIndiretos(indirectCosts);
    const custoMensalTotal = totalCD + totalCI;

    return {
      // Hours
      horasPorM2, horasBase, horasFinais, fonteHoras: fonte, fatorEsforco,
      // Cost
      custoInternoEquipe, despesasExtras, custoInternoTotal,
      // Pricing candidates
      valorHoraComercial, valorReferenciaComercial, valorMinimoPorCusto, ticketMinimoComDespesas,
      // Final
      valorFinal, imposto, valorLiquido,
      // KPIs
      lucrobruto, lucroLiquido, margemBruta, margemLiquida, rentabilidade, markup,
      custoHoraMinimo,          // renamed from pontoEquilibrio
      pontoEquilibrio: custoHoraMinimo, // keep legacy alias so existing HTML bindings don't break
      // Alerts
      alertas,
      // Details
      detalhesEquipe, determinante, precificacaoIndividual,
      // Office
      totalHorasProdutivas: totalH, totalCustosDiretos: totalCD, totalCustosIndiretos: totalCI,
      rateioHora: rateio, custoMensalTotal,
      // Meta
      metaMensal: settings.metaMensal,
      metaSemanal: settings.metaMensal / Config.SEMANAS_MES,
      metaDiaria:  settings.metaMensal / Config.DIAS_UTEIS_MES,
    };
  }

  // ── AI-Ready Estimation Hook ───────────────────────────────────────────────
  // When AI_ENDPOINT is configured, this will call the ML model for hour estimation.
  async function estimarHorasComIA(project) {
    if (!Config.AI_ENDPOINT) return null;
    try {
      const resp = await fetch(Config.AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: Config.AI_VERSION,
          disciplina: project.disciplina,
          area: project.area,
          complexidade: project.complexidade,
          tipoEdificacao: project.tipoEdificacao,
        }),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  return {
    calcularResultado,
    calcularHorasBase,
    calcularFatorEsforco,
    totalHorasProdutivas,
    totalCustosDiretos,
    totalCustosIndiretos,
    rateioIndiretoHora,
    custoRealHoraPorColaborador,
    custoMedioHora,
    estimarHorasComIA,
  };
})();
