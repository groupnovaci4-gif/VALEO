/**
 * Calculs dérivés de l'espace actif, mémorisés : soldes, position,
 * enveloppes, analyses. Les écrans n'implémentent AUCUNE formule.
 */
import { useCallback, useMemo } from 'react';
import { useApp, useData } from '@/store/app';
import { useI18n, hasKey } from '@/i18n';
import { accountBalances, flowTotals, moneyPosition } from '@/core/balance';
import { budgetSummary, envelopeStatuses } from '@/core/budget';
import { computeInsights } from '@/core/insights';
import { monthKey, periodOf, today } from '@/core/dates';
import { formatMoney, type CurrencyCode } from '@/core/money';
import type { Account, Category } from '@/core/types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/core/defaults';

export function useCurrency(): CurrencyCode {
  const { activeSpace, profile } = useApp();
  return activeSpace?.currency ?? profile?.currency ?? 'XOF';
}

/** Formateur de montants dans la devise de l'espace (ou une autre). */
export function useMoney() {
  const currency = useCurrency();
  return useCallback((minor: number, opts?: Parameters<typeof formatMoney>[2] & { currency?: string }) => formatMoney(minor, opts?.currency ?? currency, opts), [currency]);
}

/** Libellés des catégories : système (traduits) ou personnalisées (nom saisi). */
export function useCategoryLabels() {
  const { t } = useI18n();
  const data = useData();
  return useMemo(() => {
    const byId = new Map<string, Category>(data.categories.map((c) => [c.id, c]));
    const fallback = new Map<string, string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c.key]));
    const label = (c: Category | undefined, id: string): string => {
      if (c?.labelKey && hasKey(c.labelKey)) return c.name || t(c.labelKey);
      if (c?.name) return c.name;
      const key = fallback.get(id);
      if (key && hasKey(key)) return t(key);
      return t('tx.uncategorized');
    };
    const meta = (id: string | null | undefined) => {
      const c = id ? byId.get(id) : undefined;
      const seed = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((s) => s.id === id);
      return { name: label(c, id ?? ''), icon: c?.icon ?? seed?.icon ?? 'pricetag', color: c?.color ?? seed?.color ?? '#94A3B8' };
    };
    const sorted = (kind: 'income' | 'expense') =>
      data.categories
        .filter((c) => c.kind === kind)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, ...meta(c.id) }));
    return { label, byId: (id: string) => label(byId.get(id), id), meta, list: sorted };
  }, [data.categories, t]);
}

export function useAccountLabel() {
  const { t } = useI18n();
  const data = useData();
  return useCallback(
    (id: string | null | undefined) => {
      const a = data.accounts.find((x) => x.id === id);
      return a ? a.name : t('common.none');
    },
    [data.accounts, t],
  );
}

export function useFinance() {
  const data = useData();
  const currency = useCurrency();
  const labels = useCategoryLabels();
  const now = today();
  const month = monthKey(now);
  return useMemo(() => {
    const balances = accountBalances(data.accounts, data.transactions);
    const position = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
    const flows = flowTotals(data.transactions, periodOf('month', now), currency);
    const envelopes = envelopeStatuses(data.envelopes, data.transactions, data.budgets, month, currency);
    const budget = budgetSummary(envelopes, flows.expense);
    const insights = computeInsights({ data, currency, now, categoryName: labels.label });
    const activeAccounts: Account[] = data.accounts.filter((a) => a.active).sort((a, b) => a.order - b.order);
    return { data, currency, now, month, balances, position, flows, envelopes, budget, insights, activeAccounts };
  }, [data, currency, now, month, labels.label]);
}
