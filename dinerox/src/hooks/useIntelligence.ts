import { useMemo } from 'react';
import { useApp } from '@/store/app';
import { useFinance } from './useFinance';
import { financialSnapshot, recommendations } from '@/core/intelligence';

/** Photographie financière et recommandations de l'espace actif (données réelles uniquement). */
export function useIntelligence() {
  const { profile } = useApp();
  const { data, currency, now, position } = useFinance();
  return useMemo(() => {
    // Disponible LIBRE (hors argent mis de côté pour les objectifs), comme partout ailleurs.
    const snapshot = financialSnapshot({ data, currency, now, available: position.free, financial: profile?.financial });
    return { snapshot, recommendations: recommendations(snapshot, data.goals) };
  }, [data, currency, now, position.free, profile?.financial]);
}
