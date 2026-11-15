export type PlantStatus = 'operacional' | 'manutencao' | 'alerta';
export type InvoiceStatus = 'paga' | 'pendente' | 'vencida';
export type PaymentMethod = 'PIX' | 'Boleto' | 'Transferência' | 'Cartão';

export interface SolarPlant {
  id: string;
  code: string;
  name: string;
  ucNumber: string;
  city: string;
  state: string;
  capacityKwp: number;
  inverterModel: string;
  inverterCount: number;
  panelCount: number;
  tariffPerKwh: number;
  commissionedAt: string;
  status: PlantStatus;
  imageUrl: string;
  monthlyTargetKwh: number;
}

export interface ConsumptionRecord {
  id: string;
  month: string; // YYYY-MM
  consumedKwh: number;
  compensatedKwh: number;
  gridCostWithoutSolar: number;
  billedAmount: number;
}

export interface Client {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  city: string;
  ucNumber: string;
  plantId: string;
  contractedKwh: number;
  discountPct: number;
  fixedDiscountBrl?: number;
  sellerId: string;
  commissionPct: number;
  contractStartDate: string;
  status: 'ativo' | 'suspenso';
  consumptionHistory: ConsumptionRecord[];
}

export interface Seller {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  region: string;
  defaultCommissionPct: number;
  pixKey: string;
  joinedAt: string;
  status: 'ativo' | 'inativo';
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  plantId: string;
  sellerId: string;
  commissionPctSnapshot: number;
  referenceMonth: string; // YYYY-MM
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  kwhCompensated: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  commissionAmount: number;
  status: InvoiceStatus;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  receiptNumber?: string;
}

export interface MonthlyPerformanceRecord {
  month: string; // YYYY-MM
  plantId: string;
  generatedKwh: number;
  expectedKwh: number;
  compensatedKwh: number;
  performanceRatioPct: number;
  availabilityPct: number;
  co2AvoidedTons: number;
  maintenanceExpense?: number;
  utilityExpense?: number;
  leaseExpense?: number;
  otherExpenses?: number;
  totalExpenses?: number;
  expenseNotes?: string;
}

export interface AppDatabase {
  plants: SolarPlant[];
  sellers: Seller[];
  clients: Client[];
  invoices: Invoice[];
  monthlyPerformance: MonthlyPerformanceRecord[];
}
