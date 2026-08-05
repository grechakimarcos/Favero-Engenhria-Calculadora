'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global;
global.App = {};

vm.runInThisContext(fs.readFileSync('js/core/config.js', 'utf8'), {
  filename: 'js/core/config.js',
});

App.Supabase = {
  getProfile() {
    return {
      empresa: 'Fávero Engenharia',
      nome_completo: 'Eng. Responsável',
      cargo: 'Responsável técnico',
      telefone: '(11) 99999-9999',
    };
  },
  getUserInfo() {
    return {
      name: 'Eng. Responsável',
      email: 'responsavel@favero.example',
    };
  },
};
App.Assets = { pdfLogo: 'data:image/png;base64,RF_LOGO_TEST' };

vm.runInThisContext(fs.readFileSync('js/core/reports.js', 'utf8'), {
  filename: 'js/core/reports.js',
});

const pdfInstances = [];

class FakeImage {
  constructor() {
    this.naturalWidth = 500;
    this.naturalHeight = 500;
  }

  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this._src;
  }
}

function flattenCells(value, output) {
  if (Array.isArray(value)) {
    value.forEach(item => flattenCells(item, output));
    return;
  }
  if (value !== null && value !== undefined) output.push(String(value));
}

class FakeJsPDF {
  constructor(options) {
    this.options = options;
    this.pageCount = 1;
    this.currentPage = 1;
    this.entries = [];
    this.tables = [];
    this.images = [];
    this.savedFilename = null;
    this.lastAutoTable = { finalY: 0 };
    this.internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
      getNumberOfPages: () => this.pageCount,
    };
    pdfInstances.push(this);
  }

  _capture(kind, value) {
    const values = [];
    flattenCells(value, values);
    values.forEach(text => this.entries.push({ kind, page: this.currentPage, text }));
    return this;
  }

  text(value) { return this._capture('text', value); }
  setFillColor() { return this; }
  rect() { return this; }
  setTextColor() { return this; }
  setFont() { return this; }
  setFontSize() { return this; }
  roundedRect() { return this; }
  setDrawColor() { return this; }
  setLineWidth() { return this; }
  line() { return this; }
  circle() { return this; }
  addImage(...args) {
    this.images.push(args);
    return this;
  }

  splitTextToSize(value) {
    return [String(value)];
  }

  addPage() {
    this.pageCount += 1;
    this.currentPage = this.pageCount;
    return this;
  }

  setPage(page) {
    this.currentPage = page;
    return this;
  }

  autoTable(options) {
    this.tables.push(options);
    const rows = [...(options.head || []), ...(options.body || [])];
    let cursor = Number(options.startY) || 18;

    rows.forEach(row => {
      if (cursor + 7 > 265) {
        this.addPage();
        cursor = 18;
      }
      this._capture('cell', row);
      cursor += 7;
    });

    this.lastAutoTable = { finalY: cursor };
    return this;
  }

  save(filename) {
    this.savedFilename = filename;
    return this;
  }
}

