/**
 * Administration — moindre privilège : uniquement des statistiques
 * AGRÉGÉES calculées côté serveur (Cloud Function `adminStats`, réservée aux
 * comptes portant le droit `admin`). Aucune donnée financière individuelle.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, ErrorState, Loading, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { firebase } from '@/services/firebase';
import { useGoalCategories } from '@/features/goals';

interface Stats {
  users: number;
  active7: number;
  families: number;
  plans: Record<string, number>;
  generatedAt: number;
}

export default function Admin() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const categories = useGoalCategories();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchStats = useCallback(
    () =>
      httpsCallable<unknown, Stats>(firebase().functions, 'adminStats')({})
        .then((res) => setStats(res.data))
        .catch(() => setError(true))
        .finally(() => setLoading(false)),
    [],
  );
  const load = () => {
    setLoading(true);
    setError(false);
    void fetchStats();
  };
  useEffect(() => {
    if (!user?.isAdmin) return;
    void fetchStats();
  }, [user?.isAdmin, fetchStats]);
  if (!user?.isAdmin) {
    return (
      <Screen back title={t('admin.title')}>
        <Banner tone="danger" icon="lock-closed" text={t('admin.forbidden')} />
      </Screen>
    );
  }
  return (
    <Screen back title={t('admin.title')} right={<Button small variant="ghost" icon="refresh" label={t('admin.refresh')} onPress={load} />}>
      <Banner tone="info" icon="shield-checkmark-outline" text={t('admin.notice')} />
      {loading ? <Loading /> : error ? <ErrorState onRetry={load} /> : stats ? (
        <Card>
          <Row title={t('admin.users')} right={<Text weight="700">{stats.users}</Text>} />
          <Row title={t('admin.active7')} right={<Text weight="700">{stats.active7}</Text>} />
          <Row title={t('admin.families')} right={<Text weight="700">{stats.families}</Text>} />
          {Object.entries(stats.plans).map(([p, n]) => (
            <Row key={p} title={`${t('admin.plans')} · ${p}`} right={<Text weight="700">{n}</Text>} />
          ))}
        </Card>
      ) : null}
      <SectionHeader title={t('admin.categories')} />
      <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
        {t('admin.categoriesHint')}
      </Text>
      <Card>
        {categories.map((c) => (
          <Row key={c.id} title={`${c.icon} ${c.label[lang]}`} subtitle={`${c.id} · ${c.order} · ${c.templates.length}`} />
        ))}
      </Card>
    </Screen>
  );
}
