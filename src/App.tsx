import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  BarChart3,
  Briefcase,
  Building2,
  Database,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Receipt,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { ClientsView } from './components/ClientsView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { InvoicesView } from './components/InvoicesView.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { PlantsView } from './components/PlantsView.tsx';
import { ReceiptPreviewModal } from './components/ReceiptPreviewModal.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { SellersView } from './components/SellersView.tsx';
import { INITIAL_DB } from './data/seedData.ts';
import { auth, loginWithGoogle, logoutUser } from './firebase.ts';
import {
  createInvoiceInFirestore,
  deleteClientFromFirestore,
  deletePlantFromFirestore,
  deleteSellerFromFirestore,
  ensureUserProfile,
  markInvoicePaidInFirestore,
  saveClientToFirestore,
  saveMonthlyPerformanceToFirestore,
  savePlantToFirestore,
  saveSellerToFirestore,
  subscribeUserDatabase,
} from './services/firestoreDb.ts';
import type {
  AppDatabase,
  Client,
  Invoice,
  MonthlyPerformanceRecord,
  PaymentMethod,
  Seller,
  SolarPlant,
} from './types.ts';

type NavTab = 'dashboard' | 'plants' | 'clients' | 'invoices' | 'sellers' | 'reports';

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'plants', label: 'Plantas Solares', icon: Building2 },
  { id: 'clients', label: 'Clientes e Consumo', icon: Users },
  { id: 'invoices', label: 'Faturas e Recibos', icon: Receipt },
  { id: 'sellers', label: 'Vendedores', icon: Briefcase },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
];

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'Visão Detalhada da Operação',
  plants: 'Cadastro de Mini Usinas Solares',
  clients: 'Clientes, Consumo e Faturas',
  invoices: 'Controle de Faturas e Recibos',
  sellers: 'Vendedores e Comissões por Período',
  reports: 'Relatórios Mensais de Performance',
};

const FALLBACK_AVATAR = '/src/assets/images/avatar_gestor_usina_1794695948412.jpg';

