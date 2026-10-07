/**
 * Conseil du jour : calculé de façon déterministe (recommandations existantes),
 * lisible à voix haute ; l'IA peut l'EXPLIQUER (consentement + formule), jamais
 * le décider ni inventer un chiffre. Aucune action n'est exécutée d'ici.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useCategoryLabels } from '@/hooks/useFinance';
import { useIntelligence } from '@/hooks/useIntelligence';
import { Button, Card, Text } from '@/components/ui';
import { SourceTag, useRecommendationText } from '@/features/Recommendation';
import { adviceOfDay, reformulationQuestion } from '@/core/coach/advice';
import { buildFinanceSummary } from '@/core/ai/summary';
import { hasFeature } from '@/core/subscription';
import { askRemoteAssistant } from '@/services/ai';
import { ListenButton } from './ListenButton';

/** `excludeId` : recommandation déjà affichée ailleurs sur l'écran (jamais deux fois la même). */
export function AdviceOfDay({ excludeId }: { excludeId?: string }) {
  const { t, lang } = useI18n();
  const { profile, plan, mode } = useApp();
  const { data, currency, now } = useFinance();
  const cats = useCategoryLabels();
  const { recommendations } = useIntelligence();
  const render = useRecommendationText();
  const advice = useMemo(() => adviceOfDay(recommendations.filter((r) => r.id !== excludeId), now), [recommendations, now, excludeId]);
  const [ai, setAi] = useState<{ for: string; text: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!advice) return null;
  const text = render(advice);
  // Reformulation IA : uniquement avec consentement explicite, formule et compte en ligne.
  const aiAllowed = mode === 'firebase' && !!profile?.preferences.aiConsent && hasFeature(plan, 'ai_assistant');
  const explanation = ai && ai.for === advice.id ? ai.text : null;
  const explain = async () => {
    setBusy(true);
    try {
      const summary = buildFinanceSummary(data, currency, now, cats.byId);
      const answer = await askRemoteAssistant(reformulationQuestion(text, lang === 'en' ? 'en' : 'fr'), summary, lang);
      setAi({ for: advice.id, text: answer });
    } catch {
      setAi({ for: advice.id, text: null });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong" accessibilityRole="header">
          {t('coach.advice.title')}
        </Text>
        <ListenButton text={text} />
      </View>
      <Text variant="small" style={{ marginTop: 4 }}>
        {text}
      </Text>
      <View style={{ marginTop: 6 }}>
        <SourceTag source={advice.source} />
      </View>
      {aiAllowed ? (
        explanation ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="caption" weight="700" tone="ai">
                {t('coach.advice.aiTitle')}
              </Text>
              <ListenButton text={explanation} />
            </View>
            <Text variant="small">{explanation}</Text>
            <Text variant="caption" tone="subtle">
              {t('coach.advice.aiDisclaimer')}
            </Text>
          </View>
        ) : (
          <Button small variant="ghost" icon="sparkles" label={ai && ai.for === advice.id ? t('ai.remoteUnavailable') : t('coach.advice.explain')} loading={busy} onPress={() => void explain()} style={{ marginTop: 8 }} />
        )
      ) : null}
    </Card>
  );
}
