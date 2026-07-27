'use strict';
window.App = window.App || {};

/**
 * @module Config
 * Centralizes all constants, master data, and business rules.
 * Following Single Responsibility Principle: this is the single source of truth.
 */
App.Config = Object.freeze({

  // ── Financial Parameters ────────────────────────────────────────────────────
  IMPOSTO_SIMPLES: 0.06,
  META_MENSAL: 30000,
  SEMANAS_MES: 4.3,
  DIAS_UTEIS_MES: 22,
  MULTIPLICADOR_MINIMO_CUSTO: 1.80,
  STORAGE_KEY: 'favero_erp_v3',

  // ── Effort Multiplier Factors ───────────────────────────────────────────────
  FATORES_REVISAO: { 0: 1.00, 1: 1.10, 2: 1.20, 3: 1.35, 4: 1.50 },
  FATORES_APROVACAO: { 0: 1.00, 1: 1.10, 2: 1.20, 3: 1.35 },
  FATORES_COMPLEXIDADE: { 1: 1.00, 2: 1.15, 3: 1.30, 4: 1.50, 5: 1.80 },
  FATORES_TIPO: { fluxo: 0.90, estrategico: 0.85, padrao: 1.00, premium: 1.20, problema: 1.35 },
  FATORES_EDIFICACAO: { casa: 1.00, predio: 1.20, comercio: 0.90 },
  FATORES_RISCO: { 0: 0.00, 1: 0.10, 2: 0.20, 3: 0.35, 4: 0.50 },
  FATORES_URGENCIA: { 0: 0.00, 1: 0.10, 2: 0.25, 3: 0.50 },

  // ── Engineering Disciplines Master Data ─────────────────────────────────────
  DISCIPLINAS: {
    eletrico:       { nome: 'Elétrico Residencial',      areaRef: 200, horasRef: 12, valorBase: 950,  ticketMinimo: 950  },
    hidrossanitario:{ nome: 'Hidrossanitário Residencial',areaRef: 200, horasRef: 18, valorBase: 2200, ticketMinimo: 2200 },
    ppci:           { nome: 'PPCI',                      areaRef: 200, horasRef: 20, valorBase: 2200, ticketMinimo: 1800 },
    spda:           { nome: 'SPDA',                      areaRef: 200, horasRef: 10, valorBase: 1200, ticketMinimo: 950  },
    telecom:        { nome: 'Telecom/Rede lógica',       areaRef: 200, horasRef:  8, valorBase: 950,  ticketMinimo: 850  },
    cftv:           { nome: 'CFTV',                      areaRef: 200, horasRef:  8, valorBase: 950,  ticketMinimo: 850  },
    climatizacao:   { nome: 'Climatização',              areaRef: 200, horasRef: 16, valorBase: 1800, ticketMinimo: 1500 },
    exaustao:       { nome: 'Exaustão/Ventilação',       areaRef: 200, horasRef: 14, valorBase: 1700, ticketMinimo: 1400 },
    gas:            { nome: 'Gás',                       areaRef: 200, horasRef: 12, valorBase: 1500, ticketMinimo: 1200 },
  },

  // ── Default Collaborators (unified from both legacy data sources) ────────────
  // NOTE: Vinicius cost unified to R$2.104 from the collaboradores object (correct source).
  COLABORADORES_DEFAULT: [
    { id: 'reinaldo', nome: 'Reinaldo', cargo: 'Engenheiro Sênior',  custoMensal: 8000, horasMensais: 180, produtividade: 100 },
    { id: 'adriel',   nome: 'Adriel',   cargo: 'Engenheiro Pleno',   custoMensal: 2080, horasMensais: 120, produtividade: 100 },
    { id: 'vinicius', nome: 'Vinicius', cargo: 'Estagiário',         custoMensal: 2104, horasMensais: 120, produtividade: 100 },
    { id: 'lucas',    nome: 'Lucas',    cargo: 'Técnico',            custoMensal: 1400, horasMensais: 100, produtividade: 100 },
  ],

  // ── Default Indirect Costs ───────────────────────────────────────────────────
  CUSTOS_INDIRETOS_DEFAULT: [
    { id: 'arieli',    nome: 'Arieli (Administrativo)',  valor: 1499 },
    { id: 'estrutura', nome: 'Estrutura (Aluguel/Infra)', valor: 2595 },
  ],

  // ── Label Maps for Select Options ───────────────────────────────────────────
  LABELS_REVISAO: {
    0: 'Sem revisão extra',
    1: 'Baixa +10%',
    2: 'Média +20%',
    3: 'Alta +35%',
    4: 'Crítica +50%',
  },
  LABELS_APROVACAO: {
    0: 'Sem aprovação',
    1: 'Simples +10%',
    2: 'Média +20%',
    3: 'Complexa +35%',
  },
  LABELS_COMPLEXIDADE: {
    1: 'Simples',
    2: 'Médio +15%',
    3: 'Alto padrão +30%',
    4: 'Complexo +50%',
    5: 'Muito complexo +80%',
  },
  LABELS_TIPO: {
    fluxo:      'Fluxo -10%',
    estrategico:'Estratégico -15%',
    padrao:     'Padrão',
    premium:    'Premium +20%',
    problema:   'Problema +35%',
  },
  LABELS_EDIFICACAO: {
    casa:     'Casa',
    predio:   'Prédio +20%',
    comercio: 'Comércio -10%',
  },
  LABELS_RISCO: {
    0: 'Sem risco adicional',
    1: 'Baixo +10%',
    2: 'Médio +20%',
    3: 'Alto +35%',
    4: 'Crítico +50%',
  },
  LABELS_URGENCIA: {
    0: 'Prazo normal',
    1: 'Urgente +10%',
    2: 'Muito urgente +25%',
    3: 'Emergência +50%',
  },

  // ── AI Integration Hooks (future-ready) ─────────────────────────────────────
  AI_ENDPOINT: null, // Set to API URL when ready: e.g. 'https://api.favero.eng/v1/estimate'
  AI_VERSION: '0.1.0',
});
