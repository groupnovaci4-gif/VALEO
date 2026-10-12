/**
 * Back-office web : Cloud Functions appelables `bo…` (région europe-west1).
 * Le portail ne lit ni n'écrit jamais Firestore : tout passe par ces fonctions,
 * qui vérifient la permission à chaque appel (context.ts › requireStaff).
 * Conception : docs/backoffice.md.
 */
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { BO_MFA_KEY } from './context';
import { changePassword, loginStart, loginVerify, logout, me, newRecovery } from './login';
import { createUser, deleteUser, getUser, listUsers, searchUsers, setPlan, setSuspended, updateUser } from './users';
import { deleteTransaction, listTransactions, myAccesses, openData, previewDelete } from './data';
import { deleteRole, listRoles, listStaff, removeStaff, resetStaffMfa, saveRole, setStaffRole, setStaffSuspended } from './staff';
import { acceptInvite, getInviteLink, inviteStaff, listInvites, resendInvite, revokeInvite, viewInvite } from './invites';
import { computeSnapshot, listAudit, stats } from './stats';

const opts = { region: 'europe-west1', maxInstances: 5, timeoutSeconds: 60 } as const;
const call = (fn: (req: CallableRequest) => Promise<unknown>) => onCall(opts, fn);
/** Fonctions qui chiffrent ou vérifient un secret de double vérification. */
const callMfa = (fn: (req: CallableRequest) => Promise<unknown>) => onCall({ ...opts, secrets: [BO_MFA_KEY] }, fn);

// Connexion (mot de passe + code), session, codes de secours.
export const boLoginStart = callMfa(loginStart);
export const boLoginVerify = callMfa(loginVerify);
export const boLogout = call(logout);
export const boMe = call(me);
export const boNewRecoveryCodes = callMfa(newRecovery);
export const boChangePassword = callMfa(changePassword);

// Utilisateurs.
export const boSearchUsers = call(searchUsers);
export const boListUsers = call(listUsers);
export const boGetUser = call(getUser);
export const boCreateUser = call(createUser);
export const boUpdateUser = call(updateUser);
export const boSetPlan = call(setPlan);
export const boSetSuspended = call(setSuspended);
export const boDeleteUser = onCall({ ...opts, timeoutSeconds: 300 }, deleteUser);

// Données financières (motif, lecture seule ; suppression : Super Admin).
export const boOpenData = call(openData);
export const boListTransactions = call(listTransactions);
export const boPreviewDelete = call(previewDelete);
export const boDeleteTransaction = call(deleteTransaction);
export const boMyDataAccess = call(myAccesses);

// Équipe et rôles.
export const boListStaff = call(listStaff);
// Invitations (le jeton est chiffré avec BO_MFA_KEY).
export const boInviteStaff = callMfa(inviteStaff);
export const boListInvites = call(listInvites);
export const boResendInvite = callMfa(resendInvite);
export const boGetInviteLink = callMfa(getInviteLink);
export const boRevokeInvite = call(revokeInvite);
// Côté invité, sans session : le jeton du lien fait foi.
export const boViewInvite = call(viewInvite);
export const boAcceptInvite = call(acceptInvite);
export const boSetStaffRole = call(setStaffRole);
export const boSetStaffSuspended = call(setStaffSuspended);
export const boRemoveStaff = call(removeStaff);
export const boResetStaffMfa = call(resetStaffMfa);
export const boListRoles = call(listRoles);
export const boSaveRole = call(saveRole);
export const boDeleteRole = call(deleteRole);

// Statistiques et journal.
export const boStats = call(stats);
export const boListAudit = call(listAudit);
export const boStatsSnapshot = onSchedule({ schedule: '5 * * * *', timeZone: 'Africa/Abidjan', region: 'europe-west1' }, async () => {
  await computeSnapshot();
});