function buildFixture() {
  const internalNumbers = [
    711111.11,
    722222.22,
    733333.33,
    744444.44,
    755555.55,
    766666.66,
    777777.77,
    788888.88,
    799999.99,
    811111.11,
    822222.22,
    833333.33,
    844444.44,
    855555.55,
  ];

  const details = Array.from({ length: 36 }, (_, index) => ({
    nome: index === 0 ? 'COLABORADOR_ULTRASSECRETO_7429' : `Profissional interno ${index + 1}`,
    cargo: index === 0 ? 'CARGO_INTERNO_9981' : 'Engenheiro',
    horas: 3 + index,
    horasAjustadas: 3.25 + index,
    custoDiretoHora: 91234.56 + index,
    custoIndiretoHora: 92345.67 + index,
    custoHora: 93456.78 + index,
    custoTotal: 94567.89 + index,
    percentual: 2.5,
  }));

  const state = {
    project: {
      cliente: 'Cliente Visível Ltda.',
      nome: 'Projeto/Loja:* "Norte"?',
      cidade: 'São Paulo - SP',
      data: '2026-08-05',
      disciplina: 'eletrico',
      tipoEdificacao: 'predio',
      area: 4321,
      horasManuais: '',
      revisao: 2,
      aprovacao: 2,
      aprovacoesSelecionadas: ['Prefeitura', 'Corpo de Bombeiros'],
      complexidade: 2,
      tipoComercial: 'premium',
      fatorRisco: 2,
      fatorUrgencia: 2,
      ajusteComercial: {
        desconto: 611111.11,
        acrescimo: 622222.22,
        valorFechado: 633333.33,
      },
    },
    team: [{ colaboradorId: 'sigiloso', horas: 123.45 }],
    collaborators: [{
      id: 'sigiloso',
      nome: 'COLABORADOR_ULTRASSECRETO_7429',
      cargo: 'CARGO_INTERNO_9981',
      custoMensal: 644444.44,
      horasMensais: 160,
      produtividade: 87,
    }],
    indirectCosts: [{ nome: 'CUSTO_INDIRETO_SIGILOSO_3157', valor: 655555.55 }],
    costs: {
      art: 666666.66,
      outros: 677777.77,
      margemLucro: 68.765,
    },
    settings: {
      metaMensal: 699999.99,
      impostoSimples: 0.176543,
      multiplicadorMinimo: 2.345,
    },
    disciplinas: {
      eletrico: {
        nome: 'Projeto Elétrico',
        areaRef: 100,
        horasRef: 24,
        valorBase: 700000.01,
        ticketMinimo: 700000.02,
      },
    },
  };

  const result = {
    horasPorM2: 0.24,
    horasBase: 120,
    horasFinais: 123.45,
    fonteHoras: 'equipe',
    fatorEsforco: 1,
    fatorTecnicoReferencia: 1.35,
    fatores: {
      edificacao: 1.2,
      revisao: 1.2,
      aprovacao: 1.2,
      complexidade: 1.15,
      risco: 1.2,
      urgencia: 1.25,
      tipoComercial: 1.2,
    },
    fatorEsforcoSemLimite: 1.75,
    fatorEsforcoLimitado: false,
    fatorTecnicoEscopo: 1.75,
    fatorReferenciaTotal: 2.43,
    fatorTicketTotal: 3.15,
    multiplicadorMinimoAplicado: 2.345,
    ajusteEdificacaoLimitado: true,
    ajusteTecnicoLimitado: true,
    custoInternoEquipe: internalNumbers[0],
    custoDiretoEquipe: internalNumbers[1],
    custoIndiretoRateadoProjeto: internalNumbers[2],
    despesasExtras: internalNumbers[3],
    custoInternoTotal: internalNumbers[4],
    valorHoraComercial: internalNumbers[5],
    valorReferenciaComercial: internalNumbers[6],
    valorMinimoPorCusto: internalNumbers[7],
    ticketMinimoComDespesas: internalNumbers[8],
    valorFinalBase: internalNumbers[9],
    valorFinal: 98765.43,
    imposto: internalNumbers[10],
    valorLiquido: internalNumbers[11],
    precoManualAplicado: true,
    lucrobruto: internalNumbers[12],
    lucroLiquido: internalNumbers[13],
    margemBruta: 66.61,
    margemLiquida: 66.62,
    margemReal: 66.63,
    rentabilidade: 654.321,
    markup: 9.876543,
    custoHoraMinimo: 88888.88,
    pontoEquilibrio: 88888.88,
    alertas: [{ tipo: 'warning', msg: 'SENTINELA_ALERTA_INTERNO_8642' }],
    detalhesEquipe: details,
    determinante: 'SENTINELA_DETERMINANTE_INTERNO_9753',
    precificacaoIndividual: [],
    totalHorasProdutivas: 5432,
    totalCustosDiretos: 889999.91,
    totalCustosIndiretos: 889999.92,
    rateioHora: 889999.93,
    custoMensalTotal: 889999.94,
    metaMensal: 699999.99,
    metaSemanal: 162790.70,
    metaDiaria: 31818.18,
  };

  return { state, result, internalNumbers };
}

