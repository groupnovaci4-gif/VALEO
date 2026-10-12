/** E4 — Fiche utilisateur (users.view) : aucune donnée financière. Boutons selon les droits. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { call, type UserSummary } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { ago, countryName, fmtDate, fmtDateTime, initials } from '../format';
import { errorText } from '../messages';
import { Badge, ErrorState, Loading, Msg, PLAN_BADGE, STATUS_BADGE, useLoad, useToast } from '../components/ui';
import { actionLabel, reasonLabel, roleName } from './auditLabels';
import { DeleteUserDialog, EditUserDialog, PlanDialog, ReasonDialog, SuspendDialog } from './dialogs/UserDialogs';

interface Detail {
  user: UserSummary;
  auth: { disabled: boolean; emailVerified: boolean; createdAt: string | null; lastSignInAt: string | null; providers: string[] };
  suspension: { status: string; since: number | null; reasonCode: string | null } | null;
  isStaff: boolean;
  devices: number;
  spaces: { id: string; kind: 'personal' | 'family'; name: string; role: string | null; memberCount: number }[];
  history: { seq: number; atMs: number; action: string; result: string; actorEmail: string | null; actorRole: string | null; reasonCode: string | null }[] | null;
}

const SPACE_ROLE: Record<string, string> = { admin: 'Administrateur', partner: 'Conjoint', child: 'Enfant' };
const PLAN_NAME: Record<string, string> = { free: 'Gratuit', plus: 'Plus', family: 'Famille' };

export default function UserPage({ setTitle }: { setTitle: (t: string) => void }) {
  const { uid = '' } = useParams();
  const { can } = useSession();
  const nav = useNavigate();
  const toast = useToast();
  const [dlg, setDlg] = useState<null | 'edit' | 'plan' | 'suspend' | 'delete' | 'reason'>(null);
  const d = useLoad(async () => {
    const r = await call<Detail>('boGetUser', { uid });
    setTitle(`${r.user.firstName} ${r.user.lastName}`.trim() || r.user.email || 'Fiche');
    return r;
  }, [uid]);
  if (d.error) return <div className="card"><ErrorState text={errorText(d.error)} onRetry={d.reload} /></div>;
  if (!d.data) return <div className="card"><Loading /></div>;
  const { user: u, auth, spaces, history, isStaff } = d.data;
  const done = () => { setDlg(null); d.reload(); };
  const families = spaces.filter((s) => s.kind === 'family');
  const acts = isStaff ? [] : [
    can('users.edit') && <button key="e" className="btn outline" onClick={() => setDlg('edit')}><Icon name="create-outline" />Modifier</button>,
    can('users.changePlan') && <button key="p" className="btn outline" onClick={() => setDlg('plan')}><Icon name="star-outline" />Changer de formule</button>,
    can('users.suspend') && <button key="s" className="btn outline" onClick={() => setDlg('suspend')}><Icon name={u.status === 'suspended' ? 'checkmark-circle-outline' : 'ban-outline'} />{u.status === 'suspended' ? 'Réactiver' : 'Suspendre'}</button>,
    can('data.view') && <button key="d" className="btn primary" onClick={() => setDlg('reason')}><Icon name="receipt-outline" />Voir les opérations</button>,
  ].filter(Boolean);
  return (
    <>
      <div className="card profile">
        <span className="avatar lg" aria-hidden="true">{initials(u.firstName, u.lastName, u.email)}</span>
        <div className="id">
          <div className="muted small">{u.email}</div>
          <div className="tags">
            <Badge def={STATUS_BADGE[u.status]} />
            <Badge def={PLAN_BADGE[u.plan] ?? PLAN_BADGE.free} />
            <Badge def={auth.emailVerified ? ['b-info', 'checkmark-done-outline', 'E-mail vérifié'] : ['b-warning', 'mail-unread-outline', 'E-mail non vérifié']} />
            <button className="btn tertiary sm" aria-label={`Copier l’identifiant ${u.uid}`} onClick={() => void navigator.clipboard?.writeText(u.uid).then(() => toast('Identifiant copié.'))}><Icon name="copy-outline" /><span className="mono">{u.uid}</span></button>
          </div>
        </div>
        {acts.length > 0 && <div className="actions">{acts}</div>}
      </div>
      {isStaff && <Msg tone="info" icon="shield-checkmark-outline">Ce compte appartient à l’équipe du back-office : il se gère depuis « Équipe et rôles ».</Msg>}
      <div className="grid-main">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="card">
            <div className="card-head" style={{ paddingBottom: 14 }}><h2 className="h-sec">Informations</h2><span className="caption subtle">Aucune donnée financière</span></div>
            <dl className="dl">
              <div><dt>Prénom et nom</dt><dd>{`${u.firstName} ${u.lastName}`.trim() || '—'}</dd></div>
              <div><dt>Pays · devise</dt><dd>{countryName(u.country)} · {u.currency ?? '—'}</dd></div>
              <div><dt>Langue</dt><dd>{u.language === 'en' ? 'English' : 'Français'}</dd></div>
              <div><dt>Formule</dt><dd>{PLAN_NAME[u.plan] ?? u.plan}{u.planEndsAt ? ` · jusqu’au ${fmtDate(u.planEndsAt)}` : ''}{u.planProvider === 'manual' ? ' (attribuée à la main)' : ''}</dd></div>
              <div><dt>Inscription</dt><dd className="tnum">{fmtDate(u.createdAt)}</dd></div>
              <div><dt>Dernière activité</dt><dd>{ago(u.lastActiveAt)}</dd></div>
              <div><dt>Appareils</dt><dd>{d.data.devices}</dd></div>
              <div><dt>Dernière connexion</dt><dd>{auth.lastSignInAt ? fmtDateTime(Date.parse(auth.lastSignInAt)) : '—'}</dd></div>
            </dl>
          </section>
          <section className="card">
            <div className="card-head" style={{ paddingBottom: 14 }}><h2 className="h-sec">Espaces</h2></div>
            <ul className="list">
              {spaces.map((s) => (
                <li key={s.id}>
                  <span className="dot-ico"><Icon name={s.kind === 'family' ? 'people-outline' : 'person-outline'} /></span>
                  <div className="grow"><b>{s.kind === 'personal' ? 'Espace personnel' : s.name}</b><span className="caption subtle">{s.kind === 'personal' ? 'Propriétaire' : `${s.memberCount} membres`}</span></div>
                  {s.kind === 'family' && s.role && <Badge def={['b-primary', 'key-outline', SPACE_ROLE[s.role] ?? s.role]} />}
                </li>
              ))}
              {!spaces.length && <li><span className="caption subtle">Aucun espace pour l’instant (première connexion pas encore faite).</span></li>}
            </ul>
          </section>
        </div>
        <section className="card">
          <div className="card-head" style={{ paddingBottom: 14 }}><h2 className="h-sec">Historique des actions</h2>{can('audit.view') && <button className="btn tertiary sm" onClick={() => nav(`/journal?cible=${u.uid}`)}>Journal <Icon name="chevron-forward" /></button>}</div>
          {history ? (
            <ul className="list">
              {history.map((h) => (
                <li key={h.seq}><span className="dot-ico"><Icon name={h.result === 'ok' ? 'checkmark-circle-outline' : 'close-circle-outline'} /></span>
                  <div className="grow"><b>{actionLabel(h.action, h.result)}</b><span className="caption subtle">{h.actorEmail ?? '—'} ({roleName(h.actorRole)}) · {fmtDateTime(h.atMs)}{h.reasonCode ? ` · motif : ${reasonLabel(h.reasonCode)}` : ''}</span></div></li>
              ))}
              {!history.length && <li><span className="caption subtle">Aucune action pour l’instant.</span></li>}
            </ul>
          ) : <p className="card-pad caption subtle" style={{ margin: 0 }}>Visible avec la permission « Voir le journal ».</p>}
        </section>
      </div>
      {can('users.delete') && !isStaff && (
        <section className="danger-zone" aria-label="Action irréversible">
          <div><h2><Icon name="warning" />Action irréversible</h2><p className="small muted" style={{ margin: 0 }}>Supprime le compte, l’espace personnel, les familles dont la personne est la seule administratrice, les invitations et l’usage. Les autres familles la perdent comme membre.</p></div>
          <button className="btn danger" onClick={() => setDlg('delete')}><Icon name="trash-outline" />Supprimer définitivement</button>
        </section>
      )}
      {dlg === 'edit' && <EditUserDialog user={u} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'plan' && <PlanDialog user={u} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'suspend' && <SuspendDialog user={u} familyNames={families.map((f) => f.name)} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'delete' && <DeleteUserDialog user={u} onClose={() => setDlg(null)} />}
      {dlg === 'reason' && <ReasonDialog user={u} onClose={() => setDlg(null)} />}
    </>
  );
}
