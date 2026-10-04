/**
 * Permissions dans un espace — MIROIR de firestore.rules.
 *
 * Côté client, ces règles ne servent qu'à adapter l'interface : c'est le
 * serveur (règles Firestore) qui décide. Toute modification ici doit être
 * reportée dans firestore.rules, et inversement.
 *
 *  admin   : accès complet, gère les membres et l'espace.
 *  partner : (conjoint) lit tout, saisit et modifie les opérations, budgets,
 *            objectifs, dettes, comptes et patrimoine ; ne gère pas les membres.
 *  child   : (enfant) lit opérations, enveloppes et objectifs ; saisit SES
 *            dépenses et contribue aux objectifs ; ne voit ni dettes, ni
 *            patrimoine, ni comptes en détail ; ne modifie rien d'autre.
 */
import type { CollectionName, Role, Space } from './types';

export type Action = 'read' | 'create' | 'update' | 'delete';

const CHILD_READ: CollectionName[] = ['transactions', 'categories', 'envelopes', 'budgets', 'goals', 'goalContributions', 'accounts'];
const CHILD_CREATE: CollectionName[] = ['transactions', 'goalContributions'];

export function can(role: Role | null | undefined, action: Action, collection: CollectionName): boolean {
  if (!role) return false;
  if (role === 'admin' || role === 'partner') return true;
  // Enfant
  if (action === 'read') return CHILD_READ.includes(collection);
  if (action === 'create') return CHILD_CREATE.includes(collection);
  return false;
}

/** Un enfant ne peut modifier/supprimer que ce qu'il a lui-même créé, et seulement des opérations. */
export function canEditDoc(role: Role | null | undefined, collection: CollectionName, createdBy: string, uid: string): boolean {
  if (role === 'admin' || role === 'partner') return true;
  if (role === 'child') return collection === 'transactions' && createdBy === uid;
  return false;
}

export function roleIn(space: Pick<Space, 'members'> | null | undefined, uid: string | null | undefined): Role | null {
  if (!space || !uid) return null;
  return space.members?.[uid] ?? null;
}

export function canManageMembers(role: Role | null | undefined): boolean {
  return role === 'admin';
}

/** Un espace doit toujours garder au moins un administrateur. */
export function canChangeRole(space: Pick<Space, 'members'>, actorUid: string, targetUid: string, next: Role | null): boolean {
  if (space.members[actorUid] !== 'admin') return false;
  const admins = Object.entries(space.members).filter(([, r]) => r === 'admin').map(([u]) => u);
  const removingLastAdmin = admins.length === 1 && admins[0] === targetUid && next !== 'admin';
  return !removingLastAdmin;
}
