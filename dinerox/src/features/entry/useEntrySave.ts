/**
 * Enregistrement d'une saisie (voix, phrase, saisie rapide) : via `useActions`
 * (validation, droits, outbox hors ligne), puis message « Enregistré ✓ — il
 * vous reste X par jour » avec « Voir » et « Annuler » pendant 5 secondes.
 */
import { learnableWord } from '@/core/entry/keywords';
import { normalizeWord } from '@/core/categoryCatalog';
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { ActionError, useActions } from '@/store/actions';
import { useMoney } from '@/hooks/useFinance';
import { useToast } from '@/components/ui';
import { dailyAllowance } from '@/core/dailyAllowance';
import { today } from '@/core/dates';
import type { CurrencyCode } from '@/core/money';
import type { EntryDraft } from '@/core/entry/parse';
import { recordEntrySuccess } from '@/services/entryStats';
import { analytics } from '@/services/analytics';
import { reserveEligible } from '@/core/reserve';
import { markReviewMoment } from '@/services/storeReview';
import { moneyTracked, shortfallAfter, spendingAccounts } from '@/core/savingsCircle';
import { moneyPosition } from '@/core/balance';
import { withCircleView } from '@/core/savingsFlows';

export type EntryMethod = 'voice' | 'text_phrase' | 'quick_manual' | 'full_form';
export const UNDO_MS = 5000;

