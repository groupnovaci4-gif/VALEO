import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { Icon, Text } from '@/components/ui';
import type { DataSource, Recommendation } from '@/core/intelligence';

/** Pastille de provenance d'un chiffre : vos données, déclaré, estimation. */
export function SourceTag({ source }: { source: DataSource }) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const bg = source === 'user' ? colors.primaryLight : source === 'declared' ? colors.infoBg : colors.warningBg;
  const fg = source === 'user' ? colors.primary : source === 'declared' ? colors.info : colors.secondary;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text variant="caption" weight="600" style={{ color: fg }}>
        {t(`intel.source.${source}` as TKey)}
      </Text>
    </View>
  );
}

export function useRecommendationText() {
  const { t } = useI18n();
  const money = useMoney();
  const cats = useCategoryLabels();
  return (r: Recommendation) => {
    const p: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(r.params)) p[k] = typeof v === 'number' && k !== 'percent' ? money(v) : v;
    if (typeof r.params.categoryId === 'string') p.category = cats.byId(r.params.categoryId);
    return t(`intel.rec.${r.kind}` as TKey, p);
  };
}

export function RecommendationCard({ r }: { r: Recommendation }) {
  const { colors, radius } = useTheme();
  const text = useRecommendationText();
  const map = {
    positive: [colors.successBg, colors.success, 'sparkles'],
    info: [colors.infoBg, colors.info, 'bulb-outline'],
    warning: [colors.warningBg, colors.warning, 'warning-outline'],
    danger: [colors.dangerBg, colors.danger, 'alert-circle-outline'],
  } as const;
  const [bg, fg, icon] = map[r.severity];
  return (
    <Pressable
      accessibilityRole={r.link ? 'button' : 'text'}
      onPress={r.link ? () => router.push(r.link as never) : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, backgroundColor: bg, borderRadius: radius.lg, padding: 14, marginBottom: 10, opacity: pressed ? 0.85 : 1 })}
    >
      <Icon name={icon} size={20} color={fg} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text variant="small" style={{ color: colors.text }}>
          {text(r)}
        </Text>
        <SourceTag source={r.source} />
      </View>
      {r.link ? <Icon name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}
