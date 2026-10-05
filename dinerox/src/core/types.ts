/**
 * Modèle de données — SOURCE DE VÉRITÉ des types.
 *
 * Organisation : toutes les données financières vivent dans un « espace »
 * (`Space`). Chaque utilisateur possède un espace personnel (id = son uid) et
 * peut appartenir à des espaces familiaux. Cela unifie « Mes finances
 * personnelles » et « Finances familiales » : mêmes écrans, mêmes calculs,
 * seules les permissions changent (voir permissions.ts et firestore.rules).
 *
 * Chemin Firestore : spaces/{spaceId}/{collection}/{docId}.
 */
import type { CurrencyCode } from './money';
import type { ISODate, MonthKey } from './dates';

export type ID = string;
/** Horodatage ms depuis l'époque Unix. */
export type Millis = number;

/** Champs communs à tout enregistrement synchronisé. */
export interface SyncedDoc {
  id: ID;
  /** Dernière modification côté client — arbitre les conflits (le plus récent gagne). */
  updatedAt: Millis;
  createdAt: Millis;
  /** uid de l'auteur. */
  createdBy: string;
  /** Suppression logique : une suppression hors-ligne doit pouvoir se synchroniser. */
  deleted?: boolean;
}

// ─── Espaces & membres ────────────────────────────────────────────────

export type SpaceKind = 'personal' | 'family';
/** admin = accès complet ; partner = conjoint, partagé ; child = enfant, limité. */
export type Role = 'admin' | 'partner' | 'child';

