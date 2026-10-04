/**
 * Internationalisation : dictionnaires typés + interpolation `{param}`.
 * Langue initiale : français ; anglais prêt ; d'autres langues (dioula,
 * wolof…) s'ajoutent en créant un fichier et en l'inscrivant dans DICTS.
 */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { getLocales } from 'expo-localization';
import { fr, type TKey } from './fr';
import { en } from './en';
import { brand } from '@/config/brand';
import type { Language } from '@/core/types';
import { parseISODate, type ISODate } from '@/core/dates';

export type { TKey };

const DICTS: Record<Language, Record<TKey, string>> = { fr, en };
export const LANGUAGES: Language[] = ['fr', 'en'];
export const LANGUAGE_NAMES: Record<Language, string> = { fr: 'Français', en: 'English' };

export type Params = Record<string, string | number | null | undefined>;

export function translate(lang: Language, key: TKey, params?: Params): string {
  const raw = DICTS[lang]?.[key] ?? fr[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (k === 'app') return brand.name;
    const v = params?.[k];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode ?? 'fr';
  return (LANGUAGES as string[]).includes(code) ? (code as Language) : 'fr';
}

const MONTHS: Record<Language, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** « 12 octobre 2026 » / « October 12, 2026 ». Format maison : identique sur tous les moteurs JS. */
export function formatDate(lang: Language, date: ISODate, opts: { year?: boolean } = {}): string {
  const d = parseISODate(date);
  const m = MONTHS[lang][d.getMonth()];
  const withYear = opts.year ?? d.getFullYear() !== new Date().getFullYear();
  if (lang === 'en') return `${m} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`;
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${m}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

/** « décembre 2028 ». */
export function formatMonthYear(lang: Language, date: ISODate): string {
  const d = parseISODate(date.length === 7 ? `${date}-01` : date);
  const m = MONTHS[lang][d.getMonth()];
  return lang === 'fr' ? `${m} ${d.getFullYear()}` : `${m} ${d.getFullYear()}`;
}

export function monthName(lang: Language, monthIndex0: number): string {
  return MONTHS[lang][monthIndex0];
}

interface I18nValue {
  lang: Language;
  t: (key: TKey, params?: Params) => string;
  date: (d: ISODate, opts?: { year?: boolean }) => string;
  monthYear: (d: ISODate) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'fr',
  t: (k, p) => translate('fr', k, p),
  date: (d, o) => formatDate('fr', d, o),
  monthYear: (d) => formatMonthYear('fr', d),
});

export function I18nProvider({ lang, children }: { lang: Language; children: React.ReactNode }) {
  const t = useCallback((key: TKey, params?: Params) => translate(lang, key, params), [lang]);
  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t,
      date: (d, o) => formatDate(lang, d, o),
      monthYear: (d) => formatMonthYear(lang, d),
    }),
    [lang, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** Vrai si la clé existe (clés dynamiques : catégories, insights…). */
export function hasKey(key: string): key is TKey {
  return key in fr;
}
