/**
 * Nouvelle tontine (ou conversion d'une récurrence, `?fromRecurring=`), en
 * 4 écrans : type → montant et fréquence → membres et mon tour (ou cycle du
 * collecteur) → compte, avec l'aperçu de l'échéancier avant validation.
 * Carnet de suivi : l'application ne collecte, ne garde ni ne transfère d'argent.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Banner, Button, Card, Chip, ChipGroup, DateField, Field, ProgressBar, Row, Screen, SwitchRow, Text } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { useActionErrorMessage } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';
import { useTheme } from '@/theme';
import { buildSchedule, collectorTotals, expectedTurns, potOf, tontineFromRecurring, validateTontine } from '@/core/tontine';
import { withinLimit } from '@/core/subscription';
import { today } from '@/core/dates';
import type { Tontine, TontineFrequency, TontineType } from '@/core/types';

const TYPES: TontineType[] = ['rotating', 'collector', 'fixed_contribution'];
const FREQS: TontineFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
const SHARES = [0.5, 1, 2, 3];
const STEPS = 4;
type Draft = Omit<Tontine, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;
const int = (s: string) => {
  const n = Number(s.replace(/\D/g, '').slice(0, 4));
  return n > 0 ? n : null;
};

function NewTontine() {
  const { fromRecurring } = useLocalSearchParams<{ fromRecurring?: string }>();
  const { t, date, lang } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const errorMessage = useActionErrorMessage();
  const actions = useActions();
  const { plan } = useApp();
  const { data, currency } = useFinance();
  const rule = fromRecurring ? data.recurring.find((r) => r.id === fromRecurring && !r.deleted) : undefined;
  const accounts = data.accounts.filter((a) => a.active && !a.deleted && a.currency === currency);
  const [d, setD] = useState<Draft>(() =>
    rule
      ? tontineFromRecurring(rule)
      : { type: 'rotating', name: '', organizerName: null, currency, amountPerShare: 0, sharesHeld: 1, frequency: 'monthly', customDays: null, startDate: today(), membersCount: null, myTurns: [], potAmount: null, organizerFee: null, latePenalty: null, cycleDays: null, collectorCommission: null, accountId: accounts.find((a) => !a.isSavings)?.id ?? accounts[0]?.id ?? null, status: 'active', linkedRecurringId: null },
  );
  const [step, setStep] = useState(0);
  const [deactivate, setDeactivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const active = data.tontines.filter((x) => !x.deleted && x.status === 'active').length;
  const preview = useMemo(() => (validateTontine(d).length ? [] : buildSchedule({ ...d, id: 'preview', createdAt: 0, updatedAt: 0, createdBy: '' }).slice(0, 8)), [d]);

  if (!withinLimit(plan, 'tontines', active)) {
    return (
      <Screen back title={t('tontine.new')}>
        <UpgradeCard feature="tontine_multiple" text={t('tontine.limit')} />
      </Screen>
    );
  }

  // Erreurs propres à l'écran courant (on n'avance pas tant qu'elles existent).
  const stepErrors = () => {
    const e = validateTontine(d);
    const of = [['name', 'amount', 'shares', 'customDays'], ['members', 'turns', 'cycle', 'commission'], [], []][step - 1] ?? [];
    return e.filter((x) => of.includes(x));
  };
  const next = () => {
    const e = stepErrors();
    if (e.length) return setError(t(`tontine.err.${e[0]}` as TKey));
    setError(null);
    setStep((s) => s + 1);
  };
  const create = () => {
    const e = validateTontine(d);
    if (e.length) return setError(t(`tontine.err.${e[0]}` as TKey));
    try {
      const saved = rule ? actions.convertRecurringToTontine(d, deactivate) : actions.saveTontine(d);
      router.replace(`/tontines/${saved.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const legal = <Banner tone="info" icon="shield-checkmark-outline" text={t('tontine.legal')} />;
  const n = d.membersCount ?? 0;
  const wanted = expectedTurns(d.sharesHeld);

  return (
    <Screen
      back
      title={rule ? t('tontine.convert.title') : t('tontine.new')}
      edges={['top', 'bottom']}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {step > 0 ? <Button variant="secondary" icon="arrow-back" label={t('common.back')} onPress={() => (setError(null), setStep((s) => s - 1))} /> : null}
          <Button style={{ flex: 1 }} label={step < STEPS - 1 ? t('common.continue') : t('tontine.create')} onPress={step < STEPS - 1 ? next : create} />
        </View>
      }
    >
      <Text variant="caption" tone="subtle">
        {t('tontine.step', { current: step + 1, total: STEPS })}
      </Text>
      <ProgressBar value={((step + 1) / STEPS) * 100} tone="success" />
      <View style={{ height: 12 }} />
      {error ? <Banner tone="danger" icon="alert-circle" text={error} /> : null}

      {step === 0 ? (
        <>
          {rule ? <Banner tone="info" icon="repeat" text={t('tontine.convert.hint', { name: rule.label })} /> : null}
          <Text variant="h3" style={{ marginBottom: 8 }}>
            {t('tontine.type.title')}
          </Text>
          {TYPES.map((ty) => (
            <Pressable
              key={ty}
              accessibilityRole="radio"
              accessibilityState={{ selected: d.type === ty }}
              accessibilityLabel={t(`tontine.type.${ty}` as TKey)}
              onPress={() => set('type', ty)}
              style={{ borderWidth: 1.5, borderColor: d.type === ty ? colors.primary : colors.border, backgroundColor: d.type === ty ? colors.surfaceAlt : colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 10, gap: 4 }}
            >
              <Text variant="bodyStrong">{t(`tontine.type.${ty}` as TKey)}</Text>
              <Text variant="small" tone="muted">
                {t(`tontine.type.${ty}.hint` as TKey)}
              </Text>
            </Pressable>
          ))}
          {legal}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Field label={t('tontine.name')} placeholder={t('tontine.name.placeholder')} value={d.name} onChangeText={(v) => set('name', v)} maxLength={120} />
          <Field label={`${t('tontine.organizer')} (${t('common.optional')})`} value={d.organizerName ?? ''} onChangeText={(v) => set('organizerName', v || null)} maxLength={80} />
          <AmountField label={t(d.type === 'rotating' ? 'tontine.amountPerShare' : d.type === 'collector' ? 'tontine.amountCollector' : 'tontine.amountFixed')} value={d.amountPerShare || null} onChange={(v) => set('amountPerShare', v ?? 0)} currency={currency} />
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tontine.frequency')}
          </Text>
          <ChipGroup scroll value={d.frequency} onChange={(v) => set('frequency', v)} options={FREQS.map((f) => ({ value: f, label: t(`tontine.freq.${f}` as TKey) }))} />
          {d.frequency === 'custom' ? <Field label={t('tontine.customDays')} value={d.customDays ? String(d.customDays) : ''} onChangeText={(v) => set('customDays', int(v))} keyboardType="number-pad" inputMode="numeric" maxLength={3} /> : null}
          {d.type === 'rotating' ? (
            <>
              <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
                {t('tontine.shares')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {SHARES.map((s) => (
                  <Chip key={s} label={s === 0.5 ? t('tontine.halfShare') : t(s === 1 ? 'tontine.oneShare' : 'tontine.nShares', { count: s })} selected={d.sharesHeld === s} onPress={() => setD((cur) => ({ ...cur, sharesHeld: s, myTurns: (cur.myTurns ?? []).slice(0, expectedTurns(s)) }))} />
                ))}
              </View>
              <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
                {t('tontine.myContribution', { amount: money(Math.round(d.amountPerShare * d.sharesHeld)) })}
              </Text>
            </>
          ) : null}
          <DateField label={t('tontine.startDate')} value={d.startDate} onChange={(v) => v && set('startDate', v)} shortcuts={false} />
        </>
      ) : null}

      {step === 2 ? (
        d.type === 'rotating' ? (
          <>
            <Field label={t('tontine.members')} placeholder={t('tontine.members.placeholder')} value={d.membersCount ? String(d.membersCount) : ''} onChangeText={(v) => setD((cur) => ({ ...cur, membersCount: int(v), myTurns: (cur.myTurns ?? []).filter((x) => x <= (int(v) ?? 0)) }))} keyboardType="number-pad" inputMode="numeric" maxLength={3} />
            <Text variant="caption" tone="subtle" style={{ marginTop: -8, marginBottom: 12 }}>
              {t('tontine.members.hint')}
            </Text>
            {n >= 2 ? (
              <>
                <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
                  {t('tontine.myTurns', { count: wanted })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {Array.from({ length: Math.min(n, 120) }, (_, i) => i + 1).map((turn) => {
                    const on = (d.myTurns ?? []).includes(turn);
                    return (
                      <Chip
                        key={turn}
                        label={String(turn)}
                        selected={on}
                        onPress={() => setD((cur) => {
                          const cur2 = cur.myTurns ?? [];
                          if (on) return { ...cur, myTurns: cur2.filter((x) => x !== turn) };
                          return { ...cur, myTurns: [...(cur2.length >= wanted ? cur2.slice(1) : cur2), turn].sort((a, b) => a - b) };
                        })}
                      />
                    );
                  })}
                </View>
                <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
                  {t('tontine.pot.computed', { amount: money(Math.round(d.amountPerShare * n)) })}
                </Text>
              </>
            ) : null}
            <AmountField label={`${t('tontine.pot')} (${t('common.optional')})`} value={d.potAmount ?? null} onChange={(v) => set('potAmount', v)} currency={currency} />
            <AmountField label={`${t('tontine.organizerFee')} (${t('common.optional')})`} value={d.organizerFee ?? null} onChange={(v) => set('organizerFee', v)} currency={currency} />
            <AmountField label={`${t('tontine.latePenalty')} (${t('common.optional')})`} value={d.latePenalty ?? null} onChange={(v) => set('latePenalty', v)} currency={currency} />
          </>
        ) : d.type === 'collector' ? (
          <>
            <Field label={t('tontine.cycleDays')} placeholder={t('tontine.cycleDays.placeholder')} value={d.cycleDays ? String(d.cycleDays) : ''} onChangeText={(v) => set('cycleDays', int(v))} keyboardType="number-pad" inputMode="numeric" maxLength={3} />
            <AmountField label={t('tontine.commission')} hint={t('tontine.commission.placeholder')} value={d.collectorCommission ?? null} onChange={(v) => set('collectorCommission', v)} currency={currency} />
            {d.cycleDays ? (
              <Text variant="caption" tone="subtle">
                {(() => {
                  const c = collectorTotals({ ...d, id: 'x', createdAt: 0, updatedAt: 0, createdBy: '' });
                  return t('tontine.collector.summary', { total: money(c.total), commission: money(c.commission), returned: money(c.returned), percent: lang === 'fr' ? String(c.percent).replace('.', ',') : String(c.percent) });
                })()}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text tone="muted" style={{ marginBottom: 12 }}>
              {t('tontine.fixed.nothing')}
            </Text>
            <AmountField label={`${t('tontine.latePenalty')} (${t('common.optional')})`} value={d.latePenalty ?? null} onChange={(v) => set('latePenalty', v)} currency={currency} />
          </>
        )
      ) : null}

      {step === 3 ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('tontine.account')}
          </Text>
          {accounts.length ? <ChipGroup scroll value={d.accountId ?? null} onChange={(v) => set('accountId', v)} options={accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} /> : <Text variant="small" tone="muted">{t('tx.autoCash')}</Text>}
          <Card style={{ marginTop: 12 }} accessibilityLabel={t('tontine.preview')}>
            <Text variant="bodyStrong" style={{ marginBottom: 6 }}>
              {t('tontine.preview')}
            </Text>
            {d.type === 'rotating' ? (
              <Text variant="small" tone="muted" style={{ marginBottom: 6 }}>
                {t('tontine.preview.rotating', { pot: money(potOf(d)), count: d.membersCount ?? 0 })}
              </Text>
            ) : d.type === 'collector' && d.cycleDays ? (
              <Text variant="small" tone="muted" style={{ marginBottom: 6 }}>
                {(() => {
                  const c = collectorTotals({ ...d, id: 'x', createdAt: 0, updatedAt: 0, createdBy: '' });
                  return t('tontine.collector.summary', { total: money(c.total), commission: money(c.commission), returned: money(c.returned), percent: lang === 'fr' ? String(c.percent).replace('.', ',') : String(c.percent) });
                })()}
              </Text>
            ) : null}
            {preview.map((s) => (
              <Row
                key={s.period}
                title={`${date(s.date)} · ${money(s.contribution)}`}
                subtitle={d.type === 'rotating' ? (s.mine ? t('tontine.turn.mine', { amount: money(s.payout) }) : t('tontine.turn.other', { turn: s.turn ?? s.period })) : s.payout > 0 ? t('tontine.collector.returned', { amount: money(s.payout) }) : undefined}
              />
            ))}
          </Card>
          {rule ? <SwitchRow title={t('tontine.convert.deactivate', { name: rule.label })} subtitle={t('tontine.convert.deactivateHint')} value={deactivate} onChange={setDeactivate} /> : null}
          {legal}
        </>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(NewTontine);
