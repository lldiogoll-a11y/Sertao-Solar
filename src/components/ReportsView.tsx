import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Briefcase, Building2, FileDown, Users } from 'lucide-react';
import type {
  Client,
  Invoice,
  MonthlyPerformanceRecord,
  Seller,
  SolarPlant,
} from '../types.ts';
import {
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  formatNumber,
} from '../utils/formatters.ts';
import {
  exportAllSellersReportPDF,
  exportClientsPortfolioPDF,
  exportClientStatementPDF,
  exportGeneralReportPDF,
  exportMonthlyPerformancePDF,
  exportPlantReportPDF,
  exportSellerCommissionsPDF,
} from '../utils/pdfExport.ts';
import { InvoiceStatusLabel, PlantStatusLabel } from './StatusText.tsx';

interface ReportsViewProps {
  plants: SolarPlant[];
  clients: Client[];
  sellers: Seller[];
  invoices: Invoice[];
  monthlyPerformance: MonthlyPerformanceRecord[];
}

type ReportScope = 'geral' | 'plantas' | 'clientes' | 'vendedores';
type PeriodMode = 'month' | 'custom' | 'all';

const SCOPE_TABS: { id: ReportScope; label: string; icon: typeof BarChart3 }[] = [
  { id: 'geral', label: 'Relatório Geral', icon: BarChart3 },
  { id: 'plantas', label: 'Plantas Solares', icon: Building2 },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'vendedores', label: 'Vendedores', icon: Briefcase },
];

