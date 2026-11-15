import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Client, Invoice, MonthlyPerformanceRecord, Seller, SolarPlant } from '../types.ts';
import { formatBRL, formatDateBR, formatMonthFull, formatMonthShort, formatNumber } from './formatters.ts';

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SERTÃO SOLAR', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text('Gestão Inteligente de Mini Usinas Solares', 14, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 196, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(subtitle, 196, 18, { align: 'right' });

  doc.setTextColor(15, 23, 42);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 282, 196, 282);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Sertão Solar Operações Fotovoltaicas · Documento emitido em ${formatDateBR(new Date().toISOString().slice(0, 10))}`,
      14,
      287,
    );
    doc.text(`Página ${i} de ${pageCount}`, 196, 287, { align: 'right' });
  }
}

export function exportPaymentReceiptPDF(
  invoice: Invoice,
  client: Client | undefined,
  plant: SolarPlant | undefined,
  seller: Seller | undefined,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const receiptNum = invoice.receiptNumber || `REC-${invoice.number.replace('FAT-', '')}`;

  addHeader(doc, 'RECIBO DE PAGAMENTO', `Comprovante Nº ${receiptNum}`);

  // Receipt Summary Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 36, 182, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('VALOR RECEBIDO', 20, 44);
  doc.text('DATA DO PAGAMENTO', 95, 44);
  doc.text('FORMA DE PAGAMENTO', 150, 44);

  doc.setFontSize(15);
  doc.setTextColor(22, 163, 74);
  doc.text(formatBRL(invoice.netAmount), 20, 54);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatDateBR(invoice.paidAt || new Date().toISOString().slice(0, 10)), 95, 54);
  doc.text(invoice.paymentMethod || 'PIX', 150, 54);

  // Client & Plant details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Dados do Pagador e Unidade Consumidora', 14, 76);

  autoTable(doc, {
    startY: 80,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    body: [
      ['Cliente / Razão Social', client?.name || 'Cliente não localizado'],
      ['CPF / CNPJ', client?.document || '—'],
      ['Unidade Consumidora (UC)', client?.ucNumber || '—'],
      ['Cidade / UF', client?.city || '—'],
      ['Mini Usina Geradora', plant ? `${plant.code} — ${plant.name} (${plant.city}/${plant.state})` : '—'],
      ['Vendedor Responsável', seller ? `${seller.name} (Comissão ${invoice.commissionPctSnapshot.toFixed(1)}%)` : '—'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62 } },
  });

  const afterClientY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Discriminação da Fatura Quitada', 14, afterClientY);

  autoTable(doc, {
    startY: afterClientY + 4,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Fatura', 'Mês Referência', 'Energia Compensada', 'Valor Tarifa Cheia', 'Desconto Solar', 'Total Pago']],
    body: [
      [
        invoice.number,
        formatMonthFull(invoice.referenceMonth),
        `${formatNumber(invoice.kwhCompensated)} kWh`,
        formatBRL(invoice.grossAmount),
        `-${formatBRL(invoice.discountAmount)}`,
        formatBRL(invoice.netAmount),
      ],
    ],
  });

  const afterTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const declaration = `Recebemos de ${client?.name || 'Cliente'}, inscrito sob CPF/CNPJ ${client?.document || '—'}, a importância líquida de ${formatBRL(invoice.netAmount)}, referente à quitação integral da fatura ${invoice.number} (${formatMonthFull(invoice.referenceMonth)}) de compensação de créditos de energia solar fotovoltaica.`;
  const splitText = doc.splitTextToSize(declaration, 182);
  doc.text(splitText, 14, afterTableY);

  // Signature line
  const sigY = afterTableY + 34;
  doc.setDrawColor(148, 163, 184);
  doc.line(55, sigY, 155, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Sertão Solar Administração de Mini Usinas Solares', 105, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Autenticação Digital: ${receiptNum} · Fatura ${invoice.number}`, 105, sigY + 10, { align: 'center' });

  addFooter(doc);
  doc.save(`Recibo_${receiptNum}_${invoice.referenceMonth}.pdf`);
}

