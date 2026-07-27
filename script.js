/**
 * @deprecated Este arquivo foi substituído pela arquitetura modular em /modules/
 *
 * Migração realizada em: 2026-07-27
 * Nova estrutura:
 *   modules/config.js     → Constantes e dados mestres
 *   modules/store.js      → Estado global + persistência
 *   modules/calculator.js → Lógica de cálculo pura
 *   modules/charts.js     → Gráficos Chart.js
 *   modules/reports.js    → PDF (jsPDF) + Excel (SheetJS)
 *   modules/ui.js         → Componentes DOM reutilizáveis
 *   modules/app.js        → Orquestrador principal
 *
 * O arquivo index.html carrega os módulos diretamente.
 * Este arquivo não é mais referenciado pelo HTML.
 *
 * Mantido apenas para referência histórica do código original.
 * Pode ser removido com segurança.
 */

// ── ORIGINAL LEGACY CODE (preserved for reference) ─────────────────────────

const impostoSimples = 0.06;
const metaMensal = 30000;
const semanasMes = 4.3;
const diasUteisMes = 22;
const multiplicadorMinimoCusto = 1.80;

const colaboradores = {
  Reinaldo: { custo: 8000, horas: 180 },
  Adriel: { custo: 2080, horas: 120 },
  Vinicius: { custo: 2104, horas: 120 }, // NOTE: valor corrigido de R$0 (novaEquipe) para R$2104 (colaboradores)
  Lucas: { custo: 1400, horas: 100 }
};

const custosIndiretos = { Arieli: 1499, Estrutura: 2595 };

// ... (código original mantido como referência — não é executado)
