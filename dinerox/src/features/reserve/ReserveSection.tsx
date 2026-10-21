/**
 * Section « Réserves » de l'écran Objectifs (au-dessus des objectifs) — étape 4, en LISTE : icône
 * de contenu, nom et solde, barre, plafond et mise de côté prévue ; ou invitation à créer la
 * réserve famille.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, ContentIcon, ListCard, ProgressBar, SectionHeader, Text, reserveIcon } from '@/components/ui';
import { isReserve, reserveState } from '@/core/reserve';
import { can } from '@/core/permissions';

export function ReserveSection() {
  const { t } = useI18n();
  const money = useMoney();
  const { colors } = useTheme();
  const { role } = useApp();
  const { data } = useFinance();
  const reserves = data.goals.filter((g) => !g.deleted && isReserve(g) && (g.status === 'active' || g.status === 'paused'));
  const canCreate = can(role, 'create', 'goals');
  if (!reserves.length && !canCreate) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionHeader title={t('reserve.section')} action={reserves.length && canCreate ? t('common.add') : undefined} onAction={() => router.push('/reserve/new')} />
      {reserves.length ? (
        <ListCard>
          {reserves.map((r) => {
            const s = reserveState(r, data.goalContributions);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.name} · ${money(s.balance)} · ${t('reserve.of', { amount: money(s.target) })}`}
                onPress={() => router.push(`/reserve/${r.id}`)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
              >
                <ContentIcon {...reserveIcon(r)} color={colors.primary} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                      {r.name}
                    </Text>
                    <Text variant="bodyStrong">{money(s.balance)}</Text>
                  </View>
                  <View style={{ marginTop: 6 }}>
                    <ProgressBar value={s.percent} tone={s.full ? 'success' : 'primary'} height={6} label={r.name} />
                  </View>
                  <Text variant="small" tone="muted" style={{ fontSize: 13, lineHeight: 18, marginTop: 6 }}>
                    {t('reserve.of', { amount: money(s.target) })}
                    {s.monthly ? ` · ${t('reserve.monthlyPlan', { amount: money(s.monthly) })}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ListCard>
      ) : (
        // Invitation à créer la réserve : une carte.
        <Card style={{ gap: 8 }}>
          <Text variant="bodyStrong">🤝 {t('reserve.defaultName')}</Text>
          <Text variant="small" tone="muted">
            {t('reserve.createCta.body')}
          </Text>
          <Button icon="add-circle-outline" label={t('reserve.create')} onPress={() => router.push('/reserve/new')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}
      <Text variant="caption" tone="subtle" style={{ marginTop: 6, marginBottom: 6 }}>
        {t('reserve.section.hint')}
      </Text>
    </View>
  );
}
