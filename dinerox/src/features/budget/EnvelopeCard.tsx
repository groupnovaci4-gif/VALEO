/**
 * Pavé d'enveloppe (accueil et onglet Budget) : nom, reste (ou dépassement), barre, et
 * l'état ÉCRIT avec une icône — jamais la couleur seule (audit B3).
 * Le lecteur d'écran entend le nom, le reste et l'état en une phrase.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useMoney } from '@/hooks/useFinance';
import { IconCircle, ProgressBar, Tile, TileIcon, TileText, levelTone } from '@/components/ui';
import type { EnvelopeStatus } from '@/core/budget';

/** Icône de chaque état d'enveloppe (accompagne toujours le mot). */
export const LEVEL_ICON = { ok: 'checkmark-circle', warning: 'warning', reached: 'warning', critical: 'alert-circle' } as const;

/**
 * Enveloppe en PAVÉ (accueil et onglet Budget) : nom, reste (ou dépassement), barre, l'état
 * ÉCRIT avec une icône (jamais la couleur seule), « dépensé sur budget · % » sur une ligne.
 * `upcoming` : part des dépenses datées après aujourd'hui (« dont X à venir »).
 * `declaredShare` : part du revenu DÉCLARÉ (information, deux décimales ; jamais dans un espace familial, §9).
 */
export function EnvelopeTile({ s, hidden = false, declaredShare = null, upcoming = 0 }: { s: EnvelopeStatus; hidden?: boolean; declaredShare?: number | null; upcoming?: number }) {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const remaining = s.remaining < 0 ? t('env.over', { amount: show(-s.remaining) }) : t('env.left', { amount: show(s.remaining) });
  const state = t(`env.state.${s.level}` as TKey);
  const stateColor = s.level === 'critical' ? colors.danger : s.level === 'ok' ? colors.success : colors.warning;
  return (
    <Tile onPress={() => router.push(`/envelopes/${s.envelope.id}`)} accessibilityLabel={`${s.envelope.name}, ${remaining}, ${state}`}>
      <IconCircle icon={s.envelope.icon} color={s.envelope.color} size={36} />
      <TileText variant="bodyStrong">{s.envelope.name}</TileText>
      <TileText variant="label" tone={s.remaining < 0 ? 'danger' : 'default'}>
        {remaining}
      </TileText>
      <ProgressBar value={s.percent} tone={levelTone(s.level)} label={s.envelope.name} height={8} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TileIcon name={LEVEL_ICON[s.level]} size={18} color={stateColor} />
        <TileText variant="small" weight="600" color={stateColor} style={{ flexShrink: 1 }}>
          {state}
        </TileText>
      </View>
      <TileText variant="small" tone="muted">
        {t('env.ofPercent', { spent: show(s.spent), budget: show(s.budget), percent: s.percent })}
      </TileText>
      {/* Audit I1 : l'enveloppe compte les dépenses prévues du mois (c'est un budget) — dites « à venir ». */}
      {upcoming > 0 ? (
        <TileText variant="small" tone="muted">
          {t('env.upcoming', { amount: show(upcoming) })}
        </TileText>
      ) : null}
      {declaredShare !== null ? (
        <TileText variant="caption" tone="subtle">
          {t('env.shareOfDeclared', { percent: lang === 'en' ? declaredShare.toFixed(2) : declaredShare.toFixed(2).replace('.', ',') })}
        </TileText>
      ) : null}
    </Tile>
  );
}
