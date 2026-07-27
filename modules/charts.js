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

  // ── Horas Previstas vs Realizadas — Horizontal Bar ─────────────────────────
  function renderHorasComparativo(canvasId, history) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dados = (history || [])
      .filter(h => h.aiPayload && h.aiPayload.horasRealizadas !== null)
      .slice(0, 8)
      .reverse();

    if (dados.length === 0) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">Sem dados. Cadastre horas realizadas no histórico.</p>';
      return;
    }

    const labels = dados.map(h => h.project.nome || `Projeto #${h.id.slice(-4)}`);

    _instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Horas Previstas',
            data: dados.map(h => h.result.horasFinais),
            backgroundColor: 'rgba(76, 139, 245, 0.7)',
            borderColor: '#4C8BF5',
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: 'Horas Realizadas',
            data: dados.map(h => h.aiPayload.horasRealizadas),
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: '#10B981',
            borderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#CBD5E1', font: { size: 12 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}h`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#8892A4' },
          },
          y: {
            grid: { display: false },
            ticks: { color: '#CBD5E1', font: { size: 11 } },
          },
        },
      },
    });
  }

  // ── KPI Sparkline — Line ───────────────────────────────────────────────────
  function renderHistoricoValores(canvasId, history) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dados = (history || []).slice(0, 10).reverse();
    if (dados.length < 2) {
      canvas.parentElement.innerHTML = '<p class="chart-empty">Adicione pelo menos 2 projetos para ver a evolução.</p>';
      return;
    }

    _instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: dados.map(h => h.project.nome || `#${h.id.slice(-4)}`),
        datasets: [{
          label: 'Valor Final (R$)',
          data: dados.map(h => h.result.valorFinal),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#10B981',
          pointRadius: 5,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${_moeda(ctx.raw)}` } },
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#8892A4', callback: v => `R$${(v/1000).toFixed(0)}k` },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#CBD5E1', font: { size: 11 } },
          },
        },
      },
    });
  }

  return {
    renderCustoComposicao,
    renderCandidatosPreco,
    renderHorasComparativo,
    renderHistoricoValores,
  };
})();
