/**
 * « Puis-je contribuer ? » — voir l'impact d'une contribution AVANT de dire
 * oui. Tous les chiffres viennent de `core/simulator` ; rien n'est enregistré
 * ici. Trois issues, sans jugement : enregistrer cette contribution (formulaire
 * prérempli, à confirmer), essayer un autre montant, fermer.
 * Formule gratuite : 3 simulations par mois (compteur local).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { AmountField, Button, Card, Chip, Screen, Text } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { withSpaceReady } from '@/components/SpaceReady';
import { compareAmounts, simulateContribution, SIMULATION_CATEGORY, type Simulation } from '@/core/simulator';
import { activeReserves } from '@/core/reserve';
import { canUseReserve } from '@/core/permissions';
import { FREE_SIMULATIONS_PER_MONTH, hasFeature } from '@/core/subscription';
import { recordSimulation, simulationsThisMonth } from '@/services/simulatorStats';
import type { DailyAllowance } from '@/core/dailyAllowance';

const CATEGORIES = ['cat_social', 'cat_family'] as const;

function Simulate() {
  const params = useLocalSearchParams<{ amount?: string; category?: string }>();
  const { t, date } = useI18n();
  const money = useMoney();
  const { plan, user, profile, role } = useApp();
  const { data, currency, now } = useFinance();
  const unlimited = hasFeature(plan, 'contribution_simulator');
  const reserves = canUseReserve(role) ? activeReserves(data.goals, currency) : [];
  const [amount, setAmount] = useState<number | null>(params.amount ? Number(params.amount) || null : null);
  const [categoryId, setCategoryId] = useState<string>(CATEGORIES.includes(params.category as never) ? (params.category as string) : SIMULATION_CATEGORY);
  const [useReserve, setUseReserve] = useState(true);
  const [other, setOther] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const reserveId = useReserve && reserves[0] ? reserves[0].id : null;
  const input = { data, currency, today: now, financial: profile?.financial, categoryId, reserveId };
  const result: Simulation | null = useMemo(() => (shown ? simulateContribution({ ...input, amount: shown }) : null), [shown, data, currency, now, profile?.financial, categoryId, reserveId]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherRow = useMemo(() => (shown && other && other !== shown ? compareAmounts(input, [other])[0] : null), [other, shown, data, currency, now, profile?.financial, categoryId, reserveId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) void simulationsThisMonth(user.uid).then(setUsed);
  }, [user]);
  const locked = !unlimited && used !== null && used >= FREE_SIMULATIONS_PER_MONTH && shown === null;

  const run = async () => {
    if (!amount || amount <= 0) return;
    if (!unlimited && user) {
      const n = await simulationsThisMonth(user.uid);
      if (n >= FREE_SIMULATIONS_PER_MONTH) return setUsed(n);
      setUsed(await recordSimulation(user.uid));
    }
    setShown(amount);
  };
  // Ouvert depuis la voix (« si je donne 30 000… ») : la simulation est calculée tout de suite.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !params.amount || used === null) return;
    auto.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used]);

  const perDayLine = (a: number, r: DailyAllowance) =>
    r.status === 'ok' ? t('sim.perDay', { amount: money(a), perDay: money(r.perDay), date: date(r.until) }) : r.status === 'deficit' ? t('sim.deficit', { amount: money(a), shortfall: money(r.deficit) }) : t('daily.needsIncome');

  if (locked) {
    return (
      <Screen back title={t('sim.title')}>
        <UpgradeCard feature="contribution_simulator" text={t('sim.limit', { count: FREE_SIMULATIONS_PER_MONTH })} />
      </Screen>
    );
  }

  return (
    <Screen back title={t('sim.title')} edges={['top', 'bottom']}>
      <Text tone="muted" style={{ marginBottom: 12 }}>
        {t('sim.tagline')}
      </Text>
      <AmountField label={t('sim.amount')} value={amount} onChange={(v) => (setAmount(v), setShown(null))} currency={currency} big />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={t(c === 'cat_social' ? 'sim.cat.social' : 'sim.cat.family')} selected={categoryId === c} onPress={() => (setCategoryId(c), setShown(null))} />
        ))}
      </View>
      {reserves.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <Chip icon="wallet-outline" label={t('reserve.use.yes')} selected={useReserve} onPress={() => setUseReserve(true)} />
          <Chip label={t('reserve.use.no')} selected={!useReserve} onPress={() => setUseReserve(false)} />
        </View>
      ) : null}
      <Button icon="calculator-outline" label={t('sim.run')} onPress={() => void run()} disabled={!amount || amount <= 0} />
      {!unlimited && used !== null ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
          {t('sim.quota', { left: Math.max(0, FREE_SIMULATIONS_PER_MONTH - used), count: FREE_SIMULATIONS_PER_MONTH })}
        </Text>
      ) : null}

      {result ? (
        <Card style={{ marginTop: 14, gap: 8 }} accessibilityLabel={t('sim.result')}>
          <Text variant="small" tone="muted">
            {t('sim.today', { perDay: result.before.status === 'ok' ? money(result.before.perDay) : '—' })}
          </Text>
          <Text variant="bodyStrong">{perDayLine(result.amount, result.after)}</Text>
          {result.reserve ? (
            <Text variant="small">
              {t('sim.reserve', { before: money(result.reserve.before), after: money(result.reserve.after) })}
              {result.reserve.complement > 0 ? ` ${t('sim.complement', { amount: money(result.reserve.complement) })}` : ''}
            </Text>
          ) : null}
          {result.envelopes.map((e) => (
            <Text key={e.envelopeId} variant="small">
              {e.after === 'critical' ? t('sim.env.critical', { name: e.name, over: money(-e.remainingAfter) }) : e.after === 'reached' ? t('sim.env.reached', { name: e.name }) : t('sim.env.warning', { name: e.name, left: money(e.remainingAfter) })}
            </Text>
          ))}
          {result.shortfall && result.shortfall.plannedSetAside > 0 ? <Text variant="small">{t('sim.setAside', { amount: money(result.shortfall.plannedSetAside) })}</Text> : null}
          {otherRow ? <Text variant="small">{perDayLine(otherRow.amount, otherRow.after)}</Text> : null}
          <AmountField label={t('sim.other')} value={other} onChange={setOther} currency={currency} />
          <View style={{ gap: 8 }}>
            <Button
              icon="checkmark"
              label={t('sim.save')}
              onPress={() => router.push({ pathname: '/transaction/new', params: { type: 'expense', amount: String(result.amount), categoryId, ...(result.reserve && result.reserve.fromReserve > 0 ? { reserveId: result.reserve.id } : {}) } })}
            />
            <Button
              variant="secondary"
              label={t('sim.saveDifferent')}
              onPress={() => router.push({ pathname: '/transaction/new', params: { type: 'expense', categoryId, ...(other && other > 0 ? { amount: String(other) } : {}), ...(result.reserve ? { reserveId: result.reserve.id } : {}) } })}
            />
            <Button variant="ghost" label={t('common.close')} onPress={() => router.back()} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

export default withSpaceReady(Simulate);
