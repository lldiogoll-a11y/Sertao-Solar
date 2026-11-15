import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Edit2, FileDown, Plus, Trash2, X } from 'lucide-react';
import type { Client, Invoice, Seller } from '../types.ts';
import { formatBRL, formatDateBR, formatMonthShort, uid } from '../utils/formatters.ts';
import { exportSellerCommissionsPDF, type SellerCommissionRow } from '../utils/pdfExport.ts';
import { InvoiceStatusLabel } from './StatusText.tsx';

interface SellersViewProps {
  sellers: Seller[];
  clients: Client[];
  invoices: Invoice[];
  canEdit: boolean;
  onRequireLogin: (reason?: string) => void;
  onSaveSeller: (seller: Seller, isNew: boolean) => Promise<void>;
  onDeleteSeller: (id: string) => Promise<void>;
}

type PeriodPreset = '2026-11' | '2026-10' | 'last3m' | 'year2026' | 'custom';

export function SellersView({
  sellers,
  clients,
  invoices,
  canEdit,
  onRequireLogin,
  onSaveSeller,
  onDeleteSeller,
}: SellersViewProps) {
  const [preset, setPreset] = useState<PeriodPreset>('last3m');
  const [customStart, setCustomStart] = useState('2026-09');
  const [customEnd, setCustomEnd] = useState('2026-11');
  const [selectedSellerId, setSelectedSellerId] = useState<string>(sellers[0]?.id || '');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [form, setForm] = useState({
    name: '',
    document: '',
    email: '',
    phone: '',
    region: '',
    defaultCommissionPct: 8.5,
    pixKey: '',
    status: 'ativo' as 'ativo' | 'inativo',
  });

  const { startMonth, endMonth, periodLabel } = useMemo(() => {
    if (preset === '2026-11') {
      return { startMonth: '2026-11', endMonth: '2026-11', periodLabel: 'Novembro/2026' };
    }
    if (preset === '2026-10') {
      return { startMonth: '2026-10', endMonth: '2026-10', periodLabel: 'Outubro/2026' };
    }
    if (preset === 'last3m') {
      return { startMonth: '2026-09', endMonth: '2026-11', periodLabel: 'Set/2026 a Nov/2026' };
    }
    if (preset === 'year2026') {
      return { startMonth: '2026-01', endMonth: '2026-12', periodLabel: 'Ano de 2026' };
    }
    return {
      startMonth: customStart,
      endMonth: customEnd,
      periodLabel: `${formatMonthShort(customStart)} a ${formatMonthShort(customEnd)}`,
    };
  }, [preset, customStart, customEnd]);

  const periodInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) => inv.referenceMonth >= startMonth && inv.referenceMonth <= endMonth,
      ),
    [invoices, startMonth, endMonth],
  );

  const sellerSummaries = useMemo(() => {
    return sellers.map((seller) => {
      const sellerClients = clients.filter((c) => c.sellerId === seller.id);
      const sInvoices = periodInvoices.filter((i) => i.sellerId === seller.id);

      const paidRevenue = sInvoices
        .filter((i) => i.status === 'paga')
        .reduce((s, i) => s + i.netAmount, 0);
      const earnedCommission = sInvoices
        .filter((i) => i.status === 'paga')
        .reduce((s, i) => s + i.commissionAmount, 0);
      const pendingCommission = sInvoices
        .filter((i) => i.status === 'pendente')
        .reduce((s, i) => s + i.commissionAmount, 0);
      const overdueCommission = sInvoices
        .filter((i) => i.status === 'vencida')
        .reduce((s, i) => s + i.commissionAmount, 0);

      return {
        seller,
        clientCount: sellerClients.length,
        invoiceCount: sInvoices.length,
        paidRevenue,
        earnedCommission,
        pendingCommission,
        overdueCommission,
        totalProjected: earnedCommission + pendingCommission + overdueCommission,
      };
    });
  }, [sellers, clients, periodInvoices]);

  const activeSummary = useMemo(
    () =>
      sellerSummaries.find((s) => s.seller.id === selectedSellerId) ??
      sellerSummaries[0] ??
      null,
    [sellerSummaries, selectedSellerId],
  );

  const activeSellerRows = useMemo<SellerCommissionRow[]>(() => {
    if (!activeSummary) return [];
    return periodInvoices
      .filter((inv) => inv.sellerId === activeSummary.seller.id)
      .map((inv) => {
        const cli = clients.find((c) => c.id === inv.clientId);
        return {
          invoice: inv,
          clientName: cli?.name || 'Cliente não localizado',
          clientUc: cli?.ucNumber || '—',
          commissionPct: inv.commissionPctSnapshot,
          commissionValue: inv.commissionAmount,
        };
      })
      .sort((a, b) => b.invoice.referenceMonth.localeCompare(a.invoice.referenceMonth));
  }, [activeSummary, periodInvoices, clients]);

  const openCreate = () => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para cadastrar um novo vendedor.');
      return;
    }
    setEditingSeller(null);
    setForm({
      name: '',
      document: '',
      email: '',
      phone: '',
      region: '',
      defaultCommissionPct: 8.5,
      pixKey: '',
      status: 'ativo',
    });
    setModalOpen(true);
  };

  const openEdit = (seller: Seller) => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para editar os dados do vendedor.');
      return;
    }
    setEditingSeller(seller);
    setForm({
      name: seller.name,
      document: seller.document,
      email: seller.email,
      phone: seller.phone,
      region: seller.region,
      defaultCommissionPct: seller.defaultCommissionPct,
      pixKey: seller.pixKey,
      status: seller.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Seller = editingSeller
      ? { ...editingSeller, ...form }
      : {
          id: uid('sel'),
          ...form,
          joinedAt: new Date().toISOString().slice(0, 10),
        };
    await onSaveSeller(payload, !editingSeller);
    setSelectedSellerId(payload.id);
    setModalOpen(false);
  };

  const totalEarnedAll = sellerSummaries.reduce((s, r) => s + r.earnedCommission, 0);
  const totalProjectedAll = sellerSummaries.reduce(
    (s, r) => s + r.pendingCommission + r.overdueCommission,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Sales Period Filter Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-600">Período de Vendas:</span>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['2026-11', 'Nov/2026'],
                ['2026-10', 'Out/2026'],
                ['last3m', 'Últimos 3 Meses'],
                ['year2026', 'Ano 2026'],
                ['custom', 'Personalizado'],
              ] as [PeriodPreset, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreset(k)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  preset === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="month"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 font-mono"
              />
              <span className="text-slate-400">até</span>
              <input
                type="month"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 font-mono"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Vendedor
        </button>
      </div>

      {/* Period Summary KPIs + Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Consolidado de Comissões ({periodLabel})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Apuração automática baseada nos percentuais definidos por cliente
            </p>
          </div>

          <div className="space-y-4 my-6">
            <div className="border-b border-slate-200 pb-3">
              <p className="text-xs text-slate-500">Comissões Realizadas (Faturas Pagas)</p>
              <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
                {formatBRL(totalEarnedAll)}
              </p>
            </div>
            <div className="border-b border-slate-200 pb-3">
              <p className="text-xs text-slate-500">
                Comissões em Aberto (Pendentes e Vencidas)
              </p>
              <p className="text-2xl font-semibold text-amber-700 font-mono tabular-nums mt-1">
                {formatBRL(totalProjectedAll)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Equipe Comercial Ativa</p>
              <p className="text-lg font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                {sellers.filter((s) => s.status === 'ativo').length} vendedores · {clients.length}{' '}
                clientes
              </p>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            Ganhos Individuais por Vendedor no Período
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Comparativo entre comissão liberada (pagas) e comissão pendente/em atraso
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sellerSummaries.map((s) => ({
                  name: s.seller.name.split(' ')[0],
                  realizada: Number(s.earnedCommission.toFixed(2)),
                  prevista: Number((s.pendingCommission + s.overdueCommission).toFixed(2)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => `R$ ${Math.round(Number(v))}`}
                />
                <Tooltip formatter={(v, name) => [formatBRL(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="realizada"
                  name="Comissão Realizada (Paga)"
                  fill="#16A34A"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="prevista"
                  name="Comissão em Aberto"
                  fill="#D97706"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sellers Ranking / Management Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Desempenho Individual dos Vendedores ({periodLabel})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecione um vendedor para inspecionar o extrato detalhado por cliente e exportar em PDF
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                <th className="py-3 px-5">Vendedor / Região</th>
                <th className="py-3 px-4 text-right">Taxa Padrão</th>
                <th className="py-3 px-4 text-right">Carteira</th>
                <th className="py-3 px-4 text-right">Faturamento Pago</th>
                <th className="py-3 px-4 text-right">Comissão Realizada</th>
                <th className="py-3 px-4 text-right">Em Aberto</th>
                <th className="py-3 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sellerSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Nenhum vendedor cadastrado. Clique em &ldquo;Novo Vendedor&rdquo; para começar.
                  </td>
                </tr>
              ) : (
                sellerSummaries.map((row) => {
                  const isSelected = activeSummary?.seller.id === row.seller.id;
                  return (
                    <tr
                      key={row.seller.id}
                      onClick={() => setSelectedSellerId(row.seller.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">{row.seller.name}</div>
                        <div className="text-xs text-slate-500">
                          {row.seller.region} · PIX: {row.seller.pixKey}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.seller.defaultCommissionPct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.clientCount} clientes
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                        {formatBRL(row.paidRevenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatBRL(row.earnedCommission)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700">
                        {formatBRL(row.pendingCommission + row.overdueCommission)}
                      </td>
                      <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(row.seller)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Editar vendedor"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canEdit) {
                                onRequireLogin('Faça login com sua conta Google para excluir um vendedor.');
                                return;
                              }
                              onDeleteSeller(row.seller.id);
                            }}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                            title="Excluir vendedor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Seller Individual Earnings Ledger */}
      {activeSummary && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Extrato Individual de Ganhos: {activeSummary.seller.name}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                Período: {periodLabel} · Realizada: {formatBRL(activeSummary.earnedCommission)} ·
                Pendente/Vencida:{' '}
                {formatBRL(activeSummary.pendingCommission + activeSummary.overdueCommission)}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                exportSellerCommissionsPDF(activeSummary.seller, periodLabel, activeSellerRows, {
                  paidRevenue: activeSummary.paidRevenue,
                  earnedCommission: activeSummary.earnedCommission,
                  pendingCommission: activeSummary.pendingCommission,
                  overdueCommission: activeSummary.overdueCommission,
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              Exportar Comissões (PDF)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                  <th className="py-2.5 px-5">Fatura</th>
                  <th className="py-2.5 px-4">Cliente (UC)</th>
                  <th className="py-2.5 px-4">Competência</th>
                  <th className="py-2.5 px-4">Vencimento</th>
                  <th className="py-2.5 px-4 text-right">Valor Fatura</th>
                  <th className="py-2.5 px-4 text-right">% Comissão</th>
                  <th className="py-2.5 px-4 text-right">Ganho Individual</th>
                  <th className="py-2.5 px-5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {activeSellerRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Nenhuma fatura registrada para este vendedor no período selecionado.
                    </td>
                  </tr>
                ) : (
                  activeSellerRows.map((r) => (
                    <tr key={r.invoice.id} className="hover:bg-slate-50">
                      <td className="py-3 px-5 font-mono font-medium text-slate-900">
                        {r.invoice.number}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{r.clientName}</div>
                        <div className="text-slate-500 font-mono">UC {r.clientUc}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {formatMonthShort(r.invoice.referenceMonth)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                        {formatDateBR(r.invoice.dueDate)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatBRL(r.invoice.netAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {r.commissionPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatBRL(r.commissionValue)}
                      </td>
                      <td className="py-3 px-5">
                        <InvoiceStatusLabel status={r.invoice.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Cadastro / Edição Vendedor */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingSeller ? 'Editar Vendedor' : 'Cadastrar Novo Vendedor'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome Completo
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CPF / CNPJ
                  </label>
                  <input
                    required
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Comissão Padrão (%)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={40}
                    step={0.1}
                    value={form.defaultCommissionPct}
                    onChange={(e) =>
                      setForm({ ...form, defaultCommissionPct: Number(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Região de Atuação
                  </label>
                  <input
                    required
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chave PIX para Repasse
                  </label>
                  <input
                    required
                    value={form.pixKey}
                    onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  {editingSeller ? 'Salvar Alterações' : 'Cadastrar Vendedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
