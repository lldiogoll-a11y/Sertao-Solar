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
import { Edit2, Eye, FileDown, Percent, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type {
  Client,
  ConsumptionRecord,
  Invoice,
  PaymentMethod,
  Seller,
  SolarPlant,
} from '../types.ts';
import {
  formatBRL,
  formatDateBR,
  formatMonthShort,
  formatNumber,
  uid,
} from '../utils/formatters.ts';
import { exportClientStatementPDF, exportPaymentReceiptPDF } from '../utils/pdfExport.ts';
import { InvoiceStatusLabel } from './StatusText.tsx';
import { UtilityPdfImportModal } from './UtilityPdfImportModal.tsx';

interface ClientsViewProps {
  clients: Client[];
  plants: SolarPlant[];
  sellers: Seller[];
  invoices: Invoice[];
  canEdit: boolean;
  onRequireLogin: (reason?: string) => void;
  getAuthToken: () => Promise<string | null>;
  onSaveClient: (client: Client, isNew: boolean) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  onCreateInvoice: (invoice: Invoice) => Promise<void>;
  onMarkInvoicePaid: (invoice: Invoice, method: PaymentMethod, paidAt: string) => Promise<void>;
  onPreviewReceipt: (invoice: Invoice) => void;
}

export function ClientsView({
  clients,
  plants,
  sellers,
  invoices,
  canEdit,
  onRequireLogin,
  getAuthToken,
  onSaveClient,
  onDeleteClient,
  onCreateInvoice,
  onMarkInvoicePaid,
  onPreviewReceipt,
}: ClientsViewProps) {
  const [search, setSearch] = useState('');
  const [plantFilter, setPlantFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState<'all' | 'vencida' | 'pendente'>('all');

  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null,
  );
  const [detailTab, setDetailTab] = useState<'consumption' | 'invoices'>('consumption');

  // Create / Edit Client Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState({
    name: '',
    document: '',
    email: '',
    phone: '',
    city: '',
    ucNumber: '',
    plantId: plants[0]?.id || '',
    contractedKwh: 15000,
    discountPct: 15,
    fixedDiscountBrl: 0,
    sellerId: sellers[0]?.id || '',
    commissionPct: sellers[0]?.defaultCommissionPct ?? 8.5,
    contractStartDate: new Date().toISOString().slice(0, 10),
    status: 'ativo' as 'ativo' | 'suspenso',
  });

  // Add Consumption Entry Form inside Client Detail
  const [consumptionForm, setConsumptionForm] = useState({
    month: '2026-11',
    consumedKwh: 16000,
    compensatedKwh: 15000,
    discountPct: clients[0]?.discountPct ?? 15,
    extraDiscountBrl: clients[0]?.fixedDiscountBrl ?? 0,
    generateInvoice: true,
    dueDate: '2026-11-28',
  });

  // Quick Launch Consumption Modal
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false);
  const [consumptionTargetClientId, setConsumptionTargetClientId] = useState<string>(
    clients[0]?.id || '',
  );

  // Quick Discount Modal
  const [discountModalClient, setDiscountModalClient] = useState<Client | null>(null);
  const [discountModalForm, setDiscountModalForm] = useState({
    discountPct: 15,
    fixedDiscountBrl: 0,
  });

  // Utility PDF Auto-Import Modal
  const [pdfImportOpen, setPdfImportOpen] = useState(false);

  // Quick Pay Modal inside Client Detail
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('PIX');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.ucNumber.toLowerCase().includes(q) ||
        c.document.toLowerCase().includes(q);
      const matchPlant = plantFilter === 'all' || c.plantId === plantFilter;
      const clientInvs = invoices.filter((i) => i.clientId === c.id);
      const matchBilling =
        billingFilter === 'all' ||
        (billingFilter === 'vencida' && clientInvs.some((i) => i.status === 'vencida')) ||
        (billingFilter === 'pendente' && clientInvs.some((i) => i.status === 'pendente'));
      return matchSearch && matchPlant && matchBilling;
    });
  }, [clients, search, plantFilter, billingFilter, invoices]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? filteredClients[0] ?? null,
    [clients, selectedClientId, filteredClients],
  );

  const selectedClientInvoices = useMemo(
    () =>
      selectedClient
        ? invoices
            .filter((i) => i.clientId === selectedClient.id)
            .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))
        : [],
    [invoices, selectedClient],
  );

  const openCreateModal = () => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para cadastrar um novo cliente.');
      return;
    }
    setEditingClient(null);
    const firstSeller = sellers[0];
    setForm({
      name: '',
      document: '',
      email: '',
      phone: '',
      city: '',
      ucNumber: '',
      plantId: plants[0]?.id || '',
      contractedKwh: 15000,
      discountPct: 16,
      fixedDiscountBrl: 0,
      sellerId: firstSeller?.id || '',
      commissionPct: firstSeller?.defaultCommissionPct ?? 8.5,
      contractStartDate: new Date().toISOString().slice(0, 10),
      status: 'ativo',
    });
    setModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para editar o cadastro deste cliente.');
      return;
    }
    setEditingClient(client);
    setForm({
      name: client.name,
      document: client.document,
      email: client.email,
      phone: client.phone,
      city: client.city,
      ucNumber: client.ucNumber,
      plantId: client.plantId,
      contractedKwh: client.contractedKwh,
      discountPct: client.discountPct,
      fixedDiscountBrl: client.fixedDiscountBrl ?? 0,
      sellerId: client.sellerId,
      commissionPct: client.commissionPct,
      contractStartDate: client.contractStartDate,
      status: client.status,
    });
    setModalOpen(true);
  };

  const openDiscountModal = (client: Client) => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para adicionar ou ajustar descontos.');
      return;
    }
    setDiscountModalClient(client);
    setDiscountModalForm({
      discountPct: client.discountPct,
      fixedDiscountBrl: client.fixedDiscountBrl ?? 0,
    });
  };

  const handleSaveDiscountModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountModalClient) return;
    const updated: Client = {
      ...discountModalClient,
      discountPct: discountModalForm.discountPct,
      fixedDiscountBrl: discountModalForm.fixedDiscountBrl,
    };
    await onSaveClient(updated, false);
    if (selectedClient?.id === updated.id) {
      setConsumptionForm((prev) => ({
        ...prev,
        discountPct: updated.discountPct,
        extraDiscountBrl: updated.fixedDiscountBrl ?? 0,
      }));
    }
    setDiscountModalClient(null);
  };

  const handleSellerChange = (sellerId: string) => {
    const seller = sellers.find((s) => s.id === sellerId);
    setForm((prev) => ({
      ...prev,
      sellerId,
      commissionPct: seller ? seller.defaultCommissionPct : prev.commissionPct,
    }));
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Client = editingClient
      ? { ...editingClient, ...form }
      : {
          id: uid('cli'),
          ...form,
          consumptionHistory: [],
        };
    await onSaveClient(payload, !editingClient);
    setSelectedClientId(payload.id);
    setConsumptionForm((prev) => ({
      ...prev,
      discountPct: payload.discountPct,
      extraDiscountBrl: payload.fixedDiscountBrl ?? 0,
    }));
    setModalOpen(false);
  };

  const selectClientRow = (client: Client) => {
    setSelectedClientId(client.id);
    setConsumptionForm((prev) => ({
      ...prev,
      consumedKwh: client.contractedKwh,
      compensatedKwh: client.contractedKwh,
      discountPct: client.discountPct,
      extraDiscountBrl: client.fixedDiscountBrl ?? 0,
    }));
  };

  const openConsumptionModal = (client?: Client) => {
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para lançar o consumo mensal.');
      return;
    }
    const target = client || selectedClient || clients[0];
    if (!target) return;
    setConsumptionTargetClientId(target.id);
    setSelectedClientId(target.id);
    setConsumptionForm((prev) => ({
      ...prev,
      consumedKwh: target.contractedKwh,
      compensatedKwh: target.contractedKwh,
      discountPct: target.discountPct,
      extraDiscountBrl: target.fixedDiscountBrl ?? 0,
    }));
    setConsumptionModalOpen(true);
  };

  const saveConsumptionEntry = async (targetClient: Client) => {
    const plant = plants.find((p) => p.id === targetClient.plantId);
    const tariff = plant?.tariffPerKwh ?? 0.92;
    const gross = Number((consumptionForm.compensatedKwh * tariff).toFixed(2));
    const pctDiscount = gross * (Math.max(0, Math.min(100, consumptionForm.discountPct)) / 100);
    const extraDiscount = Math.max(0, consumptionForm.extraDiscountBrl);
    const discount = Number(Math.min(gross, pctDiscount + extraDiscount).toFixed(2));
    const billed = Number(Math.max(0, gross - discount).toFixed(2));

    const newRecord: ConsumptionRecord = {
      id: uid('ch'),
      month: consumptionForm.month,
      consumedKwh: consumptionForm.consumedKwh,
      compensatedKwh: consumptionForm.compensatedKwh,
      gridCostWithoutSolar: gross,
      billedAmount: billed,
    };

    const updatedHistory = [
      ...targetClient.consumptionHistory.filter((h) => h.month !== consumptionForm.month),
      newRecord,
    ].sort((a, b) => a.month.localeCompare(b.month));

    await onSaveClient({ ...targetClient, consumptionHistory: updatedHistory }, false);

    if (consumptionForm.generateInvoice) {
      const commissionVal = Number((billed * (targetClient.commissionPct / 100)).toFixed(2));
      const newInv: Invoice = {
        id: uid('inv'),
        number: `FAT-2026-${Math.floor(1000 + Math.random() * 8999)}`,
        clientId: targetClient.id,
        plantId: targetClient.plantId,
        sellerId: targetClient.sellerId,
        commissionPctSnapshot: targetClient.commissionPct,
        referenceMonth: consumptionForm.month,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: consumptionForm.dueDate,
        kwhCompensated: consumptionForm.compensatedKwh,
        grossAmount: gross,
        discountAmount: discount,
        netAmount: billed,
        commissionAmount: commissionVal,
        status: consumptionForm.dueDate < '2026-11-14' ? 'vencida' : 'pendente',
      };
      await onCreateInvoice(newInv);
    }
  };

  const handleAddConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      onRequireLogin('Faça login com sua conta Google para registrar leituras de consumo.');
      return;
    }
    if (!selectedClient) return;
    await saveConsumptionEntry(selectedClient);
  };

  const handleModalConsumptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = clients.find((c) => c.id === consumptionTargetClientId);
    if (!target) return;
    await saveConsumptionEntry(target);
    setSelectedClientId(target.id);
    setDetailTab('consumption');
    setConsumptionModalOpen(false);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    await onMarkInvoicePaid(payingInvoice, payMethod, payDate);
    setPayingInvoice(null);
  };

  return (
    <div className="space-y-6">
      {/* Filter & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, UC ou CNPJ/CPF..."
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
            />
          </div>

          <select
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">Todas as Usinas</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {(
              [
                ['all', 'Todos'],
                ['vencida', 'Com Fatura Vencida'],
                ['pendente', 'Com Pendentes'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBillingFilter(k)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  billingFilter === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!canEdit) {
                onRequireLogin(
                  'Faça login com sua conta Google para importar PDFs da concessionária.',
                );
                return;
              }
              setPdfImportOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            Importar PDF Concessionária
          </button>
          <button
            type="button"
            onClick={() => openConsumptionModal()}
            disabled={clients.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-900 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Lançar Consumo
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                <th className="py-3 px-5">Cliente / UC</th>
                <th className="py-3 px-4">Usina Vinculada</th>
                <th className="py-3 px-4">Vendedor & Comissão</th>
                <th className="py-3 px-4 text-right">Cota / Desconto</th>
                <th className="py-3 px-4">Faturas Vencidas / Pendentes</th>
                <th className="py-3 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Nenhum cliente encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const plant = plants.find((p) => p.id === client.plantId);
                  const seller = sellers.find((s) => s.id === client.sellerId);
                  const cInvs = invoices.filter((i) => i.clientId === client.id);
                  const overdue = cInvs.filter((i) => i.status === 'vencida');
                  const pending = cInvs.filter((i) => i.status === 'pendente');
                  const isSelected = selectedClient?.id === client.id;

                  return (
                    <tr
                      key={client.id}
                      onClick={() => selectClientRow(client)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">{client.name}</div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          UC {client.ucNumber} · {client.document} · {client.city}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        <div className="font-medium text-slate-900">{plant?.code || '—'}</div>
                        <div className="text-slate-500">{plant?.name || 'Sem usina'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-sm font-medium text-slate-900">
                          {seller?.name || 'Não atribuído'}
                        </div>
                        <div className="text-xs text-amber-800 font-mono tabular-nums">
                          Comissão: {client.commissionPct.toFixed(1)}% por fatura
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        <div className="font-medium text-slate-900">
                          {formatNumber(client.contractedKwh)} kWh
                        </div>
                        <div className="text-xs text-emerald-700 font-medium">
                          -{client.discountPct}% tarifa
                          {(client.fixedDiscountBrl ?? 0) > 0
                            ? ` · -${formatBRL(client.fixedDiscountBrl ?? 0)}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {overdue.length > 0 ? (
                          <div className="text-red-700 font-medium font-mono tabular-nums">
                            {overdue.length} vencida(s) ·{' '}
                            {formatBRL(overdue.reduce((s, i) => s + i.netAmount, 0))}
                          </div>
                        ) : null}
                        {pending.length > 0 ? (
                          <div className="text-amber-700 font-medium font-mono tabular-nums">
                            {pending.length} pendente(s) ·{' '}
                            {formatBRL(pending.reduce((s, i) => s + i.netAmount, 0))}
                          </div>
                        ) : null}
                        {overdue.length === 0 && pending.length === 0 ? (
                          <span className="text-emerald-700 font-medium">Todas quitadas</span>
                        ) : null}
                      </td>
                      <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openConsumptionModal(client)}
                            className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md whitespace-nowrap"
                          >
                            Lançar Consumo
                          </button>
                          <button
                            type="button"
                            onClick={() => openDiscountModal(client)}
                            className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-md"
                            title="Adicionar ou ajustar descontos do cliente"
                          >
                            <Percent className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(client)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            title="Editar cadastro e vendedor"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canEdit) {
                                onRequireLogin(
                                  'Faça login com sua conta Google para excluir clientes.',
                                );
                                return;
                              }
                              onDeleteClient(client.id);
                            }}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                            title="Excluir cliente"
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

      {/* Client Detail Panel: Consumption History + Overdue/Pending Invoice Control */}
      {selectedClient && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Ficha Operacional: {selectedClient.name}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                UC {selectedClient.ucNumber} · Vendedor:{' '}
                {sellers.find((s) => s.id === selectedClient.sellerId)?.name || '—'} (
                {selectedClient.commissionPct.toFixed(1)}%) · Desconto {selectedClient.discountPct}%
                {(selectedClient.fixedDiscountBrl ?? 0) > 0
                  ? ` + ${formatBRL(selectedClient.fixedDiscountBrl ?? 0)} fixo`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                <button
                  type="button"
                  onClick={() => setDetailTab('consumption')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    detailTab === 'consumption'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Histórico de Consumo
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('invoices')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    detailTab === 'invoices'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Faturas Vencidas e Pendentes ({selectedClientInvoices.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => openDiscountModal(selectedClient)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <Percent className="w-3.5 h-3.5" />
                Desconto do Cliente
              </button>

              <button
                type="button"
                onClick={() =>
                  exportClientStatementPDF(
                    selectedClient,
                    plants.find((p) => p.id === selectedClient.plantId),
                    sellers.find((s) => s.id === selectedClient.sellerId),
                    selectedClientInvoices,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Exportar Extrato (PDF)
              </button>
            </div>
          </div>

          {detailTab === 'consumption' ? (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">
                    Evolução Mensal: Consumo da Rede vs. Energia Solar Compensada (kWh)
                  </h4>
                  <div className="h-64 w-full border border-slate-200 rounded-lg p-3">
                    {selectedClient.consumptionHistory.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500">
                        Nenhum histórico de consumo registrado para este cliente ainda.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={selectedClient.consumptionHistory.map((h) => ({
                            ...h,
                            label: formatMonthShort(h.month),
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                          <Tooltip
                            formatter={(v, name) => [`${formatNumber(Number(v))} kWh`, name]}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Bar
                            dataKey="consumedKwh"
                            name="Consumo Total (kWh)"
                            fill="#94A3B8"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            dataKey="compensatedKwh"
                            name="Compensado Solar (kWh)"
                            fill="#D97706"
                            radius={[3, 3, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <form
                  onSubmit={handleAddConsumption}
                  className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3"
                >
                  <h4 className="text-sm font-semibold text-slate-900">
                    Registrar Leitura Mensal de Consumo
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mês de Referência
                    </label>
                    <input
                      type="month"
                      required
                      value={consumptionForm.month}
                      onChange={(e) =>
                        setConsumptionForm({ ...consumptionForm, month: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Consumo (kWh)
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={consumptionForm.consumedKwh}
                        onChange={(e) =>
                          setConsumptionForm({
                            ...consumptionForm,
                            consumedKwh: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Compensado (kWh)
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        value={consumptionForm.compensatedKwh}
                        onChange={(e) =>
                          setConsumptionForm({
                            ...consumptionForm,
                            compensatedKwh: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                        value={consumptionForm.discountPct}
                        onChange={(e) =>
                          setConsumptionForm({
                            ...consumptionForm,
                            discountPct: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Desconto Extra (R$)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={consumptionForm.extraDiscountBrl}
                        onChange={(e) =>
                          setConsumptionForm({
                            ...consumptionForm,
                            extraDiscountBrl: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                      />
                    </div>
                  </div>
                  {(() => {
                    const plant = plants.find((p) => p.id === selectedClient.plantId);
                    const tariff = plant?.tariffPerKwh ?? 0.92;
                    const gross = consumptionForm.compensatedKwh * tariff;
                    const pctVal = gross * (Math.max(0, Math.min(100, consumptionForm.discountPct)) / 100);
                    const totalDisc = Math.min(gross, pctVal + Math.max(0, consumptionForm.extraDiscountBrl));
                    const netVal = Math.max(0, gross - totalDisc);
                    return (
                      <div className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between text-xs font-mono tabular-nums">
                        <span className="text-emerald-700 font-medium">
                          Desc: -{formatBRL(totalDisc)}
                        </span>
                        <span className="font-semibold text-slate-900">
                          Líquido: {formatBRL(netVal)}
                        </span>
                      </div>
                    );
                  })()}
                  <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
                    <input
                      type="checkbox"
                      checked={consumptionForm.generateInvoice}
                      onChange={(e) =>
                        setConsumptionForm({
                          ...consumptionForm,
                          generateInvoice: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    Gerar fatura e comissão ({selectedClient.commissionPct.toFixed(1)}%) automaticamente
                  </label>
                  {consumptionForm.generateInvoice && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Vencimento da Fatura
                      </label>
                      <input
                        type="date"
                        required
                        value={consumptionForm.dueDate}
                        onChange={(e) =>
                          setConsumptionForm({ ...consumptionForm, dueDate: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono"
                      />
                    </div>
                  )}
                  <button
                    type="submit"
                    className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
                  >
                    Salvar Leitura no Histórico
                  </button>
                </form>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                      <th className="py-2.5 px-4">Competência</th>
                      <th className="py-2.5 px-4 text-right">Consumo Total</th>
                      <th className="py-2.5 px-4 text-right">Compensado Solar</th>
                      <th className="py-2.5 px-4 text-right">Sem Solar (Rede)</th>
                      <th className="py-2.5 px-4 text-right">Valor Faturado</th>
                      <th className="py-2.5 px-4 text-right">Economia Gerada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono tabular-nums text-xs">
                    {selectedClient.consumptionHistory.map((h) => {
                      const saving = Math.max(0, h.gridCostWithoutSolar - h.billedAmount);
                      return (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                            {formatMonthShort(h.month)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-700">
                            {formatNumber(h.consumedKwh)} kWh
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-amber-700">
                            {formatNumber(h.compensatedKwh)} kWh
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-600">
                            {formatBRL(h.gridCostWithoutSolar)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                            {formatBRL(h.billedAmount)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium text-emerald-700">
                            +{formatBRL(saving)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                <div className="p-4">
                  <p className="text-xs text-slate-500">Faturas Vencidas (Em Atraso)</p>
                  <p className="text-lg font-semibold text-red-700 font-mono tabular-nums mt-1">
                    {formatBRL(
                      selectedClientInvoices
                        .filter((i) => i.status === 'vencida')
                        .reduce((s, i) => s + i.netAmount, 0),
                    )}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-500">Faturas Pendentes (A Vencer)</p>
                  <p className="text-lg font-semibold text-amber-700 font-mono tabular-nums mt-1">
                    {formatBRL(
                      selectedClientInvoices
                        .filter((i) => i.status === 'pendente')
                        .reduce((s, i) => s + i.netAmount, 0),
                    )}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-slate-500">Total Liquidado (Pagas)</p>
                  <p className="text-lg font-semibold text-emerald-700 font-mono tabular-nums mt-1">
                    {formatBRL(
                      selectedClientInvoices
                        .filter((i) => i.status === 'paga')
                        .reduce((s, i) => s + i.netAmount, 0),
                    )}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                      <th className="py-2.5 px-4">Fatura</th>
                      <th className="py-2.5 px-4">Referência</th>
                      <th className="py-2.5 px-4">Vencimento</th>
                      <th className="py-2.5 px-4 text-right">Valor Líquido</th>
                      <th className="py-2.5 px-4 text-right">Comissão Vendedor</th>
                      <th className="py-2.5 px-4">Situação</th>
                      <th className="py-2.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {selectedClientInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Nenhuma fatura emitida para este cliente.
                        </td>
                      </tr>
                    ) : (
                      selectedClientInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            {inv.number}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {formatMonthShort(inv.referenceMonth)}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                            {formatDateBR(inv.dueDate)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatBRL(inv.netAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                            {formatBRL(inv.commissionAmount)} ({inv.commissionPctSnapshot.toFixed(1)}%)
                          </td>
                          <td className="py-3 px-4">
                            <InvoiceStatusLabel status={inv.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            {inv.status === 'paga' ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onPreviewReceipt(inv)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded hover:bg-slate-100"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  Recibo
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    exportPaymentReceiptPDF(
                                      inv,
                                      selectedClient,
                                      plants.find((p) => p.id === inv.plantId),
                                      sellers.find((s) => s.id === inv.sellerId),
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800"
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
                                    onRequireLogin(
                                      'Faça login com sua conta Google para registrar pagamentos e emitir recibos.',
                                    );
                                    return;
                                  }
                                  setPayingInvoice(inv);
                                  setPayDate(new Date().toISOString().slice(0, 10));
                                }}
                                className="px-3 py-1 text-xs font-medium text-white bg-emerald-700 rounded hover:bg-emerald-800 whitespace-nowrap"
                              >
                                Registrar Pagamento
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Cadastro / Edição Cliente (com Vendedor e % Comissão) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
        >
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h2 id="client-modal-title" className="text-base font-semibold text-slate-900">
                {editingClient ? 'Editar Cadastro do Cliente' : 'Cadastrar Novo Cliente'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome / Razão Social
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Supermercados Alvorada Ltda"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">CPF / CNPJ</label>
                  <input
                    required
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unidade Consumidora (UC)
                  </label>
                  <input
                    required
                    value={form.ucNumber}
                    onChange={(e) => setForm({ ...form, ucNumber: e.target.value })}
                    placeholder="3008812041"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cidade / UF</label>
                  <input
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Ribeirão Preto / SP"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mini Usina Vinculada
                  </label>
                  <select
                    required
                    value={form.plantId}
                    onChange={(e) => setForm({ ...form, plantId: e.target.value })}
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
                    Cota Contratada (kWh)
                  </label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={form.contractedKwh}
                    onChange={(e) => setForm({ ...form, contractedKwh: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Descontos do Cliente */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-900">
                  Descontos do Cliente (Aplicados nas Faturas e Lançamentos)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Desconto na Tarifa (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step={0.5}
                      value={form.discountPct}
                      onChange={(e) => setForm({ ...form, discountPct: Number(e.target.value) })}
                      className="w-full border border-slate-300 bg-white rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Desconto Fixo Mensal (R$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.fixedDiscountBrl}
                      onChange={(e) =>
                        setForm({ ...form, fixedDiscountBrl: Number(e.target.value) })
                      }
                      placeholder="0,00"
                      className="w-full border border-slate-300 bg-white rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                {(() => {
                  const p = plants.find((item) => item.id === form.plantId);
                  const t = p?.tariffPerKwh ?? 0.92;
                  const estGross = form.contractedKwh * t;
                  const estPctDisc = estGross * (Math.max(0, Math.min(100, form.discountPct)) / 100);
                  const estTotalDisc = Math.min(estGross, estPctDisc + Math.max(0, form.fixedDiscountBrl));
                  const estNet = Math.max(0, estGross - estTotalDisc);
                  return (
                    <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums pt-1">
                      <span>Base contratada: {formatBRL(estGross)}</span>
                      <span className="text-emerald-700 font-medium">
                        Economia estimada: -{formatBRL(estTotalDisc)}/mês
                      </span>
                      <span className="text-slate-900 font-semibold">
                        Líquido est.: {formatBRL(estNet)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Identificação do Vendedor e Percentual de Ganho e Comissão */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-900">
                  Vínculo Comercial — Vendedor e Percentual de Ganho / Comissão
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Vendedor Responsável
                    </label>
                    <select
                      required
                      value={form.sellerId}
                      onChange={(e) => handleSellerChange(e.target.value)}
                      className="w-full border border-slate-300 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Padrão {s.defaultCommissionPct}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Percentual de Ganho / Comissão (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={40}
                      step={0.1}
                      value={form.commissionPct}
                      onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
                      className="w-full border border-slate-300 bg-white rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
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
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  {editingClient ? 'Salvar Alterações' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Pagamento */}
      {payingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Registrar Pagamento</h3>
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmPayment} className="p-6 space-y-4 text-sm">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <p className="text-xs text-slate-500">Fatura {payingInvoice.number}</p>
                <p className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
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
                  Confirmar e Emitir Recibo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Lançar Consumo Mensal */}
      {consumptionModalOpen && (() => {
        const targetClient = clients.find((c) => c.id === consumptionTargetClientId);
        const plant = targetClient ? plants.find((p) => p.id === targetClient.plantId) : undefined;
        const tariff = plant?.tariffPerKwh ?? 0.92;
        const previewGross = consumptionForm.compensatedKwh * tariff;
        const previewPctDisc =
          previewGross * (Math.max(0, Math.min(100, consumptionForm.discountPct)) / 100);
        const previewDiscount = Math.min(
          previewGross,
          previewPctDisc + Math.max(0, consumptionForm.extraDiscountBrl),
        );
        const previewNet = Math.max(0, previewGross - previewDiscount);
        const previewCommission = targetClient ? previewNet * (targetClient.commissionPct / 100) : 0;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consumption-modal-title"
          >
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 id="consumption-modal-title" className="text-base font-semibold text-slate-900">
                  Lançar Consumo Mensal do Cliente
                </h3>
                <button
                  type="button"
                  onClick={() => setConsumptionModalOpen(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleModalConsumptionSubmit} className="p-6 overflow-y-auto space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cliente</label>
                  <select
                    required
                    value={consumptionTargetClientId}
                    onChange={(e) => {
                      const c = clients.find((item) => item.id === e.target.value);
                      setConsumptionTargetClientId(e.target.value);
                      if (c) {
                        setConsumptionForm((prev) => ({
                          ...prev,
                          consumedKwh: c.contractedKwh,
                          compensatedKwh: c.contractedKwh,
                          discountPct: c.discountPct,
                          extraDiscountBrl: c.fixedDiscountBrl ?? 0,
                        }));
                      }
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mês Referência
                    </label>
                    <input
                      type="month"
                      required
                      value={consumptionForm.month}
                      onChange={(e) =>
                        setConsumptionForm({ ...consumptionForm, month: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Consumo Total (kWh)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={consumptionForm.consumedKwh}
                      onChange={(e) =>
                        setConsumptionForm({
                          ...consumptionForm,
                          consumedKwh: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Compensado (kWh)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={consumptionForm.compensatedKwh}
                      onChange={(e) =>
                        setConsumptionForm({
                          ...consumptionForm,
                          compensatedKwh: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Desconto na Tarifa (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step={0.5}
                      value={consumptionForm.discountPct}
                      onChange={(e) =>
                        setConsumptionForm({
                          ...consumptionForm,
                          discountPct: Number(e.target.value),
                        })
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
                      value={consumptionForm.extraDiscountBrl}
                      onChange={(e) =>
                        setConsumptionForm({
                          ...consumptionForm,
                          extraDiscountBrl: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                {targetClient && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-slate-500 font-sans block">Tarifa Cheia ({formatBRL(tariff)}/kWh)</span>
                      <span className="font-semibold text-slate-900">{formatBRL(previewGross)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">
                        Desconto ({consumptionForm.discountPct}%{consumptionForm.extraDiscountBrl > 0 ? ` + ${formatBRL(consumptionForm.extraDiscountBrl)}` : ''})
                      </span>
                      <span className="font-semibold text-emerald-700">-{formatBRL(previewDiscount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">Valor a Faturar</span>
                      <span className="font-semibold text-slate-900">{formatBRL(previewNet)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans block">Comissão Vendedor ({targetClient.commissionPct.toFixed(1)}%)</span>
                      <span className="font-semibold text-amber-800">{formatBRL(previewCommission)}</span>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={consumptionForm.generateInvoice}
                    onChange={(e) =>
                      setConsumptionForm({
                        ...consumptionForm,
                        generateInvoice: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  Gerar fatura e comissão automaticamente para este mês
                </label>

                {consumptionForm.generateInvoice && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Vencimento da Fatura
                    </label>
                    <input
                      type="date"
                      required
                      value={consumptionForm.dueDate}
                      onChange={(e) =>
                        setConsumptionForm({ ...consumptionForm, dueDate: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setConsumptionModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                  >
                    Salvar Lançamento
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal Configurar Descontos do Cliente */}
      {discountModalClient && (() => {
        const plant = plants.find((p) => p.id === discountModalClient.plantId);
        const tariff = plant?.tariffPerKwh ?? 0.92;
        const baseGross = discountModalClient.contractedKwh * tariff;
        const pctDisc =
          baseGross * (Math.max(0, Math.min(100, discountModalForm.discountPct)) / 100);
        const totalDisc = Math.min(
          baseGross,
          pctDisc + Math.max(0, discountModalForm.fixedDiscountBrl),
        );
        const netEst = Math.max(0, baseGross - totalDisc);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discount-modal-title"
          >
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 id="discount-modal-title" className="text-base font-semibold text-slate-900">
                    Descontos do Cliente
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {discountModalClient.name} · UC {discountModalClient.ucNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountModalClient(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveDiscountModal} className="p-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Desconto na Tarifa (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step={0.5}
                      value={discountModalForm.discountPct}
                      onChange={(e) =>
                        setDiscountModalForm({
                          ...discountModalForm,
                          discountPct: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Desconto Fixo Mensal (R$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={discountModalForm.fixedDiscountBrl}
                      onChange={(e) =>
                        setDiscountModalForm({
                          ...discountModalForm,
                          fixedDiscountBrl: Number(e.target.value),
                        })
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-500">
                      Cota contratada ({formatNumber(discountModalClient.contractedKwh)} kWh)
                    </span>
                    <span className="text-slate-900">{formatBRL(baseGross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-500">Total de descontos</span>
                    <span className="text-emerald-700 font-semibold">-{formatBRL(totalDisc)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5">
                    <span className="font-sans font-medium text-slate-700">Fatura mensal estimada</span>
                    <span className="text-slate-900 font-semibold">{formatBRL(netEst)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDiscountModalClient(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                  >
                    Salvar Descontos
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* Modal Importar Relatório PDF da Concessionária */}
      {pdfImportOpen && (
        <UtilityPdfImportModal
          clients={clients}
          plants={plants}
          sellers={sellers}
          getAuthToken={getAuthToken}
          onClose={() => setPdfImportOpen(false)}
          onImportConfirm={async ({ client, isNewClient, invoice }) => {
            await onSaveClient(client, isNewClient);
            if (invoice) {
              await onCreateInvoice(invoice);
            }
            setSelectedClientId(client.id);
            setDetailTab('consumption');
          }}
        />
      )}
    </div>
  );
}
