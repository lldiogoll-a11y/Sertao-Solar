import { useState } from 'react';
import { CheckCircle2, FileDown, FileText, Loader2, Upload, X } from 'lucide-react';
import type {
  Client,
  ConsumptionRecord,
  Invoice,
  Seller,
  SolarPlant,
} from '../types.ts';
import { formatBRL, formatMonthShort, formatNumber, uid } from '../utils/formatters.ts';
import { exportSampleUtilityBillPDF } from '../utils/pdfExport.ts';

interface UtilityPdfImportModalProps {
  clients: Client[];
  plants: SolarPlant[];
  sellers: Seller[];
  getAuthToken: () => Promise<string | null>;
  onClose: () => void;
  onImportConfirm: (payload: {
    client: Client;
    isNewClient: boolean;
    invoice?: Invoice;
  }) => Promise<void>;
}

interface ExtractedUtilityData {
  utilityCompany: string;
  clientName: string;
  document: string;
  ucNumber: string;
  city: string;
  email: string;
  phone: string;
  referenceMonth: string;
  dueDate: string;
  consumedKwh: number;
  compensatedKwh: number;
  gridCostWithoutSolar: number;
  historicalConsumption: {
    month: string;
    consumedKwh: number;
    compensatedKwh: number;
  }[];
  observations: string;
}

