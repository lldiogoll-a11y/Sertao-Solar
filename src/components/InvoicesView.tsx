import { useMemo, useState } from 'react';
import { Eye, FileDown, Plus, Search, X } from 'lucide-react';
import type { Client, Invoice, InvoiceStatus, PaymentMethod, Seller, SolarPlant } from '../types.ts';
import {
  formatBRL,
  formatDateBR,
  formatMonthShort,
  formatNumber,
  uid,
} from '../utils/formatters.ts';
import { exportInvoicesStatusPDF, exportPaymentReceiptPDF } from '../utils/pdfExport.ts';
import { InvoiceStatusLabel } from './StatusText.tsx';

interface InvoicesViewProps {
  invoices: Invoice[];
  clients: Client[];
  plants: SolarPlant[];
  sellers: Seller[];
  canEdit: boolean;
  onRequireLogin: (reason?: string) => void;
  onCreateInvoice: (invoice: Invoice) => Promise<void>;
  onMarkInvoicePaid: (invoice: Invoice, method: PaymentMethod, paidAt: string) => Promise<void>;
  onPreviewReceipt: (invoice: Invoice) => void;
}

export function InvoicesView({
  invoices,
  clients,
  plants,
  sellers,
  canEdit,
  onRequireLogin,
  onCreateInvoice,
  onMarkInvoicePaid,
  onPreviewReceipt,
}: InvoicesViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Pay modal
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('PIX');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  // New invoice modal
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    clientId: clients[0]?.id || '',
    referenceMonth: '2026-11',
    dueDate: '2026-11-28',
    kwhCompensated: clients[0]?.contractedKwh || 15000,
    discountPct: clients[0]?.discountPct ?? 15,
    extraDiscountBrl: clients[0]?.fixedDiscountBrl ?? 0,
  });

  const availableMonths = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.referenceMonth))).sort().reverse(),
    [invoices],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices
      .filter((inv) => {
        const cli = clients.find((c) => c.id === inv.clientId);
        const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
        const matchMonth = monthFilter === 'all' || inv.referenceMonth === monthFilter;
        const matchSearch =
          !q ||
          inv.number.toLowerCase().includes(q) ||
          (cli?.name.toLowerCase().includes(q) ?? false) ||
          (cli?.ucNumber.toLowerCase().includes(q) ?? false);
        return matchStatus && matchMonth && matchSearch;
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [invoices, clients, statusFilter, monthFilter, search]);

  const paidSum = filtered.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0);
  const pendingSum = filtered
    .filter((i) => i.status === 'pendente')
    .reduce((s, i) => s + i.netAmount, 0);
  const overdueSum = filtered
    .filter((i) => i.status === 'vencida')
    .reduce((s, i) => s + i.netAmount, 0);
  const commissionSum = filtered.reduce((s, i) => s + i.commissionAmount, 0);

  const handleOpenNew = () => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para emitir uma nova fatura.');
      return;
    }
    const firstClient = clients[0];
    setNewForm({
      clientId: firstClient?.id || '',
      referenceMonth: '2026-11',
      dueDate: '2026-11-28',
      kwhCompensated: firstClient?.contractedKwh || 15000,
      discountPct: firstClient?.discountPct ?? 15,
      extraDiscountBrl: firstClient?.fixedDiscountBrl ?? 0,
    });
    setNewOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cli = clients.find((c) => c.id === newForm.clientId);
    if (!cli) return;
    const plant = plants.find((p) => p.id === cli.plantId);
    const tariff = plant?.tariffPerKwh ?? 0.92;
    const gross = Number((newForm.kwhCompensated * tariff).toFixed(2));
    const pctDiscount = gross * (Math.max(0, Math.min(100, newForm.discountPct)) / 100);
    const extraDiscount = Math.max(0, newForm.extraDiscountBrl);
    const discount = Number(Math.min(gross, pctDiscount + extraDiscount).toFixed(2));
    const net = Number(Math.max(0, gross - discount).toFixed(2));
    const commissionVal = Number((net * (cli.commissionPct / 100)).toFixed(2));

    const invoice: Invoice = {
      id: uid('inv'),
      number: `FAT-2026-${Math.floor(1000 + Math.random() * 8999)}`,
      clientId: cli.id,
      plantId: cli.plantId,
      sellerId: cli.sellerId,
      commissionPctSnapshot: cli.commissionPct,
      referenceMonth: newForm.referenceMonth,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: newForm.dueDate,
      kwhCompensated: newForm.kwhCompensated,
      grossAmount: gross,
      discountAmount: discount,
      netAmount: net,
      commissionAmount: commissionVal,
      status: newForm.dueDate < '2026-11-14' ? 'vencida' : 'pendente',
    };
    await onCreateInvoice(invoice);
    setNewOpen(false);
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    await onMarkInvoicePaid(payingInvoice, payMethod, payDate);
    setPayingInvoice(null);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Recebido (Pagas)</p>
          <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
            {formatBRL(paidSum)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {filtered.filter((i) => i.status === 'paga').length} faturas liquidadas
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Faturas Pendentes</p>
          <p className="text-2xl font-semibold text-amber-700 font-mono tabular-nums mt-1">
            {formatBRL(pendingSum)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {filtered.filter((i) => i.status === 'pendente').length} aguardando vencimento
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Faturas Vencidas</p>
          <p className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1">
            {formatBRL(overdueSum)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {filtered.filter((i) => i.status === 'vencida').length} em atraso para cobrança
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Comissões Vinculadas</p>
          <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
            {formatBRL(commissionSum)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Calculadas automaticamente por cliente</p>
        </div>
      </div>

      {/* Filters & Export Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fatura ou cliente..."
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-60"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['all', 'Todas'],
                ['vencida', 'Vencidas'],
                ['pendente', 'Pendentes'],
                ['paga', 'Pagas'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800"
          >
            <option value="all">Todas as Competências</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthShort(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportInvoicesStatusPDF(
                monthFilter === 'all' ? 'Todas as Competências' : formatMonthShort(monthFilter),
                filtered,
                clients,
                sellers,
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4" />
            Exportar Lista (PDF)
          </button>
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Emitir Fatura
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                <th className="py-3 px-5">Fatura / Ref.</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Vendedor (% Com.)</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4 text-right">Energia</th>
                <th className="py-3 px-4 text-right">Valor Líquido</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-5 text-right">Recibo / Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    Nenhuma fatura encontrada para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const cli = clients.find((c) => c.id === inv.clientId);
                  const plant = plants.find((p) => p.id === inv.plantId);
                  const sel = sellers.find((s) => s.id === inv.sellerId);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="font-mono font-semibold text-slate-900">{inv.number}</div>
                        <div className="text-xs text-slate-500">
                          {formatMonthShort(inv.referenceMonth)} · {plant?.code || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{cli?.name || '—'}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          UC {cli?.ucNumber || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="text-slate-900 font-medium">{sel?.name || '—'}</div>
                        <div className="text-slate-500 font-mono tabular-nums">
                          {inv.commissionPctSnapshot.toFixed(1)}% · {formatBRL(inv.commissionAmount)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                        {formatDateBR(inv.dueDate)}
                        {inv.paidAt && (
                          <div className="text-emerald-700">Pago {formatDateBR(inv.paidAt)}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {formatNumber(inv.kwhCompensated)} kWh
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{formatBRL(inv.netAmount)}</div>
                        {inv.discountAmount > 0 && (
                          <div className="text-[11px] text-emerald-700">
                            Desc. -{formatBRL(inv.discountAmount)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <InvoiceStatusLabel status={inv.status} />
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {inv.status === 'paga' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onPreviewReceipt(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Recibo
                            </button>
                            <button
                              type="button"
                              onClick={() => exportPaymentReceiptPDF(inv, cli, plant, sel)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              PDF
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!canEdit) {
                                onRequireLogin('Faça login com sua conta Google para registrar pagamentos e gerar recibos.');
                                return;
                              }
                              setPayingInvoice(inv);
                              setPayDate(new Date().toISOString().slice(0, 10));
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 whitespace-nowrap"
                          >
                            Receber e Gerar Recibo
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Emitir Nova Fatura */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Emitir Nova Fatura</h3>
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cliente</label>
                <select
                  required
                  value={newForm.clientId}
                  onChange={(e) => {
                    const c = clients.find((item) => item.id === e.target.value);
                    setNewForm({
                      ...newForm,
                      clientId: e.target.value,
                      kwhCompensated: c?.contractedKwh || 15000,
                      discountPct: c?.discountPct ?? 15,
                      extraDiscountBrl: c?.fixedDiscountBrl ?? 0,
                    });
                  }}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (UC {c.ucNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Competência
                  </label>
                  <input
                    type="month"
                    required
                    value={newForm.referenceMonth}
                    onChange={(e) => setNewForm({ ...newForm, referenceMonth: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vencimento
                  </label>
                  <input
                    type="date"
                    required
                    value={newForm.dueDate}
                    onChange={(e) => setNewForm({ ...newForm, dueDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Energia Compensada (kWh)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newForm.kwhCompensated}
                  onChange={(e) =>
                    setNewForm({ ...newForm, kwhCompensated: Number(e.target.value) })
                  }
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Desconto (%)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100}
                    step={0.5}
                    value={newForm.discountPct}
                    onChange={(e) =>
                      setNewForm({ ...newForm, discountPct: Number(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Desconto Adicional (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={newForm.extraDiscountBrl}
                    onChange={(e) =>
                      setNewForm({ ...newForm, extraDiscountBrl: Number(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              {(() => {
                const cli = clients.find((c) => c.id === newForm.clientId);
                const plant = cli ? plants.find((p) => p.id === cli.plantId) : undefined;
                const tariff = plant?.tariffPerKwh ?? 0.92;
                const gross = newForm.kwhCompensated * tariff;
                const pctDisc = gross * (Math.max(0, Math.min(100, newForm.discountPct)) / 100);
                const totalDisc = Math.min(gross, pctDisc + Math.max(0, newForm.extraDiscountBrl));
                const net = Math.max(0, gross - totalDisc);
                const comm = cli ? net * (cli.commissionPct / 100) : 0;
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500 font-sans block">Valor Bruto</span>
                      <span className="font-semibold text-slate-900">{formatBRL(gross)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">Total Descontos</span>
                      <span className="font-semibold text-emerald-700">-{formatBRL(totalDisc)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">Valor Líquido</span>
                      <span className="font-semibold text-slate-900">{formatBRL(net)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">
                        Comissão ({(cli?.commissionPct ?? 0).toFixed(1)}%)
                      </span>
                      <span className="font-semibold text-amber-800">{formatBRL(comm)}</span>
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setNewOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  Emitir Fatura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Pagamento */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Registrar Pagamento & Recibo
              </h3>
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmPay} className="p-6 space-y-4 text-sm">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <p className="text-xs text-slate-500">
                  {payingInvoice.number} · {clients.find((c) => c.id === payingInvoice.clientId)?.name}
                </p>
                <p className="text-lg font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                  {formatBRL(payingInvoice.netAmount)}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meio de Pagamento
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="PIX">PIX</option>
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="Transferência">Transferência (TED/DOC)</option>
                  <option value="Cartão">Cartão Empresarial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Data do Recebimento
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPayingInvoice(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                >
                  Confirmar Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
