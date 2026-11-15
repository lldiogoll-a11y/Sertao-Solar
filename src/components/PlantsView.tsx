import { useMemo, useState } from 'react';
import { CalendarPlus, Edit2, Plus, Sun, Trash2, X } from 'lucide-react';
import type {
  Client,
  MonthlyPerformanceRecord,
  PlantStatus,
  SolarPlant,
} from '../types.ts';
import {
  formatBRL,
  formatDateBR,
  formatMonthShort,
  formatNumber,
  uid,
} from '../utils/formatters.ts';
import { PlantStatusLabel } from './StatusText.tsx';

interface PlantsViewProps {
  plants: SolarPlant[];
  clients: Client[];
  monthlyPerformance: MonthlyPerformanceRecord[];
  canEdit: boolean;
  onRequireLogin: (reason?: string) => void;
  onSavePlant: (plant: SolarPlant, isNew: boolean) => Promise<void>;
  onDeletePlant: (id: string) => Promise<void>;
  onSaveMonthlyGeneration: (record: MonthlyPerformanceRecord) => Promise<void>;
}

const EMPTY_PLANT_FORM = {
  code: '',
  name: '',
  ucNumber: '',
  city: '',
  state: 'SP',
  capacityKwp: 400,
  inverterModel: 'Sungrow SG110CX',
  inverterCount: 4,
  panelCount: 720,
  tariffPerKwh: 0.92,
  commissionedAt: new Date().toISOString().slice(0, 10),
  status: 'operacional' as PlantStatus,
  monthlyTargetKwh: 58000,
};

