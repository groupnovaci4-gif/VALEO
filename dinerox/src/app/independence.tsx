/**
 * Trajectoire vers l'indépendance financière — SIMULATION modifiable,
 * jamais une promesse. Les valeurs de départ viennent des données réelles.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useIntelligence } from '@/hooks/useIntelligence';
import { AmountField, Banner, Card, Field, GradientCard, ProgressBar, Screen, SectionHeader, Text } from '@/components/ui';
import { withSpaceReady } from '@/components/SpaceReady';
import { useTheme } from '@/theme';
import { netWorth } from '@/core/networth';
import { simulateIndependence } from '@/core/independence';

const pct = (s: string, d: number) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : d;
};

function Independence() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const { data, currency } = useFinance();
  const { snapshot } = useIntelligence();
  const capitalNow = useMemo(() => netWorth(data.assets, data.accounts, data.transactions, data.debts, data.debtPayments, currency).net, [data, currency]);
  const [expenses, setExpenses] = useState<number | null>(snapshot.expenses.value || null);
  const [savings, setSavings] = useState<number | null>(Math.max(0, snapshot.savingsCapacity.value) || null);
  const [capital, setCapital] = useState<number | null>(capitalNow);
  const [ret, setRet] = useState('4');
  const [withdraw, setWithdraw] = useState('4');
  const r = useMemo(
    () => simulateIndependence({ monthlyExpenses: expenses ?? 0, monthlySavings: savings ?? 0, currentCapital: capital ?? 0, annualReturnPct: pct(ret, 4), withdrawalRatePct: pct(withdraw, 4) || 4 }),
    [expenses, savings, capital, ret, withdraw],
  );
  const max = Math.max(1, r.target, ...r.trajectory.map((p) => p.capital));
  const shown = r.trajectory.filter((p, i) => i % Math.max(1, Math.ceil(r.trajectory.length / 12)) === 0 || i === r.trajectory.length - 1);
  return (
    <Screen back title={t('fi.title')}>
      <Banner tone="info" icon="information-circle-outline" text={t('fi.disclaimer')} />
      <GradientCard>
        <Text variant="overline" tone="heroMuted">
          {t('fi.target').toUpperCase()}
        </Text>
        <Text variant="display" tone="onHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ marginVertical: 6 }}>
          {money(r.target)}
        </Text>
        <Text variant="small" tone="heroMuted">
          {r.years === null ? t('fi.notReached') : r.years === 0 ? t('fi.reached') : t('fi.years', { years: String(r.years).replace('.', ',') })}
        </Text>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 12, overflow: 'hidden' }}>
          <View style={{ width: `${r.progressPct}%`, height: '100%', backgroundColor: colors.secondaryContainer }} />
        </View>
        <Text variant="caption" tone="heroMuted" style={{ marginTop: 8 }}>
          {t('fi.progress', { percent: r.progressPct, income: money(r.passiveIncomeToday) })}
        </Text>
      </GradientCard>

      <SectionHeader title={t('fi.hypotheses')} />
      <Card>
        <AmountField label={t('fi.expenses')} value={expenses} onChange={setExpenses} currency={currency} />
        <AmountField label={t('fi.savings')} value={savings} onChange={setSavings} currency={currency} />
        <AmountField label={t('fi.capital')} hint={t('fi.capitalHint')} value={capital} onChange={setCapital} currency={currency} />
        <Field label={t('fi.return')} value={ret} onChangeText={setRet} keyboardType="decimal-pad" inputMode="decimal" suffix="%" hint={t('fi.returnHint')} />
        <Field label={t('fi.withdraw')} value={withdraw} onChangeText={setWithdraw} keyboardType="decimal-pad" inputMode="decimal" suffix="%" hint={t('fi.withdrawHint')} />
      </Card>

      <SectionHeader title={t('fi.trajectory')} />
      <Card>
        {shown.map((p) => (
          <View key={p.year} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text variant="caption" tone="muted">
                {t('fi.year', { year: p.year })}
              </Text>
              <Text variant="caption" weight="600">
                {money(p.capital)}
              </Text>
            </View>
            <ProgressBar value={(Math.max(0, p.capital) / max) * 100} tone={p.capital >= r.target ? 'success' : 'primary'} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

export default withSpaceReady(Independence);
