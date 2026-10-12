/** Fenêtres de la fiche utilisateur : modifier, formule, suspension, suppression, motif de consultation. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, type UserSummary } from '../../api';
import { errorText } from '../../messages';
import { countryOptions } from '../../format';
import { Icon } from '../../icons';
import { useSession, type DataAccess } from '../../session';
import { Dialog, Msg, useToast } from '../../components/ui';
import { ReasonFields, reasonOk, type Reason } from '../../components/ReasonFields';

const fullName = (u: UserSummary) => `${u.firstName} ${u.lastName}`.trim() || u.email || '—';

function useAction(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function EditUserDialog({ user, onClose, onDone }: { user: UserSummary; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email ?? '', country: user.country ?? 'CI', currency: user.currency ?? 'XOF', language: user.language ?? 'fr' });
  const a = useAction(() => { toast('Modifications enregistrées. Action enregistrée au journal.'); onDone(); });
  const changes = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== ((user as unknown as Record<string, unknown>)[k] ?? '')));
  return (
    <Dialog title={`Modifier ${fullName(user)}`} intro="Prénom, nom, pays, devise, langue et adresse e-mail. Aucune donnée financière n’est modifiable ici." icon="create-outline" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn primary" disabled={a.busy || !Object.keys(changes).length} onClick={() => void a.run(() => call('boUpdateUser', { uid: user.uid, changes }))}><Icon name="save-outline" />Enregistrer</button></>}>
      <div className="two" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="ef">Prénom</label><input id="ef" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
        <div className="field"><label htmlFor="el">Nom</label><input id="el" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="ee">E-mail</label><input id="ee" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><span className="help">Un changement d’adresse demandera à la personne de la confirmer.</span></div>
      <div className="two" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="ec">Pays</label><select id="ec" className="select" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{countryOptions().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="eg">Langue</label><select id="eg" className="select" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="fr">Français</option><option value="en">English</option></select></div>
      </div>
      <div className="field"><label htmlFor="ed">Devise du profil</label><input id="ed" className="input" value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /><span className="help">Aucune conversion : les montants déjà saisis gardent leur devise.</span></div>
      {a.error && <Msg tone="danger" icon="alert-circle">{a.error}</Msg>}
    </Dialog>
  );
}

const toDateInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function PlanDialog({ user, onClose, onDone }: { user: UserSummary; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState(user.plan);
  const [end, setEnd] = useState(toDateInput(Date.now() + 30 * 86400_000));
  const [reason, setReason] = useState<Reason>({ code: '', note: '' });
  const a = useAction(() => { toast('Formule changée. Action enregistrée au journal.'); onDone(); });
  const endsAt = Date.parse(`${end}T23:59:59`);
  return (
    <Dialog title="Changer de formule" intro={`Formule attribuée à la main à ${fullName(user)} (Super Admin seulement). Elle change les quotas du compte ; rien n’est facturé.`} icon="star-outline" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn primary" disabled={a.busy || !reasonOk(reason) || (plan !== 'free' && !end)} onClick={() => void a.run(() => call('boSetPlan', { uid: user.uid, plan, endsAt: plan === 'free' ? null : endsAt, reasonCode: reason.code, reasonNote: reason.note }))}><Icon name="save-outline" />Enregistrer</button></>}>
      <div className="field"><label htmlFor="pp">Formule</label><select id="pp" className="select" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="free">Gratuit</option><option value="plus">Plus</option><option value="family">Famille</option></select></div>
      {plan !== 'free' && <div className="field"><label htmlFor="pe">Date de fin (obligatoire)</label><input id="pe" className="input" type="date" value={end} min={toDateInput(Date.now() + 86400_000)} max={toDateInput(Date.now() + 365 * 86400_000)} onChange={(e) => setEnd(e.target.value)} /><span className="help">La formule redevient gratuite à cette date.</span></div>}
      <ReasonFields value={reason} onChange={setReason} variant="select" help="Jamais montré à l’utilisateur." />
      {a.error && <Msg tone="danger" icon="alert-circle">{a.error}</Msg>}
    </Dialog>
  );
}

export function SuspendDialog({ user, familyNames, onClose, onDone }: { user: UserSummary; familyNames: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const suspend = user.status !== 'suspended';
  const [reason, setReason] = useState<Reason>({ code: '', note: '' });
  const a = useAction(() => { toast(suspend ? 'Compte suspendu. Déconnexion de tous les appareils en cours.' : 'Compte réactivé. La personne peut se reconnecter et retrouve ses données.'); onDone(); });
  return (
    <Dialog
      title={suspend ? `Suspendre le compte de ${fullName(user)} ?` : `Réactiver le compte de ${fullName(user)} ?`}
      intro={suspend ? <>La personne sera déconnectée de tous ses appareils et ne pourra plus se connecter. <b>Aucune donnée n’est supprimée</b> ; la réactivation rétablit tout.</> : 'La personne pourra se reconnecter et retrouvera toutes ses données.'}
      icon="ban-outline" tone={suspend ? 'danger' : 'primary'} onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className={`btn ${suspend ? 'danger' : 'primary'}`} disabled={a.busy || !reasonOk(reason)} onClick={() => void a.run(() => call('boSetSuspended', { uid: user.uid, suspended: suspend, reasonCode: reason.code, reasonNote: reason.note }))}><Icon name={suspend ? 'ban-outline' : 'checkmark-circle-outline'} />{suspend ? 'Suspendre le compte' : 'Réactiver le compte'}</button></>}>
      <ReasonFields value={reason} onChange={setReason} variant="select" help="Jamais montré à l’utilisateur." />
      {suspend && familyNames.length > 0 && <Msg tone="warning" icon="people-outline">La personne reste membre de {familyNames.map((n) => `« ${n} »`).join(', ')} : les autres membres ne voient aucun changement.</Msg>}
      {a.error && <Msg tone="danger" icon="alert-circle">{a.error}</Msg>}
    </Dialog>
  );
}

export function DeleteUserDialog({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState<Reason>({ code: '', note: '' });
  const a = useAction(() => { toast('Compte supprimé définitivement. Action enregistrée au journal.'); nav('/utilisateurs'); });
  const match = !!user.email && confirm.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <Dialog title="Supprimer définitivement ce compte ?" intro={<>Cette action est <b>irréversible</b>. Les mêmes effets que « Supprimer mon compte » dans l’app s’appliquent.</>} icon="warning" tone="danger" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn danger" disabled={a.busy || !match || !reasonOk(reason)} onClick={() => void a.run(() => call('boDeleteUser', { uid: user.uid, confirmEmail: confirm.trim(), reasonCode: reason.code, reasonNote: reason.note }))}><Icon name="trash-outline" />Supprimer définitivement</button></>}>
      <ul className="effects">
        <li><Icon name="remove-circle-outline" />Espace personnel, profil, usage et invitations supprimés</li>
        <li><Icon name="remove-circle-outline" />Familles dont la personne est la seule administratrice : supprimées pour tous leurs membres</li>
        <li><Icon name="remove-circle-outline" />Compte de connexion supprimé</li>
      </ul>
      <ReasonFields value={reason} onChange={setReason} variant="select" />
      <div className="field"><label htmlFor="de">Pour confirmer, retapez l’e-mail : <b>{user.email}</b></label><input id="de" className="input" type="email" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      {a.error && <Msg tone="danger" icon="alert-circle">{a.error}</Msg>}
    </Dialog>
  );
}

/** Motif de consultation (data.view) : ouvre un accès de 30 min, journalisé. */
export function ReasonDialog({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const { setAccess } = useSession();
  const nav = useNavigate();
  const [reason, setReason] = useState<Reason>({ code: 'client_request', note: '' });
  const a = useAction(() => undefined);
  const open = () =>
    a.run(async () => {
      const r = await call<Omit<DataAccess, 'reasonCode' | 'reasonNote'>>('boOpenData', { uid: user.uid, reasonCode: reason.code, reasonNote: reason.note });
      // Espace personnel d'abord, puis les familles.
      const spaces = [...r.spaces].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'personal' ? -1 : 1));
      setAccess(user.uid, { ...r, spaces, reasonCode: reason.code, reasonNote: reason.note || null });
      nav(`/donnees/${user.uid}`, { state: { user } });
    });
  return (
    <Dialog title="Motif de consultation" intro={<>Vous allez consulter les opérations financières de {fullName(user)}. Ce motif est <b>interne</b> : il est enregistré au journal et n’est jamais envoyé à l’utilisateur.</>} icon="eye-outline" tone="warning" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn primary" disabled={a.busy || !reasonOk(reason)} onClick={() => void open()}><Icon name="eye-outline" />Consulter</button></>}>
      <ReasonFields value={reason} onChange={setReason} legend="Motif" />
      <Msg tone="info" icon="information-circle">Lecture seule, 25 opérations par page, aucune exportation. L’accès dure 30 minutes.</Msg>
      {a.error && <Msg tone="danger" icon="alert-circle">{a.error}</Msg>}
    </Dialog>
  );
}