export interface Space {
  id: ID;
  kind: SpaceKind;
  name: string;
  ownerId: string;
  /** uid → rôle. */
  members: Record<string, Role>;
  /** Copie des clés de `members` (requêtes array-contains). */
  memberIds: string[];
  /** uid → prénom affiché (évite de lire les profils des autres membres). */
  memberNames: Record<string, string>;
  currency: CurrencyCode;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface FamilyInvite {
  id: ID;
  spaceId: ID;
  spaceName: string;
  email: string;
  role: Role;
  invitedBy: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: Millis;
  expiresAt: Millis;
}

// ─── Comptes ──────────────────────────────────────────────────────────

export type AccountType = 'cash' | 'mobile_money' | 'bank' | 'savings' | 'card' | 'investment' | 'other';

/**
 * Fournisseur d'un compte. Purement descriptif dans cette version : AUCUNE
 * connexion réelle aux opérateurs n'est faite (voir services/providers).
 */
export type AccountProvider = 'orange_money' | 'mtn_momo' | 'moov_money' | 'wave' | 'free_money' | 'airtel_money' | 'mobile_other' | 'tontine' | 'bank' | 'none';

export interface Account extends SyncedDoc {
  name: string;
  type: AccountType;
  provider: AccountProvider;
  currency: CurrencyCode;
  /** Solde à la création du compte dans DineroX. Le solde courant est DÉRIVÉ des opérations. */
  openingBalance: number;
  color: string;
  icon: string;
  active: boolean;
  /** Compte réservé à l'épargne (exclu de l'argent disponible). */
  isSavings: boolean;
  savingsKind?: SavingsKind;
  order: number;
}

export type SavingsKind = 'general' | 'emergency' | 'project' | 'child' | 'retirement';

// ─── Catégories ───────────────────────────────────────────────────────

export type CategoryKind = 'income' | 'expense';

export interface Category extends SyncedDoc {
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  order: number;
  /** Catégorie fournie par DineroX (non supprimable, renommable). */
  system?: boolean;
  /** Clé i18n pour les catégories système. */
  labelKey?: string;
  /** Sous-catégorie : identifiant de la catégorie parente (une seule profondeur). */
  parentId?: string | null;
  /** Charge habituellement fixe (loyer, électricité, tontine…) : sert à l'analyse des charges fixes. */
  fixed?: boolean;
}

// ─── Opérations ───────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction extends SyncedDoc {
  type: TransactionType;
  /** Montant en unités mineures, toujours > 0. */
  amount: number;
  currency: CurrencyCode;
  date: ISODate;
  accountId: ID;
  /** Transfert : compte destinataire. */
  toAccountId?: ID | null;
  /** Transfert entre devises différentes : montant reçu, saisi par l'utilisateur. */
  toAmount?: number | null;
  categoryId?: ID | null;
  /** Sous-catégorie facultative (la catégorie reste la catégorie principale : budgets et rapports inchangés). */
  subcategoryId?: ID | null;
  envelopeId?: ID | null;
  /** Bénéficiaire / commerçant (dépense) ou source (revenu). */
  payee?: string | null;
  note?: string | null;
  receiptUrl?: string | null;
  /** Généré par une règle récurrente. */
  recurringId?: ID | null;
  /** Transfert lié à une contribution d'objectif. */
  goalId?: ID | null;
  /** Remboursement de dette. */
  debtId?: ID | null;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

/** Revenu ou dépense récurrent(e) : « Salaire 450 000 tous les 25 du mois ». */
export interface RecurringRule extends SyncedDoc {
  type: 'income' | 'expense';
  label: string;
  amount: number;
  currency: CurrencyCode;
  accountId: ID;
  categoryId?: ID | null;
  envelopeId?: ID | null;
  frequency: Frequency;
  /** Première échéance. Les suivantes en découlent. */
  startDate: ISODate;
  endDate?: ISODate | null;
  active: boolean;
  /** Dernière échéance déjà matérialisée en opération. */
  lastGenerated?: ISODate | null;
}

// ─── Budget & enveloppes ──────────────────────────────────────────────

export interface Envelope extends SyncedDoc {
  name: string;
  icon: string;
  color: string;
  /** Budget mensuel par défaut (unités mineures). */
  monthlyBudget: number;
  /** Catégories rattachées par défaut à cette enveloppe. */
  categoryIds: ID[];
  order: number;
  active: boolean;
}

export type BudgetMethod = 'custom' | 'envelopes' | '50_30_20' | 'zero_based' | 'family';

/** Plan d'un mois : surcharge éventuelle du budget de chaque enveloppe. */
export interface BudgetPlan extends SyncedDoc {
  /** id = clé du mois 'YYYY-MM'. */
  month: MonthKey;
  method: BudgetMethod;
  expectedIncome: number;
  /** envelopeId → montant prévu ce mois. */
  allocations: Record<ID, number>;
}

// ─── Objectifs ────────────────────────────────────────────────────────

export type GoalPriority = 'low' | 'normal' | 'high' | 'urgent';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'archived';
/** Nature technique, déduite de la catégorie — jamais demandée à l'utilisateur. */
export type GoalType = 'financial' | 'purchase' | 'construction' | 'professional' | 'family' | 'custom';
export type GoalScope = 'personal' | 'couple' | 'family';

export interface GoalChange {
  at: Millis;
  by: string;
  field: 'targetAmount' | 'targetDate' | 'priority' | 'status' | 'name' | 'monthlyContribution';
  from: string | number | null;
  to: string | number | null;
}

export interface PlannedContribution {
  /** uid du membre, ou libellé libre (« Parent 2 »). */
  memberId?: string | null;
  label: string;
  monthly: number;
}

export interface Goal extends SyncedDoc {
  name: string;
  /** Identifiant de catégorie d'objectif (voir goalCategories.ts) ou 'custom'. */
  categoryId: string;
  /** Modèle choisi dans la catégorie (ex. 'buy_car'), facultatif. */
  templateId?: string | null;
  type: GoalType;
  icon: string;
  currency: CurrencyCode;
  targetAmount: number;
  /** Montant déjà disponible à la création. */
  initialAmount: number;
  targetDate?: ISODate | null;
  priority: GoalPriority;
  /** Rang d'affichage / de répartition (1 = le plus prioritaire). */
  rank: number;
  /** Compte ou enveloppe d'épargne associé(e). */
  accountId?: ID | null;
  /** Contribution mensuelle que l'utilisateur peut faire (facultative). */
  monthlyContribution?: number | null;
  scope: GoalScope;
  planned?: PlannedContribution[];
  status: GoalStatus;
  completedAt?: Millis | null;
  history: GoalChange[];
}

/** Contribution à un objectif. Montant négatif = retrait. */
export interface GoalContribution extends SyncedDoc {
  goalId: ID;
  amount: number;
  date: ISODate;
  /** Compte d'où provient l'argent (information). */
  accountId?: ID | null;
  /** Si l'argent a été réellement déplacé : le transfert créé. */
  transferId?: ID | null;
  note?: string | null;
}

// ─── Dettes & crédits ─────────────────────────────────────────────────

export type DebtDirection = 'i_owe' | 'owed_to_me';
export type DebtKind = 'personal' | 'bank' | 'family' | 'supplier' | 'loan_given' | 'loan_received';

export interface Debt extends SyncedDoc {
  direction: DebtDirection;
  kind: DebtKind;
  counterparty: string;
  principal: number;
  currency: CurrencyCode;
  startDate: ISODate;
  dueDate?: ISODate | null;
  /** Mensualité prévue. */
  installment?: number | null;
  /** Jour du mois de l'échéance (1-28). */
  dueDay?: number | null;
  /** Taux annuel en % (information, non capitalisé automatiquement). */
  rate?: number | null;
  note?: string | null;
  status: 'active' | 'closed';
}

export interface DebtPayment extends SyncedDoc {
  debtId: ID;
  amount: number;
  date: ISODate;
  accountId?: ID | null;
  /** Opération créée dans un compte, le cas échéant. */
  transactionId?: ID | null;
  note?: string | null;
}

// ─── Patrimoine ───────────────────────────────────────────────────────

export type AssetType = 'real_estate' | 'vehicle' | 'land' | 'savings' | 'investment' | 'business' | 'other';

export interface Asset extends SyncedDoc {
  name: string;
  type: AssetType;
  value: number;
  currency: CurrencyCode;
  acquiredAt?: ISODate | null;
  note?: string | null;
}

// ─── Collections synchronisées ────────────────────────────────────────

/** Toutes les collections d'un espace. Ajouter une entité ⇒ l'ajouter ici ET dans firestore.rules. */
export interface SpaceCollections {
  accounts: Account;
  categories: Category;
  transactions: Transaction;
  recurring: RecurringRule;
  envelopes: Envelope;
  budgets: BudgetPlan;
  goals: Goal;
  goalContributions: GoalContribution;
  debts: Debt;
  debtPayments: DebtPayment;
  assets: Asset;
}

export type CollectionName = keyof SpaceCollections;

export const COLLECTIONS: CollectionName[] = [
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'envelopes',
  'budgets',
  'goals',
  'goalContributions',
  'debts',
  'debtPayments',
  'assets',
];

/** Vue en mémoire d'un espace : listes sans les enregistrements supprimés. */
export type SpaceData = { [K in CollectionName]: SpaceCollections[K][] };

export function emptySpaceData(): SpaceData {
  return {
    accounts: [],
    categories: [],
    transactions: [],
    recurring: [],
    envelopes: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    debts: [],
    debtPayments: [],
    assets: [],
  };
}

// ─── Utilisateur ──────────────────────────────────────────────────────

export type PlanId = 'free' | 'plus' | 'family';
export type Language = 'fr' | 'en';
export type ThemePreference = 'system' | 'light' | 'dark';
export type FamilySituation = 'single' | 'couple' | 'couple_children' | 'single_parent' | 'extended';
export type IncomeFrequency = 'monthly' | 'biweekly' | 'weekly' | 'daily' | 'irregular';

export interface NotificationPrefs {
  budgetAlerts: boolean;
  goalProgress: boolean;
  incomeReceived: boolean;
  unusualSpending: boolean;
  savingsReminder: boolean;
  debtDue: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
}

export interface UserPreferences {
  theme: ThemePreference;
  notifications: NotificationPrefs;
  /** Verrouillage par biométrie/PIN. */
  appLock: boolean;
  /** Minutes en arrière-plan avant verrouillage (0 = immédiat). */
  autoLockMinutes: number;
  /** Consentement explicite à l'analyse des données par l'assistant IA distant. */
  aiConsent: boolean;
  /** Consentement aux statistiques d'usage anonymes. */
  analyticsConsent: boolean;
  budgetMethod: BudgetMethod;
}

/**
 * Abonnement : écrit UNIQUEMENT par le serveur (Cloud Functions) après
 * vérification d'un achat. Les règles Firestore interdisent au client de
 * le modifier.
 */
export interface Subscription {
  plan: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  provider: 'none' | 'google_play' | 'app_store' | 'stripe' | 'mobile_money' | 'manual';
  expiresAt?: Millis | null;
  updatedAt: Millis;
}

export type EmploymentStatus = 'employee' | 'civil_servant' | 'self_employed' | 'trader' | 'farmer' | 'student' | 'unemployed' | 'retired' | 'other';
export type HousingStatus = 'tenant' | 'owner' | 'family' | 'hosted' | 'other';
/** Nature des revenus : fixe (salaire), variable (commissions), irrégulier, ou aucun pour le moment. */
export type IncomeNature = 'fixed' | 'variable' | 'irregular' | 'none';

/**
 * Profil financier : complété PROGRESSIVEMENT (tout est facultatif, sauf le
 * pays et la devise qui ont des valeurs par défaut). Le pays et la devise sont
 * deux informations distinctes (Côte d'Ivoire, Sénégal, Bénin… → XOF).
 */
export interface FinancialProfile {
  familyStatus?: FamilySituation | null;
  children?: number | null;
  /** Autres personnes à charge (parents, frères et sœurs, neveux…). */
  dependents?: number | null;
  employmentStatus?: EmploymentStatus | null;
  incomeNature?: IncomeNature | null;
  /** Catégories de revenus (inc_salary, inc_business…). */
  incomeSources?: string[];
  /** Revenu mensuel approximatif déclaré (unités mineures), si connu. */
  monthlyIncome?: number | null;
  payDay?: number | null;
  housingStatus?: HousingStatus | null;
  /** Moyens de paiement / sources d'argent utilisés (clés ACCOUNT_TEMPLATES). */
  paymentMethods?: string[];
  /** L'utilisateur a indiqué ne pas avoir (encore) de compte bancaire. */
  noBankAccount?: boolean;
  /** Charges principales déclarées : sous-catégorie → montant mensuel (0 = montant inconnu). */
  fixedCharges?: Record<string, number>;
  /** Capacité d'épargne déclarée par l'utilisateur (sinon estimée par DINEROX). */
  savingCapacity?: number | null;
  /** Modèles d'objectifs choisis. */
  financialGoals?: string[];
  updatedAt?: number;
}

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  country: string;
  currency: CurrencyCode;
  photoURL?: string | null;
  language: Language;
  timezone: string;
  preferences: UserPreferences;
  subscription: Subscription;
  /** Profil financier (complété progressivement). */
  financial?: FinancialProfile;
  onboarding: {
    completed: boolean;
    /** Choix multiples (ex. en couple ET soutien de la famille élargie). */
    familySituations?: FamilySituation[];
    /** Catégories de revenus (inc_salary, inc_business…). */
    incomeSources?: string[];
    incomeFrequencies?: IncomeFrequency[];
    /** Anciens champs à choix unique (conservés pour les profils existants). */
    familySituation?: FamilySituation | null;
    incomeFrequency?: IncomeFrequency | null;
    mainExpenses?: string[];
    goals?: string[];
    budgetPreference?: BudgetMethod | null;
  };
  /** Consentement CGU / confidentialité : version acceptée. */
  termsAcceptedVersion?: string | null;
  createdAt: Millis;
  updatedAt: Millis;
}
