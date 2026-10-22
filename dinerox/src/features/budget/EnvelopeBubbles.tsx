/**
 * Enveloppes en BULLES (refonte finale B7 accueil, C2 budget ; ecrans/*.html, `.bub`) : une carte,
 * 3 colonnes (2 si le texte est agrandi ou l'écran étroit, A8), anneau de 76 dp (trait 6) autour
 * de l'icône de contenu (34 dp), nom, état ÉCRIT en couleur (« Dépassé de … », « Épuisée »,
 * « Reste … ») et, au Budget, le pourcentage. Un toucher ouvre l'enveloppe (comme avant).
 * Le lecteur d'écran entend le nom, le reste, l'état, le détail « dépensé sur budget · % », les
 * dépenses à venir et la part du revenu déclaré (mêmes informations que la ligne d'avant).
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { BIG_TEXT, shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { useMoney } from '@/hooks/useFinance';
import { ContentIcon, ProgressRing, Text, envelopeIconIds } from '@/components/ui';
import { envelopeIconSlug } from '@/components/ui/contentIconMap';
import type { EnvelopeStatus } from '@/core/budget';
import { BUBBLE_SIZES, bubbleLook } from './envelopeBubble';

const NARROW_WIDTH = 340;

export function EnvelopeBubbles({ items, hidden = false, percent = false, large = false, upcoming = {}, declaredShare }: { items: EnvelopeStatus[]; hidden?: boolean; percent?: boolean; large?: boolean; upcoming?: Record<string, number>; declaredShare?: (s: EnvelopeStatus) => number | null }) {
  const { colors, dark } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = width < NARROW_WIDTH || fontScale >= BIG_TEXT ? 2 : 3;
  const sz = BUBBLE_SIZES[large ? 'large' : 'normal'];
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingVertical: sz.padV, paddingHorizontal: 8, flexDirection: 'row', flexWrap: 'wrap', rowGap: sz.rowGap, ...(dark ? null : shadowB) }}>
      {items.map((s) => (
        <View key={s.envelope.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 4 }}>
          <EnvelopeBubble s={s} sz={sz} hidden={hidden} percent={percent} upcoming={upcoming[s.envelope.id] ?? 0} declaredShare={declaredShare ? declaredShare(s) : null} />
        </View>
      ))}
    </View>
  );
}

function EnvelopeBubble({ s, sz, hidden, percent, upcoming, declaredShare }: { s: EnvelopeStatus; sz: (typeof BUBBLE_SIZES)[keyof typeof BUBBLE_SIZES]; hidden: boolean; percent: boolean; upcoming: number; declaredShare: number | null }) {
  const { t, lang } = useI18n();
  const { colors, dark } = useTheme();
  const p = finalPalette(dark);
  const money = useMoney();
  const show = (n: number) => (hidden ? '••••••' : money(n));
  const look = bubbleLook(s);
  const color = p[look.ring];
  const status = look.text === 'over' ? t('env.over', { amount: show(-s.remaining) }) : look.text === 'reached' ? t('env.state.reached') : t('env.left', { amount: show(s.remaining) });
  const a11y = [
    s.envelope.name,
    status,
    t(`env.state.${s.level}` as TKey),
    t('env.ofPercent', { spent: show(s.spent), budget: show(s.budget), percent: s.percent }),
    upcoming > 0 ? t('env.upcoming', { amount: show(upcoming) }) : null,
    declaredShare !== null ? t('env.shareOfDeclared', { percent: lang === 'en' ? declaredShare.toFixed(2) : declaredShare.toFixed(2).replace('.', ',') }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => router.push(`/envelopes/${s.envelope.id}`)} style={({ pressed }) => ({ alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 2, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
      <ProgressRing size={sz.ring} stroke={sz.stroke} percent={s.percent} color={color} track={p.ringTrack}>
        <ContentIcon slug={envelopeIconSlug(s.envelope)} ids={envelopeIconIds(s.envelope.categoryIds)} icon={s.envelope.icon} color={s.envelope.color} size={sz.icon} />
      </ProgressRing>
      <Text variant="caption" weight="600" align="center" style={{ fontSize: 12, lineHeight: 16 }}>
        {s.envelope.name}
      </Text>
      <Text variant="caption" weight="600" align="center" style={{ fontSize: 11, lineHeight: 14, color }}>
        {status}
      </Text>
      {percent ? (
        <Text variant="caption" weight="400" tone="subtle" align="center" style={{ fontSize: 11, lineHeight: 14 }}>
          {`${s.percent} %`}
        </Text>
      ) : null}
    </Pressable>
  );
}
