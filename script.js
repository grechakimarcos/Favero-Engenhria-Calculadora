const impostoSimples = 0.06;
const metaMensal = 30000;
const semanasMes = 4.3;
const diasUteisMes = 22;
const multiplicadorMinimoCusto = 1.80;

const colaboradores = {
  Reinaldo: { custo: 8000, horas: 180 },
  Adriel: { custo: 2080, horas: 120 },
  Vinicius: { custo: 2104, horas: 120 },
  Lucas: { custo: 1400, horas: 100 }
};

const custosIndiretos = { Arieli: 1499, Estrutura: 2595 };

const disciplinas = {
  eletrico: { nome: "Elétrico Residencial", areaRef: 200, horasRef: 12, valorBase: 950, ticketMinimo: 950 },
  hidrossanitario: { nome: "Hidrossanitário Residencial", areaRef: 200, horasRef: 18, valorBase: 2200, ticketMinimo: 2200 },
  ppci: { nome: "PPCI", areaRef: 200, horasRef: 20, valorBase: 2200, ticketMinimo: 1800 },
  spda: { nome: "SPDA", areaRef: 200, horasRef: 10, valorBase: 1200, ticketMinimo: 950 },
  telecom: { nome: "Telecom/Rede lógica", areaRef: 200, horasRef: 8, valorBase: 950, ticketMinimo: 850 },
  cftv: { nome: "CFTV", areaRef: 200, horasRef: 8, valorBase: 950, ticketMinimo: 850 },
  climatizacao: { nome: "Climatização", areaRef: 200, horasRef: 16, valorBase: 1800, ticketMinimo: 1500 },
  exaustao: { nome: "Exaustão/Ventilação", areaRef: 200, horasRef: 14, valorBase: 1700, ticketMinimo: 1400 },
  gas: { nome: "Gás", areaRef: 200, horasRef: 12, valorBase: 1500, ticketMinimo: 1200 }
};

const fatorRevisao = { 0: 1.00, 1: 1.10, 2: 1.20, 3: 1.35, 4: 1.50 };
const fatorAprovacao = { 0: 1.00, 1: 1.10, 2: 1.20, 3: 1.35 };
const fatorCmp = { 1: 1.00, 2: 1.15, 3: 1.30, 4: 1.50, 5: 1.80 };
const fatorTipo = { fluxo: 0.90, estrategico: 0.85, padrao: 1.00, premium: 1.20, problema: 1.35 };

function moeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function totalHorasProdutivas() { return Object.values(colaboradores).reduce((s, c) => s + c.horas, 0); }
function totalCustosDiretos() { return Object.values(colaboradores).reduce((s, c) => s + c.custo, 0); }
function totalCustosIndiretos() { return Object.values(custosIndiretos).reduce((s, v) => s + v, 0); }
function rateioIndiretoHora() { return totalCustosIndiretos() / totalHorasProdutivas(); }
function custoRealHora(nome) { const c = colaboradores[nome]; return (c.custo / c.horas) + rateioIndiretoHora(); }

function carregarResumo() {
  const custoMensal = totalCustosDiretos() + totalCustosIndiretos();
  const horas = totalHorasProdutivas();
  document.getElementById('custoMensal').innerText = moeda(custoMensal);
  document.getElementById('horasProdutivas').innerText = horas + 'h';
  document.getElementById('custoMedioHora').innerText = moeda(custoMensal / horas);
  document.getElementById('metaMensal').innerText = moeda(metaMensal);
  document.getElementById('metaSemanal').innerText = moeda(metaMensal / semanasMes);
  document.getElementById('metaDiaria').innerText = moeda(metaMensal / diasUteisMes);
  document.getElementById('custosIndiretos').innerText = moeda(totalCustosIndiretos());
  document.getElementById('rateioHora').innerText = moeda(rateioIndiretoHora());
}

function opcoesColaboradores(selecionado = '') {
  return Object.keys(colaboradores).map(nome => `<option value="${nome}" ${nome === selecionado ? 'selected' : ''}>${nome}</option>`).join('');
}

