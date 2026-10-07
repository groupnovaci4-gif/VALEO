/**
 * Couche IA côté client — distincte du reste de l'application.
 *
 * 1. Compréhension locale (core/ai/parser) : gratuite, hors-ligne,
 *    déterministe. Produit des PROPOSITIONS que l'utilisateur confirme.
 * 2. Réponses chiffrées locales (core/ai/answers) : fondées sur les données.
 * 3. Analyse détaillée distante (Cloud Function `financeAssistant`) : uniquement
 *    avec consentement et formule Plus ; reçoit un résumé agrégé, jamais les
 *    opérations brutes. La clé d'API reste sur le serveur.
 */
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import type { FinanceSummary } from '@/core/ai/summary';
import type { Language } from '@/core/types';

/** Déplacée dans le module pur du parseur (partagé avec la saisie vocale). */
export { resolveAccountHint } from '@/core/ai/parser';

export async function askRemoteAssistant(question: string, summary: FinanceSummary, language: Language): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const fn = httpsCallable<{ question: string; summary: FinanceSummary; language: Language }, { answer: string }>(firebase().functions, 'financeAssistant', { timeout: 60_000 });
    const res = await fn({ question: question.slice(0, 500), summary, language });
    return res.data.answer || null;
  } catch {
    return null;
  }
}