export function exportClientStatementPDF(
  client: Client,
  plant: SolarPlant | undefined,
  seller: Seller | undefined,
  clientInvoices: Invoice[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'EXTRATO DO CLIENTE', `UC ${client.ucNumber} · ${client.name}`);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    body: [
      ['Cliente / Razão Social', client.name, 'CPF / CNPJ', client.document],
      ['Unidade Consumidora', client.ucNumber, 'Cidade / UF', client.city],
      ['Usina Vinculada', plant ? `${plant.code} — ${plant.name}` : '—', 'Cota Contratada', `${formatNumber(client.contractedKwh)} kWh/mês`],
      ['Desconto Contratual', `${client.discountPct}%`, 'Vendedor / Comissão', `${seller?.name || '—'} (${client.commissionPct.toFixed(1)}%)`],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      2: { fontStyle: 'bold', cellWidth: 38 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Histórico de Consumo e Compensação', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Mês Ref.', 'Consumo Total (kWh)', 'Compensado (kWh)', 'Custo s/ Solar', 'Valor Faturado', 'Economia']],
    body: client.consumptionHistory.map((h) => [
      formatMonthShort(h.month),
      `${formatNumber(h.consumedKwh)} kWh`,
      `${formatNumber(h.compensatedKwh)} kWh`,
      formatBRL(h.gridCostWithoutSolar),
      formatBRL(h.billedAmount),
      formatBRL(Math.max(0, h.gridCostWithoutSolar - h.billedAmount)),
    ]),
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Controle de Faturas (Pagas, Pendentes e Vencidas)', 14, y2);

  const statusLabel = (s: Invoice['status']) =>
    s === 'paga' ? 'Paga' : s === 'vencida' ? 'Vencida' : 'Pendente';

  autoTable(doc, {
    startY: y2 + 3,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    head: [['Fatura', 'Referência', 'Vencimento', 'Energia (kWh)', 'Valor Líquido', 'Situação', 'Pagamento']],
    body: clientInvoices.map((inv) => [
      inv.number,
      formatMonthShort(inv.referenceMonth),
      formatDateBR(inv.dueDate),
      `${formatNumber(inv.kwhCompensated)} kWh`,
      formatBRL(inv.netAmount),
      statusLabel(inv.status),
      inv.paidAt ? formatDateBR(inv.paidAt) : 'Em aberto',
    ]),
  });

  addFooter(doc);
  doc.save(`Extrato_Cliente_${client.ucNumber}.pdf`);
}

export interface SellerCommissionRow {
  invoice: Invoice;
  clientName: string;
  clientUc: string;
  commissionPct: number;
  commissionValue: number;
}

