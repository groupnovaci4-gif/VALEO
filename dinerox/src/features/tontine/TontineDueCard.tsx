/**
 * Accueil : une cotisation de tontine arrive dans 3 jours ou moins (ou est
 * en retard) → accès direct à « Mes tontines ». Rien s'il n'y a rien à faire.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { diffDays } from '@/core/dates';
import { upcomingDue } from '@/core/tontine';

/** Fenêtre d'affichage sur l'accueil (jours). */
export const HOME_TONTINE_DAYS = 3;

export function TontineDueCard({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const { data, now } = useFinance();
  const due = upcomingDue(data, now, HOME_TONTINE_DAYS);
  if (!due.length) return null;
  const { tontine, item } = due[0];
  const days = diffDays(now, item.dueDate);
  const amount = hidden ? '••••••' : money(item.contribution);
  const line = item.status === 'late' ? t('tontine.home.late', { name: tontine.name, amount }) : days === 0 ? t('tontine.home.today', { name: tontine.name, amount }) : t('tontine.home.soon', { name: tontine.name, amount, days });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line}
      onPress={() => router.push(due.length > 1 ? '/tontines' : `/tontines/${tontine.id}`)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: item.status === 'late' ? colors.danger : colors.border, padding: 12, marginBottom: 12 })}
    >
      <Icon name="people" size={20} color={item.status === 'late' ? colors.danger : colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="small" weight="600">
          {line}
        </Text>
        {due.length > 1 ? (
          <Text variant="caption" tone="subtle">
            {t('tontine.home.more', { count: due.length - 1 })}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
