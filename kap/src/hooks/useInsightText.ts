import { useCallback } from 'react';
import { useI18n, hasKey } from '@/i18n';
import { useMoney } from './useFinance';
import type { Insight } from '@/core/insights';

/** Clés dont la valeur est un montant à formater. */
const MONEY_PARAMS = new Set(['amount', 'over', 'remaining', 'before', 'monthly', 'total', 'income', 'budget', 'free', 'available', 'savings', 'goals', 'committed', 'after', 'capacity', 'needed', 'gap', 'spent', 'saving', 'expense', 'incomeBefore', 'planned']);

/** Formate les paramètres : montants → devise, dates ISO → « 12 octobre ». */
export function useFormatParams() {
  const money = useMoney();
  const { date, monthYear } = useI18n();
  return useCallback(
    (params: Record<string, string | number> = {}, opts: { monthDates?: boolean } = {}) => {
      const out: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(params)) {
        if (MONEY_PARAMS.has(k) && typeof v === 'number') out[k] = money(v);
        else if (k === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = opts.monthDates ? monthYear(v) : date(v);
        else out[k] = v;
      }
      return out;
    },
    [money, date, monthYear],
  );
}

export function useInsightText() {
  const { t } = useI18n();
  const fmt = useFormatParams();
  return useCallback(
    (i: Insight) => {
      const key = i.kind === 'envelope_threshold' ? `ins.envelope_threshold.${i.params.level}` : `ins.${i.kind}`;
      return hasKey(key) ? t(key, fmt(i.params, { monthDates: i.kind === 'goal_eta' })) : '';
    },
    [t, fmt],
  );
}
