/**
 * Moteur unique de compréhension (docs/ia-comprend-tout.md §1) pour les deux portes d'entrée :
 * la feuille de saisie (`door: 'entry'`) et « Parler à DineroX » (`door: 'assistant'`).
 *
 *  1. compréhension locale (`core/ai/intent.ts`) avec le vocabulaire de l'espace actif ;
 *  2. sinon, avec consentement au texte actuel + en ligne (+ formule de l'assistant pour sa
 *     porte) : repli Haiku (`understandPhrase`), réponse revérifiée sur le téléphone ;
 *  3. réponses calculées (`localAnswers.ts`) et cartes (`actionCard.ts`), droits respectés.
 * Aucune écriture ici : « Valider » appelle `runAction` (voir `IntentResult`).
 */
import { useCallback, useMemo } from 'react';
import { useI18n, hasKey, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useCategoryLabels, useFinance, useMoney } from '@/hooks/useFinance';
import { useCategoryCatalog } from '@/services/categoryCatalog';
import { understandRemote } from '@/services/ai';
import { intentContext, understand, type Intent, type QuestionIntent } from '@/core/ai/intent';
import { remoteIntent } from '@/core/ai/remote';
import { answerIntent, topicGate, type Answer } from '@/core/ai/localAnswers';
import { paramKind } from '@/core/ai/answerParams';
import { transcriptConsent } from '@/core/aiConsent';
import { hasFeature } from '@/core/subscription';
import { useCoach } from '@/features/coach/CoachProvider';
import { currencyInWords, type CurrencyCode } from '@/core/money';

export type Door = 'entry' | 'assistant';

export function useIntentEngine(door: Door) {
  const { t, lang, date, monthYear } = useI18n();
  const money = useMoney();
  const cats = useCategoryLabels();
  const categoryName = cats.byId;
  const catalog = useCategoryCatalog();
  const { plan, role, profile, activeSpace, mode, online } = useApp();
  const { data, currency, now, spaceKind } = useFinance();
  const { rewards } = useCoach();
  const ctx = useMemo(() => intentContext(data, { today: now, currency: currency as CurrencyCode, catalog, categoryLabel: categoryName }), [data, now, currency, catalog, categoryName]);

  /** Repli permis : en ligne, consentement au texte actuel ; « Parler à DineroX » : formule de l'assistant. */
  const remoteAllowed = mode === 'firebase' && online && transcriptConsent(profile?.preferences) && (door === 'entry' || hasFeature(plan, 'ai_assistant'));

  const understandLocal = useCallback((text: string): Intent => understand(text, ctx), [ctx]);

  /** Local d'abord ; repli seulement pour une phrase non comprise. `quota` : quota de la porte épuisé. */
  const understandText = useCallback(
    async (text: string): Promise<{ intent: Intent; source: 'local' | 'ai' | 'none'; quota?: boolean }> => {
      const local = understand(text, ctx);
      if (local.kind !== 'unknown' || !remoteAllowed) return { intent: local, source: local.kind === 'unknown' ? 'none' : 'local' };
      const raw = await understandRemote(text, lang === 'en' ? 'en' : 'fr', door, activeSpace?.id);
      if (raw === 'quota') return { intent: local, source: 'none', quota: true };
      const r = remoteIntent(raw, text, ctx);
      return { intent: r, source: r.kind === 'unknown' ? 'none' : 'ai' };
    },
    [ctx, remoteAllowed, lang, door, activeSpace?.id],
  );

  /** Réponse calculée, ou message de droits (formule, rôle). */
  const answer = useCallback(
    (q: QuestionIntent): Answer =>
      topicGate(q.topic, { plan, role, spaceKind }) ?? answerIntent(q, { data, currency: currency as CurrencyCode, now, categoryName, payDay: profile?.financial?.payDay ?? null, financial: profile?.financial ?? null, rewardsCount: rewards.length, spaceKind }),
    [plan, role, spaceKind, data, currency, now, categoryName, profile?.financial, rewards.length],
  );

  /** Paramètres affichés : montants, dates, catégories. */
  const params = useCallback(
    (p: Record<string, string | number> = {}) => {
      const out: Record<string, string | number> = {};
      // `cur` : devise des montants de la ligne (compte dans une autre devise), sinon celle de l'espace.
      const cur = typeof p.cur === 'string' ? { currency: p.cur } : undefined;
      for (const [k, v] of Object.entries(p)) {
        const kind = paramKind(k, v);
        out[k] = kind === 'money' ? money(v as number, cur) : kind === 'date' ? date(v as string) : kind === 'month' ? monthYear(v as string) : k === 'category' ? categoryName(String(v)) : v;
      }
      if (cur) out.inCur = currencyInWords(cur.currency, lang === 'en' ? 'en' : 'fr');
      return out;
    },
    [money, date, monthYear, categoryName, lang],
  );
  const text = useCallback((key: string, p?: Record<string, string | number>) => (hasKey(key) ? t(key as TKey, params(p)) : ''), [t, params]);
  const render = useCallback((a: Answer) => ({ text: text(a.key, a.params), bullets: (a.bullets ?? []).map((b) => text(b.key, b.params)).filter(Boolean) }), [text]);

  return { ctx, door, understandLocal, understandText, answer, render, text, remoteAllowed };
}
