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
import { ActionError, useActions, type Draft } from '@/store/actions';
import type { Transaction } from '@/core/types';
import { useMoney } from '@/hooks/useFinance';
import { useToast } from '@/components/ui';
import { dailyAllowanceV2 } from '@/core/allowance';
import { spendPlan } from '@/core/spendPlan';
import type { SourceChoice } from '@/core/writePlans';
import { today } from '@/core/dates';
import type { CurrencyCode } from '@/core/money';
import type { EntryDraft } from '@/core/entry/parse';
import { recordEntrySuccess } from '@/services/entryStats';
import { analytics } from '@/services/analytics';
import { reserveEligible } from '@/core/reserve';
import { markReviewMoment } from '@/services/storeReview';
import { defaultSpendingAccountId, spendingAccounts } from '@/core/savingsCircle';
import { withLedgerView } from '@/core/nature';

export type EntryMethod = 'voice' | 'text_phrase' | 'quick_manual' | 'full_form';

/**
 * Cercle fermé : message gardé pendant la conversation (enregistrement « inline », dont le bilan
 * est dans la feuille) et montré, avec « Retirer de mon épargne ou d'un objectif », à sa fermeture.
 */
let heldNotice: { message: string; amount: number } | null = null;
export const UNDO_MS = 5000;

