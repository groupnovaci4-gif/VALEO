/** E6 / E7 — Opérations d'un utilisateur (data.view) ; suppression (data.delete, Super Admin). */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import catalog from '@app/core/categoryCatalog.v2.json';
import { fr } from '@app/i18n/fr';
import { call, type UserSummary } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { fmtIsoDate, formatMoney, remaining } from '../format';
import { errorText } from '../messages';
import { Dialog, Empty, ErrorState, Loading, Msg, useToast } from '../components/ui';
import { ReasonFields, reasonOk, type Reason } from '../components/ReasonFields';
import { reasonLabel } from './auditLabels';
import { ReasonDialog } from './dialogs/UserDialogs';

interface Tx {
  id: string; date: string; type: string; direction: string | null; amount: number; currency: string;
  categoryId: string | null; subcategoryId: string | null; categoryName: string | null; subcategoryName: string | null;
  accountName: string | null; toAccountName: string | null; createdByName: string | null; linked: number;
}
const LABELS = new Map((catalog as { entries: { id: string; label: { fr: string } }[] }).entries.map((e) => [e.id, e.label.fr]));
/** Nom d'une catégorie sans document : catalogue, puis textes de l'app (cat.x / inc.x). */
const fallbackLabel = (id: string) => LABELS.get(id) ?? (fr as Record<string, string>)[id.replace(/^(cat|inc)_/, '$1.')] ?? null;
const TYPE: Record<string, [string, string, string, string]> = {
  income: ['ti-in', 'arrow-down', 'Revenu', 'amt-in'],
  expense: ['ti-out', 'arrow-up', 'Dépense', 'amt-out'],
  transfer: ['ti-tr', 'swap-horizontal', 'Transfert', 'amt-tr'],
  adjustment: ['ti-tr', 'options-outline', 'Ajustement', 'amt-tr'],
};
const catOf = (t: Tx) => {
  const c = t.categoryName ?? (t.categoryId ? fallbackLabel(t.categoryId) : null);
  const s = t.subcategoryName ?? (t.subcategoryId ? fallbackLabel(t.subcategoryId) : null);
  return [c, s].filter(Boolean).join(' · ') || (t.type === 'transfer' ? 'Transfert entre comptes' : '—');
};
const signedAmount = (t: Tx) => {
  if (t.type === 'income' || (t.type === 'adjustment' && t.direction === 'in')) return formatMoney(t.amount, t.currency, { signed: true });
  if (t.type === 'expense' || (t.type === 'adjustment' && t.direction === 'out')) return formatMoney(-t.amount, t.currency);
  return formatMoney(t.amount, t.currency);
};

