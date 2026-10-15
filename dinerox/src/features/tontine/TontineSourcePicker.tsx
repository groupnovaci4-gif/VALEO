/**
 * « Payer depuis » une cotisation de tontine (carnet et tontine partagée) —
 * cercle fermé (fondateur, 2026-10-14) : un compte courant, un compte
 * d'épargne ou un objectif (réserve comprise, s'il contient assez). Payée
 * depuis l'épargne ou un objectif, la cotisation reste de l'épargne : le
 * disponible ne change pas. Depuis un compte courant qui ne suffit pas, on
 * propose de la payer directement depuis l'épargne ou un objectif.
 */
import React from 'react';
import { ChipGroup, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { goalSaved } from '@/core/balance';
import { moneyTracked, shortfallAfter, type TontineSource } from '@/core/savingsCircle';
import type { CurrencyCode } from '@/core/money';

const encode = (s: TontineSource) => (s.kind === 'account' ? `acc:${s.accountId}` : `goal:${s.goalId}`);
const decode = (v: string): TontineSource => (v.startsWith('goal:') ? { kind: 'goal', goalId: v.slice(5) } : { kind: 'account', accountId: v.slice(4) });

/** Sources possibles : comptes actifs de la devise, puis objectifs qui contiennent au moins la cotisation. */
export function useTontineSources(currency: string, amount: number) {
  const { data } = useFinance();
  const accounts = data.accounts.filter((a) => a.active && !a.deleted && a.currency === currency).sort((a, b) => Number(a.isSavings) - Number(b.isSavings));
  const goals = data.goals.filter((g) => !g.deleted && (g.status === 'active' || g.status === 'paused') && g.currency === currency && goalSaved(g, data.goalContributions) >= amount);
  return { accounts, goals };
}

export function TontineSourcePicker({ currency, amount, value, onChange }: { currency: string; amount: number; value: TontineSource | null; onChange: (s: TontineSource) => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const { data, position } = useFinance();
  const { accounts, goals } = useTontineSources(currency, amount);
  const chosenAccount = value?.kind === 'account' ? accounts.find((a) => a.id === value.accountId) : undefined;
  const fromCircle = value?.kind === 'goal' || !!chosenAccount?.isSavings;
  // Disponible insuffisant (seulement si la personne a renseigné son argent) : proposer l'épargne ou un objectif.
  const short = !fromCircle && !!chosenAccount && moneyTracked(data.accounts, data.transactions, currency) && shortfallAfter(position.free, amount) !== null && (goals.length > 0 || accounts.some((a) => a.isSavings));
  return (
    <>
      <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
        {t('tontine.payFrom')}
      </Text>
      <ChipGroup
        scroll
        value={value ? encode(value) : null}
        onChange={(v) => onChange(decode(v))}
        options={[
          ...accounts.map((a) => ({ value: `acc:${a.id}`, label: a.name, icon: a.icon, color: a.color })),
          ...goals.map((g) => ({ value: `goal:${g.id}`, label: `${g.icon} ${g.name} · ${money(goalSaved(g, data.goalContributions), { currency: g.currency as CurrencyCode })}` })),
        ]}
      />
      {fromCircle ? (
        <Text variant="caption" tone="subtle" style={{ marginBottom: 10 }}>
          {t('tontine.payFromCircle')}
        </Text>
      ) : short ? (
        <Text variant="caption" tone="warning" style={{ marginBottom: 10 }}>
          {t('tontine.payShortfall')}
        </Text>
      ) : null}
    </>
  );
}