export function exportSellerCommissionsPDF(
  seller: Seller,
  periodLabel: string,
  rows: SellerCommissionRow[],
  totals: {
    paidRevenue: number;
    earnedCommission: number;
    pendingCommission: number;
    overdueCommission: number;
  },
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'RELATÓRIO DE COMISSÕES', `${seller.name} · ${periodLabel}`);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.8 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    body: [
      ['Vendedor', seller.name, 'CPF / CNPJ', seller.document],
      ['Região de Atuação', seller.region, 'Chave PIX', seller.pixKey],
      ['Comissão Realizada (Pagas)', formatBRL(totals.earnedCommission), 'Comissão Pendente', formatBRL(totals.pendingCommission)],
      ['Comissão em Faturas Vencidas', formatBRL(totals.overdueCommission), 'Volume Recebido no Período', formatBRL(totals.paidRevenue)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48 },
      2: { fontStyle: 'bold', cellWidth: 48 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Detalhamento por Fatura e Cliente (${periodLabel})`, 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8.2, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Fatura', 'Cliente', 'Ref.', 'Situação', 'Valor Fatura', '% Com.', 'Comissão']],
    body: rows.map((r) => [
      r.invoice.number,
      r.clientName,
      formatMonthShort(r.invoice.referenceMonth),
      r.invoice.status === 'paga' ? 'Paga' : r.invoice.status === 'vencida' ? 'Vencida' : 'Pendente',
      formatBRL(r.invoice.netAmount),
      `${r.commissionPct.toFixed(1)}%`,
      formatBRL(r.commissionValue),
    ]),
  });

  addFooter(doc);
  doc.save(`Comissoes_${seller.name.replace(/\s+/g, '_')}.pdf`);
}

export function exportMonthlyPerformancePDF(
  month: string,
  plants: SolarPlant[],
  performance: MonthlyPerformanceRecord[],
  invoices: Invoice[],
  clients: Client[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'RELATÓRIO MENSAL DE PERFORMANCE', `Competência: ${formatMonthFull(month)}`);

  const monthPerf = performance.filter((p) => p.month === month);
  const monthInv = invoices.filter((i) => i.referenceMonth === month);

  const totalGenerated = monthPerf.reduce((acc, p) => acc + p.generatedKwh, 0);
  const totalExpected = monthPerf.reduce((acc, p) => acc + p.expectedKwh, 0);
  const totalCompensated = monthPerf.reduce((acc, p) => acc + p.compensatedKwh, 0);
  const totalCo2 = monthPerf.reduce((acc, p) => acc + p.co2AvoidedTons, 0);
  const avgPr = monthPerf.length ? monthPerf.reduce((acc, p) => acc + p.performanceRatioPct, 0) / monthPerf.length : 0;

  const paidTotal = monthInv.filter((i) => i.status === 'paga').reduce((acc, i) => acc + i.netAmount, 0);
  const openTotal = monthInv.filter((i) => i.status !== 'paga').reduce((acc, i) => acc + i.netAmount, 0);
  const commissionTotal = monthInv.reduce((acc, i) => acc + i.commissionAmount, 0);
  const plantExpensesTotal = monthPerf.reduce((acc, p) => acc + (p.totalExpenses || 0), 0);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    body: [
      ['Geração Total Realizada', `${formatNumber(totalGenerated)} kWh`, 'Meta do Período', `${formatNumber(totalExpected)} kWh`],
      ['Energia Compensada (Clientes)', `${formatNumber(totalCompensated)} kWh`, 'Performance Ratio Médio', `${avgPr.toFixed(1)}%`],
      ['Receita Liquidada (Pagas)', formatBRL(paidTotal), 'Em Aberto (Pendentes/Vencidas)', formatBRL(openTotal)],
      ['Despesas das Plantas', formatBRL(plantExpensesTotal), 'Comissões Apuradas', formatBRL(commissionTotal)],
      ['CO₂ Evitado no Mês', `${formatNumber(totalCo2, 1)} t`, 'Saldo (Receita - Desp. - Com.)', formatBRL(paidTotal - plantExpensesTotal - commissionTotal)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 52 },
      2: { fontStyle: 'bold', cellWidth: 52 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Performance Operacional por Mini Usina', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8.2, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Usina', 'Potência', 'Gerado (kWh)', 'Meta (kWh)', 'Ating.', 'Despesas (R$)', 'PR (%)']],
    body: monthPerf.map((rec) => {
      const plant = plants.find((p) => p.id === rec.plantId);
      const pct = rec.expectedKwh > 0 ? (rec.generatedKwh / rec.expectedKwh) * 100 : 0;
      return [
        plant ? `${plant.code} — ${plant.name}` : rec.plantId,
        plant ? `${formatNumber(plant.capacityKwp)} kWp` : '—',
        formatNumber(rec.generatedKwh),
        formatNumber(rec.expectedKwh),
        `${pct.toFixed(1)}%`,
        formatBRL(rec.totalExpenses || 0),
        `${rec.performanceRatioPct.toFixed(1)}%`,
      ];
    }),
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Faturamento por Cliente na Competência', 14, y2);

  autoTable(doc, {
    startY: y2 + 3,
    theme: 'striped',
    styles: { fontSize: 8.3, cellPadding: 2.5 },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    head: [['Fatura', 'Cliente', 'Compensado', 'Valor Líquido', 'Comissão', 'Situação']],
    body: monthInv.map((inv) => {
      const cli = clients.find((c) => c.id === inv.clientId);
      return [
        inv.number,
        cli?.name || inv.clientId,
        `${formatNumber(inv.kwhCompensated)} kWh`,
        formatBRL(inv.netAmount),
        formatBRL(inv.commissionAmount),
        inv.status === 'paga' ? 'Paga' : inv.status === 'vencida' ? 'Vencida' : 'Pendente',
      ];
    }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Performance_${month}.pdf`);
}