export function useEntrySave() {
  const { t } = useI18n();
  const toast = useToast();
  const money = useMoney();
  const actions = useActions();
  const { engine, activeSpace, user, profile, role } = useApp();

  /** Message de confirmation : reste par jour recalculé APRÈS l'enregistrement. */
  const confirmation = useCallback(() => {
    if (!engine || !activeSpace) return t('entry.saved');
    // Argent disponible v2 : LA même fonction que l'accueil, le simulateur et la conversation.
    const r = dailyAllowanceV2({ data: withLedgerView(engine.getData(activeSpace.id)), currency: activeSpace.currency as CurrencyCode, today: today(), payDay: profile?.financial?.payDay ?? null });
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
   * dépense (`redirectedTo` : compte courant utilisé) → « Retirer de mon épargne ou d'un
   * objectif ». Argent disponible v2 (§6.3) : le message « Pas assez d'argent » APRÈS coup
   * disparaît — le contrôle passe AVANT l'enregistrement (rien n'est enregistré sinon).
   */
  const circleNotice = useCallback(
    (ids: string[], redirectedTo?: string | null): { message: string; amount: number } | null => {
      if (!engine || !activeSpace) return null;
      const d = withLedgerView(engine.getData(activeSpace.id));
      const currency = activeSpace.currency;
      const saved = d.transactions.filter((x) => ids.includes(x.id) && !x.deleted && x.currency === currency);
      if (redirectedTo) {
        const name = d.accounts.find((a) => a.id === redirectedTo)?.name ?? '';
        const amount = saved.filter((x) => x.type === 'expense' && x.accountId === redirectedTo).reduce((n, x) => n + x.amount, 0);
        return { message: t('circle.redirect', { account: name }), amount };
      }
      return null;
    },
    [engine, activeSpace, t],
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
    /** `choices` : compléments choisis sur la feuille (§6.3), appliqués dans le même lot que la sortie. */
    (drafts: EntryDraft[], method: EntryMethod, corrected = false, inline = false, choices: SourceChoice[] = []): string[] => {
      if (!activeSpace) throw new Error('notReady');
      const ids: string[] = [];
      const createdCategories: string[] = [];
      /** Complément du cumul (§6.3), écrit avant les lignes ; retiré avec elles si besoin. */
      let complementIds: string[] = [];
      // §6.1 — Plusieurs lignes : le contrôle porte sur le CUMUL par compte, AVANT tout
      // enregistrement (la part prise sur une réserve est déduite d'abord). Rien n'est écrit sinon.
      if (engine && !choices.length) {
        const d = engine.getData(activeSpace.id);
        const fallback = defaultSpendingAccountId(d.accounts, null, activeSpace.currency) ?? '';
        const lines = drafts
          .filter((x) => x.type === 'expense' && x.amount && !x.tontine)
          .map((x) => ({ accountId: x.accountId ?? fallback ?? null, amount: x.amount as number, date: x.date, reserveId: x.reserveId && reserveEligible(x.categoryId, x.subcategoryId) ? x.reserveId : null }));
        const plan = lines.length ? spendPlan({ data: d, currency: activeSpace.currency as CurrencyCode, today: today(), lines: lines.map((l) => ({ ...l, accountId: l.accountId || null })), role }) : null;
        if (plan?.status === 'no_money') throw new ActionError('noMoney', { errors: ['money.none'] });
        if (plan && plan.status !== 'ok') throw new ActionError('shortfall', { errors: ['money.shortfall'], accountId: plan.shortfalls[0].accountId, missing: plan.shortfalls[0].missing, sources: plan.shortfalls[0].sources });
      }
      try {
        // 1.9 — « Je crée la catégorie X » (réponse dans la conversation) : créée ici, à la validation,
        // avec le mot entendu comme mot-clé (la prochaine fois, plus de question).
        drafts = drafts.map((d) => {
          if (d.categoryId || !d.newCategoryName || d.type === 'savings') return d;
          const cat = actions.saveCategory({ kind: d.type, name: d.newCategoryName, icon: 'pricetag', color: '#64748B', order: 999, parentId: null, keywords: [normalizeWord(d.newCategoryName)] });
          createdCategories.push(cat.id);
          return { ...d, categoryId: cat.id, subcategoryId: null, suggested: { categoryId: cat.id, subcategoryId: null } };
        });
        // §6.1 + §6.3 — Le complément choisi couvre le CUMUL des dépenses de la note, en une fois :
        // ensuite chaque ligne passe sans nouvelle feuille (sinon la 2e ligne redemanderait).
        if (choices.length) {
          const accountsNow = engine ? engine.getData(activeSpace.id).accounts : [];
          const fallback = defaultSpendingAccountId(accountsNow, null, activeSpace.currency) ?? '';
          complementIds = actions.coverGroupShortfall(
            drafts
              .filter((x) => x.type === 'expense' && x.amount && !x.tontine)
              .map((x) => ({
                draft: { type: 'expense', amount: x.amount as number, currency: activeSpace.currency, date: x.date, accountId: x.accountId ?? fallback, categoryId: x.categoryId, subcategoryId: x.subcategoryId, payee: x.payee, note: null } as Draft<Transaction>,
                reserveId: x.reserveId && reserveEligible(x.categoryId, x.subcategoryId) ? x.reserveId : null,
              })),
            choices,
          );
        }
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
          // « Prendre sur la réserve ? » accepté sur la carte : utilisation liée, dans le même lot.
          const reserveId = d.reserveId && d.type === 'expense' && reserveEligible(d.categoryId, d.subcategoryId) ? d.reserveId : null;
          const accountsNow = engine ? engine.getData(activeSpace.id).accounts : [];
          const tx = actions.saveTransaction(
            {
              type: d.type,
              amount: d.amount as number,
              currency: activeSpace.currency,
              date: d.date,
              // Aucun compte courant : « Espèces » est créé APRÈS le contrôle (règle 10), jamais l'épargne.
              accountId: d.accountId ?? defaultSpendingAccountId(accountsNow, null, activeSpace.currency) ?? '',
              categoryId: d.categoryId,
              subcategoryId: d.subcategoryId,
              payee: d.payee,
              note: null,
            },
            // Note déjà contrôlée au cumul et complétée : pas de second contrôle ligne à ligne
            // (une ligne datée d'hier serait vue sans le complément, daté d'aujourd'hui).
            complementIds.length ? { reserveId, covered: true } : { reserveId, choices },
          );
          ids.push(tx.id);
        }
        // « Annuler » (5 s) retire aussi le complément : tout le groupe, d'un coup.
        ids.push(...complementIds);
      } catch (e) {
        // Échec en cours de route : rien de partiel (les lignes, le complément et les catégories déjà créés sont retirés).
        for (const id of [...ids, ...complementIds.filter((x) => !ids.includes(x))]) actions.remove('transactions', id);
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
      else heldNotice = circleNotice(ids, redirected?.accountId ?? null);
      return ids;
    },
    [actions, activeSpace, user, undoToast, engine, circleNotice, role],
  );

  /** Message gardé pendant la conversation (null s'il n'y en a pas) : la conversation le dit tout de suite. */
  const takeHeldNotice = useCallback(() => heldNotice?.message ?? null, []);
  /** À la fermeture de la feuille : le message gardé, avec le bouton de retrait. */
  const flushHeldNotice = useCallback(() => {
    const n = heldNotice;
    heldNotice = null;
    if (!n) return;
    toast.show(n.message, 'warning', { duration: 9000, actions: [{ label: t('circle.withdraw'), onPress: () => router.push({ pathname: '/withdraw', params: { amount: String(n.amount) } }) }] });
  }, [toast, t]);

  return { saveDrafts, undoToast, undo, takeHeldNotice, flushHeldNotice };
}
