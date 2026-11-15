export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDateBR(isoDate?: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('T')[0].split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const MONTH_FULL_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${MONTH_NAMES_PT[idx]}/${y}`;
}

export function formatMonthFull(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${MONTH_FULL_PT[idx]} de ${y}`;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
