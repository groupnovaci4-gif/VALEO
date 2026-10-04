/**
 * Interfaces des futures intégrations financières.
 *
 * AUCUNE intégration n'est active : DineroX gère les comptes manuellement et ne
 * simule jamais une connexion à un opérateur. Ces contrats permettront
 * d'ajouter plus tard des connecteurs OFFICIELS (Orange Money, MTN MoMo,
 * Moov Money, Wave, banques via agrégateur), exécutés CÔTÉ SERVEUR (Cloud
 * Functions) : les identifiants d'API ne doivent jamais être embarqués dans
 * l'application. Toute fonctionnalité impliquant un service financier
 * réglementé (paiement, initiation de virement) nécessitera une étude
 * réglementaire préalable (BCEAO, agréments).
 */
import type { CurrencyCode } from '@/core/money';
import type { ISODate } from '@/core/dates';

export type ProviderId = 'orange_money' | 'mtn_momo' | 'moov_money' | 'wave' | 'bank_aggregator';

export type ProviderStatus = 'unavailable' | 'disconnected' | 'connecting' | 'connected' | 'error';

/** Opération importée d'un fournisseur, à rapprocher des opérations DineroX. */
export interface ImportedTransaction {
  externalId: string;
  date: ISODate;
  amount: number;
  currency: CurrencyCode;
  direction: 'in' | 'out';
  counterparty?: string;
  label?: string;
}

/** Lecture seule : solde et historique (agrégation de comptes). */
export interface AccountDataProvider {
  readonly id: ProviderId;
  status(): Promise<ProviderStatus>;
  /** Démarre un consentement (OAuth / USSD / OTP) géré par le serveur. */
  connect(accountId: string): Promise<{ consentUrl?: string }>;
  disconnect(accountId: string): Promise<void>;
  fetchBalance(accountId: string): Promise<{ amount: number; currency: CurrencyCode; asOf: number }>;
  fetchTransactions(accountId: string, since: ISODate): Promise<ImportedTransaction[]>;
}

export type MobileMoneyProvider = AccountDataProvider;
export type BankProvider = AccountDataProvider;

/** Initiation de paiement — service réglementé, NON implémenté. */
export interface PaymentProvider {
  readonly id: ProviderId | 'stripe';
  requestPayment(input: { amount: number; currency: CurrencyCode; reference: string; payerPhone?: string }): Promise<{ paymentId: string; status: 'pending' | 'succeeded' | 'failed' }>;
}
