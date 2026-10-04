import type { AccountDataProvider, PaymentProvider, ProviderId } from './types';

/**
 * Registre des connecteurs. Vide aujourd'hui : l'interface affiche
 * « Compte suivi manuellement ». Brancher un connecteur = l'enregistrer ici
 * (et implémenter sa partie serveur).
 */
const dataProviders = new Map<ProviderId, AccountDataProvider>();
const paymentProviders = new Map<string, PaymentProvider>();

export const providers = {
  registerData(p: AccountDataProvider) {
    dataProviders.set(p.id, p);
  },
  registerPayment(p: PaymentProvider) {
    paymentProviders.set(p.id, p);
  },
  data(id: ProviderId): AccountDataProvider | null {
    return dataProviders.get(id) ?? null;
  },
  payment(id: string): PaymentProvider | null {
    return paymentProviders.get(id) ?? null;
  },
  /** Vrai seulement quand un connecteur officiel est réellement disponible. */
  isConnectable(id: ProviderId): boolean {
    return dataProviders.has(id);
  },
};
