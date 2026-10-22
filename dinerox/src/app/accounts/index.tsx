/**
 * Comptes — refonte finale G1 (FINAL-comptes.png ; ecrans/maquette-comptes-index.html › accountsfull) :
 * « Comptes » + « + », bandeau « DineroX ne détient pas votre argent » sur fond sable, « Argent
 * disponible » en grand, puis Comptes et Épargne en liste (logos du fondateur ; icônes 3D pour
 * Cash, banque et épargne — cochon de profil). Aucun calcul ici (`useFinance`).
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useCurrency, useFinance, useMoney } from '@/hooks/useFinance';
import { Card, EmptyState, Icon, IconButton, Screen, SectionHeader, Text } from '@/components/ui';
import { AccountRow } from '@/features/rows';
import { can } from '@/core/permissions';
import { currencyInfo, formatMoney } from '@/core/money';
import { DesignV2, shadowB, useTheme } from '@/theme';

export default function Accounts() {
  return (
    <DesignV2>
      <AccountsScreen />
    </DesignV2>
  );
}

function AccountsScreen() {
  const { t } = useI18n();
  const { role } = useApp();
  const { colors, dark } = useTheme();
  const currency = useCurrency();
  const money = useMoney();
  const { data, balances, money: current } = useFinance();
  const sorted = [...data.accounts].sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
  const spending = sorted.filter((a) => !a.isSavings);
  const savings = sorted.filter((a) => a.isSavings);
  const card = { backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden' as const, ...(dark ? null : shadowB) };
  return (
    <Screen back title={t('acc.title')} right={can(role, 'create', 'accounts') ? <IconButton icon="add" size={26} label={t('acc.new')} onPress={() => router.push('/accounts/edit')} /> : undefined}>
      {/* Bandeau sur fond sable (maquette `.banner`). */}
      <View accessible accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginTop: 4, marginBottom: 12 }}>
        <Icon name="information-circle-outline" size={22} color={colors.textMuted} />
        <Text variant="body" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
          {t('acc.trackingNotice')}
        </Text>
      </View>
      {data.accounts.length === 0 ? (
        <Card>
          <EmptyState emoji="👛" title={t('acc.empty.title')} body={t('acc.empty.body')} action={t('acc.new')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : (
        <>
          <View style={{ ...card, padding: 16 }} accessible accessibilityLabel={`${t('home.available')}, ${money(current.available)}`}>
            <Text variant="caption" tone="muted">
              {t('home.available')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Text variant="amountHero" numeric style={{ fontSize: 34, lineHeight: 40 }}>
                {formatMoney(current.available, currency, { hideSymbol: true })}
              </Text>
              <Text variant="label" style={{ fontSize: 16, marginLeft: 6 }}>
                {currencyInfo(currency).symbol}
              </Text>
            </View>
          </View>
          <SectionHeader title={t('acc.title')} />
          <View style={card}>
            {spending.map((a, i) => (
              <View key={a.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <AccountRow account={a} balance={balances[a.id] ?? 0} />
              </View>
            ))}
          </View>
          {savings.length ? (
            <>
              <SectionHeader title={t('sav.title')} />
              <View style={card}>
                {savings.map((a, i) => (
                  <View key={a.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <AccountRow account={a} balance={balances[a.id] ?? 0} />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
