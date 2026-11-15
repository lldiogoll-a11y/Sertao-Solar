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
import { ArrowRight, FileDown } from 'lucide-react';
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
import { exportMonthlyPerformancePDF } from '../utils/pdfExport.ts';
import { InvoiceStatusLabel, PlantStatusLabel } from './StatusText.tsx';

type NavTab = 'dashboard' | 'plants' | 'clients' | 'invoices' | 'sellers' | 'reports';

interface DashboardViewProps {
  plants: SolarPlant[];
  clients: Client[];
  sellers: Seller[];
  invoices: Invoice[];
  monthlyPerformance: MonthlyPerformanceRecord[];
  onNavigateTab: (tab: NavTab) => void;
}

export function DashboardView({
  plants,
  clients,
  sellers,
  invoices,
  monthlyPerformance,
  onNavigateTab,
}: DashboardViewProps) {
  const availableMonths = useMemo(
    () => Array.from(new Set(monthlyPerformance.map((m) => m.month))).sort().reverse(),
    [monthlyPerformance],
  );

  const defaultMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || defaultMonth);
  const [plantFilter, setPlantFilter] = useState<string>('all');

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const monthOptions = availableMonths.length > 0 ? availableMonths : [selectedMonth];

  const filteredPlants = useMemo(
    () => (plantFilter === 'all' ? plants : plants.filter((p) => p.id === plantFilter)),
    [plants, plantFilter],
  );

  const filteredClients = useMemo(
    () => (plantFilter === 'all' ? clients : clients.filter((c) => c.plantId === plantFilter)),
    [clients, plantFilter],
  );

  const monthPerformance = useMemo(
    () =>
      monthlyPerformance.filter(
        (m) => m.month === selectedMonth && (plantFilter === 'all' || m.plantId === plantFilter),
      ),
    [monthlyPerformance, selectedMonth, plantFilter],
  );

  const monthInvoices = useMemo(
    () =>
      invoices.filter(
        (i) =>
          i.referenceMonth === selectedMonth &&
          (plantFilter === 'all' || i.plantId === plantFilter),
      ),
    [invoices, selectedMonth, plantFilter],
  );

  const allFilteredInvoices = useMemo(
    () => (plantFilter === 'all' ? invoices : invoices.filter((i) => i.plantId === plantFilter)),
    [invoices, plantFilter],
  );

  // Core KPI Calculations
  const totalCapacityKwp = filteredPlants.reduce((s, p) => s + p.capacityKwp, 0);
  const operationalCount = filteredPlants.filter((p) => p.status === 'operacional').length;
  const totalTargetKwh = filteredPlants.reduce((s, p) => s + p.monthlyTargetKwh, 0);
  const totalContractedKwh = filteredClients.reduce((s, c) => s + c.contractedKwh, 0);
  const allocationPct = totalTargetKwh > 0 ? (totalContractedKwh / totalTargetKwh) * 100 : 0;

  const generatedKwh = monthPerformance.reduce((s, r) => s + r.generatedKwh, 0);
  const expectedKwh = monthPerformance.reduce((s, r) => s + r.expectedKwh, 0);
  const compensatedKwh = monthPerformance.reduce((s, r) => s + r.compensatedKwh, 0);
  const plantExpensesMonth = monthPerformance.reduce((s, r) => s + (r.totalExpenses || 0), 0);
  const co2Tons = monthPerformance.reduce((s, r) => s + r.co2AvoidedTons, 0);
  const generationGoalPct = expectedKwh > 0 ? (generatedKwh / expectedKwh) * 100 : 0;
  const avgPr = monthPerformance.length
    ? monthPerformance.reduce((s, r) => s + r.performanceRatioPct, 0) / monthPerformance.length
    : 0;

  const paidInvoicesMonth = monthInvoices.filter((i) => i.status === 'paga');
  const paidRevenueMonth = paidInvoicesMonth.reduce((s, i) => s + i.netAmount, 0);

  const overdueAll = allFilteredInvoices.filter((i) => i.status === 'vencida');
  const pendingAll = allFilteredInvoices.filter((i) => i.status === 'pendente');
  const overdueTotal = overdueAll.reduce((s, i) => s + i.netAmount, 0);
  const pendingTotal = pendingAll.reduce((s, i) => s + i.netAmount, 0);

  const earnedCommissionMonth = paidInvoicesMonth.reduce((s, i) => s + i.commissionAmount, 0);
  const openCommissionAll = [...overdueAll, ...pendingAll].reduce(
    (s, i) => s + i.commissionAmount,
    0,
  );

  const avgDiscountPct = filteredClients.length
    ? filteredClients.reduce((s, c) => s + c.discountPct, 0) / filteredClients.length
    : 0;

  // Monthly Generation vs. Target vs. Compensated Series
  const monthlyGenerationSeries = useMemo(() => {
    return [...availableMonths].reverse().map((m) => {
      const recs = monthlyPerformance.filter(
        (r) => r.month === m && (plantFilter === 'all' || r.plantId === plantFilter),
      );
      return {
        label: formatMonthShort(m),
        gerado: recs.reduce((s, r) => s + r.generatedKwh, 0),
        compensado: recs.reduce((s, r) => s + r.compensatedKwh, 0),
        meta: recs.reduce((s, r) => s + r.expectedKwh, 0),
      };
    });
  }, [availableMonths, monthlyPerformance, plantFilter]);

  // Financial Status Series by Month (Pagas vs Pendentes vs Vencidas)
  const monthlyFinancialSeries = useMemo(() => {
    const invMonths = Array.from(new Set(allFilteredInvoices.map((i) => i.referenceMonth))).sort();
    return invMonths.map((m) => {
      const invs = allFilteredInvoices.filter((i) => i.referenceMonth === m);
      return {
        label: formatMonthShort(m),
        pagas: Number(
          invs
            .filter((i) => i.status === 'paga')
            .reduce((s, i) => s + i.netAmount, 0)
            .toFixed(2),
        ),
        pendentes: Number(
          invs
            .filter((i) => i.status === 'pendente')
            .reduce((s, i) => s + i.netAmount, 0)
            .toFixed(2),
        ),
        vencidas: Number(
          invs
            .filter((i) => i.status === 'vencida')
            .reduce((s, i) => s + i.netAmount, 0)
            .toFixed(2),
        ),
      };
    });
  }, [allFilteredInvoices]);

  // Plant Breakdown Rows
  const plantBreakdown = useMemo(() => {
    return filteredPlants.map((plant) => {
      const perf = monthPerformance.find((m) => m.plantId === plant.id);
      const linkedClients = clients.filter((c) => c.plantId === plant.id);
      const allocatedKwh = linkedClients.reduce((s, c) => s + c.contractedKwh, 0);
      const plantInvs = monthInvoices.filter((i) => i.plantId === plant.id);
      const billedMonth = plantInvs.reduce((s, i) => s + i.netAmount, 0);
      const goalPct =
        perf && perf.expectedKwh > 0 ? (perf.generatedKwh / perf.expectedKwh) * 100 : 0;

      return {
        plant,
        clientCount: linkedClients.length,
        allocatedKwh,
        generatedKwh: perf?.generatedKwh || 0,
        expectedKwh: perf?.expectedKwh || plant.monthlyTargetKwh,
        expensesMonth: perf?.totalExpenses || 0,
        goalPct,
        prPct: perf?.performanceRatioPct || 0,
        billedMonth,
      };
    });
  }, [filteredPlants, monthPerformance, clients, monthInvoices]);

  // Open Invoices Queue (Overdue first, then Pending)
  const attentionInvoices = useMemo(() => {
    return [...overdueAll, ...pendingAll].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'vencida' ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [overdueAll, pendingAll]);

  // Seller Performance Summary
  const sellerBreakdown = useMemo(() => {
    return sellers.map((seller) => {
      const sClients = filteredClients.filter((c) => c.sellerId === seller.id);
      const sInvsMonth = monthInvoices.filter((i) => i.sellerId === seller.id);
      const billed = sInvsMonth.reduce((s, i) => s + i.netAmount, 0);
      const realizedComm = sInvsMonth
        .filter((i) => i.status === 'paga')
        .reduce((s, i) => s + i.commissionAmount, 0);
      const openComm = sInvsMonth
        .filter((i) => i.status !== 'paga')
        .reduce((s, i) => s + i.commissionAmount, 0);

      return {
        seller,
        clientCount: sClients.length,
        billed,
        realizedComm,
        openComm,
      };
    });
  }, [sellers, filteredClients, monthInvoices]);

  return (
    <div className="space-y-6">
      {/* Filter & Export Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="dash-month" className="text-xs font-medium text-slate-600">
              Competência:
            </label>
            <select
              id="dash-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthFull(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dash-plant" className="text-xs font-medium text-slate-600">
              Usina:
            </label>
            <select
              id="dash-plant"
              value={plantFilter}
              onChange={(e) => setPlantFilter(e.target.value)}
              className="text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Todas as Mini Usinas ({plants.length})</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            exportMonthlyPerformancePDF(
              selectedMonth,
              plants,
              monthlyPerformance,
              invoices,
              clients,
            )
          }
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <FileDown className="w-4 h-4" />
          Exportar Visão Mensal (PDF)
        </button>
      </div>

      {/* Detailed 6-Cell Executive KPI Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Geração na Competência vs. Meta</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
              {formatNumber(generatedKwh)}{' '}
              <span className="text-sm font-normal text-slate-500">kWh</span>
            </p>
            <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
              {generationGoalPct.toFixed(1)}% da meta ({formatNumber(expectedKwh)} kWh) · PR{' '}
              {avgPr.toFixed(1)}%
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Parque Instalado & Alocação</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
              {formatNumber(totalCapacityKwp)}{' '}
              <span className="text-sm font-normal text-slate-500">kWp</span>
            </p>
            <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
              {operationalCount}/{filteredPlants.length} usinas operacionais ·{' '}
              {allocationPct.toFixed(0)}% da energia alocada
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Carteira de Clientes & Compensação</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
              {filteredClients.length}{' '}
              <span className="text-sm font-normal text-slate-500">unidades</span>
            </p>
            <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
              {formatNumber(compensatedKwh)} kWh compensados · desconto médio{' '}
              {avgDiscountPct.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/50">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">
              Receita Recebida ({formatMonthShort(selectedMonth)})
            </p>
            <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1.5">
              {formatBRL(paidRevenueMonth)}
            </p>
            <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
              {paidInvoicesMonth.length} fatura(s) · Despesas plantas:{' '}
              <span className="text-red-700 font-semibold">{formatBRL(plantExpensesMonth)}</span>
            </p>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Faturas Vencidas & Pendentes (Geral)
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('invoices')}
                className="text-xs font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap"
              >
                Cobrança <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-2xl font-semibold text-red-700 font-mono tabular-nums mt-1.5">
              {formatBRL(overdueTotal)}
            </p>
            <p className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
              {overdueAll.length} vencida(s) · {pendingAll.length} pendente(s) (
              {formatBRL(pendingTotal)})
            </p>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">
                Comissões ({formatMonthShort(selectedMonth)})
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab('sellers')}
                className="text-xs font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap"
              >
                Vendedores <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
              {formatBRL(earnedCommissionMonth)}
            </p>
            <p className="text-xs text-amber-700 mt-1.5 font-mono tabular-nums">
              Realizada no mês · Em aberto geral: {formatBRL(openCommissionAll)}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Comparative Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Performance Histórica de Geração e Compensação (kWh)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo mensal entre energia gerada, créditos alocados e meta projetada
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap"
            >
              Ver Relatório Completo
            </button>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyGenerationSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(v, name) => [`${formatNumber(Number(v))} kWh`, name]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="gerado" name="Gerado (kWh)" fill="#D97706" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="compensado"
                  name="Compensado (kWh)"
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

        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recebimentos vs. Pendências (R$)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Situação financeira das faturas emitidas por competência
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyFinancialSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip formatter={(v, name) => [formatBRL(Number(v)), name]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="pagas" name="Pagas" stackId="a" fill="#16A34A" />
                <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill="#D97706" />
                <Bar
                  dataKey="vencidas"
                  name="Vencidas"
                  stackId="a"
                  fill="#DC2626"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Plant Operational Summary Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Detalhamento por Mini Usina — {formatMonthFull(selectedMonth)}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Capacidade instalada, cota alocada aos clientes, geração realizada e faturamento
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('plants')}
            className="text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50 whitespace-nowrap"
          >
            Gerenciar Plantas
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                <th className="py-3 px-5">Usina Solar</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4 text-right">Potência</th>
                <th className="py-3 px-4 text-right">Clientes / Cota</th>
                <th className="py-3 px-4 text-right">Gerado / Meta</th>
                <th className="py-3 px-4 text-right">PR (%)</th>
                <th className="py-3 px-4 text-right">Despesas</th>
                <th className="py-3 px-5 text-right">Faturado no Mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {plantBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhuma mini usina cadastrada ainda.
                  </td>
                </tr>
              ) : (
                plantBreakdown.map((row) => (
                  <tr key={row.plant.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <div className="text-sm font-semibold text-slate-900">{row.plant.name}</div>
                      <div className="text-slate-500 font-mono">
                        {row.plant.code} · {row.plant.city}/{row.plant.state} · UC{' '}
                        {row.plant.ucNumber}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <PlantStatusLabel status={row.plant.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                      {formatNumber(row.plant.capacityKwp)} kWp
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-slate-900 font-medium">{row.clientCount} clientes</div>
                      <div className="text-slate-500">{formatNumber(row.allocatedKwh)} kWh</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {formatNumber(row.generatedKwh)} kWh ({row.goalPct.toFixed(1)}%)
                      </div>
                      <div className="text-slate-500">Meta {formatNumber(row.expectedKwh)} kWh</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.prPct.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-red-700">
                      {formatBRL(row.expensesMonth)}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatBRL(row.billedMonth)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: Overdue/Pending Invoices Queue + Seller Commission Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Faturas Vencidas e Pendentes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Títulos prioritários em aberto para recebimento e emissão de recibo
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('invoices')}
              className="text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap"
            >
              Abrir Faturas
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                  <th className="py-2.5 px-5 font-medium">Fatura / Cliente</th>
                  <th className="py-2.5 px-4 font-medium">Vencimento</th>
                  <th className="py-2.5 px-4 font-medium">Situação</th>
                  <th className="py-2.5 px-5 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {attentionInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Nenhuma fatura vencida ou pendente no momento.
                    </td>
                  </tr>
                ) : (
                  attentionInvoices.slice(0, 6).map((inv) => {
                    const cli = clients.find((c) => c.id === inv.clientId);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-3 px-5">
                          <div className="font-medium text-slate-900">{cli?.name || '—'}</div>
                          <div className="text-slate-500 font-mono">
                            {inv.number} · {formatMonthShort(inv.referenceMonth)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {formatDateBR(inv.dueDate)}
                        </td>
                        <td className="py-3 px-4">
                          <InvoiceStatusLabel status={inv.status} />
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatBRL(inv.netAmount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Comissões por Vendedor — {formatMonthShort(selectedMonth)}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento automático de ganhos individuais sobre a carteira de clientes
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('sellers')}
              className="text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap"
            >
              Ver Extratos
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-left">
                  <th className="py-2.5 px-5 font-medium">Vendedor</th>
                  <th className="py-2.5 px-4 font-medium text-right">Carteira</th>
                  <th className="py-2.5 px-4 font-medium text-right">Realizada</th>
                  <th className="py-2.5 px-5 font-medium text-right">Em Aberto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sellerBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Nenhum vendedor cadastrado ainda.
                    </td>
                  </tr>
                ) : (
                  sellerBreakdown.map((row) => (
                    <tr key={row.seller.id} className="hover:bg-slate-50">
                      <td className="py-3 px-5">
                        <div className="font-medium text-slate-900">{row.seller.name}</div>
                        <div className="text-slate-500">
                          {row.seller.region} · Padrão {row.seller.defaultCommissionPct.toFixed(1)}%
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.clientCount} clientes
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatBRL(row.realizedComm)}
                      </td>
                      <td className="py-3 px-5 text-right font-mono tabular-nums font-medium text-amber-700">
                        {formatBRL(row.openComm)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