function capturedTokens(doc) {
  return doc.entries.map(entry => entry.text);
}

function capturedText(doc) {
  return capturedTokens(doc).join('\n').replace(/\u00a0/g, ' ');
}

beforeEach(() => {
  pdfInstances.length = 0;
  global.Image = FakeImage;
  global.document = {
    baseURI: 'https://example.test/calculadora/index.html',
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/png;base64,RF_LOGO_TEST',
      };
    },
  };
  window.jspdf = { jsPDF: FakeJsPDF };
});

test('buildClientReportData mantém somente a whitelist comercial e usa rótulos neutros', () => {
  const { state, result, internalNumbers } = buildFixture();
  const data = App.Reports.buildClientReportData(state, result);

  assert.deepEqual(Object.keys(data).sort(), [
    'approvals',
    'area',
    'buildingType',
    'city',
    'client',
    'complexity',
    'discipline',
    'estimatedHours',
    'includedItems',
    'investmentTotal',
    'issuedAt',
    'issuer',
    'projectName',
    'reference',
    'revisions',
    'scopeItems',
    'urgency',
  ]);
  assert.deepEqual(Object.keys(data.issuer).sort(), ['company', 'responsible', 'role']);

  assert.equal(data.client, 'Cliente Visível Ltda.');
  assert.equal(data.projectName, 'Projeto/Loja:* "Norte"?');
  assert.equal(data.issuer.responsible, 'Reinaldo Favero Filho');
  assert.equal(data.estimatedHours, 123.45);
  assert.equal(data.investmentTotal, 98765.43);
  assert.equal(data.buildingType, 'Prédio');
  assert.equal(data.complexity, 'Complexo');
  assert.equal(data.urgency, 'Muito urgente');
  assert.equal(data.revisions, 'Revisões intermediárias previstas');
  assert.equal(data.approvals, 'Prefeitura, Corpo de Bombeiros');

  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /COLABORADOR_ULTRASSECRETO_7429|CARGO_INTERNO_9981/);
  assert.doesNotMatch(serialized, /CUSTO_INDIRETO_SIGILOSO_3157/);
  assert.doesNotMatch(serialized, /SENTINELA_(?:ALERTA|DETERMINANTE)_INTERNO/);
  assert.doesNotMatch(serialized, /(?:markup|mark-up|lucro|margem|rentabilidade|alíquota|percentual)/i);
  assert.doesNotMatch(serialized, /%|\+\d+|-\d+%/);
  internalNumbers.forEach(value => assert.doesNotMatch(serialized, new RegExp(String(value).replace('.', '\\.'))));
});

