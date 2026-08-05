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
    const value = Number(v);
    return (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function _pct(v) {
    const value = Number(v);
    return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
  }


  // ── PDF helpers ───────────────────────────────────────────────────────────
  const PDF = Object.freeze({
    margin: 14,
    footerHeight: 14,
    navy: [15, 23, 42],
    blue: [37, 99, 235],
    green: [5, 150, 105],
    slate: [71, 85, 105],
    line: [203, 213, 225],
    pale: [241, 245, 249],
  });
  const PDF_LOGO_PATH = 'assets/Logo_RF_white.png';
  const CLIENT_SIGNATORY = 'Reinaldo Favero Filho';
  let _logoPromise = null;

  function _num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function _safeText(value, fallback) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text || (fallback || '—');
  }

  function _plainText(value) {
    return _safeText(value).replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu, '').trim();
  }

  function _formatDate(value) {
    if (!value) return new Date().toLocaleDateString('pt-BR');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? new Date(String(value) + 'T12:00:00')
      : new Date(value);
    return Number.isNaN(date.getTime()) ? _safeText(value) : date.toLocaleDateString('pt-BR');
  }

  function _hours(value) {
    return _num(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' h';
  }

  function _factor(value) {
    return 'x' + _num(value, 1).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }

  function _fileSafe(value) {
    return _safeText(value, 'Projeto')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 72) || 'Projeto';
  }

  function _reference(project) {
    const seed = [project?.cliente, project?.nome, project?.disciplina, project?.data].join('|');
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const date = String(project?.data || new Date().toISOString().slice(0, 10)).replace(/\D/g, '').slice(0, 8);
    return 'ORC-' + (date || 'SEM-DATA') + '-' + String(hash >>> 0).slice(-5).padStart(5, '0');
  }

  function _issuerInfo() {
    const service = App.Supabase || {};
    const profile = typeof service.getProfile === 'function' ? service.getProfile() || {} : {};
    const user = typeof service.getUserInfo === 'function' ? service.getUserInfo() || {} : {};
    return {
      empresa: _safeText(profile.empresa, 'Favero Engenharia'),
      nome: _safeText(profile.nome_completo || user.name, ''),
      cargo: _safeText(profile.cargo, ''),
      telefone: _safeText(profile.telefone, ''),
      email: _safeText(user.email, ''),
    };
  }

  function _getJsPDF() {
    if (typeof window === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Biblioteca jsPDF não carregada. Verifique sua conexão e tente novamente.');
    }
    return window.jspdf.jsPDF;
  }

  function _imageToPngDataUrl(image) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return image;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('A logo carregada não possui dimensões válidas.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('O navegador não conseguiu preparar a logo para o PDF.');
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png')) throw new Error('A conversão da logo para PNG falhou.');
    return dataUrl;
  }

  function _loadLogo() {
    if (_logoPromise) return _logoPromise;
    if (typeof Image === 'undefined') return Promise.resolve(null);
    _logoPromise = new Promise((resolve, reject) => {
      const logo = new Image();
      logo.onload = () => {
        try {
          // jsPDF recebe a imagem já incorporada em base64. Isso evita que ele
          // tente reler a URL do arquivo durante a geração do documento.
          resolve(_imageToPngDataUrl(logo));
        } catch (error) {
          reject(error);
        }
      };
      logo.onerror = () => reject(new Error('Não foi possível carregar a logo do cabeçalho do PDF.'));
      logo.alt = 'Logo RF';
      logo.src = typeof document !== 'undefined'
        ? new URL(PDF_LOGO_PATH, document.baseURI).href
        : PDF_LOGO_PATH;
    });
    return _logoPromise;
  }

  function _newContext(jsPDF) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
      throw new Error('Plugin AutoTable não carregado. Verifique sua conexão e tente novamente.');
    }
    return { doc, width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight(), y: 0 };
  }

  function _setDocumentProperties(doc, properties) {
    if (typeof doc.setProperties !== 'function') return;
    doc.setProperties({
      title: properties.title,
      subject: properties.subject,
      author: _safeText(properties.author, 'Favero Engenharia'),
      creator: 'Sistema de Orçamentos Favero Engenharia',
      keywords: properties.keywords,
    });
  }

  function _drawHeader(ctx, options, logo) {
    const doc = ctx.doc;
    doc.setFillColor.apply(doc, PDF.navy);
    doc.rect(0, 0, ctx.width, 42, 'F');
    let textX = PDF.margin;
    if (logo && typeof doc.addImage === 'function') {
      try {
        doc.addImage(logo, 'PNG', PDF.margin, 6, 24, 24, undefined, 'FAST');
        textX = 42;
      } catch (error) {
        console.warn('[Reports] Logo não pôde ser adicionada ao PDF:', error);
        throw new Error('Não foi possível inserir a logo no cabeçalho do PDF.');
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(_safeText(options.company, 'Favero Engenharia').toUpperCase(), textX, 13);
    doc.setFontSize(13);
    doc.text(options.title, textX, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(options.subtitle, textX, 29);
    doc.text('Ref.: ' + options.reference + '  •  Emissão: ' + options.issuedAt, textX, 35);
    if (options.badge) {
      doc.setFillColor.apply(doc, options.badgeColor || PDF.green);
      doc.roundedRect(ctx.width - 66, 8, 52, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(options.badge, ctx.width - 40, 13.2, { align: 'center' });
    }
    ctx.y = 50;
  }

  function _ensureSpace(ctx, needed) {
    if (ctx.y + needed <= ctx.height - PDF.footerHeight - 8) return;
    ctx.doc.addPage();
    ctx.y = 20;
  }

  function _section(ctx, title) {
    _ensureSpace(ctx, 17);
    const doc = ctx.doc;
    doc.setTextColor.apply(doc, PDF.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(title, PDF.margin, ctx.y);
    ctx.y += 3;
    doc.setDrawColor.apply(doc, PDF.blue);
    doc.setLineWidth(0.5);
    doc.line(PDF.margin, ctx.y, ctx.width - PDF.margin, ctx.y);
    ctx.y += 5;
  }

  function _table(ctx, body, options) {
    const settings = options || {};
    ctx.doc.autoTable({
      startY: ctx.y,
      head: settings.head || [],
      body: body,
      theme: settings.theme || 'grid',
      margin: { left: PDF.margin, right: PDF.margin, top: 18, bottom: 22 },
      headStyles: {
        fillColor: PDF.navy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        textColor: PDF.navy,
        lineColor: PDF.line,
        lineWidth: 0.2,
        fontSize: settings.fontSize || 8.5,
        cellPadding: 2.4,
      },
      alternateRowStyles: { fillColor: PDF.pale },
      columnStyles: settings.columnStyles || {},
      styles: { overflow: 'linebreak', valign: 'middle' },
    });
    ctx.y = ctx.doc.lastAutoTable.finalY + (settings.gap || 7);
  }

  function _paragraph(ctx, value, options) {
    const settings = options || {};
    const doc = ctx.doc;
    const width = settings.width || ctx.width - (PDF.margin * 2);
    doc.setFont('helvetica', settings.bold ? 'bold' : 'normal');
    doc.setFontSize(settings.fontSize || 9.5);
    doc.setTextColor.apply(doc, settings.color || PDF.slate);
    const text = _plainText(value);
    const lines = typeof doc.splitTextToSize === 'function' ? doc.splitTextToSize(text, width) : [text];
    _ensureSpace(ctx, (lines.length * 4.6) + 3);
    doc.text(lines, settings.x || PDF.margin, ctx.y);
    ctx.y += (lines.length * 4.6) + (settings.gap === undefined ? 3 : settings.gap);
  }

  function _bullets(ctx, items) {
    (items || []).filter(Boolean).forEach(item => {
      _ensureSpace(ctx, 10);
      ctx.doc.setFillColor.apply(ctx.doc, PDF.blue);
      ctx.doc.circle(PDF.margin + 1.2, ctx.y - 1.1, 0.8, 'F');
      _paragraph(ctx, item, { x: PDF.margin + 5, width: ctx.width - (PDF.margin * 2) - 5, fontSize: 9.2, gap: 2 });
    });
  }

  function _highlight(ctx, label, value, color) {
    _ensureSpace(ctx, 24);
    const doc = ctx.doc;
    doc.setFillColor.apply(doc, color || PDF.blue);
    doc.roundedRect(PDF.margin, ctx.y, ctx.width - (PDF.margin * 2), 19, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(label, PDF.margin + 6, ctx.y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(value, ctx.width - PDF.margin - 6, ctx.y + 12.5, { align: 'right' });
    ctx.y += 25;
  }

  function _applyPageChrome(ctx, company, reference, confidentiality) {
    const doc = ctx.doc;
    const total = typeof doc.internal.getNumberOfPages === 'function'
      ? doc.internal.getNumberOfPages()
      : 1;
    for (let page = 1; page <= total; page += 1) {
      if (typeof doc.setPage === 'function') doc.setPage(page);
      if (page > 1) {
        doc.setFillColor.apply(doc, PDF.navy);
        doc.rect(0, 0, ctx.width, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(_safeText(company, 'Favero Engenharia').toUpperCase(), PDF.margin, 6.5);
        doc.text(reference, ctx.width - PDF.margin, 6.5, { align: 'right' });
      }
      doc.setFillColor.apply(doc, PDF.navy);
      doc.rect(0, ctx.height - PDF.footerHeight, ctx.width, PDF.footerHeight, 'F');
      doc.setTextColor(203, 213, 225);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const footer = confidentiality
        ? _safeText(company, 'Favero Engenharia') + ' • Documento confidencial de uso interno'
        : _safeText(company, 'Favero Engenharia') + ' • Proposta comercial';
      doc.text(footer, PDF.margin, ctx.height - 5);
      doc.text('Página ' + page + ' de ' + total, ctx.width - PDF.margin, ctx.height - 5, { align: 'right' });
    }
  }

  function _neutralBuilding(value) {
    return ({ casa: 'Casa', predio: 'Prédio', comercio: 'Comércio' })[value] || 'Edificação';
  }

  function _neutralComplexity(value) {
    return ({ 0: 'Simples', 1: 'Normal', 2: 'Complexo', 3: 'Alto padrão', 4: 'Complexo', 5: 'Muito complexo' })[value] || 'Normal';
  }

  function _neutralUrgency(value) {
    return ({ 0: 'Prazo normal', 1: 'Urgente', 2: 'Muito urgente', 3: 'Emergencial' })[value] || 'Prazo a definir';
  }

  function _neutralRevision(value) {
    return ({
      0: 'Sem revisões adicionais previstas',
      1: 'Poucas revisões previstas',
      2: 'Revisões intermediárias previstas',
      3: 'Diversas revisões previstas',
      4: 'Ciclo intensivo de revisões',
    })[value] || 'Conforme escopo';
  }

  /**
   * Builds the client document from an explicit allow-list. Never return raw
   * state/result references here: this boundary prevents internal financial
   * or collaborator data from reaching the commercial PDF.
   */
  function buildClientReportData(state, result) {
    const project = state?.project || {};
    const costs = state?.costs || {};
    const discipline = (state?.disciplinas || {})[project.disciplina] || {};
    const issuer = _issuerInfo();
    const approvals = Array.isArray(project.aprovacoesSelecionadas)
      ? project.aprovacoesSelecionadas.filter(Boolean).map(value => _safeText(value))
      : [];
    const approvalCount = _num(project.aprovacao);
    const approvalDescription = approvals.length
      ? approvals.join(', ')
      : (approvalCount > 0
        ? approvalCount + (approvalCount === 1 ? ' interface de aprovação prevista' : ' interfaces de aprovação previstas')
        : 'Nenhuma aprovação externa prevista');
    const disciplineName = _safeText(discipline.nome || project.disciplina, 'Serviço de engenharia');
    const building = _neutralBuilding(project.tipoEdificacao);
    const area = _num(project.area);
    const scopeItems = [
      'Desenvolvimento dos serviços técnicos de ' + disciplineName + ' para ' + building.toLowerCase() + '.',
      area > 0 ? 'Dimensionamento baseado na área informada de ' + area.toLocaleString('pt-BR') + ' m².' : '',
      'Compatibilização técnica conforme as informações e premissas fornecidas pelo cliente.',
      approvalDescription !== 'Nenhuma aprovação externa prevista' ? 'Consideração das interfaces de aprovação: ' + approvalDescription + '.' : '',
    ].filter(Boolean);
    const includedItems = [];
    if (_num(costs.art) > 0) includedItems.push('Taxas e/ou ART previstas estão contempladas no investimento total.');
    if (_num(costs.outros) > 0) includedItems.push('Itens complementares previstos estão contemplados no investimento total.');

    return {
      reference: _reference(project),
      issuedAt: new Date().toLocaleDateString('pt-BR'),
      issuer: {
        company: issuer.empresa,
        responsible: CLIENT_SIGNATORY,
        role: issuer.cargo,
      },
      client: _safeText(project.cliente, 'Cliente não informado'),
      projectName: _safeText(project.nome, 'Projeto não informado'),
      city: _safeText(project.cidade, 'Não informada'),
      discipline: disciplineName,
      buildingType: building,
      area: area,
      complexity: _neutralComplexity(project.complexidade),
      urgency: _neutralUrgency(project.fatorUrgencia),
      revisions: _neutralRevision(project.revisao),
      approvals: approvalDescription,
      estimatedHours: _num(result?.horasFinais),
      investmentTotal: _num(result?.valorFinal),
      scopeItems: scopeItems,
      includedItems: includedItems,
    };
  }

  async function exportarRelatorioTecnico(state, result) {
    if (!state || !result) throw new Error('Calcule o orçamento antes de gerar o relatório técnico.');
    const jsPDF = _getJsPDF();
    const ctx = _newContext(jsPDF);
    const project = state.project || {};
    const costs = state.costs || {};
    const settings = state.settings || {};
    const discipline = (state.disciplinas || {})[project.disciplina] || {};
    const issuer = _issuerInfo();
    const reference = _reference(project);
    const approvalNames = Array.isArray(project.aprovacoesSelecionadas)
      ? project.aprovacoesSelecionadas.filter(Boolean).join(', ')
      : '';
    const approvalTechnicalLabel = _safeText(Config.LABELS_APROVACAO?.[project.aprovacao])
      + (approvalNames ? ' • ' + approvalNames : '');
    const logo = await _loadLogo();
    _setDocumentProperties(ctx.doc, {
      title: 'Relatório Técnico de Precificação - ' + _safeText(project.nome),
      subject: 'Memória interna de cálculo do orçamento ' + reference,
      author: issuer.empresa,
      keywords: 'relatório técnico, precificação, engenharia, confidencial',
    });
    _drawHeader(ctx, {
      company: issuer.empresa,
      title: 'Relatório Técnico de Precificação',
      subtitle: 'Memória completa do cálculo e da formação do preço',
      reference: reference,
      issuedAt: new Date().toLocaleDateString('pt-BR'),
      badge: 'CONFIDENCIAL • USO INTERNO',
      badgeColor: [185, 28, 28],
    }, logo);

    if (issuer.nome !== '—') {
      _paragraph(ctx, 'Responsável pela emissão: ' + issuer.nome + (issuer.cargo !== '—' ? ' • ' + issuer.cargo : ''), { fontSize: 8.5 });
    }

    _section(ctx, '1. Identificação do projeto');
    _table(ctx, [
      ['Projeto', _safeText(project.nome), 'Cliente', _safeText(project.cliente)],
      ['Cidade', _safeText(project.cidade), 'Data do projeto', _formatDate(project.data)],
      ['Disciplina', _safeText(discipline.nome || project.disciplina), 'Área', _num(project.area).toLocaleString('pt-BR') + ' m²'],
      ['Edificação', _safeText(Config.LABELS_EDIFICACAO?.[project.tipoEdificacao]), 'Complexidade', _safeText(Config.LABELS_COMPLEXIDADE?.[project.complexidade])],
      ['Revisões', _safeText(Config.LABELS_REVISAO?.[project.revisao]), 'Aprovações', approvalTechnicalLabel],
      ['Risco', _safeText(Config.LABELS_RISCO?.[project.fatorRisco]), 'Urgência', _safeText(Config.LABELS_URGENCIA?.[project.fatorUrgencia])],
      ['Tipo comercial', _safeText(Config.LABELS_TIPO?.[project.tipoComercial]), 'Referência', reference],
    ], {
      columnStyles: {
        0: { fontStyle: 'bold', textColor: PDF.slate, cellWidth: 31 },
        1: { cellWidth: 59 },
        2: { fontStyle: 'bold', textColor: PDF.slate, cellWidth: 31 },
        3: { cellWidth: 61 },
      },
    });

    const sourceLabels = { equipe: 'Equipe informada', manual: 'Horas manuais', area: 'Estimativa por área', nenhum: 'Sem origem válida', erro: 'Disciplina não configurada' };
    _section(ctx, '2. Memória de cálculo das horas');
    _table(ctx, [
      ['Origem das horas', sourceLabels[result.fonteHoras] || _safeText(result.fonteHoras)],
      ['Referência da disciplina', _hours(discipline.horasRef) + ' para ' + _num(discipline.areaRef).toLocaleString('pt-BR') + ' m²'],
      ['Índice de referência', _num(result.horasPorM2).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 }) + ' h/m²'],
      ['Horas-base', _hours(result.horasBase)],
      ['Fator de esforço aplicado às horas', _factor(result.fatorEsforco)],
      ['Fator técnico aplicado à referência', _factor(result.fatorTecnicoReferencia)],
      ['Horas finais estimadas', _hours(result.horasFinais)],
      ['Fator técnico sem limite', _factor(result.fatorEsforcoSemLimite)],
      ['Limite técnico acionado', result.fatorEsforcoLimitado ? 'Sim' : 'Não'],
    ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 88 }, 1: { cellWidth: 94 } } });

    _section(ctx, '3. Fatores técnicos e comerciais aplicados');
    _table(ctx, [
      ['Edificação', _safeText(Config.LABELS_EDIFICACAO?.[project.tipoEdificacao]), _factor(result.fatores?.edificacao)],
      ['Revisões', _safeText(Config.LABELS_REVISAO?.[project.revisao]), _factor(result.fatores?.revisao)],
      ['Aprovações', _safeText(Config.LABELS_APROVACAO?.[project.aprovacao]), _factor(result.fatores?.aprovacao)],
      ['Complexidade', _safeText(Config.LABELS_COMPLEXIDADE?.[project.complexidade]), _factor(result.fatores?.complexidade)],
      ['Risco', _safeText(Config.LABELS_RISCO?.[project.fatorRisco]), _factor(result.fatores?.risco)],
      ['Urgência', _safeText(Config.LABELS_URGENCIA?.[project.fatorUrgencia]), _factor(result.fatores?.urgencia)],
      ['Tipo comercial', _safeText(Config.LABELS_TIPO?.[project.tipoComercial]), _factor(result.fatores?.tipoComercial)],
      ['Fator técnico do escopo', 'Resultado combinado limitado', _factor(result.fatorTecnicoEscopo)],
      ['Fator da referência comercial', 'Edificação × tipo × urgência × referência técnica', _factor(result.fatorReferenciaTotal)],
      ['Fator do ticket mínimo', 'Escopo × edificação × tipo × urgência', _factor(result.fatorTicketTotal)],
    ], {
      head: [['Critério', 'Seleção / regra', 'Multiplicador']],
      columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 96 }, 2: { cellWidth: 42, halign: 'right' } },
    });

    _section(ctx, '4. Composição da equipe e custos por profissional');
    if ((result.detalhesEquipe || []).length) {
      _table(ctx, result.detalhesEquipe.map(member => [
        _safeText(member.nome),
        _safeText(member.cargo),
        _hours(member.horas),
        _hours(member.horasAjustadas),
        _moeda(member.custoDiretoHora),
        _moeda(member.custoIndiretoHora),
        _moeda(member.custoHora),
        _moeda(member.custoTotal),
      ]), {
        head: [['Colaborador', 'Cargo', 'Horas inf.', 'Horas aj.', 'Direto/h', 'Indireto/h', 'Real/h', 'Total']],
        fontSize: 7,
        columnStyles: {
          0: { cellWidth: 27 }, 1: { cellWidth: 25 }, 2: { cellWidth: 20, halign: 'right' },
          3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 24, halign: 'right' },
        },
      });
      _table(ctx, result.detalhesEquipe.map(member => [
        _safeText(member.nome),
        _moeda(member.custoDiretoTotal),
        _moeda(member.custoIndiretoTotal),
        _moeda(member.custoTotal),
        _pct(member.percentual),
      ]), {
        head: [['Rateio por colaborador', 'Direto total', 'Indireto total', 'Custo total', 'Participação']],
        fontSize: 7.8,
        columnStyles: {
          0: { cellWidth: 62 }, 1: { cellWidth: 32, halign: 'right' },
          2: { cellWidth: 32, halign: 'right' }, 3: { cellWidth: 32, halign: 'right' },
          4: { cellWidth: 24, halign: 'right' },
        },
      });
    } else {
      _paragraph(ctx, 'Nenhum colaborador individual foi selecionado; o cálculo utilizou a média do escritório.');
    }

    _section(ctx, '5. Estrutura do escritório e custos indiretos');
    if ((state.indirectCosts || []).length) {
      _table(ctx, state.indirectCosts.map(item => [_safeText(item.nome), _moeda(item.valor)]), {
        head: [['Custo indireto mensal', 'Valor']],
        columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 52, halign: 'right' } },
      });
    }
    _table(ctx, [
      ['Horas produtivas mensais', _hours(result.totalHorasProdutivas)],
      ['Custos diretos mensais', _moeda(result.totalCustosDiretos)],
      ['Custos indiretos mensais', _moeda(result.totalCustosIndiretos)],
      ['Custo mensal total', _moeda(result.custoMensalTotal)],
      ['Rateio indireto por hora', _moeda(result.rateioHora) + '/h'],
      ['Indireto rateado neste projeto', _moeda(result.custoIndiretoRateadoProjeto)],
    ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 112 }, 1: { cellWidth: 70, halign: 'right' } } });

    _section(ctx, '6. Composição do custo interno');
    _table(ctx, [
      ['Custo direto da equipe', _moeda(result.custoDiretoEquipe)],
      ['Custo indireto rateado', _moeda(result.custoIndiretoRateadoProjeto)],
      ['Custo interno da equipe', _moeda(result.custoInternoEquipe)],
      ['Taxas / ART', _moeda(costs.art)],
      ['Viagens, terceiros e outros', _moeda(costs.outros)],
      ['Despesas extras', _moeda(result.despesasExtras)],
      ['Custo interno total', _moeda(result.custoInternoTotal)],
    ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 112 }, 1: { cellWidth: 70, halign: 'right' } } });

    _section(ctx, '7. Formação do preço e candidatos');
    const adjustment = project.ajusteComercial || {};
    _table(ctx, [
      ['Valor-base da disciplina', _moeda(discipline.valorBase)],
      ['Ticket-base da disciplina', _moeda(discipline.ticketMinimo)],
      ['Valor/hora comercial da disciplina', _moeda(result.valorHoraComercial)],
      ['Referência comercial', _moeda(result.valorReferenciaComercial)],
      ['Piso por custo (' + _factor(result.multiplicadorMinimoAplicado || settings.multiplicadorMinimo) + ')', _moeda(result.valorMinimoPorCusto)],
      ['Ticket mínimo ajustado', _moeda(result.ticketMinimoComDespesas)],
      ['Preço-base (maior candidato)', _moeda(result.valorFinalBase)],
      ['Desconto nominal', _moeda(adjustment.desconto)],
      ['Acréscimo nominal', _moeda(adjustment.acrescimo)],
      ['Valor fechado manualmente', result.precoManualAplicado ? _moeda(adjustment.valorFechado) : 'Não aplicado'],
      ['Critério determinante', _plainText(result.determinante)],
      ['Preço final sugerido', _moeda(result.valorFinal)],
    ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 112 }, 1: { cellWidth: 70, halign: 'right' } } });

    _section(ctx, '8. Indicadores financeiros internos');
    _table(ctx, [
      ['Alíquota estimada', _pct(_num(settings.impostoSimples) * 100), 'Impostos estimados', _moeda(result.imposto)],
      ['Valor líquido', _moeda(result.valorLiquido), 'Custo mínimo por hora', _moeda(result.custoHoraMinimo) + '/h'],
      ['Lucro bruto', _moeda(result.lucrobruto), 'Lucro líquido', _moeda(result.lucroLiquido)],
      ['Margem bruta', _pct(result.margemBruta), 'Margem líquida', _pct(result.margemLiquida)],
      ['Markup real', _num(result.markup).toFixed(2) + 'x', 'Rentabilidade', _pct(result.rentabilidade)],
    ], {
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 44 }, 1: { cellWidth: 47, halign: 'right' },
        2: { fontStyle: 'bold', cellWidth: 44 }, 3: { cellWidth: 47, halign: 'right' },
      },
    });

    if ((result.alertas || []).length || result.ajusteEdificacaoLimitado || result.ajusteTecnicoLimitado) {
      _section(ctx, '9. Alertas e observações do motor');
      const alerts = (result.alertas || []).map(alert => _plainText(alert.msg));
      if (result.ajusteEdificacaoLimitado) alerts.push('O efeito da edificação foi calculado, mas o preço ficou limitado pelo candidato determinante.');
      if (result.ajusteTecnicoLimitado) alerts.push('O efeito técnico foi calculado, mas o preço ficou limitado pelo candidato determinante.');
      _bullets(ctx, alerts);
    }

    _highlight(ctx, 'PREÇO FINAL SUGERIDO', _moeda(result.valorFinal), PDF.green);
    _applyPageChrome(ctx, issuer.empresa, reference, true);
    const filename = 'Relatorio_Tecnico_' + _fileSafe(project.nome) + '_' + _fileSafe(project.data || 'sem_data') + '.pdf';
    ctx.doc.save(filename);
    return filename;
  }

  async function exportarOrcamentoCliente(state, result) {
    if (!state || !result) throw new Error('Calcule o orçamento antes de gerar a proposta para o cliente.');
    const data = buildClientReportData(state, result);
    const jsPDF = _getJsPDF();
    const ctx = _newContext(jsPDF);
    const logo = await _loadLogo();
    _setDocumentProperties(ctx.doc, {
      title: 'Proposta de Serviços de Engenharia - ' + data.projectName,
      subject: 'Proposta comercial ' + data.reference,
      author: data.issuer.company,
      keywords: 'proposta, orçamento, serviços de engenharia',
    });
    _drawHeader(ctx, {
      company: data.issuer.company,
      title: 'Proposta de Serviços de Engenharia',
      subtitle: 'Solução técnica preparada especialmente para este projeto',
      reference: data.reference,
      issuedAt: data.issuedAt,
      badge: 'PROPOSTA COMERCIAL',
      badgeColor: PDF.blue,
    }, logo);

    _paragraph(ctx, 'Prezado(a) ' + data.client + ',', { bold: true, color: PDF.navy, fontSize: 10.5 });
    _paragraph(ctx, 'Apresentamos nossa proposta para o desenvolvimento dos serviços descritos abaixo. O documento reúne o escopo considerado, a estimativa de dedicação técnica e o investimento total para o projeto.');

    _section(ctx, '1. Identificação da proposta');
    _table(ctx, [
      ['Cliente', data.client, 'Projeto', data.projectName],
      ['Cidade', data.city, 'Disciplina', data.discipline],
      ['Tipo de edificação', data.buildingType, 'Área informada', data.area > 0 ? data.area.toLocaleString('pt-BR') + ' m²' : 'Não informada'],
      ['Referência', data.reference, 'Emissão', data.issuedAt],
    ], {
      columnStyles: {
        0: { fontStyle: 'bold', textColor: PDF.slate, cellWidth: 31 },
        1: { cellWidth: 59 },
        2: { fontStyle: 'bold', textColor: PDF.slate, cellWidth: 31 },
        3: { cellWidth: 61 },
      },
    });

    _section(ctx, '2. Escopo considerado');
    _bullets(ctx, data.scopeItems);

    _section(ctx, '3. Premissas técnicas');
    _table(ctx, [
      ['Complexidade do serviço', data.complexity],
      ['Prazo / prioridade', data.urgency],
      ['Expectativa de revisões', data.revisions],
      ['Aprovações consideradas', data.approvals],
    ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 72 }, 1: { cellWidth: 110 } } });

    _section(ctx, '4. Dedicação técnica estimada');
    _paragraph(ctx, 'A estimativa representa o esforço total previsto para a execução do escopo informado. A distribuição das atividades será organizada conforme as necessidades técnicas do projeto.');
    _highlight(ctx, 'HORAS TÉCNICAS TOTAIS ESTIMADAS', _hours(data.estimatedHours), PDF.blue);

    _section(ctx, '5. Investimento');
    _paragraph(ctx, 'O valor abaixo corresponde ao investimento total previsto para os serviços apresentados nesta proposta.');
    _highlight(ctx, 'INVESTIMENTO TOTAL', _moeda(data.investmentTotal), PDF.green);
    if (data.includedItems.length) _bullets(ctx, data.includedItems);

    _section(ctx, '6. Considerações');
    _bullets(ctx, [
      'A estimativa foi elaborada com base nas informações cadastradas para o projeto.',
      'Alterações relevantes de área, requisitos ou escopo poderão exigir uma nova avaliação da proposta.',
      'O cronograma de entrega e as condições de pagamento serão definidos na contratação.',
      'Atividades e serviços não descritos nesta proposta deverão ser avaliados separadamente.',
    ]);

    _ensureSpace(ctx, 43);
    ctx.doc.setDrawColor.apply(ctx.doc, PDF.line);
    ctx.doc.setLineWidth(0.4);
    ctx.doc.line(PDF.margin, ctx.y + 20, 91, ctx.y + 20);
    ctx.doc.line(119, ctx.y + 20, ctx.width - PDF.margin, ctx.y + 20);
    ctx.doc.setTextColor.apply(ctx.doc, PDF.slate);
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(8);
    ctx.doc.text(data.issuer.responsible !== '—' ? data.issuer.responsible : data.issuer.company, 52.5, ctx.y + 25, { align: 'center' });
    if (data.issuer.role !== '—') ctx.doc.text(data.issuer.role, 52.5, ctx.y + 29, { align: 'center' });
    ctx.doc.text('Aceite do cliente', 157.5, ctx.y + 25, { align: 'center' });
    ctx.y += 35;

    _applyPageChrome(ctx, data.issuer.company, data.reference, false);
    const filename = 'Orcamento_Cliente_' + _fileSafe(data.projectName) + '_' + _fileSafe(data.reference) + '.pdf';
    ctx.doc.save(filename);
    return filename;
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
      ['FAVERO ENGENHARIA — RELATÓRIO DE PRECIFICAÇÃO'],
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

  return {
    exportarRelatorioTecnico,
    exportarOrcamentoCliente,
    exportarPDF: exportarRelatorioTecnico,
    exportarExcel,
    buildClientReportData,
  };
})();
