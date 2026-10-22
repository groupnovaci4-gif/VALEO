/**
 * Budget du mois — refonte finale (docs/design-pro-maquette-finale, FINAL-budget.png,
 * DECISIONS.md C1, C2 ; valeurs : ecrans/budget-*.html) :
 *  1. « Budget » et le mois ;
 *  2. C1 : carte principale VERTE et FLOTTANTE (même carte que l'accueil) — anneau doré « % consommé »,
 *     Reste dans les enveloppes, Prévu, Dépensé, À répartir ; dépassement, reste à répartir négatif,
 *     dépenses hors enveloppe et remboursements de dettes restent écrits quand ils existent ;
 *  3. C2 : onglets Enveloppes / Notifications (N) ; enveloppes en bulles (% sous chacune) ;
 *     notifications du budget (« Tout marquer comme lu », mêmes règles que « À lire ») ;
 *  4. boutons « Nouvelle » (enveloppe) et « Automatique ».
 * Aucune formule ici : tous les chiffres viennent de `useFinance`.
 */
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BIG_TEXT, DesignV2, shadowB, useTheme } from '@/theme';
import { finalPalette } from '@/theme/finalPalette';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useCurrency, useFinance, useMoney } from '@/hooks/useFinance';
import { Card, EmptyState, GradientCard, Icon, ProgressRing, Screen, Text } from '@/components/ui';
import { SpaceSwitcher } from '@/features/rows';
import { ToReadList } from '@/features/notifications/ToReadList';
import { useToRead } from '@/features/notifications/useToRead';
import { EnvelopeBubbles } from '@/features/budget/EnvelopeBubbles';
import { shareOfDeclared } from '@/core/allowance';
import { currencyInfo, formatMoney } from '@/core/money';
import { can } from '@/core/permissions';

export default function Budget() {
  return (
    <DesignV2>
      <BudgetScreen />
    </DesignV2>
  );
}

