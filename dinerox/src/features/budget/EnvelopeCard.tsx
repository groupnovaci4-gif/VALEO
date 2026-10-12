/**
 * Carte d'enveloppe v2 (accueil et onglet Budget) : nom, reste (ou dépassement),
 * barre, et l'état ÉCRIT avec une icône — jamais la couleur seule (audit B3).
 * Le lecteur d'écran entend le nom, le reste et l'état en une phrase.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useMoney } from '@/hooks/useFinance';
import { Card, Icon, IconCircle, ProgressBar, Text, levelTone } from '@/components/ui';
import type { EnvelopeStatus } from '@/core/budget';

const LEVEL_ICON = { ok: 'checkmark-circle', warning: 'warning', reached: 'warning', critical: 'alert-circle' } as const;

/** Enveloppe : nom, reste (ou dépassement), barre, et l'état ÉCRIT avec une icône (jamais la couleur seule). */
export function EnvelopeCard({ s, hidden = false }: { s: EnvelopeStatus; hidden?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const remaining = s.remaining < 0 ? t('env.over', { amount: show(-s.remaining) }) : t('env.left', { amount: show(s.remaining) });
  const state = t(`env.state.${s.level}` as TKey);
  const stateColor = s.level === 'critical' ? colors.danger : s.level === 'ok' ? colors.success : colors.warning;
  return (
    <Card onPress={() => router.push(`/envelopes/${s.envelope.id}`)} accessibilityLabel={`${s.envelope.name}, ${remaining}, ${state}`} style={{ marginBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconCircle icon={s.envelope.icon} color={s.envelope.color} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {s.envelope.name}
          </Text>
          <Text variant="label" tone={s.remaining < 0 ? 'danger' : 'default'}>
            {remaining}
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
      </View>
      <ProgressBar value={s.percent} tone={levelTone(s.level)} label={s.envelope.name} height={8} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={LEVEL_ICON[s.level]} size={18} color={stateColor} />
          <Text variant="small" weight="600" style={{ color: stateColor }}>
            {state}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {t('env.consumed', { percent: s.percent })}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {t('env.of', { spent: show(s.spent), budget: show(s.budget) })}
      </Text>
    </Card>
  );
}
