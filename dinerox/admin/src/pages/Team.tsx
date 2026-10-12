/** E8 / E9 — Équipe et rôles (staff.manage, Super Admin) : collaborateurs, invitations, rôles. */
import { useState } from 'react';
import { call, type Permission } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { fmtDate, fmtDateTime, initials } from '../format';
import { errorText } from '../messages';
import { Badge, Dialog, ErrorState, Loading, Msg, useLoad, useToast, type BadgeDef } from '../components/ui';
import { inviteUrl, sendInviteEmail } from './inviteLink';
import { brand } from '../brand';

interface Staff { uid: string; email: string; displayName: string; roleId: string; roleName: string; status: 'active' | 'suspended' | 'invited'; mfaEnrolled: boolean; lastLoginAt: number | null }
interface Invite { id: string; email: string; displayName: string; roleId: string; invitedByName: string; status: 'sent' | 'accepted' | 'expired' | 'revoked'; sentAt: number; expiresAt: number; acceptedAt: number | null; revokedAt: number | null }
interface Role { id: string; name: string; permissions: Permission[]; builtIn: boolean }

export const PERMS: [Permission, string][] = [
  ['users.view', 'Voir les utilisateurs'], ['users.create', 'Créer un utilisateur'], ['users.edit', 'Modifier un utilisateur'],
  ['users.changePlan', 'Changer la formule'], ['users.suspend', 'Suspendre et réactiver'], ['users.delete', 'Supprimer définitivement'],
  ['stats.view', 'Voir les statistiques'], ['audit.view', 'Voir le journal'], ['staff.manage', 'Gérer l’équipe'],
  ['data.view', 'Voir les opérations'], ['data.delete', 'Supprimer une opération'],
];
/** Réservées (le serveur les refuse dans un rôle sur mesure). */
const RESERVED: Partial<Record<Permission, string>> = {
  'data.view': 'Réservé aux rôles Super Admin et Administrateur',
  'data.delete': 'Réservé au rôle Super Admin',
  'staff.manage': 'Réservé au rôle Super Admin',
  'users.changePlan': 'Réservé au rôle Super Admin',
};
const ROLE_BADGE: Record<string, BadgeDef> = {
  superAdmin: ['b-accent', 'ribbon-outline', 'Super Admin'], admin: ['b-primary', 'key-outline', 'Administrateur'],
  support: ['b-neutral', 'headset-outline', 'Support'], analyste: ['b-neutral', 'analytics-outline', 'Analyste'],
};
const roleBadge = (id: string, name: string): BadgeDef => ROLE_BADGE[id] ?? ['b-info', 'construct-outline', name || id];
const STAFF_STATUS: Record<string, BadgeDef> = { active: ['b-success', 'checkmark-circle', 'Actif'], suspended: ['b-danger', 'ban', 'Suspendu'], invited: ['b-info', 'mail-outline', 'Invitation envoyée'] };
const INV_STATUS: Record<Invite['status'], BadgeDef> = { sent: ['b-info', 'mail-outline', 'Invitation envoyée'], accepted: ['b-success', 'checkmark-circle', 'Acceptée'], expired: ['b-warning', 'time-outline', 'Expirée'], revoked: ['b-neutral', 'close-circle-outline', 'Annulée'] };
const nameInitials = (n: string, email: string) => { const [a, ...b] = n.split(' '); return initials(a ?? '', b.join(' '), email); };

