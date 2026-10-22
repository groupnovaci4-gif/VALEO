/**
 * Budget du mois — étape 4 (maquette validée du fondateur) :
 *  1. un seul titre (« Budget ») et le mois ;
 *  2. résumé en UNE carte : restant (barre et % écrit, dépassement écrit), puis en lignes : prévu,
 *     dépensé, reste à répartir, dépenses hors enveloppe, remboursements de dettes ;
 *  3. alertes d'enveloppes dans une carte (« Écouter » à côté de chaque ligne) ;
 *  4. enveloppes en LISTE : nom, reste, état écrit (jamais la couleur seule) ;
 *  5. accès en ronds de couleur : « Nouvelle enveloppe », « Budget automatique ».
 * Aucune formule ici : tous les chiffres viennent de `useFinance`.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Card, CircleGrid, CircleTile, EmptyState, Icon, ListCard, ProgressBar, Screen, SectionHeader, Text } from '@/components/ui';
import { SpaceSwitcher } from '@/features/rows';
import { ToReadList } from '@/features/notifications/ToReadList';
import { EnvelopeRow } from '@/features/budget/EnvelopeCard';
import { shareOfDeclared } from '@/core/allowance';
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
  const { profile, role } = useApp();
  const { envelopes, now, spaceKind, envelopeSoon } = useFinance();
  const declared = profile?.financial?.monthlyIncome ?? null;
  const editable = can(role, 'create', 'envelopes');
  return (
    <Screen brandSection={t('tab.budget')}>
      <SpaceSwitcher />
      <View style={{ marginTop: 4, marginBottom: 12 }}>
        <Text variant="titleL" accessibilityRole="header">
          {t('budget.title')}
        </Text>
        <Text variant="small" tone="muted">
          {monthYear(now)}
        </Text>
      </View>

      {envelopes.length ? <SummaryCard /> : null}

      {/* Refonte finale C2 / E3 : les messages du budget, mêmes règles que « À lire » (accueil). */}
      <ToReadList budgetOnly />

      <SectionHeader title={t('env.title')} action={envelopes.length ? String(envelopes.length) : undefined} />
      {envelopes.length ? (
        <ListCard>
          {envelopes.map((s) => (
            <EnvelopeRow key={s.envelope.id} s={s} declaredShare={shareOfDeclared(s.budget, declared, spaceKind)} upcoming={envelopeSoon[s.envelope.id] ?? 0} />
          ))}
        </ListCard>
      ) : (
        <Card>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body')} action={editable ? t('env.empty.cta') : undefined} onAction={() => router.push('/budget/auto')} />
        </Card>
      )}

      {/* Accès : créer une enveloppe, budget automatique (ronds de couleur pleine). */}
      {editable ? (
        <View style={{ marginTop: 12 }}>
          <CircleGrid columns={2}>
            <CircleTile family="vert" icon="add" label={t('env.new')} onPress={() => router.push('/envelopes/edit')} />
            {envelopes.length ? <CircleTile family="violet" icon="sparkles" label={t('budget.auto')} onPress={() => router.push('/budget/auto')} /> : null}
          </CircleGrid>
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Résumé du mois en UNE carte : « Reste dans les enveloppes » (34), barre, « Consommé : N % »,
 * puis une ligne par chiffre. Dépassement et reste négatif : écrits, avec une icône.
 */
function SummaryCard() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { role } = useApp();
  const money = useMoney();
  const { budget, toAllocate } = useFinance();
  const pct = budget.planned > 0 ? Math.round((budget.spent / budget.planned) * 100) : 0;
  const over = budget.remaining < 0;
  const line = (label: string, value: React.ReactNode, key: string) => (
    <View key={key} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text variant="body" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {value}
    </View>
  );
  const amount = (n: number, danger?: boolean) => <Amount text={money(n)} size="S" tone={danger ? 'danger' : 'default'} align="right" />;
  return (
    <Card padded={false}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text variant="caption" tone="muted">
          {t('budget.leftInEnvelopes')}
        </Text>
        <View style={{ marginTop: 2, marginBottom: 10 }}>
          <Amount text={money(budget.remaining)} size="hero" tone={over ? 'danger' : 'default'} style={{ fontSize: 34, lineHeight: 40 }} />
        </View>
        {over ? (
          // Dépassement : écrit, avec une icône (jamais la couleur seule).
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="alert-circle" size={18} color={colors.danger} />
            <Text variant="small" weight="600" tone="danger" style={{ flexShrink: 1 }}>
              {t('env.over', { amount: money(-budget.remaining) })}
            </Text>
          </View>
        ) : null}
        <ProgressBar value={pct} height={8} label={t('budget.spent')} />
        <Text variant="small" tone="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 18 }}>
          {t('env.consumed', { percent: pct })}
        </Text>
      </View>
      {line(t('budget.planned'), amount(budget.planned), 'planned')}
      {line(t('budget.spent'), amount(budget.spent), 'spent')}
      {/* Argent disponible v2 (§9) : reste à répartir = D − enveloppes restantes − engagements hors enveloppes. */}
      {role === 'child'
        ? // Audit B6 : masqué chez un enfant (dettes, tontines et charges gérées par les parents).
          line(
            t('budget.toAllocateLabel'),
            <View style={{ flexShrink: 1 }}>
              <Text variant="bodyStrong">{t('child.askParent')}</Text>
              <Text variant="small" tone="muted">
                {t('child.askParent.why')}
              </Text>
            </View>,
            'allocate',
          )
        : line(t('budget.toAllocateLabel'), amount(toAllocate.amount, toAllocate.amount < 0), 'allocate')}
      {role !== 'child' && toAllocate.amount < 0 ? (
        // Négatif : écrit, avec une icône (jamais la couleur seule).
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
          <Icon name="alert-circle" size={18} color={colors.danger} />
          <Text variant="small" weight="600" tone="danger" style={{ flexShrink: 1 }}>
            {t('budget.toAllocateOver', { amount: money(-toAllocate.amount) })}
          </Text>
        </View>
      ) : null}
      {budget.unassigned > 0 ? line(t('budget.unassigned'), amount(budget.unassigned), 'unassigned') : null}
      {/* §9 (E44b) : le capital remboursé n'est pas une dépense — ligne à part, hors enveloppes. */}
      {budget.debtRepayments > 0 ? (
        <View style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text variant="small" tone="muted">
            {t('budget.debtRepayments', { amount: money(budget.debtRepayments) })}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
