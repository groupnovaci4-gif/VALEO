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

const SYSTEM_FR = `Tu es l'assistant financier d'une application de gestion de budget personnel et familial, utilisée par une personne qui vit {pays} (montants en unités mineures de la devise indiquée ; pour XOF/XAF, 1 unité = 1 franc CFA).
Règles impératives :
- Réponds en français simple, chaleureux et concret, en 120 mots maximum, sans jargon.
- Utilise UNIQUEMENT les chiffres du résumé fourni. N'invente jamais de montant, de date ou de transaction. Si une information manque, dis-le et explique ce qu'il faudrait saisir.
- Toute projection doit être présentée explicitement comme une estimation.
- Formate les montants avec des espaces entre milliers et la devise (ex. 250 000 FCFA).
- Tu n'es pas un conseiller financier réglementé : pas de recommandation d'investissement précise ni de produit financier nommé.
- Ne demande jamais d'informations personnelles (numéro, code, mot de passe).
- Les revenus du résumé sont les revenus REÇUS ; un emprunt, une cagnotte de tontine ou un remboursement n'en sont jamais. Ne recalcule aucun chiffre : reformule ceux du résumé.`;

const SYSTEM_EN = SYSTEM_FR.replace('Réponds en français simple, chaleureux et concret', 'Answer in simple, warm, concrete English');

/**
 * Argent disponible v2 (§11.6) : le texte système dit le VRAI pays de la personne (code ISO
 * transmis dans le résumé), jamais « Afrique francophone » pour tous. Code inconnu : sans pays.
 */
export function countryPhrase(summary: unknown): string {
  const code = typeof (summary as { country?: unknown } | null)?.country === 'string' ? ((summary as { country: string }).country.toUpperCase()) : '';
  if (!/^[A-Z]{2}$/.test(code)) return 'dans son pays';
  try {
    const name = new Intl.DisplayNames(['fr'], { type: 'region' }).of(code);
    return name && name !== code ? `dans ce pays : ${name}` : 'dans son pays';
  } catch {
    return 'dans son pays';
  }
}

/** Un seul modèle dans toute l'application (docs/ia-comprend-tout.md §0.1). */
export const ASSISTANT_MODEL = 'claude-haiku-5-5';

/**
 * Requête au modèle (§6) : Haiku, réflexion DÉSACTIVÉE, effort `low`, `max_tokens` adapté à une
 * réponse de 120 mots au plus. Ni modèle de repli ni en-tête bêta de repli serveur (non pris en
 * charge par Haiku) : un refus ou une erreur → l'application garde sa réponse locale.
 */
export function buildAssistantRequest(question: string, summary: unknown, language: 'fr' | 'en'): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: 1000,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: (language === 'en' ? SYSTEM_EN : SYSTEM_FR).replace('{pays}', countryPhrase(summary)),
    messages: [
      {
        role: 'user',
        content: `Résumé financier (JSON, données réelles de l'utilisateur) :\n${JSON.stringify(summary)}\n\nQuestion : ${question}`,
      },
    ],
  };
}

export async function answerWithClaude(apiKey: string, question: string, summary: unknown, language: 'fr' | 'en'): Promise<string | null> {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 50_000 });
  const response = await client.beta.messages.create(buildAssistantRequest(question, summary, language));
  if (response.stop_reason === 'refusal') return null;
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || null;
}
