const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const dayMs = 86400000;
export const toMs = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b.slice(0, 10)) - toMs(a.slice(0, 10))) / dayMs);

export function fmtDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}
export function fmtUtc(iso: string): string {
  return `${fmtDate(iso)}, ${iso.slice(11, 16)} UTC`;
}
export const fmtNum = (v: number, digits = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
