/**
 * Famille et obligations : soutiens réguliers (récurrences « Famille ») et
 * leurs totaux — par mois, par an, part des revenus. Des chiffres, sans
 * commentaire : l'application ne juge jamais ce que l'on donne à sa famille.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useIntelligence } from '@/hooks/useIntelligence';
import { Badge, Button, Card, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { SourceTag } from '@/features/Recommendation';
import { withSpaceReady } from '@/components/SpaceReady';
import { familyObligations, monthlyEquivalent, obligationTotals, OBLIGATION_CATEGORY } from '@/core/obligations';
import { activeReserves } from '@/core/reserve';
import { can } from '@/core/permissions';

function Obligations() {
  const { t } = useI18n();
  const money = useMoney();
  const { role } = useApp();
  const { data, currency } = useFinance();
  const { snapshot } = useIntelligence();
  const rules = useMemo(() => familyObligations(data, currency), [data, currency]);
  const income = snapshot.income.value > 0 ? snapshot.income : null;
  const totals = obligationTotals(rules, income?.value ?? null);
  const reserve = activeReserves(data.goals, currency)[0];
  const canAdd = can(role, 'create', 'recurring');

  return (
    <Screen back title={t('obl.title')}>
      <Text tone="muted" style={{ marginBottom: 12 }}>
        {t('obl.tagline')}
      </Text>

      <Card style={{ gap: 6 }} accessibilityLabel={t('obl.totals.title')}>
        <Text variant="small" tone="muted">
          {t('obl.totals.title')}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <View>
            <Text variant="caption" tone="subtle">
              {t('obl.perMonth')}
            </Text>
            <Text variant="h2">{money(totals.monthly)}</Text>
          </View>
          <View>
            <Text variant="caption" tone="subtle">
              {t('obl.perYear')}
            </Text>
            <Text variant="h2">{money(totals.yearly)}</Text>
          </View>
        </View>
        {totals.shareOfIncome !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="small">{t('obl.share', { percent: totals.shareOfIncome })}</Text>
            {income ? <SourceTag source={income.source} /> : null}
          </View>
        ) : (
          <Text variant="caption" tone="subtle">
            {t('obl.shareUnknown')}
          </Text>
        )}
      </Card>

      <SectionHeader title={t('obl.list')} action={canAdd && rules.length ? t('common.add') : undefined} onAction={() => router.push(`/recurring/edit?type=expense&categoryId=${OBLIGATION_CATEGORY}&obligation=1`)} />
      <Card>
        {rules.length ? (
          rules.map((r) => {
            const per = t(`obl.freq.${r.frequency}` as TKey, { amount: money(r.amount) });
            const eq = r.frequency !== 'monthly' ? ` · ${t('obl.equivalent', { amount: money(monthlyEquivalent(r)) })}` : '';
            return <Row key={r.id} title={r.label} subtitle={`${per}${eq}`} right={!r.active ? <Badge label={t('obl.paused')} tone="neutral" /> : undefined} chevron onPress={() => router.push(`/recurring/edit?id=${r.id}&obligation=1`)} />;
          })
        ) : (
          <EmptyState title={t('obl.empty.title')} body={t('obl.empty.body')} action={canAdd ? t('obl.add') : undefined} onAction={() => router.push(`/recurring/edit?type=expense&categoryId=${OBLIGATION_CATEGORY}&obligation=1`)} />
        )}
      </Card>
      <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
        {t('obl.privacy')}
      </Text>

      <View style={{ gap: 8, marginTop: 18 }}>
        <Button variant="secondary" icon="wallet-outline" label={reserve ? t('obl.openReserve') : t('reserve.create')} onPress={() => router.push(reserve ? `/reserve/${reserve.id}` : '/reserve/new')} />
      </View>
    </Screen>
  );
}

export default withSpaceReady(Obligations);
