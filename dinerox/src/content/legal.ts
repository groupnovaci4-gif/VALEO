/**
 * Textes légaux — MODÈLES à faire valider par un juriste avant le lancement
 * (notamment au regard de la loi ivoirienne n° 2013-450 relative à la
 * protection des données à caractère personnel et des exigences de l'ARTCI).
 * `{app}` est remplacé par le nom de marque.
 */
import type { Language } from '@/core/types';

export interface LegalDoc {
  updated: string;
  sections: { title: string; body: string }[];
}

const privacyFr: LegalDoc = {
  updated: '2026-10-14',
  sections: [
    { title: 'Qui sommes-nous ?', body: "{app} est une application de gestion, d'analyse et de planification financière personnelle et familiale. {app} n'est ni une banque (y compris en ligne), ni une institution de microfinance, ni un établissement de crédit ou de paiement, ni un portefeuille électronique, ni un service de dépôt ou de transfert d'argent, ni un conseiller financier réglementé : l'application ne détient jamais votre argent et n'effectue aucune opération bancaire. Les comptes que vous renseignez sont de simples repères pour suivre vos propres finances." },
    { title: 'Données collectées', body: "Compte : prénom, nom, e-mail, téléphone (facultatif), pays, devise, langue, fuseau horaire. Profil financier que VOUS déclarez (tout est facultatif) : situation familiale, activité, logement, revenus approximatifs, charges principales, projets. Données financières que VOUS saisissez : comptes, opérations, budgets, objectifs, dettes, patrimoine. Les analyses sont calculées à partir de ces seules données ; aucune statistique externe n'est utilisée sans source identifiée. Aucune connexion à votre banque ou à votre opérateur Mobile Money n'est effectuée." },
    { title: 'Finalités', body: "Fournir le service (calculs, synchronisation entre vos appareils, partage familial que vous activez), vous envoyer les notifications que vous avez choisies, assurer la sécurité du compte." },
    { title: 'Assistant IA', body: "La compréhension des phrases et les réponses chiffrées sont calculées sur votre téléphone. L'analyse détaillée n'est utilisée que si vous l'acceptez : un résumé agrégé (totaux, catégories, enveloppes, objectifs — sans bénéficiaires, notes ni coordonnées) est alors transmis à notre prestataire d'IA, uniquement pour produire la réponse." },
    { title: 'Statistiques', body: "Avec votre accord seulement, des événements d'usage anonymes (ex. « objectif créé ») sont collectés, sans montant ni donnée personnelle. Seule exception, sans lien avec vous : le compteur anonyme de l'origine des inscriptions (voir ci-dessous)." },
    // Croissance (validé par le fondateur le 2026-10-14, docs/textes-etape5.md).
    { title: "Parrainage et lutte contre la fraude", body: "Quand vous invitez quelqu'un, utilisez un code d'invitation ou demandez à rejoindre une tontine partagée, un identifiant technique de votre téléphone (jamais un identifiant publicitaire) est transformé de façon irréversible en empreinte chiffrée avant d'être enregistré. Cette empreinte sert uniquement à vérifier qu'un même téléphone n'est pas parrainé plusieurs fois. Si vous supprimez votre compte, elle est conservée sans aucun lien avec vous, pour cette seule raison." },
    { title: "Origine des inscriptions", body: "À votre inscription, la provenance du lien qui vous a amené à {app} (par exemple « WhatsApp » ou le nom d'une campagne), si elle est connue, est ajoutée une seule fois à un compteur global anonyme. Elle n'est jamais enregistrée dans votre compte, qui garde seulement l'information « déjà comptée » (oui ou non), et aucun identifiant publicitaire ni outil de suivi externe n'est utilisé." },
    { title: 'Partage', body: "Vos données ne sont ni vendues ni louées. Elles sont hébergées par Google Cloud / Firebase. Les membres d'une famille ne voient que l'espace familial, selon leur rôle ; vos finances personnelles restent privées. Les administrateurs de {app} n'ont accès qu'à des statistiques agrégées." },
    { title: 'Conservation et sécurité', body: "Données chiffrées en transit et au repos, accès protégé par des règles strictes, verrouillage par code et biométrie. Les données sont conservées tant que votre compte existe." },
    { title: 'Vos droits', body: "Accès, rectification, export (Paramètres › Mes données › Exporter) et suppression définitive du compte (Paramètres › Mes données › Supprimer mon compte). Contact : support." },
  ],
};

