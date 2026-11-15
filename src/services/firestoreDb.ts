import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import type {
  AppDatabase,
  Client,
  ConsumptionRecord,
  Invoice,
  MonthlyPerformanceRecord,
  Seller,
  SolarPlant,
} from '../types.ts';

function clampStr(value: string | undefined | null, maxLen: number): string {
  return String(value ?? '').slice(0, maxLen);
}

function clampNum(value: number | undefined | null, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const email = clampStr(user.email, 256);
  const displayName = clampStr(user.displayName || user.email || 'Gestor', 200);

  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  try {
    if (!exists) {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export function subscribeUserDatabase(
  uid: string,
  onData: (database: AppDatabase) => void,
  onError: (error: Error) => void,
): () => void {
  let plants: SolarPlant[] = [];
  let sellers: Seller[] = [];
  let rawClients: Omit<Client, 'consumptionHistory'>[] = [];
  let consumptions: (ConsumptionRecord & { clientId: string })[] = [];
  let invoices: Invoice[] = [];
  let monthlyPerformance: MonthlyPerformanceRecord[] = [];

  const readyFlags = {
    plants: false,
    sellers: false,
    clients: false,
    consumptions: false,
    invoices: false,
    monthlyPerformance: false,
  };

  const emitIfReady = () => {
    if (
      !readyFlags.plants ||
      !readyFlags.sellers ||
      !readyFlags.clients ||
      !readyFlags.consumptions ||
      !readyFlags.invoices ||
      !readyFlags.monthlyPerformance
    ) {
      return;
    }

    const hydratedClients: Client[] = rawClients.map((cli) => ({
      ...cli,
      consumptionHistory: consumptions
        .filter((r) => r.clientId === cli.id)
        .map(({ clientId: _clientId, ...rest }) => rest)
        .sort((a, b) => a.month.localeCompare(b.month)),
    }));

    onData({
      plants,
      sellers,
      clients: hydratedClients,
      invoices,
      monthlyPerformance,
    });
  };

  const handleListenerError = (path: string) => (error: unknown) => {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch (wrapped) {
      onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const plantsPath = `users/${uid}/plants`;
  const unsubPlants = onSnapshot(
    query(collection(db, plantsPath), where('ownerId', '==', uid)),
    (snap) => {
      plants = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            code: String(data.code || ''),
            name: String(data.name || ''),
            ucNumber: String(data.ucNumber || ''),
            city: String(data.city || ''),
            state: String(data.state || ''),
            capacityKwp: Number(data.capacityKwp || 0),
            inverterModel: String(data.inverterModel || ''),
            inverterCount: Number(data.inverterCount || 0),
            panelCount: Number(data.panelCount || 0),
            tariffPerKwh: Number(data.tariffPerKwh || 0),
            commissionedAt: String(data.commissionedAt || ''),
            status: (data.status as SolarPlant['status']) || 'operacional',
            imageUrl: String(data.imageUrl || ''),
            monthlyTargetKwh: Number(data.monthlyTargetKwh || 0),
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
      readyFlags.plants = true;
      emitIfReady();
    },
    handleListenerError(plantsPath),
  );

  const sellersPath = `users/${uid}/sellers`;
  const unsubSellers = onSnapshot(
    query(collection(db, sellersPath), where('ownerId', '==', uid)),
    (snap) => {
      sellers = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || ''),
            document: String(data.document || ''),
            email: String(data.email || ''),
            phone: String(data.phone || ''),
            region: String(data.region || ''),
            defaultCommissionPct: Number(data.defaultCommissionPct || 0),
            pixKey: String(data.pixKey || ''),
            joinedAt: String(data.joinedAt || ''),
            status: (data.status as Seller['status']) || 'ativo',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      readyFlags.sellers = true;
      emitIfReady();
    },
    handleListenerError(sellersPath),
  );

  const clientsPath = `users/${uid}/clients`;
  const unsubClients = onSnapshot(
    query(collection(db, clientsPath), where('ownerId', '==', uid)),
    (snap) => {
      rawClients = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || ''),
            document: String(data.document || ''),
            email: String(data.email || ''),
            phone: String(data.phone || ''),
            city: String(data.city || ''),
            ucNumber: String(data.ucNumber || ''),
            plantId: String(data.plantId || ''),
            contractedKwh: Number(data.contractedKwh || 0),
            discountPct: Number(data.discountPct || 0),
            fixedDiscountBrl: Number(data.fixedDiscountBrl || 0),
            sellerId: String(data.sellerId || ''),
            commissionPct: Number(data.commissionPct || 0),
            contractStartDate: String(data.contractStartDate || ''),
            status: (data.status as Client['status']) || 'ativo',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      readyFlags.clients = true;
      emitIfReady();
    },
    handleListenerError(clientsPath),
  );

  const consumptionsPath = `users/${uid}/consumptions`;
  const unsubConsumptions = onSnapshot(
    query(collection(db, consumptionsPath), where('ownerId', '==', uid)),
    (snap) => {
      consumptions = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          clientId: String(data.clientId || ''),
          month: String(data.month || ''),
          consumedKwh: Number(data.consumedKwh || 0),
          compensatedKwh: Number(data.compensatedKwh || 0),
          gridCostWithoutSolar: Number(data.gridCostWithoutSolar || 0),
          billedAmount: Number(data.billedAmount || 0),
        };
      });
      readyFlags.consumptions = true;
      emitIfReady();
    },
    handleListenerError(consumptionsPath),
  );

  const invoicesPath = `users/${uid}/invoices`;
  const unsubInvoices = onSnapshot(
    query(collection(db, invoicesPath), where('ownerId', '==', uid)),
    (snap) => {
      invoices = snap.docs
        .map((d) => {
          const data = d.data();
          const inv: Invoice = {
            id: String(data.id || d.id),
            number: String(data.number || ''),
            clientId: String(data.clientId || ''),
            plantId: String(data.plantId || ''),
            sellerId: String(data.sellerId || ''),
            commissionPctSnapshot: Number(data.commissionPctSnapshot || 0),
            referenceMonth: String(data.referenceMonth || ''),
            issueDate: String(data.issueDate || ''),
            dueDate: String(data.dueDate || ''),
            kwhCompensated: Number(data.kwhCompensated || 0),
            grossAmount: Number(data.grossAmount || 0),
            discountAmount: Number(data.discountAmount || 0),
            netAmount: Number(data.netAmount || 0),
            commissionAmount: Number(data.commissionAmount || 0),
            status: (data.status as Invoice['status']) || 'pendente',
          };
          if (data.paidAt) inv.paidAt = String(data.paidAt);
          if (data.paymentMethod) inv.paymentMethod = data.paymentMethod as Invoice['paymentMethod'];
          if (data.receiptNumber) inv.receiptNumber = String(data.receiptNumber);
          return inv;
        })
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
      readyFlags.invoices = true;
      emitIfReady();
    },
    handleListenerError(invoicesPath),
  );

  const perfPath = `users/${uid}/monthlyPerformance`;
  const unsubPerf = onSnapshot(
    query(collection(db, perfPath), where('ownerId', '==', uid)),
    (snap) => {
      monthlyPerformance = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            month: String(data.month || ''),
            plantId: String(data.plantId || ''),
            generatedKwh: Number(data.generatedKwh || 0),
            expectedKwh: Number(data.expectedKwh || 0),
            compensatedKwh: Number(data.compensatedKwh || 0),
            performanceRatioPct: Number(data.performanceRatioPct || 0),
            availabilityPct: Number(data.availabilityPct || 0),
            co2AvoidedTons: Number(data.co2AvoidedTons || 0),
            maintenanceExpense: Number(data.maintenanceExpense || 0),
            utilityExpense: Number(data.utilityExpense || 0),
            leaseExpense: Number(data.leaseExpense || 0),
            otherExpenses: Number(data.otherExpenses || 0),
            totalExpenses: Number(data.totalExpenses || 0),
            expenseNotes: String(data.expenseNotes || ''),
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month) || a.plantId.localeCompare(b.plantId));
      readyFlags.monthlyPerformance = true;
      emitIfReady();
    },
    handleListenerError(perfPath),
  );

  return () => {
    unsubPlants();
    unsubSellers();
    unsubClients();
    unsubConsumptions();
    unsubInvoices();
    unsubPerf();
  };
}

