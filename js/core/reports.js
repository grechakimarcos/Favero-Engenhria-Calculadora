'use strict';
window.App = window.App || {};

/**
 * @module Reports
 * PDF and Excel export engines.
 * Uses jsPDF + AutoTable for PDF, and SheetJS (xlsx) for Excel.
 */
App.Reports = (function () {
  const Config = App.Config;

  function _moeda(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function _pct(v) {
    return `${(v || 0).toFixed(1)}%`;
  }

  function _nowFormatted() {
    return new Date().toLocaleString('pt-BR');
  }

  // ── PDF Export ─────────────────────────────────────────────────────────────
  function exportarPDF(state, result) {
    if (typeof window.jspdf === 'undefined') {
      alert('Biblioteca jsPDF não carregada. Verifique sua conexão.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { project, team, costs, collaborators, indirectCosts } = state;
    const disc = (state.disciplinas || {})[project.disciplina];
    const pageW = doc.internal.pageSize.getWidth();
    let y = 0;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.setFillColor(26, 29, 46);
    doc.rect(0, 0, pageW, 38, 'F');

    doc.setTextColor(16, 185, 129);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('FÁVERO ENGENHARIA', 14, 16);

    doc.setTextColor(203, 213, 225);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório de Precificação Técnica', 14, 25);
    doc.text(`Gerado em: ${_nowFormatted()}`, 14, 32);

    // Ref number on right
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text(`Ref: ${Date.now().toString().slice(-8)}`, pageW - 14, 32, { align: 'right' });

    y = 46;

    // ── Project Data ─────────────────────────────────────────────────────────
    doc.setTextColor(203, 213, 225);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Dados do Projeto', 14, y);
    y += 6;
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(0.5);
    doc.line(14, y, pageW - 14, y);
    y += 6;

    doc.autoTable({
      startY: y,
      head: [],
      body: [
        ['Projeto', project.nome || '—',            'Cliente', project.cliente || '—'],
        ['Disciplina', disc?.nome || '—',           'Data', project.data || '—'],
        ['Edificação', Config.LABELS_EDIFICACAO[project.tipoEdificacao] || '—', 'Área', `${project.area || 0} m²`],
        ['Complexidade', Config.LABELS_COMPLEXIDADE[project.complexidade] || '—', 'Tipo Comercial', Config.LABELS_TIPO[project.tipoComercial] || '—'],
        ['Revisão', Config.LABELS_REVISAO[project.revisao] || '—', 'Aprovação', Config.LABELS_APROVACAO[project.aprovacao] || '—'],
        ['Risco', Config.LABELS_RISCO[project.fatorRisco] || '—', 'Urgência', Config.LABELS_URGENCIA[project.fatorUrgencia] || '—'],
      ],
      columnStyles: {
        0: { cellWidth: 35, fontStyle: 'bold', textColor: [100, 116, 139], fontSize: 9 },
        1: { cellWidth: 55, textColor: [203, 213, 225] },
        2: { cellWidth: 35, fontStyle: 'bold', textColor: [100, 116, 139], fontSize: 9 },
        3: { cellWidth: 55, textColor: [203, 213, 225] },
      },
      styles: { fillColor: [30, 35, 60], lineColor: [46, 62, 88], lineWidth: 0.3, fontSize: 10 },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;

    // ── Financial KPIs ───────────────────────────────────────────────────────
    doc.setTextColor(203, 213, 225);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Indicadores Financeiros', 14, y);
    y += 6;
    doc.line(14, y, pageW - 14, y);
    y += 6;

    doc.autoTable({
      startY: y,
      head: [['Indicador', 'Valor', 'Indicador', 'Valor']],
      body: [
        ['Horas Finais', `${result.horasFinais.toFixed(2)}h`, 'Fator de Esforço', `x${result.fatorEsforco.toFixed(3)}`],
        ['Custo Interno (Equipe)', _moeda(result.custoInternoEquipe), 'Despesas Extras', _moeda(result.despesasExtras)],
        ['Custo Interno Total', _moeda(result.custoInternoTotal), 'Impostos (6%)', _moeda(result.imposto)],
        ['Ref. Comercial', _moeda(result.valorReferenciaComercial), `Custo x${result.multiplicadorMinimoAplicado || state.settings.multiplicadorMinimo}`, _moeda(result.valorMinimoPorCusto)],
        ['Ticket Mínimo', _moeda(result.ticketMinimoComDespesas), 'Mark-up', `${result.markup.toFixed(2)}x`],
        ['Lucro Bruto', _moeda(result.lucrobruto), 'Lucro Líquido', _moeda(result.lucroLiquido)],
        ['Margem Bruta', _pct(result.margemBruta), 'Rentabilidade', _pct(result.rentabilidade)],
        ['Ponto de Equilíbrio', `${_moeda(result.pontoEquilibrio)}/h`, 'Valor Líquido', _moeda(result.valorLiquido)],
      ],
      headStyles: { fillColor: [26, 29, 46], textColor: [100, 116, 139], fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [100, 116, 139], fontSize: 9, cellWidth: 45 },
        1: { textColor: [203, 213, 225], cellWidth: 45 },
        2: { fontStyle: 'bold', textColor: [100, 116, 139], fontSize: 9, cellWidth: 45 },
        3: { textColor: [203, 213, 225], cellWidth: 45 },
      },
      styles: { fillColor: [30, 35, 60], lineColor: [46, 62, 88], lineWidth: 0.3, fontSize: 10 },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 8;

    // Final price highlight box
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(14, y, pageW - 28, 18, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('PREÇO FINAL SUGERIDO:', 20, y + 7);
    doc.setFontSize(15);
    doc.text(_moeda(result.valorFinal), pageW - 20, y + 7, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 255, 240);
    doc.text(result.determinante, 20, y + 13);
    y += 26;

    // ── Team Composition ─────────────────────────────────────────────────────
    if (result.detalhesEquipe && result.detalhesEquipe.length > 0) {
      doc.setTextColor(203, 213, 225);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('3. Composição da Equipe', 14, y);
      y += 6;
      doc.line(14, y, pageW - 14, y);
      y += 4;

      doc.autoTable({
        startY: y,
        head: [['Colaborador', 'Horas Informadas', 'Horas Ajustadas', 'Custo/h Real', 'Custo no Projeto', '%']],
        body: result.detalhesEquipe.map(d => [
          d.nome,
          `${d.horas.toFixed(1)}h`,
          `${d.horasAjustadas.toFixed(2)}h`,
          _moeda(d.custoHora),
          _moeda(d.custoTotal),
          _pct(d.percentual),
        ]),
        headStyles: { fillColor: [26, 29, 46], textColor: [100, 116, 139], fontSize: 9 },
        styles: { fillColor: [30, 35, 60], lineColor: [46, 62, 88], lineWidth: 0.3, textColor: [203, 213, 225], fontSize: 10 },
        theme: 'grid',
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(26, 29, 46);
    doc.rect(0, pageH - 14, pageW, 14, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Fávero Engenharia — Sistema de Precificação Técnica', 14, pageH - 5);
    doc.text(`Página 1 de 1`, pageW - 14, pageH - 5, { align: 'right' });

    const nomeArquivo = `Precificacao_${(project.nome || 'Projeto').replace(/\s+/g, '_')}_${project.data || 'sem_data'}.pdf`;
    doc.save(nomeArquivo);
  }

  // ── Excel Export ───────────────────────────────────────────────────────────
  function exportarExcel(state, result, history) {
    if (typeof XLSX === 'undefined') {
      alert('Biblioteca SheetJS não carregada. Verifique sua conexão.');
      return;
    }

    const { project, collaborators, indirectCosts } = state;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Resumo ──────────────────────────────────────────────────────
    const resumoData = [
      ['FÁVERO ENGENHARIA — RELATÓRIO DE PRECIFICAÇÃO'],
      [],
      ['DADOS DO PROJETO'],
      ['Projeto', project.nome || '—'],
      ['Cliente', project.cliente || '—'],
      ['Data', new Date(project.data).toLocaleDateString('pt-BR')],
      ['Disciplina', (state.disciplinas || {})[project.disciplina]?.nome || '—'],
      ['Tipo Edificação', Config.LABELS_EDIFICACAO[project.tipoEdificacao] || '—'],
      ['Área', `${project.area || 0} m²`],
      [],
      ['INDICADORES FINANCEIROS'],
      ['Horas Base', result.horasBase.toFixed(2)],
      ['Horas Finais', result.horasFinais.toFixed(2)],
      ['Fator de Esforço', result.fatorEsforco.toFixed(4)],
      ['Custo Interno Equipe', result.custoInternoEquipe],
      ['Despesas Extras', result.despesasExtras],
      ['Custo Interno Total', result.custoInternoTotal],
      ['Valor Referência Comercial', result.valorReferenciaComercial],
      ['Valor Mínimo por Custo', result.valorMinimoPorCusto],
      ['Ticket Mínimo', result.ticketMinimoComDespesas],
      ['PREÇO FINAL SUGERIDO', result.valorFinal],
      ['Impostos (6%)', result.imposto],
      ['Valor Líquido', result.valorLiquido],
      ['Lucro Bruto', result.lucrobruto],
      ['Lucro Líquido', result.lucroLiquido],
      ['Mark-up', result.markup],
      ['Margem Bruta (%)', result.margemBruta],
      ['Margem Líquida (%)', result.margemLiquida],
      ['Rentabilidade (%)', result.rentabilidade],
      ['Ponto de Equilíbrio (R$/h)', result.pontoEquilibrio],
      ['Determinante', result.determinante],
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    // ── Sheet 2: Equipe ──────────────────────────────────────────────────────
    const equipeHeader = ['Colaborador', 'Cargo', 'Horas Informadas', 'Horas Ajustadas', 'Custo/h Real (R$)', 'Custo no Projeto (R$)', '% do Total'];
    const equipeRows = (result.detalhesEquipe || []).map(d => [
      d.nome, d.cargo, d.horas.toFixed(1), d.horasAjustadas.toFixed(2),
      d.custoHora.toFixed(2), d.custoTotal.toFixed(2), d.percentual.toFixed(1),
    ]);
    const wsEquipe = XLSX.utils.aoa_to_sheet([equipeHeader, ...equipeRows]);
    XLSX.utils.book_append_sheet(wb, wsEquipe, 'Equipe');

    // ── Sheet 3: Colaboradores Cadastro ──────────────────────────────────────
    const colabHeader = ['Nome', 'Cargo', 'Custo Mensal (R$)', 'Horas/Mês', 'Produtividade (%)', 'Custo Direto/h (R$)', 'Rateio/h (R$)', 'Custo Real/h (R$)'];
    const rateio = App.Calculator.rateioIndiretoHora(indirectCosts, collaborators);
    const colabRows = collaborators.map(c => {
      const direto = c.horasMensais > 0 ? c.custoMensal / c.horasMensais : 0;
      const real = App.Calculator.custoRealHoraPorColaborador(c, indirectCosts, collaborators);
      return [c.nome, c.cargo, c.custoMensal, c.horasMensais, c.produtividade, direto.toFixed(2), rateio.toFixed(2), real.toFixed(2)];
    });
    const wsColab = XLSX.utils.aoa_to_sheet([colabHeader, ...colabRows]);
    XLSX.utils.book_append_sheet(wb, wsColab, 'Colaboradores');

    // ── Sheet 4: Histórico ───────────────────────────────────────────────────
    const histHeader = ['ID', 'Data', 'Projeto', 'Cliente', 'Disciplina', 'Horas Previstas', 'Horas Realizadas', 'Custo Interno (R$)', 'Valor Final (R$)', 'Margem Bruta (%)'];
    const histRows = (history || []).map(h => [
      h.id,
      new Date(h.savedAt).toLocaleDateString('pt-BR'),
      h.project.nome || '—',
      h.project.cliente || '—',
      (state.disciplinas || {})[h.project.disciplina]?.nome || h.project.disciplina,
      h.result.horasFinais.toFixed(1),
      h.aiPayload?.horasRealizadas?.toFixed(2) || '—',
      h.result.custoInternoTotal?.toFixed(2) || '—',
      h.result.valorFinal?.toFixed(2) || '—',
      h.result.margemBruta?.toFixed(1) || '—',
    ]);
    const wsHist = XLSX.utils.aoa_to_sheet([histHeader, ...histRows]);
    XLSX.utils.book_append_sheet(wb, wsHist, 'Histórico');

    const nomeArquivo = `Precificacao_${(project.nome || 'Projeto').replace(/\s+/g, '_')}_${project.data || 'sem_data'}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  }

  return { exportarPDF, exportarExcel };
})();
