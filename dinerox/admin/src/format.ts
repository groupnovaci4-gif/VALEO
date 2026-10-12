/** Formats d'affichage. Montants : formatMoney de l'app (src/core/money.ts), jamais réinventé. */
import { formatMoney } from '@app/core/money';
import { COUNTRY_PROFILES, OTHER_COUNTRY } from '@app/core/countries';

export { formatMoney };

const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (ms: number | null | undefined) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtDateTime = (ms: number | null | undefined) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${fmtDate(ms)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
/** « 2026-10-11 » → « 11/10/2026 ». */
export const fmtIsoDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
export const fmtNumber = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const fmtPercent = (v: number, total: number) => (total ? `${(Math.round((v / total) * 1000) / 10).toString().replace('.', ',')} %` : '0 %');

export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '—';
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return fmtDate(ms);
}

export function remaining(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((ms - now) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${p2(min % 60)}`;
}

const COUNTRIES = new Map([...COUNTRY_PROFILES, OTHER_COUNTRY].map((c) => [c.code, c.name.fr]));
export const countryName = (code: string | null | undefined) => (code ? COUNTRIES.get(code) ?? code : '—');
export const countryOptions = () => [...COUNTRY_PROFILES, OTHER_COUNTRY].map((c) => ({ code: c.code, name: c.name.fr, currency: c.currency }));

export const initials = (first: string, last: string, email?: string | null) => {
  const s = `${(first || '').trim()[0] ?? ''}${(last || '').trim()[0] ?? ''}`.toUpperCase();
  return s || (email ? email[0].toUpperCase() : '?');
};
