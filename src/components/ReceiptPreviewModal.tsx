import { FileDown, X } from 'lucide-react';
import type { Client, Invoice, Seller, SolarPlant } from '../types.ts';
import { formatBRL, formatDateBR, formatMonthFull, formatNumber } from '../utils/formatters.ts';
import { exportPaymentReceiptPDF } from '../utils/pdfExport.ts';

interface ReceiptPreviewModalProps {
  invoice: Invoice;
  client?: Client;
  plant?: SolarPlant;
  seller?: Seller;
  onClose: () => void;
}

export function ReceiptPreviewModal({
  invoice,
  client,
  plant,
  seller,
  onClose,
}: ReceiptPreviewModalProps) {
  const receiptNum = invoice.receiptNumber || `REC-${invoice.number.replace('FAT-', '')}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 id="receipt-modal-title" className="text-base font-semibold text-slate-900">
              Visualização do Recibo de Pagamento
            </h2>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {receiptNum} · Fatura {invoice.number}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60 transition-colors"
            aria-label="Fechar visualização"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-bold tracking-tight">Sertão Solar</p>
                <p className="text-xs text-slate-300">Gestão de Mini Usinas Solares</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">RECIBO DE PAGAMENTO</p>
                <p className="text-xs text-slate-300 font-mono tabular-nums">{receiptNum}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50 border-b border-slate-200">
              <div className="p-4">
                <p className="text-xs text-slate-500">Valor Recebido</p>
                <p className="text-lg font-semibold text-emerald-700 font-mono tabular-nums mt-0.5">
                  {formatBRL(invoice.netAmount)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500">Data da Quitação</p>
                <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {formatDateBR(invoice.paidAt)}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500">Meio de Pagamento</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {invoice.paymentMethod || 'PIX'}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Pagador / Unidade Consumidora</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{client?.name || '—'}</p>
                  <p className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                    {client?.document} · UC {client?.ucNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Usina Geradora & Consultor</p>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {plant ? `${plant.code} — ${plant.name}` : '—'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Vendedor: {seller?.name || '—'} ({invoice.commissionPctSnapshot.toFixed(1)}%)
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 font-medium">Referência</th>
                      <th className="py-2 font-medium text-right">Energia Compensada</th>
                      <th className="py-2 font-medium text-right">Tarifa Cheia</th>
                      <th className="py-2 font-medium text-right">Desconto</th>
                      <th className="py-2 font-medium text-right">Valor Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-900">
                      <td className="py-2.5 font-medium">{formatMonthFull(invoice.referenceMonth)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {formatNumber(invoice.kwhCompensated)} kWh
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {formatBRL(invoice.grossAmount)}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700">
                        -{formatBRL(invoice.discountAmount)}
                      </td>
                      <td className="py-2.5 text-right font-semibold font-mono tabular-nums">
                        {formatBRL(invoice.netAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200 pt-4">
                Declaramos ter recebido de {client?.name || 'Cliente'} ({client?.document || '—'}) a
                importância líquida de {formatBRL(invoice.netAmount)} referente à quitação integral da
                fatura {invoice.number} ({formatMonthFull(invoice.referenceMonth)}) de compensação de
                energia solar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => exportPaymentReceiptPDF(invoice, client, plant, seller)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4" />
            Exportar Recibo em PDF
          </button>
        </div>
      </div>
    </div>
  );
}