export function useEntrySave() {
  const { t } = useI18n();
  const toast = useToast();
  const money = useMoney();
  const actions = useActions();
  const { engine, activeSpace, user, profile } = useApp();

  /** Message de confirmation : reste par jour recalculé APRÈS l'enregistrement. */
  const confirmation = useCallback(() => {
    if (!engine || !activeSpace) return t('entry.saved');
    const r = dailyAllowance({ data: withCircleView(engine.getData(activeSpace.id)), currency: activeSpace.currency as CurrencyCode, today: today(), financial: profile?.financial });
    return r.status === 'ok' ? t('entry.savedPerDay', { amount: money(r.perDay) }) : t('entry.saved');
  }, [engine, activeSpace, profile?.financial, t, money]);

  /** Annule tout le groupe d'opérations créées (un seul « Annuler »). */
  const undo = useCallback(
    (ids: string[]) => {
      try {
        for (const id of ids) actions.remove('transactions', id);
        toast.show(t('entry.undone'), 'info');
        return true;
      } catch {
        toast.show(t('error.generic'), 'error');
        return false;
      }
    },
    [actions, toast, t],
  );

  /**
   * Cercle fermé (2026-10-14), après l'enregistrement : la phrase nommait l'épargne pour une
   * dépense (`redirectedTo` : compte courant utilisé) ou le disponible est passé SOUS zéro.
   * Dans les deux cas : « Retirer de mon épargne ou d'un objectif » (montant proposé).
   * Jamais si la personne n'a jamais renseigné son argent (`moneyTracked`).
   */
  const circleNotice = useCallback(
    (ids: string[], redirectedTo?: string | null): { message: string; amount: number } | null => {
      if (!engine || !activeSpace) return null;
      const d = withCircleView(engine.getData(activeSpace.id));
      const currency = activeSpace.currency;
      const saved = d.transactions.filter((x) => ids.includes(x.id) && !x.deleted && x.currency === currency);
      if (redirectedTo) {
        const name = d.accounts.find((a) => a.id === redirectedTo)?.name ?? '';
        const amount = saved.filter((x) => x.type === 'expense' && x.accountId === redirectedTo).reduce((n, x) => n + x.amount, 0);
        return { message: t('circle.redirect', { account: name }), amount };
      }
      const spending = new Set(spendingAccounts(d.accounts, currency).map((a) => a.id));
      const outflow = saved.filter((x) => x.type === 'expense' && spending.has(x.accountId)).reduce((n, x) => n + x.amount, 0);
      if (!outflow || !moneyTracked(d.accounts, d.transactions, currency)) return null;
      const free = moneyPosition(d.accounts, d.transactions, d.goals, d.goalContributions, currency as CurrencyCode).free;
      const missing = shortfallAfter(free + outflow, outflow);
      return missing ? { message: t('circle.shortfall', { amount: money(missing) }), amount: missing } : null;
    },
    [engine, activeSpace, t, money],
  );

  /** « Voir » (Historique) et « Annuler » (suppression des opérations créées), 5 secondes. */
  const undoToast = useCallback(
    (ids: string[], opts?: { redirectedTo?: string | null }) => {
      const notice = circleNotice(ids, opts?.redirectedTo);
      if (notice) {
        toast.show(notice.message, 'warning', {
          duration: 9000,
          actions: [
            { label: t('circle.withdraw'), onPress: () => router.push({ pathname: '/withdraw', params: { amount: String(notice.amount) } }) },
            { label: t('entry.toast.undo'), onPress: () => void undo(ids) },
          ],
        });
        return;
      }
      toast.show(confirmation(), 'success', {
        duration: UNDO_MS,
        actions: [
          {
            label: t('entry.toast.view'),
            onPress: () => router.push('/transactions?from=toast'),
          },
          { label: t('entry.toast.undo'), onPress: () => void undo(ids) },
        ],
      });
    },
    [toast, confirmation, undo, t, circleNotice],
  );

  /** Enregistre les lignes confirmées ; renvoie les identifiants créés. */
  const saveDrafts = useCallback(
    /** `inline` : la conversation affiche elle-même le bilan et « Annuler » (le message serait caché par la feuille). */
    (drafts: EntryDraft[], method: EntryMethod, corrected = false, inline = false): string[] => {
      if (!activeSpace) throw new Error('notReady');
      const ids: string[] = [];
      const createdCategories: string[] = [];
      try {
        // 1.9 — « Je crée la catégorie X » (réponse dans la conversation) : créée ici, à la validation,
        // avec le mot entendu comme mot-clé (la prochaine fois, plus de question).
        drafts = drafts.map((d) => {
          if (d.categoryId || !d.newCategoryName || d.type === 'savings') return d;
          const cat = actions.saveCategory({ kind: d.type, name: d.newCategoryName, icon: 'pricetag', color: '#64748B', order: 999, parentId: null, keywords: [normalizeWord(d.newCategoryName)] });
          createdCategories.push(cat.id);
          return { ...d, categoryId: cat.id, subcategoryId: null, suggested: { categoryId: cat.id, subcategoryId: null } };
        });
        for (const d of drafts) {
          // Ligne liée à une tontine : opération réelle + entrée de tontine, en une fois.
          if (d.tontine && d.amount) {
            const entry = actions.recordTontine({ tontineId: d.tontine.id, period: d.tontine.period, kind: d.tontine.kind, amount: d.amount, date: d.date, accountId: d.accountId });
            if (entry.transactionId) ids.push(entry.transactionId);
            continue;
          }
          // 1.9 — Versement d'épargne dans une liste : logique de « Mon épargne » (transfert, jamais une dépense).
          if (d.type === 'savings') {
            if (!d.savings?.savingsAccountId || !d.amount) throw new ActionError('validation');
            const fromAccountId = d.accountId && d.accountId !== d.savings.savingsAccountId ? d.accountId : null;
            const tx = actions.depositToSavings({ savingsAccountId: d.savings.savingsAccountId, amount: d.amount, date: d.date, fromAccountId, goal: d.savings.goalId ? { goalId: d.savings.goalId, amount: d.amount } : null });
            ids.push(tx.id);
            continue;
          }
          const tx = actions.saveTransaction({
            type: d.type,
            amount: d.amount as number,
            currency: activeSpace.currency,
            date: d.date,
            // Aucun compte courant : « Espèces » est créé (règle 10), jamais l'épargne.
            accountId: d.accountId ?? actions.ensureCashAccount(activeSpace.currency),
            categoryId: d.categoryId,
            subcategoryId: d.subcategoryId,
            payee: d.payee,
            note: null,
          });
          ids.push(tx.id);
          // « Prendre sur la réserve ? » accepté sur la carte : utilisation liée à l'opération.
          if (d.reserveId && d.type === 'expense' && reserveEligible(d.categoryId, d.subcategoryId)) actions.takeFromReserve(tx.id, d.reserveId);
        }
      } catch (e) {
        // Échec en cours de route : rien de partiel (les lignes et catégories déjà créées sont retirées).
        for (const id of ids) actions.remove('transactions', id);
        for (const id of createdCategories) actions.remove('categories', id);
        throw e;
      }
      // 1.8 — Correction de catégorie sur la carte : le mot est retenu pour la prochaine fois
      // (sur l'appareil, dans l'espace ; effaçable depuis Catégories). Jamais bloquant.
      for (const d of drafts) {
        const chosen = d.subcategoryId ?? d.categoryId;
        if (!chosen || !d.source || !d.suggested) continue;
        if (d.suggested.categoryId === d.categoryId && d.suggested.subcategoryId === d.subcategoryId) continue;
        const word = learnableWord(d.source);
        if (word) actions.learnCategoryWord(word, chosen);
      }
      // Étape 4 : cagnotte de tontine reçue (saisie confirmée) = moment positif.
      if (drafts.some((d) => d.tontine?.kind === 'payout')) markReviewMoment('tontine');
      analytics.track('entry_created', { method, count: drafts.length });
      if (method === 'voice' && corrected) analytics.track('voice_entry_corrected', { method });
      // « Dernier compte utilisé » : un compte COURANT seulement (cercle fermé).
      const accountsNow = engine && activeSpace ? engine.getData(activeSpace.id).accounts : [];
      const spendingIds = new Set(spendingAccounts(accountsNow).map((a) => a.id));
      if (user) void recordEntrySuccess(user.uid, { voice: method === 'voice', items: drafts.map((d) => ({ type: d.type === 'savings' ? ('transfer' as const) : d.type, categoryId: d.categoryId, accountId: d.accountId && spendingIds.has(d.accountId) ? d.accountId : null })) }).catch(() => undefined);
      const redirected = drafts.find((d) => d.savingsRedirect && d.type === 'expense');
      if (!inline) undoToast(ids, { redirectedTo: redirected?.accountId ?? null });
      return ids;
    },
    [actions, activeSpace, user, undoToast, engine],
  );

  return { saveDrafts, undoToast, undo };
}
