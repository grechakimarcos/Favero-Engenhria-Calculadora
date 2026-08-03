'use strict';
window.App = window.App || {};

/**
 * @module Charts
 * Chart.js integration for financial dashboards.
 * Renders cost composition, pricing candidates, and margin breakdown.
 */
App.Charts = (function () {
  const _instances = {};

  function _moeda(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function _destroy(id) {
    if (_instances[id]) {
      _instances[id].destroy();
      delete _instances[id];
    }
  }

  // ── Cost Composition — Donut ───────────────────────────────────────────────
  function renderCustoComposicao(canvasId, result) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !result) return;

    const data = {
      labels: ['Custo Equipe', 'Despesas Extras', 'Impostos', 'Lucro Líquido'],
      datasets: [{
        data: [
          Math.max(0, result.custoInternoEquipe),
          Math.max(0, result.despesasExtras),
          Math.max(0, result.imposto),
          Math.max(0, result.lucroLiquido),
        ],
        backgroundColor: ['#4C8BF5', '#F59E42', '#EF4444', '#10B981'],
        borderColor: '#1A1D2E',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    };

    _instances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#CBD5E1', font: { size: 12 }, padding: 16, boxWidth: 14 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${_moeda(ctx.raw)}`,
            },
          },
        },
      },
    });
  }

  // ── Pricing Candidates — Bar ───────────────────────────────────────────────
  function renderCandidatosPreco(canvasId, result) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !result) return;

    const valores = [
      result.valorReferenciaComercial,
      result.valorMinimoPorCusto,
      result.ticketMinimoComDespesas,
      result.valorFinal,
    ];
    const maxVal = Math.max(...valores);

    _instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ref. Comercial', 'Custo x1.8', 'Ticket Mínimo', 'Preço Final'],
        datasets: [{
          label: 'Valor (R$)',
          data: valores,
          backgroundColor: [
            'rgba(76, 139, 245, 0.7)',
            'rgba(245, 158, 66, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(16, 185, 129, 0.9)',
          ],
          borderColor: [
            '#4C8BF5', '#F59E42', '#8B5CF6', '#10B981',
          ],
          borderWidth: 2,
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${_moeda(ctx.raw)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: maxVal * 1.2,
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#8892A4',
              callback: v => `R$${(v / 1000).toFixed(0)}k`,
            },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#CBD5E1', font: { size: 12 } },
          },
        },
      },
    });
  }

  // ── Custos vs Lucros (Últimos 30 dias) ─────────────────────────────────────
  function renderCustosLucro(canvasId, history) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dados = (history || []).slice(0, 15).reverse();
    
    if (dados.length === 0) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">Nenhum projeto calculado recentemente.</p>';
      return;
    }

    const labels = dados.map(h => h.project.nome || `#${h.id.slice(-4)}`);

    _instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Custo Total',
            data: dados.map(h => h.result.custoInternoTotal || h.result.custoInterno || 0),
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#EF4444',
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: 'Lucro Líquido',
            data: dados.map(h => {
              if (h.result.lucroLiquido !== undefined) return h.result.lucroLiquido;
              const custo = h.result.custoInternoTotal || h.result.custoInterno || 0;
              const liquido = h.result.valorLiquido !== undefined ? h.result.valorLiquido : (h.result.valorFinal || 0);
              return liquido - custo;
            }),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: '#10B981',
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: 'Valor Final',
            type: 'line',
            data: dados.map(h => h.result.valorFinal),
            borderColor: '#4C8BF5',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointBackgroundColor: '#4C8BF5',
            pointRadius: 4,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#CBD5E1', font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${_moeda(ctx.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#CBD5E1', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8892A4', callback: v => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v.toFixed(0)}` } },
        },
      },
    });
  }

  // ── Horas por Colaborador (Últimos 30 dias) ────────────────────────────────
  function renderHorasColaborador(canvasId, history) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dados = (history || []);
    
    const horasPorPessoa = {};
    dados.forEach(h => {
      if (h.result && h.result.detalhesEquipe) {
        h.result.detalhesEquipe.forEach(membro => {
          if (!horasPorPessoa[membro.nome]) {
            horasPorPessoa[membro.nome] = 0;
          }
          horasPorPessoa[membro.nome] += Number(membro.horasAjustadas || membro.horas || 0);
        });
      }
    });

    const labels = Object.keys(horasPorPessoa);
    const valores = Object.values(horasPorPessoa);

    if (labels.length === 0) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">Nenhum membro de equipe alocado recentemente.</p>';
      return;
    }

    _instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Horas Previstas',
          data: valores,
          backgroundColor: 'rgba(139, 92, 246, 0.7)',
          borderColor: '#8B5CF6',
          borderWidth: 2,
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` Horas Totais: ${ctx.raw.toFixed(1)}h` } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8892A4' } },
          y: { grid: { display: false }, ticks: { color: '#CBD5E1', font: { size: 11 } } },
        },
      },
    });
  }

  return {
    renderCustoComposicao,
    renderCandidatosPreco,
    renderCustosLucro,
    renderHorasColaborador,
  };
})();
