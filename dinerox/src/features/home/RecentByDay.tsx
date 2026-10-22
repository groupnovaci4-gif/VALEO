/**
 * Accueil, refonte finale B6 (ecrans/accueil-*.html, `.day` / `.txr`) : dernières opérations
 * groupées par jour (« 20 OCT. »), icône du dictionnaire (A4 : libellé → objectif lié →
 * sous-catégorie → catégorie → type) dans un carré 44 dp, petit logo de l'opérateur (A6) en
 * badge, libellé, « catégorie · compte », montant à droite. Même action qu'avant (le détail).
 */
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { AccountMark, ContentIcon, Text, accountMark, transactionIconSlug } from '@/components/ui';
import { useAccountLabel, useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { useData } from '@/store/app';
import { useOperators } from '@/services/operatorsConfig';
import { financingNature } from '@/core/nature';
import type { Transaction } from '@/core/types';
import { dayLabel, groupByDay } from './dayGroups';

export function RecentByDay({ txs }: { txs: Transaction[] }) {
  const { lang } = useI18n();
  const { colors } = useTheme();
  const groups = useMemo(() => groupByDay(txs), [txs]);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 20, paddingBottom: 6 }}>
      {groups.map((g) => (
        <View key={g.date}>
          <Text variant="caption" weight="600" tone="subtle" style={{ fontSize: 12, lineHeight: 16, letterSpacing: 0.3, textTransform: 'uppercase', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
            {dayLabel(lang, g.date)}
          </Text>
          {g.items.map((tx) => (
            <DayRow key={tx.id} tx={tx} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayRow({ tx }: { tx: Transaction }) {
  const { t } = useI18n();
  const { colors, dark } = useTheme();
  const money = useMoney();
  const cats = useCategoryLabels();
  const accountLabel = useAccountLabel();
  const data = useData();
  const operators = useOperators();
  const financing = financingNature(tx);
  const meta =
    tx.type === 'transfer'
      ? { name: t('home.tx.transfer'), icon: 'swap-horizontal', color: colors.info }
      : tx.type === 'adjustment'
        ? { name: t('tx.adjustment'), icon: 'create-outline', color: colors.info }
        : financing
          ? { name: t(`nature.${financing}` as TKey), icon: 'people-outline', color: colors.info }
          : cats.meta(tx.categoryId);
  const title = tx.payee || meta.name;
  const sub = tx.type === 'transfer' ? `${meta.name} · ${accountLabel(tx.accountId)} → ${accountLabel(tx.toAccountId)}` : `${meta.name} · ${accountLabel(tx.accountId)}`;
  const byCategory = tx.type !== 'transfer' && tx.type !== 'adjustment' && !financing;
  const goal = tx.goalId ? data.goals.find((g) => g.id === tx.goalId) : null;
  const slug = transactionIconSlug(tx, goal, byCategory);
  const account = data.accounts.find((a) => a.id === tx.accountId);
  const mark = account ? accountMark(account, operators) : null;
  const badge = account && (mark?.kind === 'logo' || mark?.kind === 'pill') ? account : null;
  const out = tx.type === 'expense' || (tx.type === 'adjustment' && tx.direction === 'out');
  const amount = out ? `-${money(tx.amount, { currency: tx.currency })}` : tx.type === 'income' ? money(tx.amount, { currency: tx.currency, signed: true }) : money(tx.amount, { currency: tx.currency });
  // Maquette : une sortie à l'encre, une entrée ou un virement en vert.
  const amountColor = out ? colors.text : finalPalette(dark).positive;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}, ${sub}`}
      onPress={() => router.push(`/transaction/${tx.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <ContentIcon slug={slug} ids={byCategory ? [tx.subcategoryId, tx.categoryId] : []} fallbackEmoji={'emoji' in meta ? meta.emoji : undefined} icon={meta.icon} color={meta.color} size={30} />
        {badge ? (
          <View style={{ position: 'absolute', right: -4, bottom: -4 }}>
            <AccountMark account={badge} color={badge.color} size={18} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" style={{ fontSize: 15 }}>
          {title}
        </Text>
        <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
          {sub}
        </Text>
      </View>
      <Text variant="label" numeric style={{ fontSize: 15, color: amountColor }}>
        {amount}
      </Text>
    </Pressable>
  );
}
