/** Libellés français des actions et motifs du journal. */
const ACTIONS: Record<string, string> = {
  'auth.login': 'Connexion au portail',
  'auth.login-recovery': 'Connexion avec un code de secours',
  'auth.mfa-enrolled': 'Double vérification activée',
  'auth.logout': 'Déconnexion',
  'auth.me': 'Ouverture du portail',
  'auth.recovery-renew': 'Nouveaux codes de secours',
  'auth.password-change': 'Changement de mot de passe',
  'user.search': 'Recherche d’un utilisateur',
  'user.list': 'Liste des utilisateurs',
  'user.view': 'Ouverture d’une fiche',
  'user.create': 'Création d’un utilisateur',
  'user.edit': 'Modification d’un utilisateur',
  'user.plan': 'Changement de formule',
  'user.suspend': 'Suspension du compte',
  'user.reactivate': 'Réactivation du compte',
  'user.delete': 'Suppression définitive du compte',
  'data.view': 'Consultation des opérations',
  'data.list': 'Lecture des opérations',
  'data.delete-preview': 'Aperçu d’une suppression',
  'data.delete': 'Suppression d’une opération',
  'staff.list': 'Liste de l’équipe',
  'staff.invite': 'Invitation d’un collaborateur',
  'staff.invite-list': 'Liste des invitations',
  'staff.invite-resend': 'Invitation renvoyée',
  'staff.invite-link': 'Lien d’invitation copié',
  'staff.invite-revoke': 'Invitation annulée',
  'staff.invite-view': 'Ouverture d’une invitation',
  'staff.invite-accept': 'Invitation acceptée',
  'staff.role': 'Changement de rôle',
  'staff.suspend': 'Suspension d’un collaborateur',
  'staff.reactivate': 'Réactivation d’un collaborateur',
  'staff.remove': 'Retrait d’un collaborateur',
  'staff.mfa-reset': 'Double vérification réinitialisée',
  'staff.bootstrap': 'Création du premier Super Admin',
  'role.list': 'Liste des rôles',
  'role.save': 'Enregistrement d’un rôle',
  'role.delete': 'Suppression d’un rôle',
  'stats.view': 'Consultation des statistiques',
  'audit.list': 'Consultation du journal',
};

export const actionLabel = (action: string, result?: string) => {
  const base = ACTIONS[action] ?? action;
  return result === 'denied' ? `${base} refusée` : base;
};
export const ACTION_OPTIONS = Object.entries(ACTIONS).filter(([k]) => !['auth.me', 'user.list', 'staff.list', 'role.list', 'staff.invite-list', 'audit.list'].includes(k));

export const REASONS: [string, string][] = [
  ['client_request', 'Demande du client'],
  ['verification', 'Vérification'],
  ['fraud_suspicion', 'Suspicion de fraude'],
  ['other', 'Autre'],
];
export const reasonLabel = (code: string | null | undefined, note?: string | null) => {
  if (!code) return '—';
  const l = REASONS.find(([c]) => c === code)?.[1] ?? code;
  return note ? `${l} : ${note}` : l;
};

export const ROLE_NAMES: Record<string, string> = { superAdmin: 'Super Admin', admin: 'Administrateur', support: 'Support', analyste: 'Analyste' };
export const roleName = (id: string | null | undefined) => (id ? ROLE_NAMES[id] ?? id : '—');

const EFFECTS: Record<string, string> = { debtPayment: 'remboursement de dette', goalContribution: 'versement à un objectif', reserveUse: 'utilisation de réserve', reserveTransfer: 'transfert de réserve', tontineEntry: 'écriture de tontine' };
export const effectsText = (e: Record<string, number> | null | undefined) =>
  e && Object.keys(e).length ? Object.entries(e).map(([k, n]) => `${n} ${EFFECTS[k] ?? k}`).join(', ') : '';
