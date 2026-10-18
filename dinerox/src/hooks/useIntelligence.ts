import { useMemo } from 'react';
import { useApp } from '@/store/app';
import { useFinance } from './useFinance';
import { coachRecommendations, financialSnapshot } from '@/core/intelligence';
import { coachState } from '@/core/coachData';
import { dailyAllowanceV2 } from '@/core/allowance';

/**
 * Photographie financière et conseils de l'espace actif (données réelles uniquement).
 * Argent disponible v2 (§11) : disponible D (position v2), revenus REÇUS, conseils de `nextAdvice`.
 */
export function useIntelligence() {
  const { profile } = useApp();
  const { data, currency, now, money } = useFinance();
  return useMemo(() => {
    const snapshot = financialSnapshot({ data, currency, now, available: money.available, financial: profile?.financial });
    const state = coachState(data, currency, now, profile?.financial);
    const allowance = dailyAllowanceV2({ data, currency, today: now, payDay: profile?.financial?.payDay ?? null });
    return { snapshot, state, recommendations: coachRecommendations(snapshot, state, data.goals, allowance.until) };
  }, [data, currency, now, money.available, profile?.financial]);
}
