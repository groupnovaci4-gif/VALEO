/**
 * Cartes de l'accueil — argent disponible v2 (docs/argent-disponible.md §4, §6.4, §7.1, §7.2,
 * §8, §12.1). Aucun calcul ici : tout vient du cœur (`positionOf`, `recurringToConfirm`,
 * `toRegularize`, `dailyAllowanceV2`) ; toute écriture passe par `useActions` et, quand de
 * l'argent sort, par la feuille de complément (`useMoneyGuard`).
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { AmountField, Button, Card, ChipGroup, Field, Text, useToast } from '@/components/ui';
import { useMoneyGuard } from './MoneyGuard';
import { recurringToConfirm, type ConfirmCard } from '@/core/recurringConfirm';
import { allowancePeriod, toRegularize, type Commitment } from '@/core/allowance';
import { spendingAccounts } from '@/core/savingsCircle';

/** Occurrences repoussées (« Pas encore ») pour la session : la carte revient au prochain démarrage. */
const snoozed = new Set<string>();

/**
 * « Votre argent disponible aujourd'hui » (§12.1) : un champ par compte courant (Espèces par défaut)
 * et une provenance facultative ; crée les OUVERTURES. Un enfant : « Demandez à un parent… » (§6.5).
 */
export function OpeningCard() {
  const { t } = useI18n();
  const toast = useToast();
  const run = useRunAction();
  const actions = useActions();
  const { role } = useApp();
  const { data, currency, now } = useFinance();
  const accounts = spendingAccounts(data.accounts, currency);
  const lines = accounts.length ? accounts.map((a) => ({ id: a.id as string | null, name: a.name })) : [{ id: null, name: t('acc.type.cash') }];
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [note, setNote] = useState('');
  if (role === 'child') {
    return (
      <Card style={{ gap: 8, marginBottom: 12 }}>
        <Text variant="titleS">{t('daily.needsIncome')}</Text>
        <Text variant="small" tone="muted">
          {t('money.askParent.body')}
        </Text>
      </Card>
    );
  }
  const save = () => {
    const filled = lines.map((l) => ({ accountId: l.id, amount: amounts[l.id ?? 'cash'] ?? 0 })).filter((l) => l.amount > 0);
    if (!filled.length) return;
    if (run(() => actions.declareOpenings({ lines: filled, note, date: now }))) toast.show(t('common.saved'));
  };
  return (
    <Card style={{ gap: 8, marginBottom: 12 }} accessibilityLabel={t('daily.needsIncome')}>
      <Text variant="titleS">{t('daily.needsIncome')}</Text>
      <Text variant="small" tone="muted">
        {t('money.opening.hint')}
      </Text>
      {lines.map((l) => (
        <AmountField key={l.id ?? 'cash'} label={l.name} value={amounts[l.id ?? 'cash'] ?? null} onChange={(v) => setAmounts((m) => ({ ...m, [l.id ?? 'cash']: v }))} currency={currency} />
      ))}
      <Field label={t('acc.opening.note')} hint={t('acc.opening.noteHint')} value={note} onChangeText={setNote} maxLength={200} />
      <Button icon="checkmark" label={t('money.opening.save')} onPress={save} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

/** Compte à solde négatif (deux téléphones, §6.4) : affiché tel quel, avec « Régulariser ». */
export function NegativeCard({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const money = useMoney();
  const { data, money: position } = useFinance();
  if (!position.negatives.length) return null;
  return (
    <>
      {position.negatives.map((id) => {
        const a = data.accounts.find((x) => x.id === id);
        const balance = position.accounts[id]?.balance ?? 0;
        return (
          <Card key={id} tone="danger" style={{ gap: 8, marginBottom: 12 }}>
            <Text variant="bodyStrong" accessibilityRole="alert">
              {t('money.negative.title', { account: a?.name ?? '', amount: hidden ? '••••••' : money(balance) })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button small icon="swap-horizontal" label={t('money.regularize')} onPress={() => router.push({ pathname: '/transaction/new', params: { type: 'transfer', toAccountId: id, amount: String(-balance) } })} />
              <Button small variant="secondary" icon="create-outline" label={t('acc.correct')} onPress={() => router.push({ pathname: '/accounts/edit', params: { id } })} />
            </View>
          </Card>
        );
      })}
    </>
  );
}

/**
 * Cartes « payé ? » / « reçu ? » (§8, D7) : une récurrence n'est jamais enregistrée seule. Une dépense :
 * [Oui, depuis {compte}] [Autre montant] [Pas encore] ; un revenu : montant VISIBLE et modifiable.
 * Puis « Salaire attendu depuis le … : reçu ? » (§7.1) quand la paie n'est pas confirmée.
 */
export function RecurringCards({ hidden }: { hidden?: boolean }) {
  const { date } = useI18n();
  const { data, now, payDay } = useFinance();
  const { role } = useApp();
  const [, refresh] = useState(0);
  const cards = useMemo(() => recurringToConfirm(data, now, payDay).filter((c) => !snoozed.has(c.id)), [data, now, payDay]);
  if (role === 'child') return null;
  const snooze = (c: ConfirmCard) => {
    snoozed.add(c.id);
    refresh((n) => n + 1);
  };
  return (
    <>
      {cards.slice(0, 3).map((c) => (
        <ConfirmCardView key={c.id} card={c} hidden={hidden} onSnooze={() => snooze(c)} />
      ))}
      <SalaryPendingCard hidden={hidden} hasIncomeCard={cards.some((c) => c.type === 'income')} format={date} />
    </>
  );
}

function ConfirmCardView({ card, hidden, onSnooze }: { card: ConfirmCard; hidden?: boolean; onSnooze: () => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const actions = useActions();
  const { guard } = useMoneyGuard();
  const { data, currency, now } = useFinance();
  const rule = data.recurring.find((r) => r.id === card.ruleId);
  const label = rule?.label ?? '';
  // Revenu : le dernier montant reçu pour cette récurrence, sinon le montant prévu — toujours visible et modifiable.
  const lastReceived = data.transactions.filter((x) => !x.deleted && x.recurringId === card.ruleId).sort((a, b) => b.date.localeCompare(a.date))[0]?.amount;
  const [amount, setAmount] = useState<number | null>(card.type === 'income' ? (lastReceived ?? card.amount) : card.amount);
  const [other, setOther] = useState(false);
  const accounts = data.accounts.filter((a) => a.active && !a.deleted && a.currency === currency && (card.type === 'income' || !a.isSavings));
  const [accountId, setAccountId] = useState<string | null>(rule && accounts.some((a) => a.id === rule.accountId) ? rule.accountId : (accounts[0]?.id ?? null));
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? '';
  const confirm = () => {
    if (!accountId || !amount) return;
    guard((choices) => actions.confirmRecurring({ ruleId: card.ruleId, occurrence: card.date, amount, accountId, date: now, choices }), { onDone: () => toast.show(t('common.saved')) });
  };
  const show = (n: number) => (hidden ? '••••••' : money(n));
  return (
    <Card style={{ gap: 8, marginBottom: 12 }}>
      <Text variant="bodyStrong">{card.type === 'expense' ? t('rec.card.expense', { label, amount: show(card.amount) }) : t('rec.card.income', { label })}</Text>
      {card.type === 'income' || other ? <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={currency} /> : null}
      {accounts.length > 1 ? <ChipGroup scroll value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button small icon="checkmark" label={card.type === 'expense' && !other ? t('rec.card.yesFrom', { account: accountName }) : t('common.confirm')} onPress={confirm} />
        {card.type === 'expense' && !other ? <Button small variant="secondary" label={t('rec.card.other')} onPress={() => setOther(true)} /> : null}
        <Button small variant="ghost" label={t('rec.card.notYet')} onPress={onSnooze} />
      </View>
    </Card>
  );
}

function SalaryPendingCard({ hasIncomeCard, format }: { hidden?: boolean; hasIncomeCard: boolean; format: (d: string) => string }) {
  const { t } = useI18n();
  const { data, currency, now, payDay } = useFinance();
  // Même règle que le reste par jour (§7.1) : paie de la période non confirmée.
  const pending = useMemo(() => (!payDay || hasIncomeCard ? null : allowancePeriod(data, currency, now, payDay).salaryPending), [data, currency, now, payDay, hasIncomeCard]);
  if (!pending) return null;
  return (
    <Card style={{ gap: 8, marginBottom: 12 }}>
      <Text variant="bodyStrong">{t('salary.pending', { date: format(pending) })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button small icon="checkmark" label={t('salary.pending.cta')} onPress={() => router.push({ pathname: '/transaction/new', params: { type: 'income', categoryId: 'inc_salary' } })} />
      </View>
    </Card>
  );
}

/**
 * « À régulariser » (§7.2) : échéances non confirmées plus anciennes que la période précédente, hors
 * de E. « Payée » (la confirmer), « Je la dois encore » (une dette due), « Pas due ».
 */
export function RegularizeList({ hidden }: { hidden?: boolean }) {
  const { t, date } = useI18n();
  const money = useMoney();
  const toast = useToast();
  const run = useRunAction();
  const actions = useActions();
  const { guard } = useMoneyGuard();
  const { role } = useApp();
  const { data, currency, now, payDay } = useFinance();
  const items = useMemo(() => toRegularize(data, currency, now, payDay), [data, currency, now, payDay]);
  if (!items.length || role === 'child') return null;
  const labelOf = (c: Commitment) => (c.kind === 'recurring' ? (data.recurring.find((r) => r.id === c.id)?.label ?? '') : (data.tontines.find((x) => x.id === c.id)?.name ?? ''));
  const paid = (c: Commitment) => {
    if (c.kind === 'recurring') {
      const rule = data.recurring.find((r) => r.id === c.id);
      if (!rule) return;
      guard((choices) => actions.confirmRecurring({ ruleId: c.id, occurrence: c.date, date: now, choices }), { onDone: () => toast.show(t('common.saved')) });
    } else router.push({ pathname: '/tontines/[id]', params: { id: c.id } });
  };
  // Tontine : « Je la dois encore » la reporte à aujourd'hui (elle redevient un engagement) ; « Pas due » la marque faite, sans argent.
  const owe = (c: Commitment) => (c.kind === 'recurring' ? run(() => actions.oweRecurringOccurrence(c.id, c.date)) : run(() => actions.postponeTontine({ tontineId: c.id, period: c.period ?? 1, amount: c.amount, date: now })));
  const notDue = (c: Commitment) => (c.kind === 'recurring' ? run(() => actions.skipRecurringOccurrence(c.id, c.date)) : run(() => actions.markTontineNotDue(c.id, c.period ?? 1, c.date)));
  return (
    <Card style={{ gap: 10, marginBottom: 12 }}>
      <Text variant="titleS">{t('reg.title')}</Text>
      {items.slice(0, 6).map((c) => (
        <View key={`${c.kind}_${c.id}_${c.date}`} style={{ gap: 6 }}>
          <Text variant="small">{t('reg.item', { label: labelOf(c), date: date(c.date), amount: hidden ? '••••••' : money(c.amount) })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button small label={t('reg.paid')} onPress={() => paid(c)} />
            <Button small variant="secondary" label={t('reg.owe')} onPress={() => owe(c)} />
            <Button small variant="ghost" label={t('reg.notDue')} onPress={() => notDue(c)} />
          </View>
        </View>
      ))}
    </Card>
  );
}