export default function App() {
  const [db, setDb] = useState<AppDatabase>(INITIAL_DB);
  const dbRef = useRef<AppDatabase>(INITIAL_DB);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewReceiptInvoice, setPreviewReceiptInvoice] = useState<Invoice | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Firebase Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3600);
  };

  const handleFriendlyDbError = (err: unknown, fallbackMsg: string) => {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Quota exceeded')) {
      showToast('Limite diário de uso do banco atingido. A cota será redefinida amanhã.');
    } else {
      showToast(fallbackMsg);
    }
  };

  const requireLogin = (reason?: string) => {
    setLoginReason(reason);
    setLoginModalOpen(true);
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        dbRef.current = INITIAL_DB;
        setDb(INITIAL_DB);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) return;

    let active = true;
    setLoading(true);
    setPreviewReceiptInvoice(null);
    let unsubscribeDb: (() => void) | null = null;

    ensureUserProfile(currentUser)
      .then(() => {
        if (!active) return;
        unsubscribeDb = subscribeUserDatabase(
          currentUser.uid,
          (nextDb) => {
            if (!active) return;
            dbRef.current = nextDb;
            setDb(nextDb);
            setLoading(false);
          },
          (err) => {
            if (!active) return;
            setLoading(false);
            handleFriendlyDbError(err, 'Erro ao sincronizar os dados da sua conta.');
          },
        );
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        handleFriendlyDbError(err, 'Não foi possível inicializar o banco da sua conta.');
      });

    return () => {
      active = false;
      if (unsubscribeDb) unsubscribeDb();
    };
  }, [authReady, currentUser?.uid]);

  const handleDirectGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await loginWithGoogle();
      showToast('Login realizado! Seu banco de dados exclusivo foi carregado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível entrar com o Google.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('A janela de login foi fechada antes da conclusão.');
      } else {
        setAuthError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const ensureAuthenticatedUid = (): string | null => {
    if (!currentUser) {
      requireLogin('Faça login com sua conta Google para acessar seu banco de dados.');
      return null;
    }
    return currentUser.uid;
  };

  const handleSavePlant = async (plant: SolarPlant, isNew: boolean) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    try {
      await savePlantToFirestore(uid, plant, isNew);
      showToast(isNew ? 'Mini usina cadastrada com sucesso.' : 'Mini usina atualizada.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível salvar a mini usina.');
    }
  };

  const handleDeletePlant = async (id: string) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    try {
      await deletePlantFromFirestore(uid, id);
      showToast('Planta removida do cadastro.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível remover a mini usina.');
    }
  };

  const handleSaveMonthlyGeneration = async (record: MonthlyPerformanceRecord) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    const existing = dbRef.current.monthlyPerformance.some(
      (m) => m.plantId === record.plantId && m.month === record.month,
    );
    try {
      await saveMonthlyPerformanceToFirestore(uid, record, existing);
      showToast(
        existing
          ? `Geração mensal (${record.month}) atualizada com sucesso.`
          : `Geração mensal (${record.month}) adicionada com sucesso.`,
      );
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível salvar a geração mensal.');
    }
  };

  const handleSaveClient = async (client: Client, isNew: boolean) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    const previousHistory = isNew
      ? []
      : dbRef.current.clients.find((c) => c.id === client.id)?.consumptionHistory ?? [];
    try {
      await saveClientToFirestore(uid, client, isNew, previousHistory);
      showToast(isNew ? 'Cliente cadastrado com sucesso.' : 'Dados do cliente e consumo atualizados.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível salvar os dados do cliente.');
    }
  };

  const handleDeleteClient = async (id: string) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    const history = dbRef.current.clients.find((c) => c.id === id)?.consumptionHistory ?? [];
    try {
      await deleteClientFromFirestore(uid, id, history);
      showToast('Cliente removido.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível remover o cliente.');
    }
  };

  const handleSaveSeller = async (seller: Seller, isNew: boolean) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    try {
      await saveSellerToFirestore(uid, seller, isNew);
      showToast(isNew ? 'Vendedor cadastrado com sucesso.' : 'Dados do vendedor atualizados.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível salvar o vendedor.');
    }
  };

  const handleDeleteSeller = async (id: string) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    try {
      await deleteSellerFromFirestore(uid, id);
      showToast('Vendedor removido.');
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível remover o vendedor.');
    }
  };

  const handleCreateInvoice = async (invoice: Invoice) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    try {
      await createInvoiceInFirestore(uid, invoice);
      showToast(`Fatura ${invoice.number} emitida.`);
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível emitir a fatura.');
    }
  };

  const handleMarkInvoicePaid = async (
    invoice: Invoice,
    method: PaymentMethod,
    paidAt: string,
  ) => {
    const uid = ensureAuthenticatedUid();
    if (!uid) return;
    const receiptNumber =
      invoice.receiptNumber || `REC-2026-${Math.floor(1000 + Math.random() * 8999)}`;
    const updated: Invoice = {
      ...invoice,
      status: 'paga',
      paymentMethod: method,
      paidAt,
      receiptNumber,
    };
    try {
      await markInvoicePaidInFirestore(uid, updated);
      setPreviewReceiptInvoice(updated);
      showToast(`Pagamento confirmado · Recibo ${receiptNumber} gerado.`);
    } catch (err) {
      handleFriendlyDbError(err, 'Não foi possível confirmar o pagamento da fatura.');
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setActiveTab('dashboard');
    showToast('Sessão encerrada.');
  };

  const overdueCount = db.invoices.filter((i) => i.status === 'vencida').length;
  const canEdit = Boolean(currentUser);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-slate-900 text-amber-400 flex items-center justify-center">
              <Sun className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-slate-900">Sertão Solar</span>
          </div>
          <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
          <div className="h-10 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-900 text-white px-6 py-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Sertão Solar</h1>
              <p className="text-xs text-slate-300">Gestão de Mini Usinas Solares</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-slate-900">
                Acesse seu banco de dados exclusivo
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Cada conta Google possui um ambiente isolado na nuvem para cadastrar e gerenciar suas
                próprias usinas solares, clientes, faturas, comissões e relatórios em PDF.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                <Database className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                <span>Dados salvos e sincronizados automaticamente por conta logada.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>Nenhuma outra conta tem acesso às informações do seu login.</span>
              </div>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-md px-3.5 py-2.5">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={handleDirectGoogleLogin}
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 text-sm font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {signingIn ? 'Conectando ao Google...' : 'Entrar com Google'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderSidebarAccount = (compactMobile = false) => (
    <div className="p-4 border-t border-slate-200 space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={currentUser.photoURL || FALLBACK_AVATAR}
          alt={currentUser.displayName || 'Gestor Sertão Solar'}
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">
            {currentUser.displayName || 'Gestor Autenticado'}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {currentUser.email || 'Banco de dados vinculado'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (compactMobile) setMobileMenuOpen(false);
          handleLogout();
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sair da conta
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          <div className="w-8 h-8 rounded-md bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Sertão Solar
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Menu principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'invoices' && overdueCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      active ? 'text-amber-300' : 'text-red-700 font-semibold'
                    }`}
                  >
                    {overdueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {renderSidebarAccount(false)}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-base font-bold text-slate-900">Sertão Solar</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            {renderSidebarAccount(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 contextual action on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
              aria-label="Abrir navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Sertão Solar</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{TAB_TITLES[activeTab]}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab !== 'reports' ? (
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Relatórios PDF
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Voltar ao Dashboard
              </button>
            )}
          </div>
        </header>

        <main key={currentUser.uid} className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-14 bg-white border border-slate-200 rounded-lg animate-pulse" />
              <div className="grid grid-cols-4 gap-4">
                <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
                <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
                <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
                <div className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  plants={db.plants}
                  clients={db.clients}
                  sellers={db.sellers}
                  invoices={db.invoices}
                  monthlyPerformance={db.monthlyPerformance}
                  onNavigateTab={(t) => setActiveTab(t)}
                />
              )}

              {activeTab === 'plants' && (
                <PlantsView
                  plants={db.plants}
                  clients={db.clients}
                  monthlyPerformance={db.monthlyPerformance}
                  canEdit={canEdit}
                  onRequireLogin={requireLogin}
                  onSavePlant={handleSavePlant}
                  onDeletePlant={handleDeletePlant}
                  onSaveMonthlyGeneration={handleSaveMonthlyGeneration}
                />
              )}

              {activeTab === 'clients' && (
                <ClientsView
                  clients={db.clients}
                  plants={db.plants}
                  sellers={db.sellers}
                  invoices={db.invoices}
                  canEdit={canEdit}
                  onRequireLogin={requireLogin}
                  getAuthToken={getAuthToken}
                  onSaveClient={handleSaveClient}
                  onDeleteClient={handleDeleteClient}
                  onCreateInvoice={handleCreateInvoice}
                  onMarkInvoicePaid={handleMarkInvoicePaid}
                  onPreviewReceipt={(inv) => setPreviewReceiptInvoice(inv)}
                />
              )}

              {activeTab === 'invoices' && (
                <InvoicesView
                  invoices={db.invoices}
                  clients={db.clients}
                  plants={db.plants}
                  sellers={db.sellers}
                  canEdit={canEdit}
                  onRequireLogin={requireLogin}
                  onCreateInvoice={handleCreateInvoice}
                  onMarkInvoicePaid={handleMarkInvoicePaid}
                  onPreviewReceipt={(inv) => setPreviewReceiptInvoice(inv)}
                />
              )}

              {activeTab === 'sellers' && (
                <SellersView
                  sellers={db.sellers}
                  clients={db.clients}
                  invoices={db.invoices}
                  canEdit={canEdit}
                  onRequireLogin={requireLogin}
                  onSaveSeller={handleSaveSeller}
                  onDeleteSeller={handleDeleteSeller}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsView
                  plants={db.plants}
                  clients={db.clients}
                  sellers={db.sellers}
                  invoices={db.invoices}
                  monthlyPerformance={db.monthlyPerformance}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Receipt Preview Modal */}
      {previewReceiptInvoice && (
        <ReceiptPreviewModal
          invoice={previewReceiptInvoice}
          client={db.clients.find((c) => c.id === previewReceiptInvoice.clientId)}
          plant={db.plants.find((p) => p.id === previewReceiptInvoice.plantId)}
          seller={db.sellers.find((s) => s.id === previewReceiptInvoice.sellerId)}
          onClose={() => setPreviewReceiptInvoice(null)}
        />
      )}

      {/* Firebase Google Login Modal */}
      {loginModalOpen && (
        <LoginModal
          reason={loginReason}
          onClose={() => {
            setLoginModalOpen(false);
            setLoginReason(undefined);
          }}
          onSuccess={() => {
            showToast('Login realizado com sucesso!');
          }}
        />
      )}

      {/* Subtle Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-lg border border-slate-700"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
