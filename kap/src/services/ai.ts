/**
 * Couche IA côté client — distincte du reste de l'application.
 *
 * 1. Compréhension locale (core/ai/parser) : gratuite, hors-ligne,
 *    déterministe. Produit des PROPOSITIONS que l'utilisateur confirme.
 * 2. Réponses chiffrées locales (core/ai/answers) : fondées sur les données.
 * 3. Analyse détaillée distante (Cloud Function `kapAssistant`) : uniquement
 *    avec consentement et formule Plus ; reçoit un résumé agrégé, jamais les
 *    opérations brutes. La clé d'API reste sur le serveur.
 */
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import { isFirebaseConfigured } from '@/config/env';
import type { FinanceSummary } from '@/core/ai/summary';
import type { AccountHint } from '@/core/ai/parser';
import type { Account, Language } from '@/core/types';

/** Trouve le compte correspondant à un indice (« wave », « orange », « épargne »…). */
export function resolveAccountHint(hint: AccountHint | null, accounts: Account[]): Account | null {
  const active = accounts.filter((a) => a.active);
  if (!hint) return null;
  const byProvider: Partial<Record<AccountHint, (a: Account) => boolean>> = {
    orange_money: (a) => a.provider === 'orange_money',
    mtn_momo: (a) => a.provider === 'mtn_momo',
    moov_money: (a) => a.provider === 'moov_money',
    wave: (a) => a.provider === 'wave',
    bank: (a) => a.type === 'bank',
    savings: (a) => a.isSavings,
    card: (a) => a.type === 'card',
    cash: (a) => a.type === 'cash',
  };
  return active.find(byProvider[hint] ?? (() => false)) ?? null;
}

export async function askRemoteAssistant(question: string, summary: FinanceSummary, language: Language): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const fn = httpsCallable<{ question: string; summary: FinanceSummary; language: Language }, { answer: string }>(firebase().functions, 'kapAssistant', { timeout: 60_000 });
    const res = await fn({ question: question.slice(0, 500), summary, language });
    return res.data.answer || null;
  } catch {
    return null;
  }
}
