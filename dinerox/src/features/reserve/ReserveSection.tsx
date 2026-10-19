/**
 * Section « Réserves » de l'écran Objectifs (au-dessus des objectifs), en PAVÉS : solde
 * et plafond de chaque réserve, ou invitation à créer la réserve famille.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, ProgressBar, SectionHeader, Text, Tile, TileGrid, TileText } from '@/components/ui';
import { isReserve, reserveState } from '@/core/reserve';
import { can } from '@/core/permissions';

export function ReserveSection() {
  const { t } = useI18n();
  const money = useMoney();
  const { role } = useApp();
  const { data } = useFinance();
  const reserves = data.goals.filter((g) => !g.deleted && isReserve(g) && (g.status === 'active' || g.status === 'paused'));
  const canCreate = can(role, 'create', 'goals');
  if (!reserves.length && !canCreate) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionHeader title={t('reserve.section')} action={reserves.length && canCreate ? t('common.add') : undefined} onAction={() => router.push('/reserve/new')} />
      {reserves.length ? (
        <TileGrid style={{ marginBottom: 6 }}>
          {reserves.map((r) => {
            const s = reserveState(r, data.goalContributions);
            return (
              <Tile key={r.id} accessibilityLabel={`${r.name} · ${money(s.balance)} · ${t('reserve.of', { amount: money(s.target) })}`} onPress={() => router.push(`/reserve/${r.id}`)}>
                <Text style={{ fontSize: 22 }}>{r.icon}</Text>
                <TileText variant="bodyStrong">{r.name}</TileText>
                <TileText variant="bodyStrong">{money(s.balance)}</TileText>
                <ProgressBar value={s.percent} tone={s.full ? 'success' : 'primary'} label={r.name} />
                <TileText variant="caption" tone="subtle">
                  {t('reserve.of', { amount: money(s.target) })}
                  {s.monthly ? ` · ${t('reserve.monthlyPlan', { amount: money(s.monthly) })}` : ''}
                </TileText>
              </Tile>
            );
          })}
        </TileGrid>
      ) : (
        // Pavé seul (invitation à créer la réserve) : toute la largeur.
        <Tile style={{ marginBottom: 6 }}>
          <Text variant="bodyStrong">🤝 {t('reserve.defaultName')}</Text>
          <Text variant="small" tone="muted">
            {t('reserve.createCta.body')}
          </Text>
          <Button icon="add-circle-outline" label={t('reserve.create')} onPress={() => router.push('/reserve/new')} style={{ alignSelf: 'flex-start' }} />
        </Tile>
      )}
      <Text variant="caption" tone="subtle" style={{ marginTop: 2, marginBottom: 6 }}>
        {t('reserve.section.hint')}
      </Text>
    </View>
  );
}