export async function savePlantToFirestore(
  uid: string,
  plant: SolarPlant,
  isNew: boolean,
): Promise<void> {
  const path = `users/${uid}/plants/${plant.id}`;
  const ref = doc(db, 'users', uid, 'plants', plant.id);
  const mutable = {
    code: clampStr(plant.code, 40),
    name: clampStr(plant.name, 160),
    ucNumber: clampStr(plant.ucNumber, 60),
    city: clampStr(plant.city, 120),
    state: clampStr(plant.state, 10),
    capacityKwp: clampNum(plant.capacityKwp),
    inverterModel: clampStr(plant.inverterModel, 120),
    inverterCount: clampNum(plant.inverterCount),
    panelCount: clampNum(plant.panelCount),
    tariffPerKwh: clampNum(plant.tariffPerKwh),
    commissionedAt: clampStr(plant.commissionedAt, 20),
    status: plant.status,
    imageUrl: clampStr(plant.imageUrl, 500),
    monthlyTargetKwh: clampNum(plant.monthlyTargetKwh),
  };

  try {
    if (isNew) {
      await setDoc(ref, {
        id: clampStr(plant.id, 128),
        ownerId: uid,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deletePlantFromFirestore(uid: string, plantId: string): Promise<void> {
  const path = `users/${uid}/plants/${plantId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'plants', plantId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMonthlyPerformanceToFirestore(
  uid: string,
  record: MonthlyPerformanceRecord,
  isExisting: boolean,
): Promise<void> {
  const recordId = `${record.plantId}_${record.month}`;
  const path = `users/${uid}/monthlyPerformance/${recordId}`;
  const ref = doc(db, 'users', uid, 'monthlyPerformance', recordId);
  const maintenanceExpense = clampNum(record.maintenanceExpense);
  const utilityExpense = clampNum(record.utilityExpense);
  const leaseExpense = clampNum(record.leaseExpense);
  const otherExpenses = clampNum(record.otherExpenses);
  const totalExpenses = Number(
    (maintenanceExpense + utilityExpense + leaseExpense + otherExpenses).toFixed(2),
  );

  const mutable = {
    generatedKwh: clampNum(record.generatedKwh),
    expectedKwh: clampNum(record.expectedKwh),
    compensatedKwh: clampNum(record.compensatedKwh),
    performanceRatioPct: clampNum(record.performanceRatioPct, 0, 200),
    availabilityPct: clampNum(record.availabilityPct, 0, 100),
    co2AvoidedTons: clampNum(record.co2AvoidedTons),
    maintenanceExpense,
    utilityExpense,
    leaseExpense,
    otherExpenses,
    totalExpenses,
    expenseNotes: clampStr(record.expenseNotes, 300),
  };

  try {
    if (!isExisting) {
      await setDoc(ref, {
        id: clampStr(recordId, 128),
        ownerId: uid,
        month: clampStr(record.month, 10),
        plantId: clampStr(record.plantId, 128),
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isExisting ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function saveSellerToFirestore(
  uid: string,
  seller: Seller,
  isNew: boolean,
): Promise<void> {
  const path = `users/${uid}/sellers/${seller.id}`;
  const ref = doc(db, 'users', uid, 'sellers', seller.id);
  const mutable = {
    name: clampStr(seller.name, 160),
    document: clampStr(seller.document, 40),
    email: clampStr(seller.email, 256),
    phone: clampStr(seller.phone, 40),
    region: clampStr(seller.region, 120),
    defaultCommissionPct: clampNum(seller.defaultCommissionPct, 0, 100),
    pixKey: clampStr(seller.pixKey, 160),
    joinedAt: clampStr(seller.joinedAt, 20),
    status: seller.status,
  };

  try {
    if (isNew) {
      await setDoc(ref, {
        id: clampStr(seller.id, 128),
        ownerId: uid,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...mutable,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteSellerFromFirestore(uid: string, sellerId: string): Promise<void> {
  const path = `users/${uid}/sellers/${sellerId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'sellers', sellerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveClientToFirestore(
  uid: string,
  client: Client,
  isNew: boolean,
  previousHistory: ConsumptionRecord[],
): Promise<void> {
  const clientPath = `users/${uid}/clients/${client.id}`;
  const clientRef = doc(db, 'users', uid, 'clients', client.id);
  const batch = writeBatch(db);

  const clientMutable = {
    name: clampStr(client.name, 200),
    document: clampStr(client.document, 40),
    email: clampStr(client.email, 256),
    phone: clampStr(client.phone, 40),
    city: clampStr(client.city, 120),
    ucNumber: clampStr(client.ucNumber, 60),
    plantId: clampStr(client.plantId, 128),
    contractedKwh: clampNum(client.contractedKwh),
    discountPct: clampNum(client.discountPct, 0, 100),
    fixedDiscountBrl: clampNum(client.fixedDiscountBrl),
    sellerId: clampStr(client.sellerId, 128),
    commissionPct: clampNum(client.commissionPct, 0, 100),
    contractStartDate: clampStr(client.contractStartDate, 20),
    status: client.status,
  };

  if (isNew) {
    batch.set(clientRef, {
      id: clampStr(client.id, 128),
      ownerId: uid,
      ...clientMutable,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(clientRef, {
      ...clientMutable,
      updatedAt: serverTimestamp(),
    });
  }

  const prevById = new Map(previousHistory.map((r) => [r.id, r]));
  const nextIds = new Set(client.consumptionHistory.map((r) => r.id));

  for (const oldRec of previousHistory) {
    if (!nextIds.has(oldRec.id)) {
      batch.delete(doc(db, 'users', uid, 'consumptions', oldRec.id));
    }
  }

  for (const rec of client.consumptionHistory) {
    const recRef = doc(db, 'users', uid, 'consumptions', rec.id);
    const recMutable = {
      month: clampStr(rec.month, 10),
      consumedKwh: clampNum(rec.consumedKwh),
      compensatedKwh: clampNum(rec.compensatedKwh),
      gridCostWithoutSolar: clampNum(rec.gridCostWithoutSolar),
      billedAmount: clampNum(rec.billedAmount),
    };
    if (prevById.has(rec.id)) {
      batch.update(recRef, {
        ...recMutable,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(recRef, {
        id: clampStr(rec.id, 128),
        ownerId: uid,
        clientId: clampStr(client.id, 128),
        ...recMutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, clientPath);
  }
}

export async function deleteClientFromFirestore(
  uid: string,
  clientId: string,
  consumptionHistory: ConsumptionRecord[],
): Promise<void> {
  const path = `users/${uid}/clients/${clientId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'clients', clientId));
  for (const rec of consumptionHistory) {
    batch.delete(doc(db, 'users', uid, 'consumptions', rec.id));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createInvoiceInFirestore(uid: string, invoice: Invoice): Promise<void> {
  const path = `users/${uid}/invoices/${invoice.id}`;
  const ref = doc(db, 'users', uid, 'invoices', invoice.id);
  const payload: Record<string, unknown> = {
    id: clampStr(invoice.id, 128),
    ownerId: uid,
    number: clampStr(invoice.number, 60),
    clientId: clampStr(invoice.clientId, 128),
    plantId: clampStr(invoice.plantId, 128),
    sellerId: clampStr(invoice.sellerId, 128),
    commissionPctSnapshot: clampNum(invoice.commissionPctSnapshot, 0, 100),
    referenceMonth: clampStr(invoice.referenceMonth, 10),
    issueDate: clampStr(invoice.issueDate, 20),
    dueDate: clampStr(invoice.dueDate, 20),
    kwhCompensated: clampNum(invoice.kwhCompensated),
    grossAmount: clampNum(invoice.grossAmount),
    discountAmount: clampNum(invoice.discountAmount),
    netAmount: clampNum(invoice.netAmount),
    commissionAmount: clampNum(invoice.commissionAmount),
    status: invoice.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (invoice.paidAt) payload.paidAt = clampStr(invoice.paidAt, 20);
  if (invoice.paymentMethod) payload.paymentMethod = invoice.paymentMethod;
  if (invoice.receiptNumber) payload.receiptNumber = clampStr(invoice.receiptNumber, 60);

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function markInvoicePaidInFirestore(uid: string, invoice: Invoice): Promise<void> {
  const path = `users/${uid}/invoices/${invoice.id}`;
  const ref = doc(db, 'users', uid, 'invoices', invoice.id);
  try {
    await updateDoc(ref, {
      status: 'paga',
      paidAt: clampStr(invoice.paidAt, 20),
      paymentMethod: invoice.paymentMethod || 'PIX',
      receiptNumber: clampStr(invoice.receiptNumber, 60),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