const termsFr: LegalDoc = {
  updated: '2026-10-01',
  sections: [
    { title: 'Objet', body: "{app} est un outil d'organisation financière. Les informations et suggestions affichées (budgets, estimations, réponses de l'assistant) sont des repères calculés à partir de vos données ; elles ne constituent pas un conseil financier, fiscal ou juridique réglementé." },
    { title: 'Compte', body: "Vous êtes responsable de l'exactitude des données saisies et de la confidentialité de vos identifiants. Activez le verrouillage de l'application sur un téléphone partagé." },
    { title: 'Comptes et Mobile Money', body: "Les comptes sont suivis manuellement. {app} n'initie aucun paiement et ne se connecte à aucun opérateur. Toute future intégration fera l'objet d'un consentement explicite." },
    { title: 'Tontines et cotisations', body: "{app} vous aide à suivre votre tontine. {app} ne collecte ni ne garde d'argent et ne garantit pas les paiements des membres. Le carnet de tontine est un outil de suivi : les cotisations et les cagnottes sont versées entre les membres, en dehors de l'application, et les règles (montants, frais, commissions, pénalités, ordre des tours) sont celles que vous saisissez." },
    { title: 'Formules', body: "Une formule gratuite est proposée. Les formules payantes, lorsqu'elles seront disponibles, seront présentées avec leur prix avant tout paiement ; aucun prélèvement n'est effectué sans votre accord." },
    { title: 'Famille', body: "L'administrateur d'une famille invite les membres et attribue les rôles. Chaque membre peut quitter la famille à tout moment." },
    { title: 'Responsabilité', body: "{app} met tout en œuvre pour la disponibilité et l'exactitude des calculs, sans garantie d'absence d'erreur. Vérifiez les décisions importantes auprès d'un professionnel." },
    { title: 'Résiliation', body: "Vous pouvez supprimer votre compte à tout moment depuis l'application." },
  ],
};

const privacyEn: LegalDoc = {
  updated: '2026-10-14',
  sections: [
    { title: 'Who we are', body: '{app} is a personal and family money management, analysis and planning app. It is not a bank (online or otherwise), a microfinance institution, a lender, a payment or e-money service, a deposit or money-transfer service, or a regulated financial adviser: it never holds your money and performs no banking operation. The accounts you enter are simple markers to track your own finances.' },
    { title: 'Data we collect', body: 'Account: first and last name, email, phone (optional), country, currency, language, time zone. Financial profile YOU declare (all optional): family situation, occupation, housing, approximate income, main expenses, projects. Financial data YOU enter. Analyses are computed from this data only; no external statistic is used without an identified source. No connection to your bank or mobile-money provider.' },
    { title: 'AI assistant', body: 'Sentence understanding and numeric answers run on your phone. Detailed analysis is used only with your consent and receives an aggregated summary with no payees, notes or contact details.' },
    // Growth (approved by the founder on 2026-10-14, docs/textes-etape5.md).
    { title: 'Statistics', body: "Only with your consent, anonymous usage events (e.g. \"goal created\") are collected, with no amount or personal data. The only exception, with no link to you: the anonymous sign-up origin counter (see below)." },
    { title: "Referrals and fraud prevention", body: "When you invite someone, use an invitation code or ask to join a shared tontine, a technical identifier of your phone (never an advertising identifier) is irreversibly turned into an encrypted fingerprint before being stored. This fingerprint is only used to check that the same phone is not referred more than once. If you delete your account, it is kept with no link to you, for that reason only." },
    { title: "Sign-up origins", body: "When you sign up, the source of the link that brought you to {app} (for example \"WhatsApp\" or a campaign name), if known, is added once to an anonymous global counter. It is never stored in your account, which only keeps the information \"already counted\" (yes or no), and no advertising identifier or external tracking tool is used." },
    { title: 'Sharing', body: 'Your data is never sold. It is hosted on Google Cloud / Firebase. Family members only see the family space according to their role. Administrators only see aggregated statistics.' },
    { title: 'Your rights', body: 'Access, correction, export and permanent account deletion are available in Settings › My data.' },
  ],
};

const termsEn: LegalDoc = {
  updated: '2026-10-01',
  sections: [
    { title: 'Purpose', body: '{app} is a money-organisation tool. Suggestions are guidance computed from your data, not regulated financial advice.' },
    { title: 'Accounts', body: 'Accounts are tracked manually. {app} never initiates payments or connects to providers.' },
    { title: 'Tontines and contributions', body: "{app} helps you keep track of your tontine. {app} does not collect or hold any money and does not guarantee members' payments. The tontine notebook is a tracking tool: contributions and pots are paid between members, outside the app, and the rules (amounts, fees, commissions, penalties, round order) are the ones you enter." },
    { title: 'Plans', body: 'A free plan is offered. Paid plans will be shown with their price before any payment.' },
    { title: 'Termination', body: 'You can delete your account at any time from the app.' },
  ],
};

export const LEGAL: Record<'privacy' | 'terms', Record<Language, LegalDoc>> = {
  privacy: { fr: privacyFr, en: privacyEn },
  terms: { fr: termsFr, en: termsEn },
};
