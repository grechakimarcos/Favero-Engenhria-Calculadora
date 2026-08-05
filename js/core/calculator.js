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

  function numeroSeguro(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  // ── Office-Level Aggregations ──────────────────────────────────────────────

  function totalHorasProdutivas(collaborators) {
    return collaborators.reduce((s, c) => s + numeroSeguro(c?.horasMensais), 0);
  }

  function totalCustosDiretos(collaborators) {
    return collaborators.reduce((s, c) => s + numeroSeguro(c?.custoMensal), 0);
  }

  function totalCustosIndiretos(indirectCosts) {
    return indirectCosts.reduce((s, c) => s + numeroSeguro(c?.valor), 0);
  }

  function rateioIndiretoHora(indirectCosts, collaborators) {
    const totalH = totalHorasProdutivas(collaborators);
    if (totalH === 0) return 0;
    return totalCustosIndiretos(indirectCosts) / totalH;
  }

  function custoRealHoraPorColaborador(colab, indirectCosts, collaborators) {
    if (!colab) return 0;
    const horasMensais = numeroSeguro(colab.horasMensais);
    if (horasMensais === 0) return 0;
    const direto = numeroSeguro(colab.custoMensal) / horasMensais;
    const rateio = rateioIndiretoHora(indirectCosts, collaborators);
    const fatorProd = numeroSeguro(colab.produtividade, 100, 1, 150) / 100;
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

  function calcularHorasBase(project, team, state) {
    const d = (state.disciplinas || {})[project.disciplina];
    if (!d) return { horasBase: 0, fonte: 'erro', horasPorM2: 0 };

    const areaRef = numeroSeguro(d.areaRef);
    const horasRef = numeroSeguro(d.horasRef);
    const horasPorM2 = areaRef > 0 ? horasRef / areaRef : 0;
    const horasEquipe = team.reduce((s, t) => s + numeroSeguro(t?.horas), 0);

    if (horasEquipe > 0) {
      return { horasBase: horasEquipe, fonte: 'equipe', horasPorM2 };
    }

    const horasManuais = numeroSeguro(project.horasManuais);
    if (horasManuais > 0) {
      return { horasBase: horasManuais, fonte: 'manual', horasPorM2 };
    }

    const area = numeroSeguro(project.area);
    if (area > 0) {
      // Economies of scale for large areas
      let fatorEscala = 1.0;
      if (area > 1000) fatorEscala = 0.70;
      else if (area > 300) fatorEscala = 0.85;

      // NOTE: fatorEdif was removed from here and moved to calcularFatorEsforco
      // so it applies regardless of whether hours come from area, manual, or team.
      const horasBase = area * horasPorM2 * fatorEscala;
      return { horasBase, fonte: 'area', horasPorM2 };
    }

    return { horasBase: 0, fonte: 'nenhum', horasPorM2 };
  }

  // ── Effort Multiplier ─────────────────────────────────────────────────────

  function calcularFatorEsforco(project) {
    // fatorEdif moved here from calcularHorasBase so it ALWAYS applies
    // regardless of whether hours come from area, manual input, or team.
    const fEdif  = Config.FATORES_EDIFICACAO[project.tipoEdificacao] || 1.0;
    const fRev   = Config.FATORES_REVISAO[project.revisao]          || 1;
    const fAprov = Config.FATORES_APROVACAO[project.aprovacao]      || 1;
    const fCmp   = Config.FATORES_COMPLEXIDADE[project.complexidade] || 1;
    
    // Suporte para o novo slider (que salva em float ex: 0.15) e pro formato antigo (índice 0-4)
    const rawRisco = project.fatorRisco;
    const riscoConfig = Config.FATORES_RISCO[rawRisco];
    const fRisco = 1 + (riscoConfig !== undefined ? riscoConfig : (Number(rawRisco) || 0));
    
    const rawUrg = project.fatorUrgencia;
    const urgConfig = Config.FATORES_URGENCIA[rawUrg];
    const fUrg   = 1 + (urgConfig !== undefined ? urgConfig : (Number(rawUrg) || 0));
    
    const fTipo  = Config.FATORES_TIPO[project.tipoComercial]        || 1.0;
    
    const totalSemLimite = 1
      + (fEdif - 1) + (fRev - 1) + (fAprov - 1)
      + (fCmp - 1) + (fRisco - 1);
    const total = Math.min(Config.MAX_FATOR_ESFORCO || 2.5, Math.max(0.5, totalSemLimite));

    return { fEdif, fRev, fAprov, fCmp, fRisco, fUrg, fTipo,
             total, totalSemLimite, limitado: total < totalSemLimite };
  }

  // ── Main Calculation Engine ────────────────────────────────────────────────

  /**
   * Calculates all financial indicators for a project.
   * @param {object} state - Full app state
   * @returns {object} result - Complete calculation result
   */
  function calcularResultado(state) {
    const project = state.project || {};
    const team = Array.isArray(state.team) ? state.team : [];
    const collaborators = Array.isArray(state.collaborators) ? state.collaborators : [];
    const indirectCosts = Array.isArray(state.indirectCosts) ? state.indirectCosts : [];
    const disciplinas = state.disciplinas || {};
    const costs = state.costs || {};
    const settings = state.settings || {};

    const d = disciplinas[project.disciplina];

    if (!d) return null;

    // 1. Hours
    const { horasBase, fonte, horasPorM2 } = calcularHorasBase(project, team, state);
    const esforco = calcularFatorEsforco(project);
    // Horas distribuidas pela equipe ou informadas manualmente ja sao finais.
    // Aplicar os fatores novamente contaria o mesmo esforco duas vezes.
    const fatorEsforco = fonte === 'area' ? esforco.total : 1;
    const horasFinais = horasBase * fatorEsforco;

    // 2. Team cost breakdown
    const horasEquipe = team.reduce((s, t) => s + numeroSeguro(t?.horas), 0);
    const fatorDistribuicao = horasEquipe > 0 ? horasFinais / horasEquipe : 1;
    const rateio = rateioIndiretoHora(indirectCosts, collaborators);

    let custoInternoEquipe = 0;
    let custoDiretoEquipe = 0;
    let custoIndiretoRateadoProjeto = 0;
    const detalhesEquipe = [];

    if (team.length > 0) {
      // useEqualDistribution = true quando nenhuma hora foi informada na equipe,
      // fazendo com que as horas finais sejam divididas igualmente entre os membros.
      const useEqualDistribution = horasEquipe === 0;
      const equalHours = useEqualDistribution ? (horasFinais / team.length) : 0;
      
      team.forEach(membro => {
        const colab = collaborators.find(c => c.id === membro.colaboradorId);
        if (!colab) return;
        
        let horasAjustadas = 0;
        let inputHoras = numeroSeguro(membro.horas);
        
        if (useEqualDistribution) {
          horasAjustadas = equalHours;
          inputHoras = equalHours; // Assume equal for display
        } else {
          horasAjustadas = inputHoras * fatorDistribuicao;
        }

        const custoHora = custoRealHoraPorColaborador(colab, indirectCosts, collaborators);
        const horasMensaisColab = numeroSeguro(colab.horasMensais);
        const produtividade = numeroSeguro(colab.produtividade, 100, 1, 150) / 100;
        const custoDiretoHora = horasMensaisColab > 0
          ? (numeroSeguro(colab.custoMensal) / horasMensaisColab) / produtividade
          : 0;
        const custoIndiretoHora = rateio / produtividade;
        const custoTotal = horasAjustadas * custoHora;
        const custoDiretoTotal = horasAjustadas * custoDiretoHora;
        const custoIndiretoTotal = horasAjustadas * custoIndiretoHora;
        custoInternoEquipe += custoTotal;
        custoDiretoEquipe += custoDiretoTotal;
        custoIndiretoRateadoProjeto += custoIndiretoTotal;
        
        detalhesEquipe.push({
          nome: colab.nome,
          cargo: colab.cargo,
          horas: inputHoras,
          horasAjustadas,
          custoHora,
          custoDiretoHora,
          custoIndiretoHora,
          custoTotal,
          custoDiretoTotal,
          custoIndiretoTotal,
          percentual: 0,
        });
      });
      // Calculate % of total for each member
      detalhesEquipe.forEach(d => {
        d.percentual = custoInternoEquipe > 0 ? (d.custoTotal / custoInternoEquipe) * 100 : 0;
      });
    } else {
      // Fallback: use office average if NO team members are selected at all
      const media = custoMedioHora(collaborators, indirectCosts);
      custoInternoEquipe = horasFinais * media;
      const totalH = totalHorasProdutivas(collaborators);
      const custoDiretoMedio = totalH > 0 ? totalCustosDiretos(collaborators) / totalH : 0;
      custoDiretoEquipe = horasFinais * custoDiretoMedio;
      custoIndiretoRateadoProjeto = horasFinais * rateio;
    }

    // 3. Extra costs
    const despesasExtras = numeroSeguro(costs.art) + numeroSeguro(costs.outros);
    const custoInternoTotal = custoInternoEquipe + despesasExtras;

    // 4. Pricing candidates
    const horasReferencia = numeroSeguro(d.horasRef);
    const valorHoraComercial = horasReferencia > 0
      ? numeroSeguro(d.valorBase) / horasReferencia
      : 0;
    // fatorTipo already captured inside esforco — reuse for clarity
    const fatorTipo = esforco.fTipo;

    // 5. Final price (max of three candidates)
    // 5. Final price base (max of three candidates)
    const multiplicadorMinimo = numeroSeguro(
      settings.multiplicadorMinimo,
      Config.MULTIPLICADOR_MINIMO_CUSTO,
      1,
      Config.MAX_MULTIPLICADOR_CUSTO || 3
    );
    const impostoSimples = numeroSeguro(settings.impostoSimples, Config.IMPOSTO_SIMPLES, 0, 0.5);
    const valorMinimoPorCusto      = custoInternoTotal * multiplicadorMinimo;
    const ticketMinimoComDespesas  = numeroSeguro(d.ticketMinimo) + despesasExtras;
    // Urgencia remunera a compressao do prazo sem criar horas ficticias.
    const valorReferenciaComercial = (horasFinais * valorHoraComercial * fatorTipo * esforco.fUrg) + despesasExtras;

    const valorFinalBase = Math.max(valorReferenciaComercial, valorMinimoPorCusto, ticketMinimoComDespesas);
    
    // 5.5 Fechamento Comercial (Ajuste)
    let valorFinal = valorFinalBase;
    const ajuste = project.ajusteComercial || { desconto: 0, acrescimo: 0, valorFechado: null };
    
    if (ajuste.valorFechado && Number(ajuste.valorFechado) > 0) {
      valorFinal = numeroSeguro(ajuste.valorFechado);
    } else {
      valorFinal += numeroSeguro(ajuste.acrescimo) - numeroSeguro(ajuste.desconto);
    }
    valorFinal = Math.max(0, valorFinal); // impede preco negativo

    const imposto       = valorFinal * impostoSimples;
    const valorLiquido  = valorFinal - imposto;

    // 6. KPI Indicators (Baseados no valor ajustado)
    const lucrobruto    = valorFinal - custoInternoTotal;
    const lucroLiquido  = valorLiquido - custoInternoTotal;
    const margemBruta   = valorFinal > 0 ? (lucrobruto   / valorFinal) * 100 : 0;
    const margemLiquida = valorFinal > 0 ? (lucroLiquido  / valorFinal) * 100 : 0;
    const rentabilidade = custoInternoTotal > 0 ? (lucroLiquido / custoInternoTotal) * 100 : 0;
    const markup        = custoInternoTotal > 0 ? valorFinal / custoInternoTotal : 0;
    
    const margemReal    = margemLiquida; // alias claro para a UI de fechamento

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
    const margem = numeroSeguro(costs.margemLucro, 0, 0, 90);
    const precificacaoIndividual = collaborators.map(colab => {
      const custoHora = custoRealHoraPorColaborador(colab, indirectCosts, collaborators);
      const custoTotalInt = horasFinais * custoHora;
      const divisor = 1 - impostoSimples - (margem / 100);
      const precoSugerido = divisor > 0.01 ? custoTotalInt / divisor : 0;
      return { id: colab.id, nome: colab.nome, cargo: colab.cargo, custoHora, custoTotalInt, precoSugerido };
    });

    // 8. Determine which pricing candidate won
    // Use epsilon comparison to avoid float precision errors.
    const EPS = 0.005; // half a cent tolerance
    let determinante = '📊 Valor Comercial de Referência';
    if (Math.abs(valorFinalBase - valorMinimoPorCusto) < EPS && valorMinimoPorCusto > 0) {
      determinante = `🎯 Custo da Equipe (x${multiplicadorMinimo})`;
    } else if (Math.abs(valorFinalBase - ticketMinimoComDespesas) < EPS) {
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
      // Individual effort factors (for transparent UI display)
      fatores: {
        edificacao: esforco.fEdif,
        revisao:    esforco.fRev,
        aprovacao:  esforco.fAprov,
        complexidade: esforco.fCmp,
        risco:      esforco.fRisco,
        urgencia:   esforco.fUrg,
        tipoComercial: esforco.fTipo,
      },
      fatorEsforcoSemLimite: esforco.totalSemLimite,
      fatorEsforcoLimitado: esforco.limitado,
      multiplicadorMinimoAplicado: multiplicadorMinimo,
      // Cost
      custoInternoEquipe, custoDiretoEquipe, custoIndiretoRateadoProjeto,
      despesasExtras, custoInternoTotal,
      // Pricing candidates
      valorHoraComercial, valorReferenciaComercial, valorMinimoPorCusto, ticketMinimoComDespesas,
      fatorTipo,
      // Final
      valorFinalBase, valorFinal, imposto, valorLiquido,
      // KPIs
      lucrobruto, lucroLiquido, margemBruta, margemLiquida, margemReal, rentabilidade, markup,
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
