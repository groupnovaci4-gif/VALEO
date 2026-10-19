/**
 * Calculs dérivés de l'espace actif, mémorisés : soldes, position,
 * enveloppes, analyses. Les écrans n'implémentent AUCUNE formule.
 */
import { useCallback, useMemo } from 'react';
import { useApp, useData } from '@/store/app';
import { useI18n, hasKey } from '@/i18n';
import { flowTotals, moneyPosition } from '@/core/balance';
import { budgetSummary, debtRepaymentsInMonth, envelopeStatuses, envelopeUpcoming, outsideEnvelopeSpent } from '@/core/budget';
import { withLedgerView } from '@/core/nature';
import { balancesAt, positionOf, upcomingByAccount } from '@/core/position';
import { unallocated } from '@/core/allowance';
import { monthSummary } from '@/core/monthSummary';
import { computeInsights } from '@/core/insights';
import { monthKey, periodOf, today } from '@/core/dates';
import { formatMoney, type CurrencyCode } from '@/core/money';
import type { Account, Category } from '@/core/types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/core/defaults';
import { budgetTransactions } from '@/core/reserve';
import { CATALOG_LABEL_PREFIX, catalogLabel, effectiveTransactions } from '@/core/categoryCatalog';
import { useCategoryCatalog } from '@/services/categoryCatalog';

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
  const { t, lang } = useI18n();
  const data = useData();
  const catalog = useCategoryCatalog();
  return useMemo(() => {
    const byId = new Map<string, Category>(data.categories.map((c) => [c.id, c]));
    const fallback = new Map<string, string>([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c.key]));
    const label = (c: Category | undefined, id: string): string => {
      // 1.8 : libellé du catalogue (traduit, corrigeable à distance) ; un nom saisi par l'utilisateur prime.
      if (c?.labelKey?.startsWith(CATALOG_LABEL_PREFIX)) return c.name || catalogLabel(id, lang === 'en' ? 'en' : 'fr', catalog) || t('tx.uncategorized');
      if (c?.labelKey && hasKey(c.labelKey)) return c.name || t(c.labelKey);
      if (c?.name) return c.name;
      const key = fallback.get(id);
      if (key && hasKey(key)) return t(key);
      return t('tx.uncategorized');
    };
    const meta = (id: string | null | undefined) => {
      const c = id ? byId.get(id) : undefined;
      const seed = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((s) => s.id === id);
      return { name: label(c, id ?? ''), icon: c?.icon ?? seed?.icon ?? 'pricetag', color: c?.color ?? seed?.color ?? '#94A3B8', emoji: c?.emoji };
    };
    // Catégories principales uniquement (les sous-catégories s'affichent sous leur parent).
    const sorted = (kind: 'income' | 'expense') =>
      data.categories
        .filter((c) => c.kind === kind && !c.parentId)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, ...meta(c.id) }));
    /** Sous-catégories d'une catégorie (icône et couleur du parent). */
    const children = (parentId: string | null | undefined) => {
      if (!parentId) return [];
      const parent = meta(parentId);
      return data.categories
        .filter((c) => c.parentId === parentId)
        .sort((a, b) => a.order - b.order || label(a, a.id).localeCompare(label(b, b.id)))
        .map((c) => ({ id: c.id, name: label(c, c.id), icon: parent.icon, color: parent.color, emoji: parent.emoji, fixed: !!c.fixed }));
    };
    return { label, byId: (id: string) => label(byId.get(id), id), meta, list: sorted, children };
  }, [data.categories, t, lang, catalog]);
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
  const raw = useData();
  const catalog = useCategoryCatalog();
  // Calculs (rapports, budgets, analyses, export) : une opération dont la sous-catégorie a
  // changé de parent est comptée sous le nouveau parent. Rien n'est réécrit en base.
  const data = useMemo(() => {
    // Vue des calculs : alias de catégories (1.8), liens anciens (tontine, dette) et NATURE de chaque
    // opération (argent disponible v2, §2.3). Rien n'est réécrit en base.
    const transactions = effectiveTransactions(raw.transactions, raw.categories, catalog);
    return withLedgerView(transactions === raw.transactions ? raw : { ...raw, transactions });
  }, [raw, catalog]);
  const { profile, activeSpace } = useApp();
  const payDay = profile?.financial?.payDay ?? null;
  const currency = useCurrency();
  const labels = useCategoryLabels();
  const now = today();
  const month = monthKey(now);
  return useMemo(() => {
    // Audit B5 : UN seul solde, celui d'aujourd'hui (comme l'accueil et l'IA) ; l'avenir à part.
    const balances = balancesAt(data.accounts, data.transactions, now);
    const upcoming = upcomingByAccount(data.accounts, data.transactions, now);
    const position = moneyPosition(data.accounts, data.transactions, data.goals, data.goalContributions, currency);
    const flows = flowTotals(data.transactions, periodOf('month', now), currency);
    const envelopes = envelopeStatuses(data.envelopes, budgetTransactions(data.transactions, data.goalContributions), data.budgets, month, currency, data.accounts);
    // « Dépenses hors enveloppe » : même base que les enveloppes (part d'une réserve exclue, §9).
    // Le capital remboursé n'est ni dans une enveloppe ni hors enveloppe : ligne à part (§9, E44b).
    const budget = {
      ...budgetSummary(envelopes, flows.expense),
      unassigned: outsideEnvelopeSpent(data.envelopes, data.transactions, data.goalContributions, month, currency),
      debtRepayments: debtRepaymentsInMonth(data.transactions, month, currency),
    };
    // Argent disponible v2 (§4) : Argent disponible / Mis de côté / Total de vos comptes.
    const money = positionOf(data, currency, now);
    // Reste à répartir (§9).
    const toAllocate = unallocated({ data, currency, today: now, payDay });
    // Mois en cours (audit I1, I2, I5) : calcul des rapports, jusqu'à aujourd'hui ; « à venir » et
    // autres devises à part. Épargne nette du mois : même calcul.
    const monthSum = monthSummary(data, currency, now);
    const monthNetSavings = monthSum.savings;
    const envelopeSoon = envelopeUpcoming(data, currency, now);
    const insights = computeInsights({ data, currency, now, categoryName: labels.label });
    const activeAccounts: Account[] = data.accounts.filter((a) => a.active).sort((a, b) => a.order - b.order);
    return { data, currency, now, month, balances, upcoming, monthSum, envelopeSoon, position, money, toAllocate, monthNetSavings, payDay, spaceKind: activeSpace?.kind ?? 'personal', flows, envelopes, budget, insights, activeAccounts };
  }, [data, currency, now, month, labels.label, payDay, activeSpace?.kind]);
}
