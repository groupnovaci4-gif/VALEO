import React from 'react';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Badge, Card, IconCircle, Row, Screen, SectionHeader } from '@/components/ui';
import { can } from '@/core/permissions';
import { hasFeature } from '@/core/subscription';

interface Item {
  key: TKey;
  icon: string;
  color: string;
  path: string;
  show?: boolean;
  locked?: boolean;
}

export default function More() {
  const { t } = useI18n();
  const { role, plan, user } = useApp();
  const groups: { title: TKey; items: Item[] }[] = [
    {
      title: 'more.money',
      items: [
        { key: 'acc.title', icon: 'wallet', color: '#16A34A', path: '/accounts' },
        { key: 'sav.title', icon: 'cash', color: '#0EA5E9', path: '/savings' },
        { key: 'debt.title', icon: 'receipt', color: '#F97316', path: '/debts', show: can(role, 'read', 'debts') },
        { key: 'nw.title', icon: 'business', color: '#7C3AED', path: '/assets', show: can(role, 'read', 'assets'), locked: !hasFeature(plan, 'net_worth') },
        { key: 'rec.title', icon: 'repeat', color: '#14B8A6', path: '/recurring', show: can(role, 'read', 'recurring') },
      ],
    },
    {
      title: 'more.plan',
      items: [
        { key: 'fam.title', icon: 'people', color: '#EC4899', path: '/family' },
        { key: 'rep.title', icon: 'bar-chart', color: '#2563EB', path: '/reports' },
        { key: 'notif.title', icon: 'notifications', color: '#EAB308', path: '/notifications' },
        { key: 'cat.title', icon: 'pricetags', color: '#64748B', path: '/categories', show: can(role, 'create', 'categories') },
      ],
    },
    {
      title: 'more.app',
      items: [
        { key: 'sub.title', icon: 'sparkles', color: '#7C3AED', path: '/subscription' },
        { key: 'set.title', icon: 'settings', color: '#334155', path: '/settings' },
        { key: 'admin.title', icon: 'shield-checkmark', color: '#0F172A', path: '/admin', show: !!user?.isAdmin },
      ],
    },
  ];
  return (
    <Screen title={t('more.title')}>
      {groups.map((g) => (
        <React.Fragment key={g.title}>
          <SectionHeader title={t(g.title)} />
          <Card>
            {g.items
              .filter((i) => i.show !== false)
              .map((i) => (
                <Row
                  key={i.key}
                  title={t(i.key)}
                  left={<IconCircle icon={i.icon} color={i.color} size={36} />}
                  right={i.locked ? <Badge tone="ai" label="Premium" /> : undefined}
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
