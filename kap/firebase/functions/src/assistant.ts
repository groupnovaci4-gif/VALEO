/**
 * Assistant financier distant (formule Plus, avec consentement).
 *
 * - La clé d'API est un secret Firebase (Secret Manager) : jamais dans l'app.
 * - Entrée : question + RÉSUMÉ AGRÉGÉ (pas d'opérations brutes, pas de
 *   bénéficiaires ni de notes) construit par l'application.
 * - Le modèle a pour consigne de n'utiliser QUE ces chiffres et de signaler
 *   clairement toute estimation ; il ne donne pas de conseil réglementé.
 */
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_FR = `Tu es l'assistant financier d'une application de gestion de budget personnel et familial utilisée en Afrique francophone (montants en unités mineures de la devise indiquée ; pour XOF/XAF, 1 unité = 1 franc CFA).
Règles impératives :
- Réponds en français simple, chaleureux et concret, en 120 mots maximum, sans jargon.
- Utilise UNIQUEMENT les chiffres du résumé fourni. N'invente jamais de montant, de date ou de transaction. Si une information manque, dis-le et explique ce qu'il faudrait saisir.
- Toute projection doit être présentée explicitement comme une estimation.
- Formate les montants avec des espaces entre milliers et la devise (ex. 250 000 FCFA).
- Tu n'es pas un conseiller financier réglementé : pas de recommandation d'investissement précise ni de produit financier nommé.
- Ne demande jamais d'informations personnelles (numéro, code, mot de passe).`;

const SYSTEM_EN = SYSTEM_FR.replace('Réponds en français simple, chaleureux et concret', 'Answer in simple, warm, concrete English');

export async function answerWithClaude(apiKey: string, question: string, summary: unknown, language: 'fr' | 'en'): Promise<string | null> {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 50_000 });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Effort explicite (défaut du modèle : medium) — bon compromis pour une réponse courte et fiable.
    output_config: { effort: 'medium' },
    // Repli automatique côté serveur si le modèle décline la demande.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: language === 'en' ? SYSTEM_EN : SYSTEM_FR,
    messages: [
      {
        role: 'user',
        content: `Résumé financier (JSON, données réelles de l'utilisateur) :\n${JSON.stringify(summary)}\n\nQuestion : ${question}`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || null;
}
