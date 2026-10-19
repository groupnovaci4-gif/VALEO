/**
 * Budget du mois — TOUT l'écran en pavés (grille de deux colonnes, une seule sous 340 px) :
 *  1. un seul titre (« Budget ») et le mois ;
 *  2. résumé : restant (barre et % écrit, dépassement écrit), prévu, dépensé, reste à
 *     répartir, dépenses hors enveloppe, remboursements de dettes ;
 *  3. alertes d'enveloppes (« Écouter » à côté de chaque pavé) ;
 *  4. enveloppes : nom, reste, état écrit + icône (jamais la couleur seule) ;
 *  5. accès : « Nouvelle enveloppe », « Budget automatique ».
 * Aucune formule ici : tous les chiffres viennent de `useFinance`.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { EmptyState, IconCircle, ProgressBar, Screen, SectionHeader, Text, Tile, TileGrid, TileIcon, TileText } from '@/components/ui';
import { InsightTile, SpaceSwitcher } from '@/features/rows';
import { EnvelopeTile } from '@/features/budget/EnvelopeCard';
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
  const { colors } = useTheme();
  const { role, profile } = useApp();
  const money = useMoney();
  const { envelopes, budget, insights, now, toAllocate, spaceKind } = useFinance();
  const declared = profile?.financial?.monthlyIncome ?? null;
  const pct = budget.planned > 0 ? Math.round((budget.spent / budget.planned) * 100) : 0;
  const alerts = insights.filter((i) => i.kind === 'envelope_threshold' || i.kind === 'envelope_over_streak');
  const editable = can(role, 'create', 'envelopes');
  const over = budget.remaining < 0;
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

      {/* Résumé : un pavé par chiffre (information seule, pas de bouton). */}
      <TileGrid>
        {envelopes.length ? (
          <Tile>
            <TileText variant="small" tone="muted">
              {t('budget.remaining')}
            </TileText>
            <TileText variant="amountM" tone={over ? 'danger' : 'default'}>
              {money(budget.remaining)}
            </TileText>
            {over ? (
              // Dépassement : écrit, avec une icône (jamais la couleur seule).
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TileIcon name="alert-circle" size={18} color={colors.danger} />
                <TileText variant="small" weight="600" tone="danger" style={{ flexShrink: 1 }}>
                  {t('env.over', { amount: money(-budget.remaining) })}
                </TileText>
              </View>
            ) : null}
            <ProgressBar value={pct} height={8} label={t('budget.spent')} />
            <TileText variant="small" tone="muted">
              {t('env.consumed', { percent: pct })}
            </TileText>
          </Tile>
        ) : null}
        {envelopes.length ? <SummaryTile label={t('budget.planned')} value={money(budget.planned)} /> : null}
        {envelopes.length ? <SummaryTile label={t('budget.spent')} value={money(budget.spent)} /> : null}
        {/* Argent disponible v2 (§9) : reste à répartir = D − enveloppes restantes − engagements hors enveloppes. */}
        {envelopes.length ? (
          <Tile>
            <TileText variant="small" weight="600" tone={toAllocate.amount < 0 ? 'danger' : 'default'}>
              {toAllocate.amount < 0 ? t('budget.toAllocateOver', { amount: money(-toAllocate.amount) }) : t('budget.toAllocate', { amount: money(toAllocate.amount) })}
            </TileText>
          </Tile>
        ) : null}
        {budget.unassigned > 0 ? <SummaryTile label={t('budget.unassigned')} value={money(budget.unassigned)} /> : null}
        {/* §9 (E44b) : le capital remboursé n'est pas une dépense — pavé à part, hors enveloppes. */}
        {budget.debtRepayments > 0 ? (
          <Tile>
            <TileText variant="small" tone="muted">
              {t('budget.debtRepayments', { amount: money(budget.debtRepayments) })}
            </TileText>
          </Tile>
        ) : null}
      </TileGrid>

      {alerts.length ? (
        <TileGrid>
          {alerts.slice(0, 4).map((i) => (
            <InsightTile key={i.id} insight={i} />
          ))}
        </TileGrid>
      ) : null}

      <SectionHeader title={t('env.title')} />
      {envelopes.length ? (
        <TileGrid>
          {envelopes.map((s) => (
            <EnvelopeTile key={s.envelope.id} s={s} declaredShare={shareOfDeclared(s.budget, declared, spaceKind)} />
          ))}
        </TileGrid>
      ) : (
        // Pavé seul : toute la largeur.
        <Tile style={{ marginBottom: 12 }}>
          <EmptyState icon="pie-chart-outline" title={t('env.empty.title')} body={t('env.empty.body')} action={editable ? t('env.empty.cta') : undefined} onAction={() => router.push('/budget/auto')} />
        </Tile>
      )}

      {/* Accès : créer une enveloppe, budget automatique. */}
      {editable ? (
        <TileGrid>
          <AccessTile icon="add-circle" label={t('env.new')} onPress={() => router.push('/envelopes/edit')} />
          {envelopes.length ? <AccessTile icon="sparkles" label={t('budget.auto')} onPress={() => router.push('/budget/auto')} /> : null}
        </TileGrid>
      ) : null}
    </Screen>
  );
}

/** Pavé de résumé : libellé, puis le montant (information seule). */
function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Tile>
      <TileText variant="small" tone="muted">
        {label}
      </TileText>
      <TileText variant="amountS">{value}</TileText>
    </Tile>
  );
}

/** Pavé d'accès : icône + titre, ouvre un écran. */
function AccessTile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tile onPress={onPress} accessibilityLabel={label}>
      <IconCircle icon={icon} color={colors.primary} size={40} />
      <TileText variant="bodyStrong">{label}</TileText>
    </Tile>
  );
}