export default function Ops({ setTitle }: { setTitle: (t: string) => void }) {
  const { uid = '' } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const { access, can, setAccess } = useSession();
  const a = access[uid];
  const [user, setUser] = useState<UserSummary | null>((loc.state as { user?: UserSummary } | null)?.user ?? null);
  const [space, setSpace] = useState(a?.spaces[0]?.id ?? '');
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [del, setDel] = useState<Tx | null>(null);
  const [reason, setReason] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (user) return;
    call<{ users: UserSummary[] }>('boSearchUsers', { q: uid }).then((r) => setUser(r.users[0] ?? null), () => undefined);
  }, [uid, user]);
  useEffect(() => {
    const name = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : null;
    setTitle(name ? `Opérations de ${name}` : 'Opérations');
  }, [user, setTitle]);
  useEffect(() => { if (a && !a.spaces.some((s) => s.id === space)) setSpace(a.spaces[0]?.id ?? ''); }, [a, space]);
  useEffect(() => setPages([null]), [space]);
  useEffect(() => {
    if (!a || !space) return;
    let alive = true;
    setRows(null);
    setError(null);
    call<{ items: Tx[]; next: string | null }>('boListTransactions', { accessId: a.accessId, spaceId: space, cursor: pages[pages.length - 1] }).then(
      (r) => { if (alive) { setRows(r.items); setNext(r.next); } },
      (e) => { if (alive) { setError(e); if ((e as { message?: string }).message === 'bo/access-expired') setAccess(uid, null); } },
    );
    return () => { alive = false; };
  }, [a, space, pages, n, uid, setAccess]);

  if (!a) {
    return (
      <div className="card">
        <Empty icon="eye-outline" title="Motif de consultation requis" text="Chaque ouverture des opérations demande un motif interne, enregistré au journal. L’accès dure 30 minutes." action={user ? <button className="btn primary sm" onClick={() => setReason(true)}><Icon name="eye-outline" />Indiquer un motif</button> : <button className="btn secondary sm" onClick={() => nav('/donnees')}>Retour</button>} />
        {reason && user && <ReasonDialog user={user} onClose={() => setReason(false)} />}
      </div>
    );
  }
  const sp = a.spaces.find((s) => s.id === space);
  return (
    <>
      <div className="audit-banner" role="status"><Icon name="eye-outline" /><span className="grow">Consultation enregistrée au journal · motif : <b>{reasonLabel(a.reasonCode, a.reasonNote)}</b> · accès valable encore {remaining(a.expiresAt)}</span><button className="btn tertiary sm" onClick={() => { setAccess(uid, null); setReason(true); }}>Changer de motif</button></div>
      <div className="card">
        <div className="toolbar">
          {a.spaces.length > 1 && (
            <div className="seg" role="group" aria-label="Espace">
              {a.spaces.map((s) => <button key={s.id} aria-pressed={s.id === space} onClick={() => setSpace(s.id)}>{s.kind === 'personal' ? 'Personnel' : s.name}</button>)}
            </div>
          )}
          <div className="grow" /><span className="caption subtle" style={{ alignSelf: 'center' }}>{can('data.delete') ? 'Lecture seule' : 'Consultation seule (suppression réservée au Super Admin)'} · 25 par page · aucune exportation</span>
        </div>
        {sp?.kind === 'family' && (
          <div className="card-pad" style={{ paddingBottom: 0 }}><Msg tone="info" icon="people-outline">Espace familial « {sp.name} » ({sp.memberCount} membres){can('data.delete') ? <> : supprimer une opération la retire <b>pour tous les membres</b></> : ''}. Notes, bénéficiaires et justificatifs sont masqués.</Msg></div>
        )}
        {sp?.kind === 'personal' && <div className="card-pad" style={{ paddingBottom: 0 }}><Msg tone="info" icon="person-outline">Espace personnel. Notes, bénéficiaires et justificatifs sont masqués.</Msg></div>}
        {error ? <ErrorState text={errorText(error)} onRetry={() => setN((x) => x + 1)} /> : !rows ? <Loading /> : !rows.length ? <Empty icon="receipt-outline" title="Aucune opération" text="Cet espace ne contient aucune opération." /> : (
          <>
            <div className="tablewrap" style={{ marginTop: 16 }}><table className="stack">
              <caption className="sr">Opérations, de la plus récente à la plus ancienne</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Catégorie</th><th scope="col">Compte</th><th scope="col">Saisie par</th><th scope="col" className="num">Montant</th>{can('data.delete') && <th scope="col"><span className="sr">Actions</span></th>}</tr></thead>
              <tbody>{rows.map((t) => { const T = TYPE[t.type] ?? TYPE.transfer; return (
                <tr key={t.id}>
                  <td data-label="Date" className="tnum">{fmtIsoDate(t.date)}</td>
                  <td data-label="Type"><span className="typecell"><span className={`typeico ${T[0]}`}><Icon name={T[1]} /></span>{T[2]}</span></td>
                  <td data-label="Catégorie">{catOf(t)}{t.linked > 0 && <div className="caption subtle"><Icon name="link-outline" /> {t.linked} écriture{t.linked > 1 ? 's' : ''} liée{t.linked > 1 ? 's' : ''}</div>}</td>
                  <td data-label="Compte" className="muted">{t.type === 'transfer' ? `${t.accountName ?? '—'} → ${t.toAccountName ?? '—'}` : t.accountName ?? '—'}</td>
                  <td data-label="Saisie par">{t.createdByName ?? '—'}</td>
                  <td data-label="Montant" className="num"><span className={T[3]}>{signedAmount(t)}</span></td>
                  {can('data.delete') && <td className="nolabel" style={{ textAlign: 'right' }}><button className="btn destructive sm" onClick={() => setDel(t)} aria-label={`Supprimer l’opération du ${fmtIsoDate(t.date)}, ${T[2]}, ${catOf(t)}`}><Icon name="trash-outline" />Supprimer</button></td>}
                </tr>); })}</tbody>
            </table></div>
            <div className="pager"><span className="small muted tnum">Page {pages.length} · 25 par page</span><div className="actions">
              <button className="btn outline sm" disabled={pages.length < 2} onClick={() => setPages((p) => p.slice(0, -1))}><Icon name="chevron-back" />Précédent</button>
              <button className="btn outline sm" disabled={!next} onClick={() => setPages((p) => [...p, next])}>Suivant<Icon name="chevron-forward" /></button>
            </div></div>
          </>
        )}
      </div>
      {del && sp && <DeleteOpDialog tx={del} accessId={a.accessId} space={sp} onClose={() => setDel(null)} onDone={() => { setDel(null); setN((x) => x + 1); }} />}
      {reason && user && <ReasonDialog user={user} onClose={() => setReason(false)} />}
    </>
  );
}

