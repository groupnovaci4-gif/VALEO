import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Badge, Card, GradientCard, Icon, IconCircle, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { can } from '@/core/permissions';
import { hasFeature } from '@/core/subscription';
import { netWorth } from '@/core/networth';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { useTheme } from '@/theme';

interface Item {
  key: TKey;
  sub: TKey;
  icon: string;
  color: string;
  path: string;
  show?: boolean;
  locked?: boolean;
}

export default function More() {
  const { t } = useI18n();
  const { role, plan, user, mode, online } = useApp();
  const money = useMoney();
  const { data, position, currency, activeAccounts } = useFinance();
  // Icônes à la couleur de la marque : vert pour l'argent, or pour les temps forts.
  const { colors, radius } = useTheme();
  const showNetWorth = hasFeature(plan, 'net_worth') && can(role, 'read', 'assets');
  // Chiffre réel : patrimoine net (formule qui l'inclut) sinon total des comptes.
  const headline = useMemo(
    () => (showNetWorth ? netWorth(data.assets, data.accounts, data.transactions, data.debts, data.debtPayments, currency).net : position.available + position.savings),
    [showNetWorth, data, currency, position.available, position.savings],
  );
  const groups: { title: TKey; aside: string; items: Item[] }[] = [
    {
      title: 'more.money',
      aside: '',
      items: [
        { key: 'acc.title', sub: 'more.sub.accounts', icon: 'wallet', color: colors.primary, path: '/accounts' },
        { key: 'sav.title', sub: 'more.sub.savings', icon: 'cash', color: colors.primary, path: '/savings' },
        { key: 'debt.title', sub: 'more.sub.debts', icon: 'receipt', color: colors.danger, path: '/debts', show: can(role, 'read', 'debts') },
        { key: 'nw.title', sub: 'more.sub.assets', icon: 'business', color: colors.secondary, path: '/assets', show: can(role, 'read', 'assets'), locked: !hasFeature(plan, 'net_worth') },
        { key: 'rec.title', sub: 'more.sub.recurring', icon: 'repeat', color: colors.info, path: '/recurring', show: can(role, 'read', 'recurring') },
      ],
    },
    {
      title: 'more.intelligence',
      aside: '',
      items: [
        { key: 'intel.title', sub: 'intel.sub', icon: 'analytics', color: colors.primary, path: '/analysis' },
        { key: 'cal.title', sub: 'cal.sub', icon: 'calendar', color: colors.info, path: '/calendar' },
        { key: 'fi.title', sub: 'fi.sub', icon: 'trending-up', color: colors.secondary, path: '/independence' },
        { key: 'reward.title', sub: 'reward.subtitle', icon: 'trophy', color: colors.warning, path: '/rewards' },
      ],
    },
    {
      title: 'more.plan',
      aside: t('more.pilot'),
      items: [
        { key: 'fam.title', sub: 'more.sub.family', icon: 'people', color: colors.primary, path: '/family' },
        { key: 'rep.title', sub: 'more.sub.reports', icon: 'bar-chart', color: colors.info, path: '/reports' },
        { key: 'notif.title', sub: 'more.sub.notifications', icon: 'notifications', color: colors.secondary, path: '/notifications' },
        { key: 'cat.title', sub: 'more.sub.categories', icon: 'pricetags', color: colors.primary, path: '/categories', show: can(role, 'create', 'categories') },
      ],
    },
    {
      title: 'more.app',
      aside: t('more.system'),
      items: [
        { key: 'sub.title', sub: 'more.sub.subscription', icon: 'sparkles', color: colors.secondary, path: '/subscription' },
        { key: 'set.title', sub: 'more.sub.settings', icon: 'settings', color: colors.info, path: '/settings' },
        { key: 'admin.title', sub: 'more.sub.admin', icon: 'shield-checkmark', color: colors.textMuted, path: '/admin', show: !!user?.isAdmin },
      ],
    },
  ];
  groups[0].aside = t('more.modules', { count: groups[0].items.filter((i) => i.show !== false).length });
  const status = mode === 'local' ? t('home.status.local') : online ? t('home.status.synced') : t('home.status.offline');
  return (
    <Screen brandSection={t('tab.more')}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="overline" style={{ color: colors.primary }}>
            {t('more.overview').toUpperCase()}
          </Text>
          <Text variant="h1">{t('more.title')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.infoBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mode === 'local' || online ? colors.primary : colors.warning }} />
          <Text variant="caption" weight="600">
            {status}
          </Text>
        </View>
      </View>

      <GradientCard>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="small" tone="heroMuted">
              {showNetWorth ? t('more.netWorth') : t('more.totalAccounts')}
            </Text>
            <Text variant="display" tone="onHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: 4 }}>
              {money(headline)}
            </Text>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="business-outline" size={24} color={colors.onHero} />
          </View>
        </View>
        <Text variant="caption" tone="heroMuted" style={{ marginTop: 10 }}>
          {t(activeAccounts.length === 1 ? 'more.accountsCount.one' : 'more.accountsCount', { count: activeAccounts.length })}
        </Text>
      </GradientCard>

      {groups.map((g) => (
        <React.Fragment key={g.title}>
          <SectionHeader title={t(g.title).toUpperCase()} action={g.aside || undefined} />
          <Card padded={false} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
            {g.items
              .filter((i) => i.show !== false)
              .map((i) => (
                <Row
                  key={i.key}
                  title={t(i.key)}
                  subtitle={t(i.sub)}
                  left={<IconCircle icon={i.icon} color={i.color} size={44} />}
                  right={i.locked ? <Badge tone="ai" label="PRO" /> : undefined}
                  chevron
                  onPress={() => router.push(i.path as never)}
                />
              ))}
          </Card>
        </React.Fragment>
      ))}
    </Screen>
  );
}
