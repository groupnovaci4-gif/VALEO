/**
 * Accueil, refonte finale B8 (ecrans/accueil-*.html, `.stats`) : « Octobre · Mois en cours »,
 * trois petites cartes — Revenus (vert), Dépenses, Épargne nette — montants sans devise, puis
 * « Reste à répartir » sur une ligne. Mêmes chiffres et mêmes actions qu'avant (useFinance) ;
 * les anciennes précisions (« perçus ce mois »…) restent dans le libellé d'accessibilité.
 * Texte agrandi ou écran étroit (A8) : une carte par ligne.
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { monthName, useI18n, type TKey } from '@/i18n';
import { BIG_TEXT, shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { SectionHeader, Text } from '@/components/ui';
import { formatMoney } from '@/core/money';
import { useCurrency, useMoney } from '@/hooks/useFinance';
import { parseISODate } from '@/core/dates';

const HIDDEN = '••••••';
const NARROW_WIDTH = 340;

export function MonthStats({ now, income, expense, savings, toAllocate, child, hidden }: { now: string; income: number; expense: number; savings: number; toAllocate: number; child: boolean; hidden: boolean }) {
  const { t, lang } = useI18n();
  const { colors, dark } = useTheme();
  const money = useMoney();
  const currency = useCurrency();
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < NARROW_WIDTH || fontScale >= BIG_TEXT;
  const name = monthName(lang, parseISODate(now).getMonth());
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const bare = (n: number) => (hidden ? HIDDEN : formatMoney(n, currency, { hideSymbol: true }));
  const stats: { key: string; label: TKey; sub: TKey; value: number; color?: string; to: string }[] = [
    { key: 'income', label: 'home.stat.income', sub: 'home.stat.income.sub', value: income, color: finalPalette(dark).positive, to: '/transactions?from=home' },
    { key: 'expense', label: 'home.stat.expense', sub: 'home.stat.expense.sub', value: expense, to: '/transactions?from=home' },
    { key: 'savings', label: 'home.stat.savings', sub: 'home.stat.savings.sub', value: savings, to: '/savings' },
  ];
  const card = { backgroundColor: colors.surface, borderRadius: 20, ...(dark ? null : shadowB) };
  return (
    <View>
      <SectionHeader title={title} action={t('home.month')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {stats.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityLabel={[t(s.label), hidden ? t('common.amountHidden') : money(s.value), t(s.sub)].join(', ')}
            onPress={() => router.push(s.to as never)}
            style={({ pressed }) => ({ ...card, flexBasis: narrow ? '100%' : '30%', flexGrow: 1, padding: 12, backgroundColor: pressed ? colors.surfaceAlt : colors.surface })}
          >
            <Text variant="caption" tone="subtle" style={{ fontSize: 12, lineHeight: 16 }}>
              {t(s.label)}
            </Text>
            <Text variant="titleS" numeric style={{ fontSize: 15, lineHeight: 20, marginTop: 4, color: s.color ?? colors.text }}>
              {bare(s.value)}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* Reste à répartir : EXACTEMENT le chiffre de l'onglet Budget (`unallocated`, §9) ; masqué chez un enfant (audit B6). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[t('home.stat.budget'), child ? t('child.askParent') : hidden ? t('common.amountHidden') : money(toAllocate)].join(', ')}
        onPress={() => router.push('/budget')}
        style={({ pressed }) => ({ ...card, marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? colors.surfaceAlt : colors.surface })}
      >
        <Text variant="label" weight="500" style={{ fontSize: 15 }}>
          {t('home.stat.budget')}
        </Text>
        <Text variant="label" numeric style={{ fontSize: 15, color: toAllocate < 0 && !child ? colors.danger : colors.text }}>
          {child ? t('child.askParent') : hidden ? HIDDEN : money(toAllocate)}
        </Text>
      </Pressable>
    </View>
  );
}