function adicionarLinhaEquipe(nome = 'Lucas', horas = 0) {
  const div = document.createElement('div');
  div.className = 'linha-equipe';
  div.innerHTML = `
    <div><label>Colaborador</label><select class="colab-projeto">${opcoesColaboradores(nome)}</select></div>
    <div><label>Horas</label><input type="number" class="horas-colab" value="${horas}" min="0" step="0.5"></div>
    <div><label>Custo/h</label><input type="text" class="custo-hora-view" disabled></div>
    <div><label>Custo</label><input type="text" class="custo-total-view" disabled></div>
    <button class="btn-danger" onclick="this.parentElement.remove(); calcularTudo();">Remover</button>
  `;
  document.getElementById('equipeProjeto').appendChild(div);
  div.querySelector('.colab-projeto').addEventListener('change', calcularTudo);
  div.querySelector('.horas-colab').addEventListener('input', calcularTudo);
  calcularTudo();
}

function carregarTabelas() {
  const tbodyColab = document.getElementById('tabelaColaboradores');
  tbodyColab.innerHTML = '';
  for (const nome in colaboradores) {
    const c = colaboradores[nome];
    const direto = c.custo / c.horas;
    const rateio = rateioIndiretoHora();
    const real = direto + rateio;
    tbodyColab.innerHTML += `<tr><td>${nome}</td><td>${moeda(c.custo)}</td><td>${c.horas}h</td><td>${moeda(direto)}</td><td>${moeda(rateio)}</td><td><strong>${moeda(real)}</strong></td></tr>`;
  }

  const tbodyDisc = document.getElementById('tabelaDisciplinas');
  tbodyDisc.innerHTML = '';
  for (const key in disciplinas) {
    const d = disciplinas[key];
    const horasM2 = d.horasRef / d.areaRef;
    tbodyDisc.innerHTML += `<tr><td>${d.nome}</td><td>${d.areaRef} m²</td><td>${d.horasRef}h</td><td>${horasM2.toFixed(3)}h/m²</td><td>${moeda(d.valorBase)}</td><td>${moeda(d.ticketMinimo)}</td></tr>`;
  }
}

