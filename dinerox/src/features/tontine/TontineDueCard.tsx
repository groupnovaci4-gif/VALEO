/**
 * Accueil : une cotisation de tontine arrive dans 3 jours ou moins (ou est
 * en retard) → accès direct à « Mes tontines ». Rien s'il n'y a rien à faire.
 * Design system v2 : message d'état (attention / en retard) avec icône, texte et chevron.
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Card, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { diffDays } from '@/core/dates';
import { upcomingDue } from '@/core/tontine';

/** Fenêtre d'affichage sur l'accueil (jours). */
export const HOME_TONTINE_DAYS = 3;

export function TontineDueCard({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const money = useMoney();
  const { data, now } = useFinance();
  const due = upcomingDue(data, now, HOME_TONTINE_DAYS);
  if (!due.length) return null;
  const { tontine, item } = due[0];
  const days = diffDays(now, item.dueDate);
  const amount = hidden ? '••••••' : money(item.contribution);
  const late = item.status === 'late';
  const line = late ? t('tontine.home.late', { name: tontine.name, amount }) : days === 0 ? t('tontine.home.today', { name: tontine.name, amount }) : t('tontine.home.soon', { name: tontine.name, amount, days });
  return (
    <Card
      tone={late ? 'danger' : 'warning'}
      onPress={() => router.push(due.length > 1 ? '/tontines' : `/tontines/${tontine.id}`)}
      accessibilityLabel={line}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12 }}
    >
      <Icon name={late ? 'alert-circle' : 'people'} size={24} color={late ? colors.danger : colors.warning} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" weight="600">
          {line}
        </Text>
        {due.length > 1 ? (
          <Text variant="small" tone="muted">
            {t('tontine.home.more', { count: due.length - 1 })}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={20} color={colors.textSubtle} />
    </Card>
  );
}
