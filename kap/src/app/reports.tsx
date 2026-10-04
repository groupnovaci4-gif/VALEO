/**
 * Rapports quotidien / hebdomadaire / mensuel / annuel : totaux, épargne,
 * évolution, catégories, objectifs, budgets ; export CSV et PDF.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { monthName, useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useCategoryLabels, useAccountLabel, useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Segmented, Text, useToast } from '@/components/ui';
import { FlowBars, RankedBars } from '@/components/charts';
import { UpgradeCard } from '@/features/rows';
import { buildReport, transactionsToCsv } from '@/core/reports';
import { addDays, addMonths, inPeriod, parseISODate, type PeriodKind } from '@/core/dates';
import { currencyInfo } from '@/core/money';
import { goalPlanFor } from '@/core/goals';
import { hasFeature } from '@/core/subscription';
import { shareCsv, sharePdf } from '@/services/export';
import { analytics } from '@/services/analytics';
import { brand } from '@/config/brand';

export default function Reports() {
  const params = useLocalSearchParams<{ period?: string }>();
  const { t, lang, date, monthYear } = useI18n();
  const toast = useToast();
  const { plan } = useApp();
  const money = useMoney();
  const cats = useCategoryLabels();
  const accountLabel = useAccountLabel();
  const { data, currency, now, envelopes } = useFinance();
  const [kind, setKind] = useState<PeriodKind>((['day', 'week', 'month', 'year'].includes(params.period ?? '') ? params.period : 'month') as PeriodKind);
  const [ref, setRef] = useState(now);
  const report = useMemo(() => buildReport(data, kind, ref, currency), [data, kind, ref, currency]);
  const shift = (dir: 1 | -1) => setRef((r) => (kind === 'day' ? addDays(r, dir) : kind === 'week' ? addDays(r, 7 * dir) : kind === 'month' ? addMonths(r, dir) : addMonths(r, 12 * dir)));
  const periodLabel = kind === 'year' ? report.period.start.slice(0, 4) : kind === 'month' ? monthYear(report.period.start) : kind === 'day' ? date(report.period.start, { year: true }) : `${date(report.period.start)} – ${date(report.period.end, { year: true })}`;
  const pointLabel = (key: string) => (kind === 'year' ? monthName(lang, Number(key.slice(5)) - 1).slice(0, 3) : kind === 'week' ? String(parseISODate(key).getDate()) : String(Number(key.slice(8))));
  const advanced = hasFeature(plan, 'advanced_reports');
  const change = (v: number | null) => (v === null ? '' : ` (${v > 0 ? '+' : ''}${v} % ${t('rep.vsPrevious')})`);

  const exportCsv = async () => {
    const list = data.transactions.filter((tx) => inPeriod(tx.date, report.period));
    const csv = transactionsToCsv(list, {
      accountName: (id) => accountLabel(id),
      categoryName: (c, id) => cats.label(c, id),
      categories: data.categories,
      decimals: (c) => currencyInfo(c).decimals,
      headers: t('rep.csv.headers').split(';'),
      typeLabel: (ty) => t(`tx.${ty}` as TKey),
    });
    await shareCsv(`${brand.slug}-${report.period.start}_${report.period.end}.csv`, csv).catch(() => toast.show(t('error.generic'), 'error'));
    analytics.track('export_data', { kind: 'csv' });
  };
  const exportPdf = async () => {
    await sharePdf(
      `${brand.slug}-${report.period.start}.pdf`,
      t('rep.pdf.title', { period: periodLabel }),
      brand.name,
      [
        {
          title: t('rep.title'),
          rows: [
            [t('rep.income'), money(report.income)],
            [t('rep.expense'), money(report.expense)],
            [t('rep.net'), money(report.net)],
            [t('rep.saved'), money(report.saved)],
            [t('rep.savingsRate'), report.savingsRate === null ? '—' : `${report.savingsRate} %`],
          ],
        },
        { title: t('rep.byCategory'), rows: report.byCategory.map((c) => [cats.byId(c.categoryId), `${money(c.amount)} · ${c.percent} %`]) },
        { title: t('rep.budgets'), rows: envelopes.map((s) => [s.envelope.name, `${money(s.spent)} / ${money(s.budget)}`]) },
      ],
      t('rep.pdf.generated', { date: date(now, { year: true }) }),
    ).catch(() => toast.show(t('error.generic'), 'error'));
    analytics.track('export_data', { kind: 'pdf' });
  };

  return (
    <Screen back title={t('rep.title')}>
      <Segmented value={kind} onChange={(k) => (setKind(k), setRef(now))} options={(['day', 'week', 'month', 'year'] as PeriodKind[]).map((k) => ({ value: k, label: t(`rep.${k}` as TKey) }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <IconButton icon="chevron-back" label="←" onPress={() => shift(-1)} />
        <Text variant="h3">{periodLabel}</Text>
        <IconButton icon="chevron-forward" label="→" onPress={() => shift(1)} />
      </View>
      <Card>
        <Row title={t('rep.income')} subtitle={change(report.incomeChange) || undefined} right={<Text weight="700" tone="income">{money(report.income)}</Text>} />
        <Row title={t('rep.expense')} subtitle={change(report.expenseChange) || undefined} right={<Text weight="700" tone="expense">{money(report.expense)}</Text>} />
        <Row title={t('rep.net')} right={<Text weight="700" tone={report.net < 0 ? 'danger' : 'default'}>{money(report.net, { signed: true })}</Text>} />
        <Row title={t('rep.saved')} subtitle={report.savingsRate === null ? undefined : `${t('rep.savingsRate')} : ${report.savingsRate} %`} right={<Text weight="700">{money(report.saved)}</Text>} />
      </Card>
      {report.transactionCount === 0 ? (
        <EmptyState emoji="📊" title={t('rep.empty')} />
      ) : (
        <>
          {kind !== 'day' ? (
            <>
              <SectionHeader title={t('rep.evolution')} />
              <Card>
                <FlowBars
                  points={report.series.map((p) => ({ label: pointLabel(p.key), income: p.income, expense: p.expense }))}
                  format={(n) => money(n)}
                  incomeLabel={t('rep.income')}
                  expenseLabel={t('rep.expense')}
                  summary={`${t('rep.income')} ${money(report.income)}, ${t('rep.expense')} ${money(report.expense)}`}
                />
              </Card>
            </>
          ) : null}
          <SectionHeader title={t('rep.byCategory')} />
          <Card>
            <RankedBars items={report.byCategory.map((c) => ({ label: cats.byId(c.categoryId), value: c.amount, percent: c.percent }))} format={(n) => money(n)} />
          </Card>
        </>
      )}
      {advanced ? (
        <>
          <SectionHeader title={t('rep.budgets')} />
          <Card>
            {envelopes.length ? envelopes.map((s) => <Row key={s.envelope.id} title={s.envelope.name} subtitle={`${money(s.spent)} / ${money(s.budget)}`} right={<View style={{ width: 90 }}><ProgressBar value={s.percent} tone={s.level === 'over' ? 'danger' : 'success'} /></View>} />) : <EmptyState title={t('env.empty.title')} />}
          </Card>
          <SectionHeader title={t('rep.goals')} />
          <Card>
            {data.goals.filter((g) => g.status === 'active').map((g) => {
              const p = goalPlanFor(g, data.goalContributions, now);
              return <Row key={g.id} title={`${g.icon} ${g.name}`} subtitle={`${money(p.saved)} / ${money(p.target)}`} right={<Text weight="700">{p.percent} %</Text>} />;
            })}
          </Card>
        </>
      ) : (
        <UpgradeCard feature="advanced_reports" text={`${t('rep.budgets')} · ${t('rep.goals')}`} />
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Button style={{ flex: 1 }} variant="secondary" icon="document-text-outline" label={t('rep.exportCsv')} onPress={() => void exportCsv()} />
        <Button style={{ flex: 1 }} variant="secondary" icon="document-outline" label={t('rep.exportPdf')} onPress={() => void exportPdf()} />
      </View>
    </Screen>
  );
}