test('exportarOrcamentoCliente inclui apenas dados comerciais e salva nome sanitizado', async () => {
  const { state, result, internalNumbers } = buildFixture();
  const filename = await App.Reports.exportarOrcamentoCliente(state, result);
  const doc = pdfInstances.at(-1);
  const content = capturedText(doc);

  assert.ok(doc, 'o jsPDF deveria ter sido instanciado');
  assert.equal(filename, doc.savedFilename);
  assert.equal(doc.images.length, 1, 'a logo deve ser adicionada ao cabeçalho');
  assert.equal(doc.images[0][0], 'data:image/png;base64,RF_LOGO_TEST');
  assert.match(filename, /^Orcamento_Cliente_ProjetoLoja_Norte_ORC-20260805-\d{5}\.pdf$/);
  assert.doesNotMatch(filename, /[<>:"/\\|?*\x00-\x1F]/);

  assert.match(content, /Cliente Visível Ltda\./);
  assert.match(content, /Projeto\/Loja:\* "Norte"\?/);
  assert.match(content, /Reinaldo Favero Filho/);
  assert.match(content, /123,45 h/);
  assert.match(content, /R\$\s*98\.765,43/);
  assert.match(content, /Prédio/);
  assert.match(content, /Muito urgente/);

  const forbidden = [
    /COLABORADOR_ULTRASSECRETO_7429/i,
    /CARGO_INTERNO_9981/i,
    /CUSTO_INDIRETO_SIGILOSO_3157/i,
    /SENTINELA_ALERTA_INTERNO_8642/i,
    /SENTINELA_DETERMINANTE_INTERNO_9753/i,
    /custo interno/i,
    /custo direto/i,
    /custo indireto/i,
    /custo\s*\/\s*hora/i,
    /markup|mark-up/i,
    /lucro/i,
    /margem/i,
    /rentabilidade/i,
    /alíquota|percentual/i,
    /%/,
    /referência comercial/i,
    /piso por custo/i,
    /ticket mínimo/i,
    /candidatos? de preço/i,
    /critério determinante/i,
  ];
  forbidden.forEach(pattern => assert.doesNotMatch(content, pattern));

  const normalizedTokenDigits = capturedTokens(doc).map(token => token.replace(/\D/g, ''));
  internalNumbers.forEach(value => {
    const sentinelDigits = String(value).replace(/\D/g, '');
    assert.equal(
      normalizedTokenDigits.some(token => token.includes(sentinelDigits)),
      false,
      `o valor interno ${value} não pode aparecer no PDF do cliente`,
    );
  });
});

test('exportarRelatorioTecnico inclui dados internos e numera todas as páginas reais', async () => {
  const { state, result } = buildFixture();
  const filename = await App.Reports.exportarRelatorioTecnico(state, result);
  const doc = pdfInstances.at(-1);
  const content = capturedText(doc);

  assert.ok(doc, 'o jsPDF deveria ter sido instanciado');
  assert.equal(filename, doc.savedFilename);
  assert.equal(filename, 'Relatorio_Tecnico_ProjetoLoja_Norte_2026-08-05.pdf');
  assert.match(content, /COLABORADOR_ULTRASSECRETO_7429/);
  assert.match(content, /CARGO_INTERNO_9981/);
  assert.match(content, /CUSTO_INDIRETO_SIGILOSO_3157/);
  assert.match(content, /SENTINELA_DETERMINANTE_INTERNO_9753/);
  assert.match(content, /SENTINELA_ALERTA_INTERNO_8642/);
  assert.match(content, /Custo interno total/i);
  assert.match(content, /Markup real/i);
  assert.match(content, /Lucro líquido/i);
  assert.match(content, /Margem líquida/i);
  assert.match(content, /Rentabilidade/i);
  assert.match(content, /Alíquota estimada/i);

  assert.ok(doc.pageCount > 1, 'o fixture extenso deveria gerar múltiplas páginas');
  assert.match(content, new RegExp(`Página 1 de ${doc.pageCount}`));
  assert.match(content, new RegExp(`Página ${doc.pageCount} de ${doc.pageCount}`));
  for (let page = 1; page <= doc.pageCount; page += 1) {
    const pageEntries = doc.entries.filter(entry => entry.page === page).map(entry => entry.text);
    assert.ok(pageEntries.includes(`Página ${page} de ${doc.pageCount}`), `rodapé ausente na página ${page}`);
  }
});

test('APIs de PDF lançam erro claro quando jsPDF não está disponível', async () => {
  const { state, result } = buildFixture();
  delete window.jspdf;

  await assert.rejects(
    App.Reports.exportarOrcamentoCliente(state, result),
    /Biblioteca jsPDF não carregada/,
  );
  await assert.rejects(
    App.Reports.exportarRelatorioTecnico(state, result),
    /Biblioteca jsPDF não carregada/,
  );
});
