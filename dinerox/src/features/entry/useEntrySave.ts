/**
 * Enregistrement d'une saisie (voix, phrase, saisie rapide) : via `useActions`
 * (validation, droits, outbox hors ligne), puis message « Enregistré ✓ — il
 * vous reste X par jour » avec « Voir » et « Annuler » pendant 5 secondes.
 */
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useMoney } from '@/hooks/useFinance';
import { useToast } from '@/components/ui';
import { dailyAllowance } from '@/core/dailyAllowance';
import { today } from '@/core/dates';
import type { CurrencyCode } from '@/core/money';
import type { EntryDraft } from '@/core/entry/parse';
import { recordEntrySuccess } from '@/services/entryStats';
import { analytics } from '@/services/analytics';

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
    const r = dailyAllowance({ data: engine.getData(activeSpace.id), currency: activeSpace.currency as CurrencyCode, today: today(), financial: profile?.financial });
    return r.status === 'ok' ? t('entry.savedPerDay', { amount: money(r.perDay) }) : t('entry.saved');
  }, [engine, activeSpace, profile?.financial, t, money]);

  /** « Voir » (Historique) et « Annuler » (suppression des opérations créées), 5 secondes. */
  const undoToast = useCallback(
    (ids: string[]) =>
      toast.show(confirmation(), 'success', {
        duration: UNDO_MS,
        actions: [
          {
            label: t('entry.toast.view'),
            onPress: () => router.push('/transactions?from=toast'),
          },
          {
            label: t('entry.toast.undo'),
            onPress: () => {
              try {
                for (const id of ids) actions.remove('transactions', id);
                toast.show(t('entry.undone'), 'info');
              } catch {
                toast.show(t('error.generic'), 'error');
              }
            },
          },
        ],
      }),
    [toast, confirmation, actions, t],
  );

  /** Enregistre les lignes confirmées ; renvoie les identifiants créés. */
  const saveDrafts = useCallback(
    (drafts: EntryDraft[], method: EntryMethod, corrected = false): string[] => {
      if (!activeSpace) throw new Error('notReady');
      const ids: string[] = [];
      try {
        for (const d of drafts) {
          const tx = actions.saveTransaction({
            type: d.type,
            amount: d.amount as number,
            currency: activeSpace.currency,
            date: d.date,
            accountId: d.accountId ?? '',
            categoryId: d.categoryId,
            subcategoryId: d.subcategoryId,
            payee: d.payee,
            note: null,
          });
          ids.push(tx.id);
        }
      } catch (e) {
        // Échec en cours de route : rien de partiel (les lignes déjà créées sont retirées).
        for (const id of ids) actions.remove('transactions', id);
        throw e;
      }
      analytics.track('entry_created', { method, count: drafts.length });
      if (method === 'voice' && corrected) analytics.track('voice_entry_corrected', { method });
      if (user) void recordEntrySuccess(user.uid, { voice: method === 'voice', items: drafts.map((d) => ({ type: d.type, categoryId: d.categoryId, accountId: d.accountId })) }).catch(() => undefined);
      undoToast(ids);
      return ids;
    },
    [actions, activeSpace, user, undoToast],
  );

  return { saveDrafts, undoToast };
}