export function ReportsView({
  plants,
  clients,
  sellers,
  invoices,
  monthlyPerformance,
}: ReportsViewProps) {
  const allKnownMonths = useMemo(() => {
    const set = new Set<string>();
    monthlyPerformance.forEach((m) => set.add(m.month));
    invoices.forEach((i) => set.add(i.referenceMonth));
    clients.forEach((c) => c.consumptionHistory.forEach((h) => set.add(h.month)));
    return Array.from(set).sort().reverse();
  }, [monthlyPerformance, invoices, clients]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [scope, setScope] = useState<ReportScope>('geral');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(allKnownMonths[0] || currentMonth);
  const [customStart, setCustomStart] = useState<string>(
    allKnownMonths[allKnownMonths.length - 1] || currentMonth,
  );
  const [customEnd, setCustomEnd] = useState<string>(allKnownMonths[0] || currentMonth);

  const [plantFilter, setPlantFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [sellerFilter, setSellerFilter] = useState<string>('all');

  useEffect(() => {
    if (allKnownMonths.length > 0 && !allKnownMonths.includes(selectedMonth)) {
      setSelectedMonth(allKnownMonths[0]);
    }
  }, [allKnownMonths, selectedMonth]);

  const monthOptions = allKnownMonths.length > 0 ? allKnownMonths : [selectedMonth];

  const { startMonth, endMonth, periodLabel } = useMemo(() => {
    if (periodMode === 'month') {
      return {
        startMonth: selectedMonth,
        endMonth: selectedMonth,
        periodLabel: formatMonthFull(selectedMonth),
      };
    }
    if (periodMode === 'custom') {
      const s = customStart <= customEnd ? customStart : customEnd;
      const e = customStart <= customEnd ? customEnd : customStart;
      return {
        startMonth: s,
        endMonth: e,
        periodLabel: `${formatMonthShort(s)} a ${formatMonthShort(e)}`,
      };
    }
    return {
      startMonth: '0000-01',
      endMonth: '9999-12',
      periodLabel: 'Todo o Histórico',
    };
  }, [periodMode, selectedMonth, customStart, customEnd]);

  const inPeriod = (m: string) => m >= startMonth && m <= endMonth;

  const periodPerformance = useMemo(
    () => monthlyPerformance.filter((r) => inPeriod(r.month)),
    [monthlyPerformance, startMonth, endMonth],
  );

  const periodInvoices = useMemo(
    () => invoices.filter((i) => inPeriod(i.referenceMonth)),
    [invoices, startMonth, endMonth],
  );

  // Scoped metrics
  const scopedPlants = useMemo(
    () => (plantFilter === 'all' ? plants : plants.filter((p) => p.id === plantFilter)),
    [plants, plantFilter],
  );

  const scopedPerf = useMemo(
    () =>
      periodPerformance.filter((r) => plantFilter === 'all' || r.plantId === plantFilter),
    [periodPerformance, plantFilter],
  );

  const scopedClients = useMemo(
    () => (clientFilter === 'all' ? clients : clients.filter((c) => c.id === clientFilter)),
    [clients, clientFilter],
  );

  const scopedSellers = useMemo(
    () => (sellerFilter === 'all' ? sellers : sellers.filter((s) => s.id === sellerFilter)),
    [sellers, sellerFilter],
  );

  // Historical chart data for General / Plants
  const chartMonths = useMemo(() => {
    const base = allKnownMonths.filter(inPeriod);
    return [...base].reverse();
  }, [allKnownMonths, startMonth, endMonth]);

  const historicalSeries = useMemo(() => {
    return chartMonths.map((m) => {
      const recs = monthlyPerformance.filter(
        (r) => r.month === m && (plantFilter === 'all' || r.plantId === plantFilter),
      );
      const invs = invoices.filter(
        (i) => i.referenceMonth === m && (plantFilter === 'all' || i.plantId === plantFilter),
      );
      return {
        label: formatMonthShort(m),
        gerado: recs.reduce((s, r) => s + r.generatedKwh, 0),
        meta: recs.reduce((s, r) => s + r.expectedKwh, 0),
        compensado: recs.reduce((s, r) => s + r.compensatedKwh, 0),
        receita: Number(invs.reduce((s, i) => s + i.netAmount, 0).toFixed(2)),
        comissoes: Number(invs.reduce((s, i) => s + i.commissionAmount, 0).toFixed(2)),
        despesas: Number(recs.reduce((s, r) => s + (r.totalExpenses || 0), 0).toFixed(2)),
      };
    });
  }, [chartMonths, monthlyPerformance, invoices, plantFilter]);

  // General Totals
  const genTotalKwh = periodPerformance.reduce((s, r) => s + r.generatedKwh, 0);
  const genExpectedKwh = periodPerformance.reduce((s, r) => s + r.expectedKwh, 0);
  const genPlantExpenses = periodPerformance.reduce((s, r) => s + (r.totalExpenses || 0), 0);
  const genPaidRevenue = periodInvoices
    .filter((i) => i.status === 'paga')
    .reduce((s, i) => s + i.netAmount, 0);
  const genOpenRevenue = periodInvoices
    .filter((i) => i.status !== 'paga')
    .reduce((s, i) => s + i.netAmount, 0);
  const genCommissionsTotal = periodInvoices.reduce((s, i) => s + i.commissionAmount, 0);

  // Primary PDF Trigger
  const handleEmitPrimaryPDF = () => {
    if (scope === 'geral') {
      if (periodMode === 'month') {
        exportMonthlyPerformancePDF(
          selectedMonth,
          plants,
          monthlyPerformance,
          invoices,
          clients,
        );
      } else {
        exportGeneralReportPDF(
          periodLabel,
          startMonth,
          endMonth,
          plants,
          clients,
          sellers,
          invoices,
          monthlyPerformance,
        );
      }
      return;
    }

    if (scope === 'plantas') {
      exportPlantReportPDF(
        plantFilter,
        periodLabel,
        startMonth,
        endMonth,
        plants,
        clients,
        invoices,
        monthlyPerformance,
      );
      return;
    }

    if (scope === 'clientes') {
      if (clientFilter !== 'all') {
        const cli = clients.find((c) => c.id === clientFilter);
        if (cli) {
          exportClientStatementPDF(
            cli,
            plants.find((p) => p.id === cli.plantId),
            sellers.find((s) => s.id === cli.sellerId),
            periodInvoices
              .filter((i) => i.clientId === cli.id)
              .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth)),
          );
          return;
        }
      }
      exportClientsPortfolioPDF(
        periodLabel,
        startMonth,
        endMonth,
        clients,
        plants,
        sellers,
        invoices,
      );
      return;
    }

    if (scope === 'vendedores') {
      if (sellerFilter !== 'all') {
        const sel = sellers.find((s) => s.id === sellerFilter);
        if (sel) {
          const sInvs = periodInvoices.filter((i) => i.sellerId === sel.id);
          const rows = sInvs
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

          exportSellerCommissionsPDF(sel, periodLabel, rows, {
            paidRevenue: sInvs.filter((i) => i.status === 'paga').reduce((s, i) => s + i.netAmount, 0),
            earnedCommission: sInvs
              .filter((i) => i.status === 'paga')
              .reduce((s, i) => s + i.commissionAmount, 0),
            pendingCommission: sInvs
              .filter((i) => i.status === 'pendente')
              .reduce((s, i) => s + i.commissionAmount, 0),
            overdueCommission: sInvs
              .filter((i) => i.status === 'vencida')
              .reduce((s, i) => s + i.commissionAmount, 0),
          });
          return;
        }
      }
      exportAllSellersReportPDF(periodLabel, startMonth, endMonth, sellers, clients, invoices);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scope Switcher + Period & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
            {SCOPE_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = scope === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {scope === 'geral' && periodMode === 'month' && (
              <button
                type="button"
                onClick={() =>
                  exportGeneralReportPDF(
                    periodLabel,
                    startMonth,
                    endMonth,
                    plants,
                    clients,
                    sellers,
                    invoices,
                    monthlyPerformance,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Geral Consolidado (PDF)
              </button>
            )}
            <button
              type="button"
              onClick={handleEmitPrimaryPDF}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              {scope === 'geral'
                ? periodMode === 'month'
                  ? 'Emitir Relatório Mensal (PDF)'
                  : 'Emitir Relatório Geral (PDF)'
                : scope === 'plantas'
                  ? 'Emitir Relatório de Plantas (PDF)'
                  : scope === 'clientes'
                    ? clientFilter === 'all'
                      ? 'Emitir Relatório de Clientes (PDF)'
                      : 'Emitir Extrato do Cliente (PDF)'
                    : sellerFilter === 'all'
                      ? 'Emitir Relatório de Vendedores (PDF)'
                      : 'Emitir Extrato do Vendedor (PDF)'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Período:</span>
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
              className="text-xs font-medium border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-800"
            >
              <option value="all">Todo o Histórico</option>
              <option value="month">Mês Específico</option>
              <option value="custom">Intervalo Personalizado</option>
            </select>
          </div>

          {periodMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-medium border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-900"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthFull(m)}
                </option>
              ))}
            </select>
          )}

          {periodMode === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="month"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-slate-200 rounded-md px-2.5 py-1 bg-slate-50 font-mono"
              />
              <span className="text-slate-400">até</span>
              <input
                type="month"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-slate-200 rounded-md px-2.5 py-1 bg-slate-50 font-mono"
              />
            </div>
          )}

          {(scope === 'geral' || scope === 'plantas') && (
            <select
              value={plantFilter}
              onChange={(e) => setPlantFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800"
            >
              <option value="all">Todas as Mini Usinas ({plants.length})</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          )}

          {scope === 'clientes' && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800"
            >
              <option value="all">Todos os Clientes ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (UC {c.ucNumber})
                </option>
              ))}
            </select>
          )}

          {scope === 'vendedores' && (
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800"
            >
              <option value="all">Todos os Vendedores ({sellers.length})</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* SCOPE 1: RELATÓRIO GERAL */}
      {scope === 'geral' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Base Operacional</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {plants.length}{' '}
                <span className="text-sm font-normal text-slate-500">usinas</span>
              </p>
              <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                {clients.length} clientes · {sellers.length} vendedores
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Geração no Período</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {formatNumber(genTotalKwh)}{' '}
                <span className="text-sm font-normal text-slate-500">kWh</span>
              </p>
              <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                Meta: {formatNumber(genExpectedKwh)} kWh (
                {genExpectedKwh > 0 ? ((genTotalKwh / genExpectedKwh) * 100).toFixed(1) : '0.0'}%)
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Receita Liquidada / Aberta</p>
              <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
                {formatBRL(genPaidRevenue)}
              </p>
              <p className="text-xs text-amber-700 mt-1 font-mono tabular-nums">
                Em aberto: {formatBRL(genOpenRevenue)}
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Margem após Comissões e Despesas</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {formatBRL(genPaidRevenue + genOpenRevenue - genCommissionsTotal - genPlantExpenses)}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                Com.: {formatBRL(genCommissionsTotal)} · Desp.: {formatBRL(genPlantExpenses)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-base font-semibold text-slate-900">
                Geração vs. Compensação (kWh)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Evolução mensal do parque solar ({periodLabel})
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={historicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip formatter={(v, name) => [`${formatNumber(Number(v))} kWh`, name]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="gerado" name="Geração Real" fill="#D97706" radius={[4, 4, 0, 0]} />
                    <Bar
                      dataKey="compensado"
                      name="Compensado Clientes"
                      fill="#0F172A"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="meta"
                      name="Meta Esperada"
                      stroke="#0284C7"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-base font-semibold text-slate-900">
                Receita Faturada vs. Comissões (R$)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Comparativo financeiro mensal no período selecionado
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historicalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip formatter={(v, name) => [formatBRL(Number(v)), name]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="receita" name="Receita Faturada" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="comissoes" name="Comissões" fill="#64748B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas Plantas" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCOPE 2: RELATÓRIO DE PLANTAS */}
      {scope === 'plantas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Plantas no Relatório</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {scopedPlants.length}
              </p>
              <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                {formatNumber(scopedPlants.reduce((s, p) => s + p.capacityKwp, 0))} kWp instalados
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Energia Gerada ({periodLabel})</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {formatNumber(scopedPerf.reduce((s, r) => s + r.generatedKwh, 0))} kWh
              </p>
              <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                Meta: {formatNumber(scopedPerf.reduce((s, r) => s + r.expectedKwh, 0))} kWh
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">PR Médio / Disponibilidade</p>
              <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
                {scopedPerf.length
                  ? (
                      scopedPerf.reduce((s, r) => s + r.performanceRatioPct, 0) / scopedPerf.length
                    ).toFixed(1)
                  : '0.0'}
                %
              </p>
              <p className="text-xs text-emerald-700 mt-1 font-mono tabular-nums">
                Disp. média:{' '}
                {scopedPerf.length
                  ? (
                      scopedPerf.reduce((s, r) => s + r.availabilityPct, 0) / scopedPerf.length
                    ).toFixed(1)
                  : '0.0'}
                %
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500">Despesas das Plantas</p>
              <p className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1">
                {formatBRL(scopedPerf.reduce((s, r) => s + (r.totalExpenses || 0), 0))}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                {scopedPerf.length} lançamento(s) ·{' '}
                {formatNumber(scopedPerf.reduce((s, r) => s + r.co2AvoidedTons, 0), 1)} t CO₂
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-900">
                Consolidado por Mini Usina — {periodLabel}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                    <th className="py-3 px-5">Mini Usina</th>
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4 text-right">Capacidade</th>
                    <th className="py-3 px-4 text-right">Clientes</th>
                    <th className="py-3 px-4 text-right">Gerado (kWh)</th>
                    <th className="py-3 px-4 text-right">PR Médio</th>
                    <th className="py-3 px-4 text-right">Despesas</th>
                    <th className="py-3 px-5 text-right">Faturamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                  {scopedPlants.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center font-sans text-slate-500">
                        Nenhuma mini usina cadastrada.
                      </td>
                    </tr>
                  ) : (
                    scopedPlants.map((plant) => {
                      const pPerf = scopedPerf.filter((r) => r.plantId === plant.id);
                      const pInv = periodInvoices.filter((i) => i.plantId === plant.id);
                      const gen = pPerf.reduce((s, r) => s + r.generatedKwh, 0);
                      const expCost = pPerf.reduce((s, r) => s + (r.totalExpenses || 0), 0);
                      const avgPr = pPerf.length
                        ? pPerf.reduce((s, r) => s + r.performanceRatioPct, 0) / pPerf.length
                        : 0;
                      const cliCount = clients.filter((c) => c.plantId === plant.id).length;
                      return (
                        <tr key={plant.id} className="hover:bg-slate-50">
                          <td className="py-3.5 px-5 font-sans">
                            <div className="font-semibold text-slate-900">
                              {plant.code} — {plant.name}
                            </div>
                            <div className="text-slate-500">
                              {plant.city}/{plant.state} · UC {plant.ucNumber}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-sans">
                            <PlantStatusLabel status={plant.status} />
                          </td>
                          <td className="py-3.5 px-4 text-right">{formatNumber(plant.capacityKwp)} kWp</td>
                          <td className="py-3.5 px-4 text-right">{cliCount}</td>
                          <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                            {formatNumber(gen)}
                          </td>
                          <td className="py-3.5 px-4 text-right">{avgPr.toFixed(1)}%</td>
                          <td className="py-3.5 px-4 text-right font-medium text-red-700">
                            {formatBRL(expCost)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-semibold text-slate-900">
                            {formatBRL(pInv.reduce((s, i) => s + i.netAmount, 0))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SCOPE 3: RELATÓRIO DE CLIENTES */}
      {scope === 'clientes' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Relatório de Clientes, Consumo e Faturamento — {periodLabel}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consolidação de energia compensada, faturas liquidadas, pendentes e vencidas por cliente
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  exportClientsPortfolioPDF(
                    periodLabel,
                    startMonth,
                    endMonth,
                    scopedClients,
                    plants,
                    sellers,
                    invoices,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Exportar Carteira (PDF)
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                    <th className="py-3 px-5">Cliente / UC</th>
                    <th className="py-3 px-4">Usina / Vendedor</th>
                    <th className="py-3 px-4 text-right">Consumo (kWh)</th>
                    <th className="py-3 px-4 text-right">Compensado</th>
                    <th className="py-3 px-4 text-right">Pago</th>
                    <th className="py-3 px-4 text-right">Em Aberto</th>
                    <th className="py-3 px-5 text-right">Extrato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                  {scopedClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center font-sans text-slate-500">
                        Nenhum cliente cadastrado para este relatório.
                      </td>
                    </tr>
                  ) : (
                    scopedClients.map((cli) => {
                      const plant = plants.find((p) => p.id === cli.plantId);
                      const seller = sellers.find((s) => s.id === cli.sellerId);
                      const hist = cli.consumptionHistory.filter((h) => inPeriod(h.month));
                      const cons = hist.reduce((s, h) => s + h.consumedKwh, 0);
                      const comp = hist.reduce((s, h) => s + h.compensatedKwh, 0);
                      const cInvs = periodInvoices.filter((i) => i.clientId === cli.id);
                      const paid = cInvs
                        .filter((i) => i.status === 'paga')
                        .reduce((s, i) => s + i.netAmount, 0);
                      const open = cInvs
                        .filter((i) => i.status !== 'paga')
                        .reduce((s, i) => s + i.netAmount, 0);

                      return (
                        <tr key={cli.id} className="hover:bg-slate-50">
                          <td className="py-3.5 px-5 font-sans">
                            <div className="font-semibold text-slate-900">{cli.name}</div>
                            <div className="text-slate-500 font-mono">
                              UC {cli.ucNumber} · {cli.document}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-sans">
                            <div className="text-slate-900">{plant?.code || '—'}</div>
                            <div className="text-slate-500">
                              {seller?.name || '—'} ({cli.commissionPct.toFixed(1)}%)
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">{formatNumber(cons)} kWh</td>
                          <td className="py-3.5 px-4 text-right text-amber-800">
                            {formatNumber(comp)} kWh
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                            {formatBRL(paid)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-red-700">
                            {formatBRL(open)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                exportClientStatementPDF(
                                  cli,
                                  plant,
                                  seller,
                                  cInvs.sort((a, b) =>
                                    b.referenceMonth.localeCompare(a.referenceMonth),
                                  ),
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 whitespace-nowrap"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SCOPE 4: RELATÓRIO DE VENDEDORES */}
      {scope === 'vendedores' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Relatório de Vendedores e Comissões — {periodLabel}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comissões realizadas (faturas pagas), pendentes e em atraso por vendedor
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  exportAllSellersReportPDF(
                    periodLabel,
                    startMonth,
                    endMonth,
                    scopedSellers,
                    clients,
                    invoices,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Exportar Consolidado (PDF)
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                    <th className="py-3 px-5">Vendedor / Região</th>
                    <th className="py-3 px-4 text-right">Carteira</th>
                    <th className="py-3 px-4 text-right">Faturado Pago</th>
                    <th className="py-3 px-4 text-right">Com. Realizada</th>
                    <th className="py-3 px-4 text-right">Com. Pendente</th>
                    <th className="py-3 px-4 text-right">Com. Vencida</th>
                    <th className="py-3 px-5 text-right">Extrato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                  {scopedSellers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center font-sans text-slate-500">
                        Nenhum vendedor cadastrado para este relatório.
                      </td>
                    </tr>
                  ) : (
                    scopedSellers.map((sel) => {
                      const sCli = clients.filter((c) => c.sellerId === sel.id).length;
                      const sInvs = periodInvoices.filter((i) => i.sellerId === sel.id);
                      const paidRevenue = sInvs
                        .filter((i) => i.status === 'paga')
                        .reduce((s, i) => s + i.netAmount, 0);
                      const earnedCommission = sInvs
                        .filter((i) => i.status === 'paga')
                        .reduce((s, i) => s + i.commissionAmount, 0);
                      const pendingCommission = sInvs
                        .filter((i) => i.status === 'pendente')
                        .reduce((s, i) => s + i.commissionAmount, 0);
                      const overdueCommission = sInvs
                        .filter((i) => i.status === 'vencida')
                        .reduce((s, i) => s + i.commissionAmount, 0);

                      const rows = sInvs
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
                        .sort((a, b) =>
                          b.invoice.referenceMonth.localeCompare(a.invoice.referenceMonth),
                        );

                      return (
                        <tr key={sel.id} className="hover:bg-slate-50">
                          <td className="py-3.5 px-5 font-sans">
                            <div className="font-semibold text-slate-900">{sel.name}</div>
                            <div className="text-slate-500">
                              {sel.region} · PIX: {sel.pixKey}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">{sCli} clientes</td>
                          <td className="py-3.5 px-4 text-right">{formatBRL(paidRevenue)}</td>
                          <td className="py-3.5 px-4 text-right font-semibold text-emerald-700">
                            {formatBRL(earnedCommission)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-amber-700">
                            {formatBRL(pendingCommission)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-red-700">
                            {formatBRL(overdueCommission)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-sans">
                            <button
                              type="button"
                              onClick={() =>
                                exportSellerCommissionsPDF(sel, periodLabel, rows, {
                                  paidRevenue,
                                  earnedCommission,
                                  pendingCommission,
                                  overdueCommission,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 whitespace-nowrap"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sellerFilter !== 'all' && (() => {
            const selInvs = periodInvoices
              .filter((i) => i.sellerId === sellerFilter)
              .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
            return (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Faturas Vinculadas ao Vendedor Selecionado
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                        <th className="py-2.5 px-5">Fatura</th>
                        <th className="py-2.5 px-4">Cliente</th>
                        <th className="py-2.5 px-4">Vencimento</th>
                        <th className="py-2.5 px-4">Situação</th>
                        <th className="py-2.5 px-5 text-right">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                      {selInvs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center font-sans text-slate-500">
                            Nenhuma fatura encontrada para este vendedor no período.
                          </td>
                        </tr>
                      ) : (
                        selInvs.map((inv) => {
                          const cli = clients.find((c) => c.id === inv.clientId);
                          return (
                            <tr key={inv.id}>
                              <td className="py-2.5 px-5 font-semibold text-slate-900">
                                {inv.number} ({formatMonthShort(inv.referenceMonth)})
                              </td>
                              <td className="py-2.5 px-4 font-sans text-slate-700">
                                {cli?.name || '—'}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600">
                                {formatDateBR(inv.dueDate)}
                              </td>
                              <td className="py-2.5 px-4 font-sans">
                                <InvoiceStatusLabel status={inv.status} />
                              </td>
                              <td className="py-2.5 px-5 text-right font-semibold text-slate-900">
                                {formatBRL(inv.commissionAmount)} ({inv.commissionPctSnapshot.toFixed(1)}%)
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