export default function Team() {
  const { me } = useSession();
  const toast = useToast();
  const staff = useLoad(() => call<{ staff: Staff[] }>('boListStaff'), []);
  const invites = useLoad(() => call<{ invites: Invite[] }>('boListInvites'), []);
  const roles = useLoad(() => call<{ roles: Role[] }>('boListRoles'), []);
  const [dlg, setDlg] = useState<null | { kind: 'invite' } | { kind: 'manage'; s: Staff } | { kind: 'cancel'; i: Invite } | { kind: 'role'; r: Role | null }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reloadAll = () => { staff.reload(); invites.reload(); roles.reload(); };
  if (staff.error) return <div className="card"><ErrorState text={errorText(staff.error)} onRetry={reloadAll} /></div>;
  const activeSupers = (staff.data?.staff ?? []).filter((s) => s.roleId === 'superAdmin' && s.status === 'active').length;
  const members = (staff.data?.staff ?? []).filter((s) => s.status !== 'invited');

  const resend = async (i: Invite) => {
    setBusyId(i.id);
    try {
      const r = await call<{ inviteId: string; token: string; email: string }>('boResendInvite', { inviteId: i.id });
      const sent = await sendInviteEmail(r.email, r.inviteId, r.token);
      toast(sent ? `Nouveau lien envoyé à ${r.email}. L’ancien lien ne fonctionne plus.` : `Nouveau lien créé (l’ancien ne fonctionne plus), mais l’e-mail n’a pas pu partir : utilisez « Copier le lien d’invitation ».`);
      invites.reload();
    } catch (e) { toast(errorText(e)); } finally { setBusyId(null); }
  };
  const copy = async (i: Invite) => {
    setBusyId(i.id);
    try {
      const r = await call<{ inviteId: string; token: string }>('boGetInviteLink', { inviteId: i.id });
      await navigator.clipboard.writeText(inviteUrl(r.inviteId, r.token));
      toast(`Lien copié. Envoyez-le seulement à ${i.displayName} : il donne accès à l’invitation.`);
    } catch (e) { toast(errorText(e)); } finally { setBusyId(null); }
  };

  return (
    <>
      <div className="card">
        <div className="toolbar"><p className="small muted" style={{ margin: 0, alignSelf: 'center' }}>Seul un Super Admin attribue le rôle Administrateur. Personne ne modifie ses propres droits.</p><div className="grow" /><button className="btn primary" onClick={() => setDlg({ kind: 'invite' })}><Icon name="person-add-outline" />Inviter un collaborateur</button></div>
        {!staff.data ? <Loading /> : (
          <div className="tablewrap"><table className="stack">
            <caption className="sr">Collaborateurs du back-office</caption>
            <thead><tr><th scope="col">Collaborateur</th><th scope="col">Rôle</th><th scope="col">Statut</th><th scope="col">Double vérification</th><th scope="col">Dernière connexion</th><th scope="col"><span className="sr">Actions</span></th></tr></thead>
            <tbody>{members.map((s) => {
              const self = s.uid === me?.uid;
              const last = s.roleId === 'superAdmin' && s.status === 'active' && activeSupers <= 1;
              const note = self ? 'Vous ne pouvez pas modifier vos propres droits' : last ? 'Dernier Super Admin : ni rétrogradable ni suspendable' : '';
              return (
                <tr key={s.uid}>
                  <td className="nolabel"><div className="ucell"><span className="avatar" aria-hidden="true">{nameInitials(s.displayName, s.email)}</span><div><b>{s.displayName}{self ? ' (vous)' : ''}</b><span>{s.email}</span></div></div></td>
                  <td data-label="Rôle"><Badge def={roleBadge(s.roleId, s.roleName)} /></td>
                  <td data-label="Statut"><Badge def={STAFF_STATUS[s.status]} /></td>
                  <td data-label="Double vérification"><Badge def={s.mfaEnrolled ? ['b-success', 'shield-checkmark', 'Activée'] : ['b-warning', 'alert-circle-outline', 'À activer']} /></td>
                  <td data-label="Dernière connexion" className="muted">{s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : 'jamais'}</td>
                  <td className="nolabel" style={{ textAlign: 'right' }}>{self ? <span className="caption subtle" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', maxWidth: 260, textAlign: 'right' }}><Icon name="lock-closed-outline" />{note}</span> : (
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{last && <span className="caption subtle" style={{ maxWidth: 220, textAlign: 'right' }}>{note}</span>}<button className="btn outline sm" onClick={() => setDlg({ kind: 'manage', s })}><Icon name="create-outline" />Gérer</button></span>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>

      <section className="card" aria-labelledby="inv-t">
        <div className="card-head" style={{ paddingBottom: 14 }}><div><h2 className="h-sec" id="inv-t">Invitations</h2><p className="caption subtle" style={{ margin: '2px 0 0' }}>Un invité n’a aucune permission tant qu’il n’a pas accepté et activé sa double vérification.</p></div></div>
        {!invites.data ? <Loading rows={2} /> : !invites.data.invites.length ? <p className="card-pad caption subtle" style={{ margin: 0 }}>Aucune invitation pour l’instant.</p> : (
          <div className="tablewrap"><table className="stack">
            <caption className="sr">Invitations envoyées</caption>
            <thead><tr><th scope="col">Personne invitée</th><th scope="col">Rôle</th><th scope="col">Statut</th><th scope="col">Envoi</th><th scope="col"><span className="sr">Actions</span></th></tr></thead>
            <tbody>{invites.data.invites.map((v) => (
              <tr key={v.id}>
                <td className="nolabel"><div className="ucell"><span className="avatar" aria-hidden="true">{nameInitials(v.displayName, v.email)}</span><div><b>{v.displayName}</b><span>{v.email}</span></div></div></td>
                <td data-label="Rôle"><Badge def={roleBadge(v.roleId, roles.data?.roles.find((r) => r.id === v.roleId)?.name ?? v.roleId)} /></td>
                <td data-label="Statut"><Badge def={INV_STATUS[v.status]} /></td>
                <td data-label="Envoi" className="muted">{v.status === 'accepted' ? `Acceptée le ${fmtDate(v.acceptedAt)}` : v.status === 'revoked' ? `Annulée le ${fmtDate(v.revokedAt)}` : `Envoyée le ${fmtDate(v.sentAt)} par ${v.invitedByName} · ${v.status === 'expired' ? 'expirée' : 'expire'} le ${fmtDate(v.expiresAt)}`}</td>
                <td className="nolabel" style={{ textAlign: 'right' }}><div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {v.status === 'sent' && <button className="btn tertiary sm" disabled={busyId === v.id} onClick={() => void copy(v)}><Icon name="copy-outline" />Copier le lien d’invitation</button>}
                  {(v.status === 'sent' || v.status === 'expired') && <>
                    <button className="btn outline sm" disabled={busyId === v.id} onClick={() => void resend(v)}><Icon name="refresh-outline" />Renvoyer</button>
                    <button className="btn destructive sm" onClick={() => setDlg({ kind: 'cancel', i: v })}><Icon name="close-circle-outline" />Annuler</button>
                  </>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <div className="rowbetween"><div><h2 className="h-sec">Rôles</h2><p className="caption subtle" style={{ margin: '2px 0 0' }}>Rôles fournis non modifiables · rôles sur mesure créés par un Super Admin</p></div><button className="btn secondary" onClick={() => setDlg({ kind: 'role', r: null })}><Icon name="add-outline" />Créer un rôle sur mesure</button></div>
      <div className="roles">
        {(roles.data?.roles ?? []).map((r) => (
          <section className="card role-card" key={r.id}>
            <h3>{r.name}<Badge def={r.builtIn ? (r.id === 'superAdmin' ? ['b-accent', 'ribbon-outline', 'Fourni'] : ['b-neutral', 'lock-closed-outline', 'Fourni']) : ['b-info', 'construct-outline', 'Sur mesure']} /></h3>
            {PERMS.map(([c, l]) => { const on = r.permissions.includes(c); return (
              <div className={`perm${on ? ' on' : ''}`} key={c}><span className="box" aria-hidden="true">{on && <Icon name="checkmark" />}</span><span>{l}<code>{c}</code></span><span className="sr">{on ? 'accordée' : 'non accordée'}</span></div>
            ); })}
            {!r.builtIn && <button className="btn outline sm" onClick={() => setDlg({ kind: 'role', r })}><Icon name="create-outline" />Modifier</button>}
          </section>
        ))}
      </div>
      <section className="card"><div className="card-head" style={{ paddingBottom: 14 }}><h2 className="h-sec">Matrice des permissions</h2></div>
        <div className="tablewrap"><table className="matrix"><caption className="sr">Permissions par rôle</caption>
          <thead><tr><th scope="col">Permission</th>{(roles.data?.roles ?? []).filter((r) => r.builtIn).map((r) => <th scope="col" key={r.id}>{r.name}</th>)}<th scope="col">Sur mesure</th></tr></thead>
          <tbody>{PERMS.map(([c, l]) => (
            <tr key={c}><th scope="row" style={{ background: 'none', fontWeight: 500, color: 'var(--text)' }}>{l} <span className="mono">{c}</span></th>
              {(roles.data?.roles ?? []).filter((r) => r.builtIn).map((r) => <td key={r.id}>{r.permissions.includes(c) ? <span className="yes"><Icon name="checkmark-circle" />Oui</span> : RESERVED[c] ? <span className="lock"><Icon name="lock-closed" />Réservée</span> : <span className="no"><Icon name="remove" />Non</span>}</td>)}
              <td>{RESERVED[c] ? <span className="lock"><Icon name="lock-closed" />Interdite</span> : <span className="no"><Icon name="options-outline" />Au choix</span>}</td></tr>
          ))}</tbody>
        </table></div></section>

      {dlg?.kind === 'invite' && <InviteDialog roles={roles.data?.roles ?? []} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reloadAll(); }} />}
      {dlg?.kind === 'cancel' && <CancelInviteDialog invite={dlg.i} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reloadAll(); }} />}
      {dlg?.kind === 'manage' && <ManageStaffDialog s={dlg.s} roles={roles.data?.roles ?? []} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reloadAll(); }} />}
      {dlg?.kind === 'role' && <RoleDialog role={dlg.r} onClose={() => setDlg(null)} onDone={() => { setDlg(null); roles.reload(); }} />}
    </>
  );
}

function InviteDialog({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('support');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await call<{ inviteId: string; token: string; email: string }>('boInviteStaff', { email: email.trim(), displayName: name.trim(), roleId });
      const sent = await sendInviteEmail(r.email, r.inviteId, r.token);
      toast(sent ? `Invitation envoyée à ${r.email}. Le lien est valable 7 jours.` : 'Invitation créée, mais l’e-mail n’a pas pu partir : utilisez « Copier le lien d’invitation ».');
      onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog title="Inviter un collaborateur" intro="La personne reçoit un lien personnel, valable 7 jours et utilisable une seule fois." icon="person-add-outline" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy || !email.trim() || !name.trim()} onClick={() => void submit()}><Icon name="send-outline" />Envoyer l’invitation</button></>}>
      <div className="field"><label htmlFor="ie">Adresse e-mail professionnelle</label><input id="ie" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><span className="help">Une adresse réservée au travail, différente de son compte personnel {brand.name}.</span></div>
      <div className="two" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="in">Nom</label><input id="in" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="ir">Rôle</label><select id="ir" className="select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.builtIn ? '' : ' (sur mesure)'}</option>)}</select></div>
      </div>
      <Msg tone="info" icon="lock-closed-outline">Aucune permission avant que la personne ait accepté et activé sa double vérification. Elle choisit elle-même son mot de passe.</Msg>
      {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
    </Dialog>
  );
}

function CancelInviteDialog({ invite, onClose, onDone }: { invite: Invite; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`Annuler l’invitation de ${invite.displayName} ?`} intro="Le lien ne fonctionnera plus. Vous pourrez inviter cette personne à nouveau." icon="close-circle-outline" tone="danger" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Garder l’invitation</button><button className="btn danger" disabled={busy} onClick={() => { setBusy(true); call('boRevokeInvite', { inviteId: invite.id }).then(() => { toast('Invitation annulée.'); onDone(); }, (e) => { setError(errorText(e)); setBusy(false); }); }}><Icon name="close-circle-outline" />Annuler l’invitation</button></>}>
      {error ? <Msg tone="danger" icon="alert-circle">{error}</Msg> : null}
    </Dialog>
  );
}

function ManageStaffDialog({ s, roles, onClose, onDone }: { s: Staff; roles: Role[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [roleId, setRoleId] = useState(s.roleId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = (fn: string, data: Record<string, unknown>, done: string) => {
    setError(null);
    setBusy(true);
    call(fn, { uid: s.uid, ...data }).then(() => { toast(done); onDone(); }, (e) => { setError(errorText(e)); setBusy(false); });
  };
  return (
    <Dialog title={`Gérer ${s.displayName}`} intro={`${s.email} · chaque action est vérifiée par le serveur et enregistrée au journal.`} icon="shield-checkmark-outline" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Fermer</button><button className="btn primary" disabled={busy || roleId === s.roleId} onClick={() => act('boSetStaffRole', { roleId }, 'Rôle changé.')}><Icon name="save-outline" />Changer le rôle</button></>}>
      <div className="field"><label htmlFor="mr">Rôle</label><select id="mr" className="select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {s.status === 'active'
          ? <button className="btn outline sm" disabled={busy} onClick={() => act('boSetStaffSuspended', { suspended: true }, 'Accès suspendu.')}><Icon name="ban-outline" />Suspendre l’accès</button>
          : <button className="btn outline sm" disabled={busy} onClick={() => act('boSetStaffSuspended', { suspended: false }, 'Accès réactivé.')}><Icon name="checkmark-circle-outline" />Réactiver l’accès</button>}
        <button className="btn outline sm" disabled={busy} onClick={() => act('boResetStaffMfa', {}, 'Double vérification réinitialisée : elle sera redemandée à la prochaine connexion.')}><Icon name="finger-print-outline" />Réinitialiser la double vérification</button>
        <button className="btn destructive sm" disabled={busy} onClick={() => act('boRemoveStaff', {}, 'Collaborateur retiré de l’équipe.')}><Icon name="trash-outline" />Retirer de l’équipe</button>
      </div>
      {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
    </Dialog>
  );
}

function RoleDialog({ role, onClose, onDone }: { role: Role | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? '');
  const [perms, setPerms] = useState<Permission[]>(role?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => { setError(null); setBusy(true); call('boSaveRole', { id: role?.id ?? null, name, permissions: perms }).then(() => { toast('Rôle enregistré.'); onDone(); }, (e) => { setError(errorText(e)); setBusy(false); }); };
  const remove = () => { if (!role) return; setBusy(true); call('boDeleteRole', { id: role.id }).then(() => { toast('Rôle supprimé.'); onDone(); }, (e) => { setError(errorText(e)); setBusy(false); }); };
  return (
    <Dialog title={role ? `Modifier « ${role.name} »` : 'Créer un rôle sur mesure'} intro="Les permissions réservées ne peuvent figurer dans aucun rôle sur mesure." icon="construct-outline" onClose={onClose}
      footer={<>{role ? <button className="btn destructive" disabled={busy} onClick={remove}><Icon name="trash-outline" />Supprimer le rôle</button> : <button className="btn outline" onClick={onClose}>Annuler</button>}<button className="btn primary" disabled={busy || name.trim().length < 2 || !perms.length} onClick={save}><Icon name="save-outline" />Enregistrer le rôle</button></>}>
      <div className="field"><label htmlFor="rn">Nom du rôle</label><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></div>
      <div>
        {PERMS.map(([c, l]) => RESERVED[c] ? (
          <div className="perm locked" key={c}><span className="box" aria-hidden="true"><Icon name="lock-closed" /></span><span>{l}<code>{c}</code><span className="caption" style={{ display: 'block' }}>{RESERVED[c]}</span></span><span className="sr">verrouillée, impossible à attribuer</span></div>
        ) : (
          <label className={`perm${perms.includes(c) ? ' on' : ''}`} style={{ cursor: 'pointer' }} key={c}>
            <span className="box" aria-hidden="true">{perms.includes(c) && <Icon name="checkmark" />}</span><span>{l}<code>{c}</code></span>
            <input type="checkbox" className="sr" checked={perms.includes(c)} aria-label={l} onChange={(e) => setPerms((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))} />
          </label>
        ))}
      </div>
      {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
    </Dialog>
  );
}