const EFFECT_TEXT: Record<string, (n: number) => string> = {
  linkedTransaction: (n) => `${n} opération${n > 1 ? 's' : ''} liée${n > 1 ? 's' : ''} (frais ou intérêts)`,
  debtPayment: (n) => `${n} remboursement${n > 1 ? 's' : ''} de dette`,
  goalContribution: (n) => `${n} versement${n > 1 ? 's' : ''} à un objectif ou à l’épargne`,
  reserveUse: (n) => `${n} utilisation${n > 1 ? 's' : ''} de réserve`,
  reserveTransfer: (n) => `${n} transfert${n > 1 ? 's' : ''} lié${n > 1 ? 's' : ''} à la réserve`,
  tontineEntry: (n) => `${n} écriture${n > 1 ? 's' : ''} de tontine`,
};

function DeleteOpDialog({ tx, accessId, space, onClose, onDone }: { tx: Tx; accessId: string; space: { id: string; kind: string; name: string; memberCount: number }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [effects, setEffects] = useState<Record<string, number> | null>(null);
  const [reason, setReason] = useState<Reason>({ code: '', note: '' });
  const [ok1, setOk1] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ effects: Record<string, number> }>('boPreviewDelete', { accessId, spaceId: space.id, txId: tx.id }).then((r) => setEffects(r.effects), (e) => setError(errorText(e)));
  }, [accessId, space.id, tx.id]);
  const T = TYPE[tx.type] ?? TYPE.transfer;
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await call('boDeleteTransaction', { accessId, spaceId: space.id, txId: tx.id, reasonCode: reason.code, reasonNote: reason.note, confirm: typed.trim() });
      toast('Opération supprimée sur tous les appareils. Action enregistrée au journal.');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Supprimer cette opération ?" icon="trash-outline" tone="danger" onClose={onClose}
      intro={space.kind === 'family' ? `Elle disparaîtra de tous les téléphones de l’espace « ${space.name} » (${space.memberCount} membres) et ne pourra pas revenir.` : 'Elle disparaîtra de tous les appareils de cette personne et ne pourra pas revenir.'}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn danger" disabled={busy || !effects || !ok1 || typed.trim() !== 'SUPPRIMER' || !reasonOk(reason)} onClick={() => void submit()}><Icon name="trash-outline" />Supprimer l’opération</button></>}>
      <div className="recap">
        <div className="r"><span className="muted">Date</span><b className="tnum">{fmtIsoDate(tx.date)}</b></div>
        <div className="r"><span className="muted">Type</span><b>{T[2]} · {catOf(tx)}</b></div>
        <div className="r"><span className="muted">Montant</span><b className="tnum">{formatMoney(tx.amount, tx.currency)}</b></div>
      </div>
      <div>
        <div className="flabel" style={{ marginBottom: 8 }}>Effets liés (calculés par le serveur)</div>
        {!effects ? <span className="skel" /> : Object.keys(effects).length ? (
          <ul className="effects">
            {Object.entries(effects).map(([k, v]) => <li key={k}><Icon name="link-outline" />{(EFFECT_TEXT[k] ?? ((n: number) => `${n} ${k}`))(v)} — supprimé{v > 1 ? 's' : ''} aussi</li>)}
            <li><Icon name="calculator-outline" />Soldes, budgets et « reste par jour » recalculés sur chaque téléphone</li>
          </ul>
        ) : <p className="small muted" style={{ margin: 0 }}>Aucune écriture liée.</p>}
      </div>
      <ReasonFields value={reason} onChange={setReason} variant="select" />
      <label className="check"><input type="checkbox" checked={ok1} onChange={(e) => setOk1(e.target.checked)} /><span>J’ai compris que cette suppression est définitive, qu’elle s’applique à tous les membres de l’espace et qu’elle est enregistrée au journal.</span></label>
      <div className="field"><label htmlFor="c2">Pour confirmer, tapez <b>SUPPRIMER</b></label><input id="c2" className="input" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
    </Dialog>
  );
}
