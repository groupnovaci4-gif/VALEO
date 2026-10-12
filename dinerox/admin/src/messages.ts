/**
 * Messages d'erreur du portail (français). Le serveur renvoie un CODE (`bo/permission`,
 * `invite/expired`…) ; le texte affiché est choisi ici. Jamais de détail technique.
 */
const MESSAGES: Record<string, string> = {
  'bo/permission': 'Action refusée : votre rôle n’a pas la permission nécessaire. Ce refus est enregistré au journal.',
  'bo/session': 'Votre session a expiré. Reconnectez-vous.',
  'bo/auth': 'Votre session a expiré. Reconnectez-vous.',
  'bo/not-staff': 'Ce compte n’a pas accès au back-office.',
  'bo/staff-suspended': 'Votre accès au back-office est suspendu. Contactez un Super Admin.',
  'bo/staff-invited': 'Cette invitation n’a pas encore été acceptée.',
  'bo/login-failed': 'Adresse ou mot de passe incorrect.',
  'bo/bad-code': 'Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.',
  'bo/locked': 'Trop d’essais. Ce compte est verrouillé pendant 15 minutes.',
  'bo/misconfigured': 'Le back-office n’est pas encore configuré sur ce serveur.',
  'bo/unavailable': 'Service momentanément indisponible. Réessayez dans un instant.',
  'bo/user-not-found': 'Utilisateur introuvable.',
  'bo/email-exists': 'Un compte existe déjà avec cette adresse.',
  'bo/target-is-staff': 'Ce compte appartient à l’équipe : il se gère depuis « Équipe et rôles ». Ce refus est enregistré au journal.',
  'bo/no-change': 'Rien à changer.',
  'bo/reason': 'Choisissez un motif (et précisez-le pour « Autre »).',
  'bo/confirm': 'La confirmation ne correspond pas.',
  'bo/endsAt': 'Choisissez une date de fin (dans les 12 prochains mois).',
  'bo/plan-store-managed': 'Cette formule a été achetée dans une boutique : elle ne se modifie pas ici.',
  'bo/access-expired': 'L’accès aux opérations a expiré (30 min). Indiquez à nouveau un motif.',
  'bo/space-mismatch': 'Cet espace n’appartient pas à cet utilisateur.',
  'bo/tx-not-found': 'Cette opération n’existe plus ou a déjà été supprimée.',
  'bo/staff-has-app-account': 'Cette adresse a déjà un compte personnel dans l’app. Utilisez une adresse réservée au travail.',
  'bo/already-staff': 'Cette personne fait déjà partie de l’équipe (ou a une invitation en cours).',
  'bo/staff-not-found': 'Collaborateur introuvable.',
  'staff/self': 'Vous ne pouvez pas modifier vos propres droits.',
  'staff/super-admin-only': 'Seul un Super Admin peut faire cela.',
  'staff/last-super-admin': 'Impossible : c’est le dernier Super Admin actif.',
  'staff/same-role': 'Ce collaborateur a déjà ce rôle.',
  'role/permission-reserved': 'Cette permission est réservée : elle ne peut pas figurer dans un rôle sur mesure.',
  'role/reserved-name': 'Ce nom est réservé à un rôle fourni.',
  'role/name': 'Le nom du rôle doit faire 2 à 40 caractères.',
  'role/name-taken': 'Un rôle porte déjà ce nom.',
  'role/empty': 'Cochez au moins une permission.',
  'role/in-use': 'Ce rôle est attribué à au moins un collaborateur.',
  'invite/expired': 'Cette invitation a expiré. Demandez à la personne qui vous a invité de vous l’envoyer à nouveau.',
  'invite/revoked': 'Cette invitation a été annulée.',
  'invite/used': 'Cette invitation a déjà été utilisée. Connectez-vous avec votre adresse et votre mot de passe.',
  'invite/invalid-token': 'Ce lien d’invitation n’est pas valable. Il a peut-être été remplacé par un lien plus récent.',
  'invite/not-found': 'Ce lien d’invitation n’est pas valable. Il a peut-être été remplacé par un lien plus récent.',
  'invite/invalid': 'Ce lien d’invitation n’est pas valable. Il a peut-être été remplacé par un lien plus récent.',
  'invite/wrong-email': 'Cette adresse ne correspond pas à l’invitation. Utilisez l’adresse qui a reçu l’invitation.',
  'invite/wrong-email+revoked': 'Cette invitation a été annulée.',
  'invite/password-weak': 'Le mot de passe doit contenir au moins 12 caractères.',
  'invite/password-required': 'Le mot de passe doit contenir au moins 12 caractères.',
  'invite/password-tooLong': '128 caractères maximum.',
};

export function codeOf(e: unknown): string {
  const m = (e as { message?: unknown } | null)?.message;
  // Le SDK peut ajouter le statut HTTP (« bo/login-failed [401] ») : seul le code compte.
  return typeof m === 'string' ? m.replace(/\s*\[\d+\]$/, '').replace(/\s*\(functions\/[a-z-]+\)\.?$/, '').trim() : '';
}

export function errorText(e: unknown): string {
  const code = codeOf(e);
  if (MESSAGES[code]) return MESSAGES[code];
  if ((e as { code?: string } | null)?.code === 'functions/unavailable' || code === 'internal') return 'Service momentanément indisponible. Réessayez dans un instant.';
  return 'Une erreur est survenue. Réessayez.';
}