function calcularTudo() {
  carregarResumo();
  carregarTabelas();

  const disciplinaKey = document.getElementById('disciplina').value;
  const area = Number(document.getElementById('area').value);
  const horasManuais = Number(document.getElementById('horasManuais').value);
  const revisao = Number(document.getElementById('revisao').value);
  const aprovacao = Number(document.getElementById('aprovacao').value);
  const cmp = Number(document.getElementById('cmp').value);
  const tipo = document.getElementById('tipo').value;
  const d = disciplinas[disciplinaKey];

  const horasPorM2 = d.horasRef / d.areaRef;
  
  const linhas = [...document.querySelectorAll('.linha-equipe')];
  let horasInformadasEquipe = 0;
  linhas.forEach(l => horasInformadasEquipe += Number(l.querySelector('.horas-colab').value || 0));

  // NOVA HIERARQUIA DE HORAS BASE: 
  // 1. Horas Informadas da Equipe (se > 0) -> Dita o tempo do projeto
  // 2. Horas Manuais (se preenchido)
  // 3. Área do Projeto (se preenchido e > 0)
  let horasBase = 0;
  if (horasInformadasEquipe > 0) {
    horasBase = horasInformadasEquipe;
  } else if (horasManuais > 0) {
    horasBase = horasManuais;
  } else if (area > 0) {
    horasBase = area * horasPorM2;
  }

  const fatorEsforco = fatorRevisao[revisao] * fatorAprovacao[aprovacao] * fatorCmp[cmp];
  const horasFinais = horasBase * fatorEsforco;
  const fatorDistribuicao = horasInformadasEquipe > 0 ? horasFinais / horasInformadasEquipe : 1;

  let custoInterno = 0;
  const tbodyEquipe = document.getElementById('tabelaEquipeProjeto');
  tbodyEquipe.innerHTML = '';

  linhas.forEach(l => {
    const nome = l.querySelector('.colab-projeto').value;
    const horas = Number(l.querySelector('.horas-colab').value || 0);
    const horasAjustadas = horas * fatorDistribuicao;
    const custoHora = custoRealHora(nome);
    const custoTotal = horasAjustadas * custoHora;
    custoInterno += custoTotal;
    l.querySelector('.custo-hora-view').value = moeda(custoHora);
    l.querySelector('.custo-total-view').value = moeda(custoTotal);
    tbodyEquipe.innerHTML += `<tr><td>${nome}</td><td>${horas.toFixed(2)}h</td><td>${horasAjustadas.toFixed(2)}h</td><td>${moeda(custoHora)}</td><td><strong>${moeda(custoTotal)}</strong></td></tr>`;
  });

  if (linhas.length === 0 || horasInformadasEquipe === 0) {
    custoInterno = horasFinais * ((totalCustosDiretos() + totalCustosIndiretos()) / totalHorasProdutivas());
    tbodyEquipe.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--muted-foreground);">Sem equipe informada. Usando custo médio do escritório.</td></tr>`;
  }

  const valorHoraComercial = d.valorBase / d.horasRef;
  const valorReferenciaComercial = horasFinais * valorHoraComercial * fatorTipo[tipo];
  const valorMinimoPorCusto = custoInterno * multiplicadorMinimoCusto;
  
  const valorFinal = Math.max(valorReferenciaComercial, valorMinimoPorCusto, d.ticketMinimo);
  const imposto = valorFinal * impostoSimples;
  const valorLiquido = valorFinal - imposto;

  // Definir qual foi a métrica que venceu:
  let determinanteText = "";
  if (valorFinal === valorMinimoPorCusto && valorMinimoPorCusto > 0) {
    determinanteText = "🎯 Definido pelo Custo da Equipe (x" + multiplicadorMinimoCusto + ")";
  } else if (valorFinal === d.ticketMinimo) {
    determinanteText = "🛡️ Definido pelo Ticket Mínimo da Disciplina";
  } else {
    determinanteText = "📊 Definido pelo Valor Comercial de Referência";
  }

  document.getElementById('horasPorM2').innerText = horasPorM2.toFixed(3) + 'h/m²';
  document.getElementById('horasBase').innerText = horasBase.toFixed(2) + 'h';
  document.getElementById('horasFinais').innerText = horasFinais.toFixed(2) + 'h';
  document.getElementById('custoInterno').innerText = moeda(custoInterno);
  document.getElementById('valorHora').innerText = moeda(valorHoraComercial);
  document.getElementById('valorCalculado').innerText = moeda(valorReferenciaComercial);
  document.getElementById('valorMinimoCusto').innerText = moeda(valorMinimoPorCusto);
  document.getElementById('ticketMinimo').innerText = moeda(d.ticketMinimo);
  document.getElementById('imposto').innerText = moeda(imposto);
  document.getElementById('valorFinal').innerText = moeda(valorFinal);
  document.getElementById('valorLiquido').innerText = moeda(valorLiquido);
  document.getElementById('fatorDeterminante').innerText = determinanteText;

  let texto = `Base: ${d.nome}. Horas finais: ${horasFinais.toFixed(2)}h. Custo interno da equipe: ${moeda(custoInterno)}.`;
  document.getElementById('observacao').innerText = texto;
}

document.getElementById('disciplina').addEventListener('change', calcularTudo);
document.getElementById('area').addEventListener('input', calcularTudo);
document.getElementById('horasManuais').addEventListener('input', calcularTudo);
document.getElementById('revisao').addEventListener('change', calcularTudo);
document.getElementById('aprovacao').addEventListener('change', calcularTudo);
document.getElementById('cmp').addEventListener('change', calcularTudo);
document.getElementById('tipo').addEventListener('change', calcularTudo);

adicionarLinhaEquipe('Lucas', 8);
adicionarLinhaEquipe('Adriel', 3);
adicionarLinhaEquipe('Reinaldo', 1);
calcularTudo();