export function exportInvoicesStatusPDF(
  title: string,
  invoices: Invoice[],
  clients: Client[],
  sellers: Seller[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'CONTROLE DE FATURAMENTO', title);

  autoTable(doc, {
    startY: 36,
    theme: 'striped',
    styles: { fontSize: 8.3, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Fatura', 'Cliente', 'Vendedor', 'Ref.', 'Vencimento', 'Valor Líquido', 'Situação']],
    body: invoices.map((inv) => {
      const cli = clients.find((c) => c.id === inv.clientId);
      const sel = sellers.find((s) => s.id === inv.sellerId);
      return [
        inv.number,
        cli?.name || '—',
        sel?.name || '—',
        formatMonthShort(inv.referenceMonth),
        formatDateBR(inv.dueDate),
        formatBRL(inv.netAmount),
        inv.status === 'paga' ? 'Paga' : inv.status === 'vencida' ? 'Vencida' : 'Pendente',
      ];
    }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Faturas_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportSampleUtilityBillPDF() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(12, 74, 110);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CONCESSIONÁRIA PAULISTA DE ENERGIA S/A', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Demonstrativo Mensal de Faturamento e Compensação SCEE (GD)', 14, 19);

  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 34,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    body: [
      ['Titular / Razão Social', 'Metalúrgica Horizonte Industrial Ltda'],
      ['CPF / CNPJ', '45.882.190/0001-62'],
      ['Unidade Consumidora (UC)', '3009945120'],
      ['Endereço / Cidade / UF', 'Av. Industrial, 1450 · Ribeirão Preto / SP'],
      ['Mês de Referência', '11/2026 (2026-11)'],
      ['Data de Vencimento', '28/11/2026'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Medição de Energia Ativa e Créditos Solares Compensados', 14, y1);

  autoTable(doc, {
    startY: y1 + 4,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [12, 74, 110], textColor: [255, 255, 255] },
    head: [['Descrição do Lançamento', 'Leitura / Quantidade', 'Tarifa Unitária', 'Valor Equiv. (R$)']],
    body: [
      ['Consumo Ativo Total Medido (Ponta + Fora Ponta)', '24.600 kWh', 'R$ 0,92', 'R$ 22.632,00'],
      ['Energia Solar Injetada / Compensada (GD)', '23.000 kWh', 'R$ 0,92', 'R$ 21.160,00'],
      ['Saldo Remanescente em Concessionária', '1.600 kWh', 'R$ 0,92', 'R$ 1.472,00'],
    ],
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Histórico de Consumo dos Últimos Meses', 14, y2);

  autoTable(doc, {
    startY: y2 + 4,
    theme: 'grid',
    styles: { fontSize: 8.8, cellPadding: 2.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    head: [['Mês/Ano', 'Consumo Medido (kWh)', 'Energia Compensada (kWh)']],
    body: [
      ['2026-08', '25.100 kWh', '23.000 kWh'],
      ['2026-09', '23.800 kWh', '22.400 kWh'],
      ['2026-10', '24.900 kWh', '23.000 kWh'],
    ],
  });

  doc.save('Fatura_Concessionaria_Exemplo_UC3009945120.pdf');
}

export function exportGeneralReportPDF(
  periodLabel: string,
  startMonth: string,
  endMonth: string,
  plants: SolarPlant[],
  clients: Client[],
  sellers: Seller[],
  invoices: Invoice[],
  monthlyPerformance: MonthlyPerformanceRecord[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'RELATÓRIO GERAL CONSOLIDADO', `Período: ${periodLabel}`);

  const inPeriod = (m: string) => m >= startMonth && m <= endMonth;
  const periodPerf = monthlyPerformance.filter((p) => inPeriod(p.month));
  const periodInv = invoices.filter((i) => inPeriod(i.referenceMonth));

  const totalKwp = plants.reduce((s, p) => s + p.capacityKwp, 0);
  const totalGenerated = periodPerf.reduce((s, p) => s + p.generatedKwh, 0);
  const totalExpected = periodPerf.reduce((s, p) => s + p.expectedKwh, 0);
  const totalCompensated = periodPerf.reduce((s, p) => s + p.compensatedKwh, 0);
  const totalPlantExpenses = periodPerf.reduce((s, p) => s + (p.totalExpenses || 0), 0);
  const paidRevenue = periodInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
  const pendingRevenue = periodInv.filter((i) => i.status === 'pendente').reduce((s, i) => s + i.netAmount, 0);
  const overdueRevenue = periodInv.filter((i) => i.status === 'vencida').reduce((s, i) => s + i.netAmount, 0);
  const earnedComm = periodInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.commissionAmount, 0);
  const openComm = periodInv.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.commissionAmount, 0);
  const netBalance = paidRevenue - earnedComm - totalPlantExpenses;

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.6 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    body: [
      ['Mini Usinas / Capacidade', `${plants.length} usinas (${formatNumber(totalKwp)} kWp)`, 'Clientes / Vendedores', `${clients.length} clientes · ${sellers.length} vendedores`],
      ['Energia Gerada no Período', `${formatNumber(totalGenerated)} kWh`, 'Meta do Período', `${formatNumber(totalExpected)} kWh`],
      ['Energia Compensada', `${formatNumber(totalCompensated)} kWh`, 'Receita Liquidada (Pagas)', formatBRL(paidRevenue)],
      ['Faturas Pendentes', formatBRL(pendingRevenue), 'Faturas Vencidas', formatBRL(overdueRevenue)],
      ['Comissões Realizadas', formatBRL(earnedComm), 'Comissões em Aberto', formatBRL(openComm)],
      ['Despesas das Plantas', formatBRL(totalPlantExpenses), 'Resultado Líquido Realizado', formatBRL(netBalance)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48 },
      2: { fontStyle: 'bold', cellWidth: 48 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Resumo por Mini Usina Solar', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Usina', 'Potência', 'Clientes', 'Gerado (kWh)', 'Despesas (R$)', 'Faturado']],
    body:
      plants.length === 0
        ? [['Nenhuma mini usina cadastrada no período.', '', '', '', '', '']]
        : plants.map((plant) => {
            const pPerf = periodPerf.filter((r) => r.plantId === plant.id);
            const pInv = periodInv.filter((i) => i.plantId === plant.id);
            const gen = pPerf.reduce((s, r) => s + r.generatedKwh, 0);
            const expCost = pPerf.reduce((s, r) => s + (r.totalExpenses || 0), 0);
            const billed = pInv.reduce((s, i) => s + i.netAmount, 0);
            const cliCount = clients.filter((c) => c.plantId === plant.id).length;
            return [
              `${plant.code} — ${plant.name}`,
              `${formatNumber(plant.capacityKwp)} kWp`,
              String(cliCount),
              formatNumber(gen),
              formatBRL(expCost),
              formatBRL(billed),
            ];
          }),
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Resumo Comercial por Vendedor', 14, y2);

  autoTable(doc, {
    startY: y2 + 3,
    theme: 'striped',
    styles: { fontSize: 8.2, cellPadding: 2.4 },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    head: [['Vendedor', 'Carteira', 'Faturamento Pago', 'Com. Realizada', 'Com. Aberta']],
    body:
      sellers.length === 0
        ? [['Nenhum vendedor cadastrado.', '', '', '', '']]
        : sellers.map((sel) => {
            const sCli = clients.filter((c) => c.sellerId === sel.id).length;
            const sInv = periodInv.filter((i) => i.sellerId === sel.id);
            const sPaid = sInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
            const sEarned = sInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.commissionAmount, 0);
            const sOpen = sInv.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.commissionAmount, 0);
            return [sel.name, `${sCli} clientes`, formatBRL(sPaid), formatBRL(sEarned), formatBRL(sOpen)];
          }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Geral_Sertao_Solar_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportPlantReportPDF(
  plantFilterId: string,
  periodLabel: string,
  startMonth: string,
  endMonth: string,
  plants: SolarPlant[],
  clients: Client[],
  invoices: Invoice[],
  monthlyPerformance: MonthlyPerformanceRecord[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const targetPlants = plantFilterId === 'all' ? plants : plants.filter((p) => p.id === plantFilterId);
  const subtitle =
    targetPlants.length === 1
      ? `${targetPlants[0].code} — ${targetPlants[0].name} · ${periodLabel}`
      : `Todas as Mini Usinas (${targetPlants.length}) · ${periodLabel}`;

  addHeader(doc, 'RELATÓRIO DE PLANTAS SOLARES', subtitle);

  const inPeriod = (m: string) => m >= startMonth && m <= endMonth;
  const perfFiltered = monthlyPerformance
    .filter((r) => inPeriod(r.month) && (plantFilterId === 'all' || r.plantId === plantFilterId))
    .sort((a, b) => b.month.localeCompare(a.month));
  const invFiltered = invoices.filter(
    (i) => inPeriod(i.referenceMonth) && (plantFilterId === 'all' || i.plantId === plantFilterId),
  );

  const totalGen = perfFiltered.reduce((s, r) => s + r.generatedKwh, 0);
  const totalExp = perfFiltered.reduce((s, r) => s + r.expectedKwh, 0);
  const totalComp = perfFiltered.reduce((s, r) => s + r.compensatedKwh, 0);
  const totalPlantCost = perfFiltered.reduce((s, r) => s + (r.totalExpenses || 0), 0);
  const billedSum = invFiltered.reduce((s, i) => s + i.netAmount, 0);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.6 },
    body: [
      ['Usinas Analisadas', String(targetPlants.length), 'Capacidade Total', `${formatNumber(targetPlants.reduce((s, p) => s + p.capacityKwp, 0))} kWp`],
      ['Energia Gerada no Período', `${formatNumber(totalGen)} kWh`, 'Meta Projetada', `${formatNumber(totalExp)} kWh`],
      ['Energia Compensada', `${formatNumber(totalComp)} kWh`, 'Despesas das Plantas', formatBRL(totalPlantCost)],
      ['Faturamento Vinculado', formatBRL(billedSum), 'Saldo Operacional (Fat. - Desp.)', formatBRL(billedSum - totalPlantCost)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 46 },
      2: { fontStyle: 'bold', cellWidth: 52 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Consolidado por Planta Solar', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Código / Nome', 'Local', 'Potência', 'Gerado (kWh)', 'PR Médio', 'Despesas', 'Faturado']],
    body:
      targetPlants.length === 0
        ? [['Nenhuma planta cadastrada.', '', '', '', '', '', '']]
        : targetPlants.map((plant) => {
            const pPerf = perfFiltered.filter((r) => r.plantId === plant.id);
            const pInv = invFiltered.filter((i) => i.plantId === plant.id);
            const gen = pPerf.reduce((s, r) => s + r.generatedKwh, 0);
            const pCost = pPerf.reduce((s, r) => s + (r.totalExpenses || 0), 0);
            const avgPr = pPerf.length ? pPerf.reduce((s, r) => s + r.performanceRatioPct, 0) / pPerf.length : 0;
            return [
              `${plant.code} — ${plant.name}`,
              `${plant.city}/${plant.state}`,
              `${formatNumber(plant.capacityKwp)} kWp`,
              formatNumber(gen),
              `${avgPr.toFixed(1)}%`,
              formatBRL(pCost),
              formatBRL(pInv.reduce((s, i) => s + i.netAmount, 0)),
            ];
          }),
  });

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Histórico de Geração Mensal e Despesas (${periodLabel})`, 14, y2);

  autoTable(doc, {
    startY: y2 + 3,
    theme: 'striped',
    styles: { fontSize: 7.8, cellPadding: 2.2 },
    headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    head: [['Competência', 'Usina', 'Gerado (kWh)', 'Meta (kWh)', 'Ating.', 'Despesas (R$)', 'PR (%)', 'Disp. (%)']],
    body:
      perfFiltered.length === 0
        ? [['Sem registros de geração no período.', '', '', '', '', '', '', '']]
        : perfFiltered.map((rec) => {
            const plant = plants.find((p) => p.id === rec.plantId);
            const pct = rec.expectedKwh > 0 ? (rec.generatedKwh / rec.expectedKwh) * 100 : 0;
            return [
              formatMonthShort(rec.month),
              plant?.code || rec.plantId,
              formatNumber(rec.generatedKwh),
              formatNumber(rec.expectedKwh),
              `${pct.toFixed(1)}%`,
              formatBRL(rec.totalExpenses || 0),
              `${rec.performanceRatioPct.toFixed(1)}%`,
              `${rec.availabilityPct.toFixed(1)}%`,
            ];
          }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Plantas_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportClientsPortfolioPDF(
  periodLabel: string,
  startMonth: string,
  endMonth: string,
  clients: Client[],
  plants: SolarPlant[],
  sellers: Seller[],
  invoices: Invoice[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'RELATÓRIO DE CLIENTES E CONSUMO', `Período: ${periodLabel} · ${clients.length} cliente(s)`);

  const inPeriod = (m: string) => m >= startMonth && m <= endMonth;
  const periodInv = invoices.filter((i) => inPeriod(i.referenceMonth));

  const totalConsumed = clients.reduce(
    (sum, c) => sum + c.consumptionHistory.filter((h) => inPeriod(h.month)).reduce((s, h) => s + h.consumedKwh, 0),
    0,
  );
  const totalCompensated = clients.reduce(
    (sum, c) => sum + c.consumptionHistory.filter((h) => inPeriod(h.month)).reduce((s, h) => s + h.compensatedKwh, 0),
    0,
  );
  const totalPaid = periodInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
  const totalOpen = periodInv.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.netAmount, 0);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.6 },
    body: [
      ['Clientes na Carteira', String(clients.length), 'Cota Mensal Contratada', `${formatNumber(clients.reduce((s, c) => s + c.contractedKwh, 0))} kWh`],
      ['Consumo Medido no Período', `${formatNumber(totalConsumed)} kWh`, 'Compensado Solar no Período', `${formatNumber(totalCompensated)} kWh`],
      ['Recebido de Clientes (Pagas)', formatBRL(totalPaid), 'Pendente / Vencido no Período', formatBRL(totalOpen)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48 },
      2: { fontStyle: 'bold', cellWidth: 48 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Detalhamento da Carteira de Clientes', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 7.8, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Cliente / UC', 'Usina', 'Vendedor (% Com.)', 'Consumo (kWh)', 'Compensado', 'Pago (R$)', 'Em Aberto (R$)']],
    body:
      clients.length === 0
        ? [['Nenhum cliente cadastrado.', '', '', '', '', '', '']]
        : clients.map((cli) => {
            const plant = plants.find((p) => p.id === cli.plantId);
            const seller = sellers.find((s) => s.id === cli.sellerId);
            const hist = cli.consumptionHistory.filter((h) => inPeriod(h.month));
            const cons = hist.reduce((s, h) => s + h.consumedKwh, 0);
            const comp = hist.reduce((s, h) => s + h.compensatedKwh, 0);
            const cInvs = periodInv.filter((i) => i.clientId === cli.id);
            const paid = cInvs.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
            const open = cInvs.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.netAmount, 0);
            return [
              `${cli.name} (UC ${cli.ucNumber})`,
              plant?.code || '—',
              seller ? `${seller.name.split(' ')[0]} (${cli.commissionPct.toFixed(1)}%)` : '—',
              formatNumber(cons),
              formatNumber(comp),
              formatBRL(paid),
              formatBRL(open),
            ];
          }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportAllSellersReportPDF(
  periodLabel: string,
  startMonth: string,
  endMonth: string,
  sellers: Seller[],
  clients: Client[],
  invoices: Invoice[],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  addHeader(doc, 'RELATÓRIO CONSOLIDADO DE VENDEDORES', `Período: ${periodLabel}`);

  const periodInv = invoices.filter(
    (i) => i.referenceMonth >= startMonth && i.referenceMonth <= endMonth,
  );

  const earnedTotal = periodInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.commissionAmount, 0);
  const pendingTotal = periodInv.filter((i) => i.status === 'pendente').reduce((s, i) => s + i.commissionAmount, 0);
  const overdueTotal = periodInv.filter((i) => i.status === 'vencida').reduce((s, i) => s + i.commissionAmount, 0);
  const paidRevenue = periodInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.6 },
    body: [
      ['Vendedores Cadastrados', String(sellers.length), 'Faturamento Pago no Período', formatBRL(paidRevenue)],
      ['Comissões Realizadas (Pagas)', formatBRL(earnedTotal), 'Comissões Pendentes', formatBRL(pendingTotal)],
      ['Comissões em Faturas Vencidas', formatBRL(overdueTotal), 'Total Geral de Comissões', formatBRL(earnedTotal + pendingTotal + overdueTotal)],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      2: { fontStyle: 'bold', cellWidth: 50 },
    },
  });

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Ranking e Apuração Individual por Vendedor', 14, y1);

  autoTable(doc, {
    startY: y1 + 3,
    theme: 'striped',
    styles: { fontSize: 8.2, cellPadding: 2.4 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    head: [['Vendedor / Região', 'Clientes', 'Faturado Pago', 'Com. Realizada', 'Com. Pendente', 'Com. Vencida', 'Chave PIX']],
    body:
      sellers.length === 0
        ? [['Nenhum vendedor cadastrado.', '', '', '', '', '', '']]
        : sellers.map((sel) => {
            const sCli = clients.filter((c) => c.sellerId === sel.id).length;
            const sInv = periodInv.filter((i) => i.sellerId === sel.id);
            const sPaid = sInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
            const sEarned = sInv.filter((i) => i.status === 'paga').reduce((s, i) => s + i.commissionAmount, 0);
            const sPending = sInv.filter((i) => i.status === 'pendente').reduce((s, i) => s + i.commissionAmount, 0);
            const sOverdue = sInv.filter((i) => i.status === 'vencida').reduce((s, i) => s + i.commissionAmount, 0);
            return [
              `${sel.name}\n${sel.region}`,
              String(sCli),
              formatBRL(sPaid),
              formatBRL(sEarned),
              formatBRL(sPending),
              formatBRL(sOverdue),
              sel.pixKey,
            ];
          }),
  });

  addFooter(doc);
  doc.save(`Relatorio_Vendedores_${new Date().toISOString().slice(0, 10)}.pdf`);
}


