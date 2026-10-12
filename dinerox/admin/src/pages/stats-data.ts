/** Données de boStats (agrégats uniquement, aucune donnée individuelle). */
import { call } from '../api';

export interface StatsCurrent {
  users: number;
  active7: number;
  families: number;
  plans: { free: number; plus: number; family: number };
  suspended: number;
  signups: number;
  byCountry?: Record<string, number>;
  entryShares?: Record<'voice' | 'text_phrase' | 'quick_manual' | 'full_form', number>;
  entryTotal?: number;
  generatedAt: number;
}
export interface StatsPoint {
  day: string;
  signups: number | null;
  users: number | null;
  active7: number | null;
  suspended: number | null;
}
export interface Stats {
  current: StatsCurrent;
  series: StatsPoint[];
}

export const loadStats = (days: 7 | 30 | 90) => call<Stats>('boStats', { days });

export const pointsOf = (series: StatsPoint[], key: 'signups' | 'active7') => series.filter((p) => typeof p[key] === 'number').map((p) => ({ day: p.day, value: p[key] as number }));

export const ENTRY_LABELS: [keyof NonNullable<StatsCurrent['entryShares']>, string][] = [
  ['voice', 'Voix'],
  ['text_phrase', 'Phrase écrite'],
  ['quick_manual', 'Saisie rapide'],
  ['full_form', 'Formulaire complet'],
];
