import { AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';
import type { InvoiceStatus, PlantStatus } from '../types.ts';

export function InvoiceStatusLabel({ status }: { status: InvoiceStatus }) {
  if (status === 'paga') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Paga
      </span>
    );
  }
  if (status === 'vencida') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Vencida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Pendente
    </span>
  );
}

export function PlantStatusLabel({ status }: { status: PlantStatus }) {
  if (status === 'operacional') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Operacional
      </span>
    );
  }
  if (status === 'manutencao') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Em Manutenção
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Alerta Técnico
    </span>
  );
}
