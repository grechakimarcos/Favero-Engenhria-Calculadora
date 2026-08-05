'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

global.window = global;
global.App = {};

for (const file of ['js/core/config.js', 'js/core/calculator.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

function state(overrides = {}) {
  const base = {
    project: {
      disciplina: 'teste',
      tipoEdificacao: 'casa',
      area: 100,
      horasManuais: '',
      revisao: 0,
      aprovacao: 0,
      complexidade: 1,
      tipoComercial: 'padrao',
      fatorRisco: 0,
      fatorUrgencia: 0,
      ajusteComercial: { desconto: 0, acrescimo: 0, valorFechado: null },
    },
    team: [{ colaboradorId: 'c1', horas: 10 }],
    collaborators: [{
      id: 'c1', nome: 'Teste', cargo: 'Engenheiro',
      custoMensal: 1000, horasMensais: 100, produtividade: 100,
    }],
    indirectCosts: [],
    disciplinas: {
      teste: { nome: 'Teste', areaRef: 100, horasRef: 10, valorBase: 1000, ticketMinimo: 0 },
    },
    costs: { art: 0, outros: 0, margemLucro: 20 },
    settings: { metaMensal: 30000, impostoSimples: 0.06, multiplicadorMinimo: 1.8 },
  };
  const result = structuredClone(base);
  Object.assign(result.project, overrides.project || {});
  Object.assign(result.costs, overrides.costs || {});
  Object.assign(result.settings, overrides.settings || {});
  if (overrides.team !== undefined) result.team = overrides.team;
  if (overrides.disciplina) Object.assign(result.disciplinas.teste, overrides.disciplina);
  return result;
}

function calc(overrides) {
  return App.Calculator.calcularResultado(state(overrides));
}

const base = calc();
assert.equal(base.horasFinais, 10);
assert.equal(base.valorFinal, 1000);

// Building type affects team-entered hours and price.
const commerce = calc({ project: { tipoEdificacao: 'comercio' } });
assert.equal(commerce.fatores.edificacao, 0.9);
assert.equal(commerce.horasFinais, 10);
assert.equal(commerce.valorFinal, 900);

const building = calc({ project: { tipoEdificacao: 'predio' } });
assert.equal(building.horasFinais, 10);
assert.equal(building.valorFinal, 1200);

// Current dashboard complexity levels are all distinct.
const simpleTeam = calc({ project: { complexidade: 0 } });
assert.equal(simpleTeam.horasFinais, 10);
assert.equal(simpleTeam.valorFinal, 900);
assert.equal(calc({ project: { complexidade: 1 } }).valorFinal, 1000);
assert.equal(calc({ project: { complexidade: 2 } }).valorFinal, 1150);

// Approval, revision and risk affect technical hours.
assert.equal(calc({ project: { aprovacao: 1 } }).valorFinal, 1100);
assert.equal(calc({ project: { aprovacao: 2 } }).valorFinal, 1200);
assert.equal(calc({ project: { aprovacao: 3 } }).valorFinal, 1350);
assert.equal(calc({ project: { revisao: 2 } }).valorFinal, 1200);
assert.equal(calc({ project: { fatorRisco: 2 } }).valorFinal, 1200);

// Urgency and commercial type affect commercial price, not hours.
const urgent = calc({ project: { fatorUrgencia: 1 } });
assert.equal(urgent.horasFinais, 10);
assert.equal(urgent.valorFinal, 1100);
assert.equal(calc({ project: { tipoComercial: 'fluxo' } }).valorFinal, 900);

// Same factor behavior for manual and area-derived hours.
const manual = calc({ project: { horasManuais: 10 }, team: [] });
assert.equal(manual.fonteHoras, 'manual');
assert.equal(manual.horasFinais, 10);
const manualCommerce = calc({
  project: { horasManuais: 10, tipoEdificacao: 'comercio' },
  team: [],
});
assert.equal(manualCommerce.horasFinais, 10);
assert.equal(manualCommerce.valorFinal, 900);
const areaCommerce = calc({ project: { tipoEdificacao: 'comercio' }, team: [] });
assert.equal(areaCommerce.fonteHoras, 'area');
assert.equal(areaCommerce.horasFinais, 10);
assert.equal(areaCommerce.valorFinal, 900);

const areaComplex = calc({ project: { complexidade: 2 }, team: [] });
assert.equal(areaComplex.horasFinais, 11.5);

// Additive composition is capped to prevent exorbitant stacking.
const extreme = calc({
  project: {
    tipoEdificacao: 'predio', complexidade: 5, revisao: 4,
    aprovacao: 3, fatorRisco: 4,
  },
  team: [],
});
assert.equal(extreme.fatorEsforco, App.Config.MAX_FATOR_ESFORCO);

// The discipline ticket follows scope factors; the cost floor remains absolute.
const ticketFloor = calc({
  project: { tipoEdificacao: 'comercio' },
  disciplina: { ticketMinimo: 1200 },
});
assert.equal(ticketFloor.horasFinais, 10);
assert.equal(ticketFloor.valorReferenciaComercial, 900);
assert.equal(ticketFloor.valorFinal, 1080);
assert.ok(ticketFloor.determinante.includes('Ticket'));
assert.equal(ticketFloor.ajusteEdificacaoLimitado, false);

const costLimited = calc({
  project: { tipoEdificacao: 'comercio' },
  disciplina: { valorBase: 0, ticketMinimo: 0 },
});
assert.equal(costLimited.valorFinal, 180);
assert.equal(costLimited.ajusteEdificacaoLimitado, true);

const manualPrice = calc({
  project: {
    tipoEdificacao: 'comercio',
    ajusteComercial: { desconto: 0, acrescimo: 0, valorFechado: 1500 },
  },
});
assert.equal(manualPrice.valorFinalBase, 900);
assert.equal(manualPrice.valorFinal, 1500);
assert.equal(manualPrice.precoManualAplicado, true);

// Extras are reimbursed once and are not multiplied by the cost markup.
const costFloorWithExtras = calc({
  costs: { outros: 1000 },
  disciplina: { valorBase: 0, ticketMinimo: 0 },
  settings: { multiplicadorMinimo: 1.8 },
});
assert.equal(costFloorWithExtras.valorMinimoPorCusto, 1180);

// Scale curve is continuous: one extra square meter never reduces hours.
const at300 = calc({ project: { area: 300 }, team: [] });
const at301 = calc({ project: { area: 301 }, team: [] });
assert.ok(at301.horasFinais > at300.horasFinais);

// A stale team reference cannot create uncosted hours.
const staleTeam = calc({ team: [{ colaboradorId: 'removido', horas: 100 }] });
assert.equal(staleTeam.fonteHoras, 'area');

console.log('Calculator factor matrix: OK');