export function PlantsView({
  plants,
  clients,
  monthlyPerformance,
  canEdit,
  onRequireLogin,
  onSavePlant,
  onDeletePlant,
  onSaveMonthlyGeneration,
}: PlantsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<SolarPlant | null>(null);
  const [form, setForm] = useState(EMPTY_PLANT_FORM);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Monthly Generation Modal & History Filter
  const [historyPlantFilter, setHistoryPlantFilter] = useState<string>('all');
  const [genModalOpen, setGenModalOpen] = useState(false);
  const [genSaving, setGenSaving] = useState(false);
  const [genForm, setGenForm] = useState({
    plantId: plants[0]?.id || '',
    month: '2026-11',
    generatedKwh: plants[0]?.monthlyTargetKwh || 58000,
    expectedKwh: plants[0]?.monthlyTargetKwh || 58000,
    compensatedKwh: 0,
    performanceRatioPct: 83.5,
    availabilityPct: 99.5,
    maintenanceExpense: 0,
    utilityExpense: 0,
    leaseExpense: 0,
    otherExpenses: 0,
    expenseNotes: '',
  });

  const buildGenDefaults = (plantId: string, month: string) => {
    const existing = monthlyPerformance.find((m) => m.plantId === plantId && m.month === month);
    if (existing) {
      return {
        plantId,
        month,
        generatedKwh: existing.generatedKwh,
        expectedKwh: existing.expectedKwh,
        compensatedKwh: existing.compensatedKwh,
        performanceRatioPct: existing.performanceRatioPct,
        availabilityPct: existing.availabilityPct,
        maintenanceExpense: existing.maintenanceExpense ?? 0,
        utilityExpense: existing.utilityExpense ?? 0,
        leaseExpense: existing.leaseExpense ?? 0,
        otherExpenses: existing.otherExpenses ?? 0,
        expenseNotes: existing.expenseNotes ?? '',
      };
    }

    const plant = plants.find((p) => p.id === plantId);
    const linkedClients = clients.filter((c) => c.plantId === plantId);
    const clientCompensatedSum = linkedClients.reduce((sum, c) => {
      const rec = c.consumptionHistory.find((h) => h.month === month);
      return sum + (rec ? rec.compensatedKwh : c.contractedKwh);
    }, 0);
    const target = plant?.monthlyTargetKwh || 50000;

    return {
      plantId,
      month,
      generatedKwh: target,
      expectedKwh: target,
      compensatedKwh: Math.min(target, clientCompensatedSum || Math.round(target * 0.94)),
      performanceRatioPct: 83.5,
      availabilityPct: 99.5,
      maintenanceExpense: 0,
      utilityExpense: 0,
      leaseExpense: 0,
      otherExpenses: 0,
      expenseNotes: '',
    };
  };

  const openCreate = () => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para cadastrar uma nova mini usina.');
      return;
    }
    setEditingPlant(null);
    setForm({
      ...EMPTY_PLANT_FORM,
      code: `UFV-0${plants.length + 1}`,
    });
    setModalOpen(true);
  };

  const openEdit = (plant: SolarPlant) => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para editar os dados da mini usina.');
      return;
    }
    setEditingPlant(plant);
    setForm({
      code: plant.code,
      name: plant.name,
      ucNumber: plant.ucNumber,
      city: plant.city,
      state: plant.state,
      capacityKwp: plant.capacityKwp,
      inverterModel: plant.inverterModel,
      inverterCount: plant.inverterCount,
      panelCount: plant.panelCount,
      tariffPerKwh: plant.tariffPerKwh,
      commissionedAt: plant.commissionedAt,
      status: plant.status,
      monthlyTargetKwh: plant.monthlyTargetKwh,
    });
    setModalOpen(true);
  };

  const openGenerationModal = (plantId?: string, month?: string) => {
    if (!canEdit) {
      onRequireLogin(
        'Faça login com sua conta Google para adicionar ou editar a geração mensal das plantas.',
      );
      return;
    }
    const targetPlantId = plantId || plants[0]?.id || '';
    if (!targetPlantId) return;
    const defaultMonth =
      month ||
      monthlyPerformance
        .filter((m) => m.plantId === targetPlantId)
        .map((m) => m.month)
        .sort()
        .reverse()[0] ||
      '2026-11';
    setGenForm(buildGenDefaults(targetPlantId, defaultMonth));
    setGenModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: SolarPlant = editingPlant
        ? {
            ...editingPlant,
            ...form,
          }
        : {
            id: uid('plant'),
            ...form,
            imageUrl: '/src/assets/images/usina_solar_horizonte_1794695947683.jpg',
          };
      await onSavePlant(payload, !editingPlant);
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genForm.plantId || !genForm.month) return;
    setGenSaving(true);
    try {
      const co2AvoidedTons = Number((genForm.generatedKwh * 0.0005).toFixed(1));
      const totalExpenses = Number(
        (
          genForm.maintenanceExpense +
          genForm.utilityExpense +
          genForm.leaseExpense +
          genForm.otherExpenses
        ).toFixed(2),
      );
      await onSaveMonthlyGeneration({
        month: genForm.month,
        plantId: genForm.plantId,
        generatedKwh: genForm.generatedKwh,
        expectedKwh: genForm.expectedKwh,
        compensatedKwh: genForm.compensatedKwh,
        performanceRatioPct: genForm.performanceRatioPct,
        availabilityPct: genForm.availabilityPct,
        co2AvoidedTons,
        maintenanceExpense: genForm.maintenanceExpense,
        utilityExpense: genForm.utilityExpense,
        leaseExpense: genForm.leaseExpense,
        otherExpenses: genForm.otherExpenses,
        totalExpenses,
        expenseNotes: genForm.expenseNotes.trim(),
      });
      setGenModalOpen(false);
    } finally {
      setGenSaving(false);
    }
  };

  const filteredGenerationHistory = useMemo(() => {
    return monthlyPerformance
      .filter((m) => historyPlantFilter === 'all' || m.plantId === historyPlantFilter)
      .sort((a, b) => b.month.localeCompare(a.month) || a.plantId.localeCompare(b.plantId));
  }, [monthlyPerformance, historyPlantFilter]);

  const totalKwp = plants.reduce((s, p) => s + p.capacityKwp, 0);
  const totalTarget = plants.reduce((s, p) => s + p.monthlyTargetKwh, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Parque de Mini Usinas Solares
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {plants.length} plantas cadastradas · {formatNumber(totalKwp)} kWp instalados · Meta mensal{' '}
            {formatNumber(totalTarget)} kWh
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openGenerationModal()}
            disabled={plants.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-900 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <CalendarPlus className="w-4 h-4" />
            Lançar Geração Mensal
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nova Planta Solar
          </button>
        </div>
      </div>

      {plants.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-medium text-slate-900">Nenhuma mini usina cadastrada</p>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre a primeira planta fotovoltaica para iniciar o monitoramento e vincular clientes.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeira Planta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plants.map((plant) => {
            const linkedClients = clients.filter((c) => c.plantId === plant.id);
            const allocatedKwh = linkedClients.reduce((s, c) => s + c.contractedKwh, 0);
            const allocationPct =
              plant.monthlyTargetKwh > 0 ? Math.min(100, (allocatedKwh / plant.monthlyTargetKwh) * 100) : 0;
            const imgFailed = failedImages[plant.id];
            const latestGen = monthlyPerformance
              .filter((m) => m.plantId === plant.id)
              .sort((a, b) => b.month.localeCompare(a.month))[0];

            return (
              <article
                key={plant.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 relative overflow-hidden border-b border-slate-200">
                  {!imgFailed && plant.imageUrl ? (
                    <img
                      src={plant.imageUrl}
                      alt={`Fotografia aérea da mini usina ${plant.name}`}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages((prev) => ({ ...prev, [plant.id]: true }))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-amber-50 text-slate-500 p-4">
                      <Sun className="w-8 h-8 text-amber-600 mb-2" />
                      <span className="text-xs font-medium text-slate-700">{plant.name}</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900 leading-snug">
                        {plant.name}
                      </h3>
                      <PlantStatusLabel status={plant.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                      {plant.code} · UC {plant.ucNumber} · {plant.city}/{plant.state}
                    </p>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-slate-200 text-xs">
                      <div>
                        <dt className="text-slate-500">Potência Instalada</dt>
                        <dd className="font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                          {formatNumber(plant.capacityKwp)} kWp
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Meta Mensal</dt>
                        <dd className="font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
                          {formatNumber(plant.monthlyTargetKwh)} kWh
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          Última Geração {latestGen ? `(${formatMonthShort(latestGen.month)})` : ''}
                        </dt>
                        <dd className="font-semibold text-amber-800 font-mono tabular-nums mt-0.5">
                          {latestGen ? `${formatNumber(latestGen.generatedKwh)} kWh` : 'Sem lançamento'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">
                          Despesas {latestGen ? `(${formatMonthShort(latestGen.month)})` : ''}
                        </dt>
                        <dd className="font-semibold text-red-700 font-mono tabular-nums mt-0.5">
                          {latestGen ? formatBRL(latestGen.totalExpenses ?? 0) : '—'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-600">
                          Cota Alocada ({linkedClients.length} clientes)
                        </span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {formatNumber(allocatedKwh)} kWh ({allocationPct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-600 rounded-full"
                          style={{ width: `${allocationPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Desde {formatDateBR(plant.commissionedAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openGenerationModal(plant.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition-colors whitespace-nowrap"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Geração
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(plant)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canEdit) {
                            onRequireLogin('Faça login com sua conta Google para excluir uma mini usina.');
                            return;
                          }
                          onDeletePlant(plant.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        title="Excluir planta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Histórico de Geração Mensal por Planta */}
      {plants.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Histórico de Geração Mensal por Planta
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Registros mensais usados automaticamente no Dashboard e nos Relatórios em PDF
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={historyPlantFilter}
                onChange={(e) => setHistoryPlantFilter(e.target.value)}
                className="text-xs font-medium border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800"
              >
                <option value="all">Todas as Plantas</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  openGenerationModal(historyPlantFilter !== 'all' ? historyPlantFilter : undefined)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Mês
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                  <th className="py-2.5 px-5">Competência</th>
                  <th className="py-2.5 px-4">Mini Usina</th>
                  <th className="py-2.5 px-4 text-right">Gerado (kWh)</th>
                  <th className="py-2.5 px-4 text-right">Meta (kWh)</th>
                  <th className="py-2.5 px-4 text-right">Atingimento</th>
                  <th className="py-2.5 px-4 text-right">Compensado</th>
                  <th className="py-2.5 px-4 text-right">Despesas (R$)</th>
                  <th className="py-2.5 px-4 text-right">PR / Disp.</th>
                  <th className="py-2.5 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                {filteredGenerationHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center font-sans text-slate-500">
                      Nenhum lançamento de geração mensal encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredGenerationHistory.map((rec) => {
                    const plant = plants.find((p) => p.id === rec.plantId);
                    const pct = rec.expectedKwh > 0 ? (rec.generatedKwh / rec.expectedKwh) * 100 : 0;
                    const totalExp = rec.totalExpenses ?? 0;
                    return (
                      <tr key={`${rec.plantId}-${rec.month}`} className="hover:bg-slate-50">
                        <td className="py-3 px-5 font-sans font-medium text-slate-900">
                          {formatMonthShort(rec.month)}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="font-medium text-slate-900">{plant?.code || '—'}</span>
                          <span className="text-slate-500 ml-1.5">{plant?.name || rec.plantId}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">
                          {formatNumber(rec.generatedKwh)} kWh
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {formatNumber(rec.expectedKwh)} kWh
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            pct >= 100
                              ? 'text-emerald-700'
                              : pct >= 90
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">
                          {formatNumber(rec.compensatedKwh)} kWh
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-semibold text-red-700">{formatBRL(totalExp)}</div>
                          {rec.expenseNotes && (
                            <div className="text-[11px] font-sans text-slate-500 truncate max-w-[140px] ml-auto" title={rec.expenseNotes}>
                              {rec.expenseNotes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {rec.performanceRatioPct.toFixed(1)}% · {rec.availabilityPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => openGenerationModal(rec.plantId, rec.month)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
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
      )}

      {/* Modal Cadastro / Edição de Planta */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plant-modal-title"
        >
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h2 id="plant-modal-title" className="text-base font-semibold text-slate-900">
                {editingPlant ? 'Editar Mini Usina Solar' : 'Cadastrar Nova Mini Usina Solar'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
                aria-label="Fechar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Código</label>
                  <input
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="UFV-04"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome da Mini Usina
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="UFV Solar Paulista II"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    UC Geradora
                  </label>
                  <input
                    required
                    value={form.ucNumber}
                    onChange={(e) => setForm({ ...form, ucNumber: e.target.value })}
                    placeholder="3009128412"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cidade</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Ribeirão Preto"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">UF</label>
                  <input
                    required
                    maxLength={2}
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                    placeholder="SP"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Potência (kWp)
                  </label>
                  <input
                    type="number"
                    required
                    min={10}
                    step={1}
                    value={form.capacityKwp}
                    onChange={(e) => setForm({ ...form, capacityKwp: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Meta Mensal (kWh)
                  </label>
                  <input
                    type="number"
                    required
                    min={1000}
                    step={100}
                    value={form.monthlyTargetKwh}
                    onChange={(e) => setForm({ ...form, monthlyTargetKwh: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tarifa (R$/kWh)
                  </label>
                  <input
                    type="number"
                    required
                    min={0.1}
                    step={0.01}
                    value={form.tariffPerKwh}
                    onChange={(e) => setForm({ ...form, tariffPerKwh: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Modelo do Inversor
                  </label>
                  <input
                    required
                    value={form.inverterModel}
                    onChange={(e) => setForm({ ...form, inverterModel: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Qtd. Inversores
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.inverterCount}
                    onChange={(e) => setForm({ ...form, inverterCount: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Qtd. Módulos
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={form.panelCount}
                    onChange={(e) => setForm({ ...form, panelCount: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data Comissionamento
                  </label>
                  <input
                    type="date"
                    required
                    value={form.commissionedAt}
                    onChange={(e) => setForm({ ...form, commissionedAt: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Situação</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as PlantStatus })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="operacional">Operacional</option>
                    <option value="manutencao">Em Manutenção</option>
                    <option value="alerta">Alerta Técnico</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editingPlant ? 'Salvar Alterações' : 'Cadastrar Planta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lançar / Editar Geração Mensal e Despesas da Planta */}
      {genModalOpen && (() => {
        const selectedPlant = plants.find((p) => p.id === genForm.plantId);
        const goalPct =
          genForm.expectedKwh > 0 ? (genForm.generatedKwh / genForm.expectedKwh) * 100 : 0;
        const potentialRevenue = selectedPlant
          ? genForm.generatedKwh * selectedPlant.tariffPerKwh
          : 0;
        const totalExpenses =
          genForm.maintenanceExpense +
          genForm.utilityExpense +
          genForm.leaseExpense +
          genForm.otherExpenses;
        const operationalResult = potentialRevenue - totalExpenses;
        const alreadyExists = monthlyPerformance.some(
          (m) => m.plantId === genForm.plantId && m.month === genForm.month,
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gen-modal-title"
          >
            <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <h2 id="gen-modal-title" className="text-base font-semibold text-slate-900">
                    Geração Mensal e Despesas da Planta
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {alreadyExists
                      ? 'Atualizando leitura de geração e despesas para esta competência'
                      : 'Adicionando novo lançamento mensal de geração e custos operacionais'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGenModalOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
                  aria-label="Fechar modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleGenerationSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mini Usina Solar
                    </label>
                    <select
                      required
                      value={genForm.plantId}
                      onChange={(e) => setGenForm(buildGenDefaults(e.target.value, genForm.month))}
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {plants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mês Referência
                    </label>
                    <input
                      type="month"
                      required
                      value={genForm.month}
                      onChange={(e) => setGenForm(buildGenDefaults(genForm.plantId, e.target.value))}
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Geração Mensal Realizada (kWh)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      value={genForm.generatedKwh}
                      onChange={(e) =>
                        setGenForm({ ...genForm, generatedKwh: Number(e.target.value) })
                      }
                      className="w-full border border-amber-300 bg-white rounded-md px-3 py-2 text-base font-semibold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Meta do Mês (kWh)
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        step={1}
                        value={genForm.expectedKwh}
                        onChange={(e) =>
                          setGenForm({ ...genForm, expectedKwh: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Energia Compensada (kWh)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={1}
                        value={genForm.compensatedKwh}
                        onChange={(e) =>
                          setGenForm({ ...genForm, compensatedKwh: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Performance Ratio — PR (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step={0.1}
                      value={genForm.performanceRatioPct}
                      onChange={(e) =>
                        setGenForm({ ...genForm, performanceRatioPct: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Disponibilidade (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step={0.1}
                      value={genForm.availabilityPct}
                      onChange={(e) =>
                        setGenForm({ ...genForm, availabilityPct: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Despesas da Planta no Mês */}
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/70">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900">
                      Despesas da Planta na Competência (R$)
                    </h3>
                    <span className="text-xs font-semibold font-mono tabular-nums text-red-700">
                      Total: {formatBRL(totalExpenses)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Manutenção / O&amp;M (R$)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.01}
                        value={genForm.maintenanceExpense}
                        onChange={(e) =>
                          setGenForm({ ...genForm, maintenanceExpense: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Concessionária / Demanda (R$)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.01}
                        value={genForm.utilityExpense}
                        onChange={(e) =>
                          setGenForm({ ...genForm, utilityExpense: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Arrendamento / Aluguel (R$)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.01}
                        value={genForm.leaseExpense}
                        onChange={(e) =>
                          setGenForm({ ...genForm, leaseExpense: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Outras Despesas (R$)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.01}
                        value={genForm.otherExpenses}
                        onChange={(e) =>
                          setGenForm({ ...genForm, otherExpenses: Number(e.target.value) })
                        }
                        className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Observações das Despesas (opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={genForm.expenseNotes}
                      onChange={(e) => setGenForm({ ...genForm, expenseNotes: e.target.value })}
                      placeholder="Ex: Limpeza dos módulos, seguro mensal, taxa mínima..."
                      className="w-full border border-slate-300 bg-white rounded-md px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-slate-500 font-sans block">Meta</span>
                    <span
                      className={`font-semibold ${
                        goalPct >= 100
                          ? 'text-emerald-700'
                          : goalPct >= 90
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {goalPct.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans block">Valor Ref.</span>
                    <span className="font-semibold text-slate-900">
                      {formatBRL(potentialRevenue)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans block">Despesas</span>
                    <span className="font-semibold text-red-700">
                      -{formatBRL(totalExpenses)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans block">Saldo Operac.</span>
                    <span
                      className={`font-semibold ${
                        operationalResult >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {formatBRL(operationalResult)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setGenModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={genSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
                  >
                    {genSaving
                      ? 'Salvando...'
                      : alreadyExists
                        ? 'Atualizar Geração e Despesas'
                        : 'Salvar Geração e Despesas'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
