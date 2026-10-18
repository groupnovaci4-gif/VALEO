/**
 * Feuille de complément — argent disponible v2 (docs/argent-disponible.md §6.2, §6.3, §6.5).
 *
 * Toute action qui fait sortir de l'argent passe par `useMoneyGuard().guard(run)` : `run` reçoit
 * les choix déjà faits sur la feuille. Si l'action est refusée (`ActionError` `noMoney` /
 * `shortfall`), la feuille s'ouvre AVANT tout enregistrement :
 *  - aucun argent renseigné : « Indiquez d'abord votre argent disponible… » + bouton vers l'accueil ;
 *  - il manque de l'argent : les sources qui suffisent seules, dans l'ordre du §6.3, puis
 *    « J'ai reçu de l'argent » (nature à choisir, jamais un revenu par défaut) et « Annuler » ;
 *    un choix relance l'action avec ce choix — complément et sortie en UN lot ; un autre compte
 *    à compléter rouvre la feuille avec les sources recalculées ;
 *  - un enfant n'a qu'un choix : « Demander à un parent ».
 * Aucun calcul ici : les sources viennent du cœur (`ActionError.details.sources`).
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { ActionError } from '@/store/actions';
import { useMoney } from '@/hooks/useFinance';
import { useActionErrorMessage } from '@/hooks/useRunAction';
import { Button, Sheet, Text, useToast } from '@/components/ui';
import type { SourceChoice } from '@/core/writePlans';
import type { SpendSource } from '@/core/spendPlan';

type Run = (choices: SourceChoice[]) => unknown;

/** Erreur déjà traitée par l'écran (message affiché, formulaire ouvert) : la feuille ne dit rien de plus. */
export class HandledError extends Error {}
interface Pending {
  run: Run;
  choices: SourceChoice[];
  error: ActionError;
  onDone?: () => void;
}

interface Guard {
  /** Exécute une sortie d'argent ; en cas de manque, ouvre la feuille. Renvoie true si l'action a réussi tout de suite. */
  guard: (run: Run, opts?: { onDone?: () => void }) => boolean;
}

const Ctx = createContext<Guard | null>(null);

export function useMoneyGuard(): Guard {
  const g = useContext(Ctx);
  if (!g) throw new Error('MoneyGuardProvider manquant');
  return g;
}

const toChoice = (s: SpendSource): SourceChoice | null => {
  if (s.kind === 'set_aside' || s.kind === 'goal') return { kind: s.kind, goalId: s.goalId, accountId: s.accountId };
  if (s.kind === 'account' || s.kind === 'savings') return { kind: s.kind, accountId: s.accountId };
  return null;
};

export function MoneyGuardProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const message = useActionErrorMessage();
  const [pending, setPending] = useState<Pending | null>(null);
  const [received, setReceived] = useState(false);
  const busy = useRef(false);

  const attempt = useCallback(
    (run: Run, choices: SourceChoice[], onDone?: () => void): boolean => {
      try {
        run(choices);
        setPending(null);
        setReceived(false);
        onDone?.();
        return true;
      } catch (e) {
        if (e instanceof ActionError && (e.code === 'noMoney' || e.code === 'shortfall')) {
          setPending({ run, choices, error: e, onDone });
          return false;
        }
        setPending(null);
        if (!(e instanceof HandledError)) toast.show(message(e), 'error');
        return false;
      }
    },
    [toast, message],
  );

  const guard = useCallback((run: Run, opts?: { onDone?: () => void }) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      return attempt(run, [], opts?.onDone);
    } finally {
      busy.current = false;
    }
  }, [attempt]);

  const value = useMemo(() => ({ guard }), [guard]);
  const close = () => {
    setPending(null);
    setReceived(false);
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {pending ? (
        <ComplementSheet
          pending={pending}
          received={received}
          onReceived={() => setReceived(true)}
          onChoose={(c) => attempt(pending.run, [...pending.choices, c], pending.onDone)}
          onClose={close}
        />
      ) : null}
    </Ctx.Provider>
  );
}

function ComplementSheet({ pending, received, onReceived, onChoose, onClose }: { pending: Pending; received: boolean; onReceived: () => void; onChoose: (c: SourceChoice) => void; onClose: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const data = useData();
  const { role } = useApp();
  const toast = useToast();
  const { error } = pending;
  const accountName = (id: string | null | undefined) => data.accounts.find((a) => a.id === id)?.name ?? t('acc.type.cash');
  const goalName = (id: string) => data.goals.find((g) => g.id === id)?.name ?? '';
  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  if (error.code === 'noMoney') {
    return (
      <Sheet visible onClose={onClose} title={t('daily.needsIncome')}>
        <Text>{t(role === 'child' ? 'money.askParent.body' : 'error.money.none')}</Text>
        {role !== 'child' ? <Button full label={t('daily.needsIncome.cta')} onPress={() => go('/')} /> : null}
        <Button full variant="ghost" label={t('common.cancel')} onPress={onClose} />
      </Sheet>
    );
  }

  const missing = error.details.missing ?? 0;
  const account = accountName(error.details.accountId);
  const title = t('money.sheet.title', { amount: money(missing), account });

  // §6.5 : un enfant n'a qu'un seul choix.
  if (role === 'child') {
    return (
      <Sheet visible onClose={onClose} title={title}>
        <Button
          full
          label={t('money.askParent')}
          onPress={() => {
            toast.show(t('money.askParent.body'), 'info');
            onClose();
          }}
        />
        <Button full variant="ghost" label={t('common.cancel')} onPress={onClose} />
      </Sheet>
    );
  }

  if (received) {
    const q = `accountId=${encodeURIComponent(error.details.accountId ?? '')}&amount=${missing}`;
    return (
      <Sheet visible onClose={onClose} title={t('money.received.title')}>
        <Button full variant="secondary" label={t('money.received.income')} onPress={() => go(`/transaction/new?type=income&${q}`)} />
        <Button full variant="secondary" label={t('money.received.loan')} onPress={() => go(`/debts/edit?direction=i_owe&${q}`)} />
        <Button full variant="secondary" label={t('money.received.repayment')} onPress={() => go('/debts')} />
        <Button full variant="secondary" label={t('money.received.pot')} onPress={() => go('/tontines')} />
        <Button full variant="ghost" label={t('common.cancel')} onPress={onClose} />
      </Sheet>
    );
  }

  const sources = (error.details.sources ?? []).filter((s) => s.kind !== 'received');
  const label = (s: SpendSource) => {
    if (s.kind === 'set_aside') return t('money.source.setAside', { goal: goalName(s.goalId), account: accountName(s.accountId) });
    if (s.kind === 'account') return t('money.source.account', { account: accountName(s.accountId), amount: money(s.free) });
    if (s.kind === 'savings') return t('money.source.savings', { account: accountName(s.accountId), amount: money(s.free) });
    if (s.kind === 'goal') return t('money.source.goal', { goal: goalName(s.goalId), account: accountName(s.accountId), amount: money(s.free) });
    return t('money.source.received');
  };
  return (
    <Sheet visible onClose={onClose} title={title}>
      <View style={{ gap: 8 }}>
        {!sources.length ? <Text tone="danger">{t('money.insufficient')}</Text> : null}
        {sources.map((s, i) => {
          const c = toChoice(s);
          return c ? <Button key={i} full variant={i === 0 ? 'primary' : 'secondary'} label={label(s)} onPress={() => onChoose(c)} /> : null;
        })}
        <Button full variant="secondary" label={t('money.source.received')} onPress={onReceived} />
        <Button full variant="ghost" label={t('common.cancel')} onPress={onClose} />
      </View>
    </Sheet>
  );
}
