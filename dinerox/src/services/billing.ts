/**
 * Abonnements — architecture prête, AUCUN paiement intégré.
 *
 * Flux cible : l'application obtient une preuve d'achat auprès d'un
 * fournisseur (Google Play Billing, Apple IAP, Stripe, Mobile Money), puis
 * appelle la Cloud Function `verifyPurchase` qui la VÉRIFIE auprès du
 * fournisseur et écrit seule `users/{uid}.subscription`. Le client ne peut
 * jamais s'attribuer une formule (règles Firestore).
 */
import type { PlanId } from '@/core/types';

export type BillingProviderId = 'google_play' | 'app_store' | 'stripe' | 'mobile_money';

export interface PurchaseProof {
  provider: BillingProviderId;
  plan: PlanId;
  /** Jeton d'achat / reçu / identifiant de transaction. */
  token: string;
}

export interface BillingProvider {
  readonly id: BillingProviderId;
  isAvailable(): Promise<boolean>;
  purchase(plan: PlanId): Promise<PurchaseProof>;
  restore(): Promise<PurchaseProof[]>;
}

const registry: BillingProvider[] = [];

export function registerBillingProvider(p: BillingProvider) {
  registry.push(p);
}

/** Fournisseurs réellement disponibles (aucun pour l'instant). */
export async function availableBillingProviders(): Promise<BillingProvider[]> {
  const out: BillingProvider[] = [];
  for (const p of registry) if (await p.isAvailable()) out.push(p);
  return out;
}