export function UtilityPdfImportModal({
  clients,
  plants,
  sellers,
  getAuthToken,
  onClose,
  onImportConfirm,
}: UtilityPdfImportModalProps) {
  const [fileName, setFileName] = useState<string>('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedUtilityData | null>(null);

  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [matchedClientId, setMatchedClientId] = useState<string>(clients[0]?.id || '');

  // Fields for new/updated client & consumption
  const [plantId, setPlantId] = useState<string>(plants[0]?.id || '');
  const [sellerId, setSellerId] = useState<string>(sellers[0]?.id || '');
  const [commissionPct, setCommissionPct] = useState<number>(
    sellers[0]?.defaultCommissionPct ?? 8.5,
  );
  const [discountPct, setDiscountPct] = useState<number>(16);
  const [extraDiscountBrl, setExtraDiscountBrl] = useState<number>(0);
  const [generateInvoice, setGenerateInvoice] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo PDF local.'));
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Selecione um arquivo no formato PDF emitido pela concessionária.');
      return;
    }

    setError(null);
    setFileName(file.name);
    setExtracting(true);

    try {
      const fileBase64 = await readFileAsBase64(file);
      const token = await getAuthToken();
      const res = await fetch('/api/import-utility-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileBase64,
          mimeType: 'application/pdf',
          fileName: file.name,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao analisar o relatório em PDF.');
      }

      const data = body.extracted as ExtractedUtilityData;
      const defaultMonth =
        data.referenceMonth && /^\d{4}-\d{2}$/.test(data.referenceMonth)
          ? data.referenceMonth
          : '2026-11';
      const defaultDue =
        data.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)
          ? data.dueDate
          : '2026-11-28';

      setExtracted({
        utilityCompany: data.utilityCompany || '',
        clientName: data.clientName || '',
        document: data.document || '',
        ucNumber: data.ucNumber || '',
        city: data.city || '',
        email: data.email || '',
        phone: data.phone || '',
        referenceMonth: defaultMonth,
        dueDate: defaultDue,
        consumedKwh: Number(data.consumedKwh) || 0,
        compensatedKwh: Number(data.compensatedKwh) || Number(data.consumedKwh) || 0,
        gridCostWithoutSolar: Number(data.gridCostWithoutSolar) || 0,
        historicalConsumption: Array.isArray(data.historicalConsumption)
          ? data.historicalConsumption
              .filter((h) => h && /^\d{4}-\d{2}$/.test(String(h.month || '')))
              .map((h) => ({
                month: String(h.month),
                consumedKwh: Number(h.consumedKwh) || 0,
                compensatedKwh: Number(h.compensatedKwh) || 0,
              }))
          : [],
        observations: data.observations || '',
      });

      const normDigits = (s?: string) => (s || '').replace(/\D/g, '');
      const targetUc = normDigits(data.ucNumber);
      const targetDoc = normDigits(data.document);
      const targetName = (data.clientName || '').toLowerCase().trim();

      const localMatchedClient = clients.find((c) => {
        if (targetUc && normDigits(c.ucNumber) === targetUc) return true;
        if (targetDoc && normDigits(c.document) === targetDoc) return true;
        if (targetName && c.name.toLowerCase().includes(targetName)) return true;
        return false;
      });

      if (localMatchedClient) {
        setTargetMode('existing');
        setMatchedClientId(localMatchedClient.id);
        setDiscountPct(localMatchedClient.discountPct);
        setExtraDiscountBrl(localMatchedClient.fixedDiscountBrl ?? 0);
      } else {
        setTargetMode('new');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível ler os dados do PDF.',
      );
    } finally {
      setExtracting(false);
    }
  };

  const selectedExistingClient =
    targetMode === 'existing' ? clients.find((c) => c.id === matchedClientId) : undefined;

  const activeDiscount = Math.max(0, Math.min(100, discountPct));
  const activeExtraDiscount = Math.max(0, extraDiscountBrl);
  const activeCommission = selectedExistingClient
    ? selectedExistingClient.commissionPct
    : commissionPct;
  const activePlant = plants.find(
    (p) => p.id === (selectedExistingClient ? selectedExistingClient.plantId : plantId),
  );
  const tariff = activePlant?.tariffPerKwh ?? 0.92;

  const grossValue = extracted
    ? extracted.gridCostWithoutSolar > 0
      ? extracted.gridCostWithoutSolar
      : Number((extracted.compensatedKwh * tariff).toFixed(2))
    : 0;
  const discountValue = Number(
    Math.min(grossValue, grossValue * (activeDiscount / 100) + activeExtraDiscount).toFixed(2),
  );
  const netValue = Number(Math.max(0, grossValue - discountValue).toFixed(2));
  const commissionValue = Number((netValue * (activeCommission / 100)).toFixed(2));

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extracted) return;
    setSaving(true);
    try {
      const mainRecord: ConsumptionRecord = {
        id: uid('ch'),
        month: extracted.referenceMonth,
        consumedKwh: extracted.consumedKwh,
        compensatedKwh: extracted.compensatedKwh,
        gridCostWithoutSolar: grossValue,
        billedAmount: netValue,
      };

      const historicalRecords: ConsumptionRecord[] = extracted.historicalConsumption
        .filter((h) => h.month !== extracted.referenceMonth && (h.consumedKwh > 0 || h.compensatedKwh > 0))
        .map((h) => {
          const histBaseKwh = h.compensatedKwh > 0 ? h.compensatedKwh : h.consumedKwh;
          const histGross = Number((histBaseKwh * tariff).toFixed(2));
          const histBilled = Number((histGross * (1 - activeDiscount / 100)).toFixed(2));
          return {
            id: uid('ch'),
            month: h.month,
            consumedKwh: h.consumedKwh,
            compensatedKwh: h.compensatedKwh,
            gridCostWithoutSolar: histGross,
            billedAmount: histBilled,
          };
        });

      const mergedExtractedRecords = [...historicalRecords, mainRecord];
      const extractedMonthsSet = new Set(mergedExtractedRecords.map((r) => r.month));

      let targetClient: Client;
      const isNew = targetMode === 'new';

      if (isNew) {
        targetClient = {
          id: uid('cli'),
          name: extracted.clientName || 'Cliente Importado',
          document: extracted.document || '00.000.000/0001-00',
          email: extracted.email || 'contato@cliente.com.br',
          phone: extracted.phone || '(00) 00000-0000',
          city: extracted.city || 'Cidade / UF',
          ucNumber: extracted.ucNumber || String(Math.floor(3000000000 + Math.random() * 99999999)),
          plantId,
          contractedKwh: extracted.compensatedKwh || extracted.consumedKwh || 10000,
          discountPct: activeDiscount,
          fixedDiscountBrl: activeExtraDiscount,
          sellerId,
          commissionPct,
          contractStartDate: new Date().toISOString().slice(0, 10),
          status: 'ativo',
          consumptionHistory: mergedExtractedRecords.sort((a, b) => a.month.localeCompare(b.month)),
        };
      } else {
        const existing = clients.find((c) => c.id === matchedClientId);
        if (!existing) return;
        const updatedHistory = [
          ...existing.consumptionHistory.filter((h) => !extractedMonthsSet.has(h.month)),
          ...mergedExtractedRecords,
        ].sort((a, b) => a.month.localeCompare(b.month));
        targetClient = {
          ...existing,
          consumptionHistory: updatedHistory,
        };
      }

      const invoice: Invoice | undefined = generateInvoice
        ? {
            id: uid('inv'),
            number: `FAT-2026-${Math.floor(1000 + Math.random() * 8999)}`,
            clientId: targetClient.id,
            plantId: targetClient.plantId,
            sellerId: targetClient.sellerId,
            commissionPctSnapshot: targetClient.commissionPct,
            referenceMonth: extracted.referenceMonth,
            issueDate: new Date().toISOString().slice(0, 10),
            dueDate: extracted.dueDate,
            kwhCompensated: extracted.compensatedKwh,
            grossAmount: grossValue,
            discountAmount: discountValue,
            netAmount: netValue,
            commissionAmount: commissionValue,
            status: extracted.dueDate < '2026-11-14' ? 'vencida' : 'pendente',
          }
        : undefined;

      await onImportConfirm({ client: targetClient, isNewClient: isNew, invoice });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="utility-pdf-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 id="utility-pdf-modal-title" className="text-base font-semibold text-slate-900">
              Importar Relatório da Concessionária (PDF)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Leitura automática dos dados do cliente, UC, consumo e energia compensada
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Upload Area */}
          <div className="border border-dashed border-slate-300 rounded-lg p-5 bg-slate-50/70">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
                  {extracting ? (
                    <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {extracting
                      ? `Analisando "${fileName}"...`
                      : fileName
                        ? `Arquivo carregado: ${fileName}`
                        : 'Selecione o PDF emitido pela concessionária'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aceita contas de energia e relatórios SCEE (CPFL, Cemig, Enel, Equatorial, etc.)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={exportSampleUtilityBillPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF Modelo
                </button>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  {extracted ? 'Trocar PDF' : 'Enviar PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-md px-4 py-3">
              {error}
            </div>
          )}

          {extracted && (
            <form id="utility-import-form" onSubmit={handleConfirm} className="space-y-4">
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md px-4 py-3 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Dados extraídos com sucesso
                    {extracted.utilityCompany ? ` (${extracted.utilityCompany})` : ''}
                  </p>
                  {extracted.observations && (
                    <p className="text-emerald-800 mt-0.5">{extracted.observations}</p>
                  )}
                </div>
              </div>

              {/* Target Client Mode */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-900">
                  Destino dos Dados no Sistema
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMode('new')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      targetMode === 'new'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Cadastrar Novo Cliente Automaticamente
                  </button>
                  {clients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTargetMode('existing')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        targetMode === 'existing'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      Adicionar ao Histórico de Cliente Existente
                    </button>
                  )}
                </div>

                {targetMode === 'existing' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Cliente Selecionado
                      </label>
                      <select
                        value={matchedClientId}
                        onChange={(e) => {
                          const c = clients.find((item) => item.id === e.target.value);
                          setMatchedClientId(e.target.value);
                          if (c) {
                            setDiscountPct(c.discountPct);
                            setExtraDiscountBrl(c.fixedDiscountBrl ?? 0);
                          }
                        }}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · UC {c.ucNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          value={discountPct}
                          onChange={(e) => setDiscountPct(Number(e.target.value))}
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
                          value={extraDiscountBrl}
                          onChange={(e) => setExtraDiscountBrl(Number(e.target.value))}
                          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mini Usina Vinculada
                      </label>
                      <select
                        required
                        value={plantId}
                        onChange={(e) => setPlantId(e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
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
                        Desconto na Tarifa (%)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={100}
                        step={0.5}
                        value={discountPct}
                        onChange={(e) => setDiscountPct(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
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
                        value={extraDiscountBrl}
                        onChange={(e) => setExtraDiscountBrl(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Vendedor Responsável
                      </label>
                      <select
                        required
                        value={sellerId}
                        onChange={(e) => {
                          const s = sellers.find((item) => item.id === e.target.value);
                          setSellerId(e.target.value);
                          if (s) setCommissionPct(s.defaultCommissionPct);
                        }}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                      >
                        {sellers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.defaultCommissionPct}%)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Comissão do Vendedor (%)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={40}
                        step={0.1}
                        value={commissionPct}
                        onChange={(e) => setCommissionPct(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Extracted Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Titular / Razão Social (do PDF)
                  </label>
                  <input
                    required
                    value={extracted.clientName}
                    onChange={(e) =>
                      setExtracted({ ...extracted, clientName: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CPF / CNPJ
                  </label>
                  <input
                    required
                    value={extracted.document}
                    onChange={(e) => setExtracted({ ...extracted, document: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unidade Consumidora (UC)
                  </label>
                  <input
                    required
                    value={extracted.ucNumber}
                    onChange={(e) => setExtracted({ ...extracted, ucNumber: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cidade / UF
                  </label>
                  <input
                    value={extracted.city}
                    onChange={(e) => setExtracted({ ...extracted, city: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mês de Referência
                  </label>
                  <input
                    type="month"
                    required
                    value={extracted.referenceMonth}
                    onChange={(e) =>
                      setExtracted({ ...extracted, referenceMonth: e.target.value })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Consumo (kWh)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={extracted.consumedKwh}
                    onChange={(e) =>
                      setExtracted({ ...extracted, consumedKwh: Number(e.target.value) })
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
                    min={0}
                    value={extracted.compensatedKwh}
                    onChange={(e) =>
                      setExtracted({ ...extracted, compensatedKwh: Number(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor Base (R$)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.01}
                    value={extracted.gridCostWithoutSolar}
                    onChange={(e) =>
                      setExtracted({
                        ...extracted,
                        gridCostWithoutSolar: Number(e.target.value),
                      })
                    }
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
                    value={extracted.dueDate}
                    onChange={(e) => setExtracted({ ...extracted, dueDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-500 font-sans block">
                    Desconto ({activeDiscount}%{activeExtraDiscount > 0 ? ` + ${formatBRL(activeExtraDiscount)}` : ''})
                  </span>
                  <span className="font-semibold text-emerald-700">
                    -{formatBRL(discountValue)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans block">Fatura Líquida</span>
                  <span className="font-semibold text-slate-900">{formatBRL(netValue)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-sans block">
                    Comissão ({activeCommission.toFixed(1)}%)
                  </span>
                  <span className="font-semibold text-amber-800">
                    {formatBRL(commissionValue)}
                  </span>
                </div>
              </div>

              {extracted.historicalConsumption.length > 0 && (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                    Histórico Adicional Detectado no PDF ({extracted.historicalConsumption.length}{' '}
                    meses serão adicionados automaticamente)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 px-3.5 font-medium">Mês</th>
                        <th className="py-1.5 px-3.5 font-medium text-right">Consumo (kWh)</th>
                        <th className="py-1.5 px-3.5 font-medium text-right">Compensado (kWh)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                      {extracted.historicalConsumption.map((h) => (
                        <tr key={h.month}>
                          <td className="py-1.5 px-3.5 font-sans text-slate-900">
                            {formatMonthShort(h.month)}
                          </td>
                          <td className="py-1.5 px-3.5 text-right text-slate-700">
                            {formatNumber(h.consumedKwh)} kWh
                          </td>
                          <td className="py-1.5 px-3.5 text-right text-amber-700">
                            {formatNumber(h.compensatedKwh)} kWh
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={generateInvoice}
                  onChange={(e) => setGenerateInvoice(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                Gerar fatura mensal e comissão do vendedor automaticamente
              </label>
            </form>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="utility-import-form"
            disabled={!extracted || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Confirmar e Adicionar Dados'}
          </button>
        </div>
      </div>
    </div>
  );
}