function BudgetScreen() {
  const { t, monthYear } = useI18n();
  const { colors, dark } = useTheme();
  const { profile, role } = useApp();
  const { envelopes, now, spaceKind, envelopeSoon } = useFinance();
  const { items } = useToRead();
  const notifCount = items.filter((x) => x.kind === 'budget').length;
  const declared = profile?.financial?.monthlyIncome ?? null;
  const editable = can(role, 'create', 'envelopes');
  const [tab, setTab] = useState<'envelopes' | 'notifications'>('envelopes');
  const segment = (key: 'envelopes' | 'notifications', label: string) => {
    const on = tab === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => setTab(key)}
        style={{ flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: on ? colors.surface : 'transparent', ...(on && !dark ? shadowB : null) }}
      >
        <Text variant="caption" weight="600" align="center" style={{ fontSize: 13, lineHeight: 18, color: on ? colors.text : colors.textMuted }}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <Screen brandSection={t('tab.budget')}>
      <SpaceSwitcher />
      <View style={{ marginTop: 4, marginBottom: 12 }}>
        <Text variant="titleL" accessibilityRole="header">
          {t('budget.title')}
        </Text>
        <Text variant="small" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
          {monthYear(now)}
        </Text>
      </View>

      {envelopes.length ? <SummaryCard /> : null}

      {/* C2 : onglets Enveloppes / Notifications (N). */}
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 3, marginTop: 16, marginBottom: 12 }}>
        {segment('envelopes', t('budget.tab.envelopes'))}
        {segment('notifications', t('budget.tab.notifications', { count: notifCount }))}
      </View>

      {tab === 'envelopes' ? (
        envelopes.length ? (
          <EnvelopeBubbles items={envelopes} large percent upcoming={envelopeSoon} declaredShare={(s) => shareOfDeclared(s.budget, declared, spaceKind)} />
        ) : (
          <Card>
            <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body')} action={editable ? t('env.empty.cta') : undefined} onAction={() => router.push('/budget/auto')} />
          </Card>
        )
      ) : notifCount ? null : (
        <Card>
          <EmptyState icon="notifications-outline" title={t('notif.empty')} body={t('ins.empty')} />
        </Card>
      )}

      {/* Refonte finale C2 / E3 : les messages du budget, mêmes règles que « À lire » (accueil). */}
      <ToReadList budgetOnly />

      {/* C2 : « Nouvelle » (enveloppe) et « Automatique ». */}
      {editable ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('env.new')}
            onPress={() => router.push('/envelopes/edit')}
            style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minHeight: 48, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? colors.primaryPressed : colors.primary })}
          >
            <Icon name="add" size={18} color={colors.onPrimary} />
            <Text variant="label" style={{ fontSize: 14, color: colors.onPrimary }}>
              {t('budget.newShort')}
            </Text>
          </Pressable>
          {envelopes.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budget.auto')}
              onPress={() => router.push('/budget/auto')}
              style={({ pressed }) => ({ flexGrow: 1, flexBasis: '45%', minHeight: 48, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: pressed ? colors.border : colors.surfaceAlt })}
            >
              <Icon name="sparkles-outline" size={16} color={finalPalette(dark).violetFg} />
              <Text variant="label" style={{ fontSize: 14 }}>
                {t('budget.autoShort')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** Valeur de la carte verte : sans devise (maquette), masquée au lecteur d'écran par la phrase complète. */
const ON_HERO_MUTED = '#C9DED6';

/**
 * C1 — carte principale verte et flottante : anneau doré 112 dp (trait 11) « N % consommé »,
 * « Reste dans les enveloppes » (28/34), puis Prévu, Dépensé, À répartir (montants sans devise).
 * Texte agrandi ou écran étroit (A8) : l'anneau passe au-dessus.
 */
function SummaryCard() {
  const { t } = useI18n();
  const { role } = useApp();
  const money = useMoney();
  const currency = useCurrency();
  const { budget, toAllocate } = useFinance();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 340 || fontScale >= BIG_TEXT;
  const pct = budget.planned > 0 ? Math.round((budget.spent / budget.planned) * 100) : 0;
  const over = budget.remaining < 0;
  const bare = (n: number) => formatMoney(n, currency, { hideSymbol: true });
  const child = role === 'child';
  const line = (label: string, value: string, a11y: string, key: string) => (
    <View key={key} accessible accessibilityLabel={`${label}, ${a11y}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, minHeight: 22 }}>
      <Text variant="caption" weight="400" style={{ fontSize: 13, lineHeight: 18, color: ON_HERO_MUTED }}>
        {label}
      </Text>
      <Text variant="caption" weight="600" numeric tone="onHero" style={{ fontSize: 14, lineHeight: 20 }}>
        {value}
      </Text>
    </View>
  );
  const note = (text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
      <Icon name="alert-circle" size={16} color="#FFFFFF" />
      <Text variant="caption" weight="600" tone="onHero" style={{ flexShrink: 1, fontSize: 13, lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
  return (
    <GradientCard float style={{ marginTop: 6, marginBottom: 6, padding: 18 }}>
      <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: 16 }}>
        <ProgressRing size={112} stroke={11} percent={pct} color="#E8B85A" track="rgba(255,255,255,0.22)">
          <View accessible accessibilityLabel={t('env.consumed', { percent: pct })} style={{ alignItems: 'center' }}>
            <Text variant="titleM" numeric tone="onHero" weight="800" style={{ fontSize: 22, lineHeight: 28 }}>
              {`${pct} %`}
            </Text>
            <Text variant="caption" weight="500" style={{ fontSize: 11, lineHeight: 14, color: ON_HERO_MUTED }}>
              {t('budget.consumedShort')}
            </Text>
          </View>
        </ProgressRing>
        <View style={{ flex: stacked ? undefined : 1, alignSelf: stacked ? 'stretch' : 'auto', minWidth: 0 }}>
          <Text variant="caption" weight="500" style={{ fontSize: 13, lineHeight: 18, color: ON_HERO_MUTED }}>
            {t('budget.leftInEnvelopes')}
          </Text>
          <View accessible accessibilityLabel={money(budget.remaining)} style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2, marginBottom: 8 }}>
            <Text variant="amountHero" numeric tone="onHero" style={{ fontSize: 28, lineHeight: 34 }}>
              {bare(budget.remaining)}
            </Text>
            <Text variant="label" tone="onHero" style={{ fontSize: 14, marginLeft: 4 }}>
              {currencyInfo(currency).symbol}
            </Text>
          </View>
          {line(t('budget.planned'), bare(budget.planned), money(budget.planned), 'planned')}
          {line(t('budget.spent'), bare(budget.spent), money(budget.spent), 'spent')}
          {/* Argent disponible v2 (§9) : reste à répartir ; masqué chez un enfant (audit B6). */}
          {child ? line(t('budget.toAllocateShort'), t('child.askParent'), t('child.askParent.why'), 'allocate') : line(t('budget.toAllocateShort'), bare(toAllocate.amount), money(toAllocate.amount), 'allocate')}
          {budget.unassigned > 0 ? line(t('budget.unassigned'), bare(budget.unassigned), money(budget.unassigned), 'unassigned') : null}
        </View>
      </View>
      {/* Dépassement et reste à répartir négatif : ÉCRITS, avec une icône (jamais la couleur seule). */}
      {over ? note(t('env.over', { amount: money(-budget.remaining) })) : null}
      {!child && toAllocate.amount < 0 ? note(t('budget.toAllocateOver', { amount: money(-toAllocate.amount) })) : null}
      {/* §9 (E44b) : le capital remboursé n'est pas une dépense — ligne à part, hors enveloppes. */}
      {budget.debtRepayments > 0 ? (
        <Text variant="caption" weight="400" style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: ON_HERO_MUTED }}>
          {t('budget.debtRepayments', { amount: money(budget.debtRepayments) })}
        </Text>
      ) : null}
    </GradientCard>
  );
}
