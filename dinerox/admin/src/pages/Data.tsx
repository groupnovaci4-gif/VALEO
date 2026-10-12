/** E6a — Données (data.view) : recherche exacte d'un utilisateur, puis motif obligatoire. */
import { useState } from 'react';
import { call, type UserSummary } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { fmtDateTime, initials } from '../format';
import { errorText } from '../messages';
import { Empty, Msg, useLoad } from '../components/ui';
import { effectsText, reasonLabel } from './auditLabels';
import { ReasonDialog } from './dialogs/UserDialogs';

export default function Data() {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<UserSummary | null>(null);
  const mine = useLoad(() => call<{ items: { atMs: number; action: string; target: string; reasonCode: string | null; effects: Record<string, number> | null }[] }>('boMyDataAccess'), []);
  const search = async () => {
    setError(null);
    setFound(null);
    try {
      setFound((await call<{ users: UserSummary[] }>('boSearchUsers', { q: q.trim() })).users);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <>
      <Msg tone="warning" icon="shield-half-outline"><b>Accès réservé et tracé.</b> Recherchez un utilisateur par e-mail ou identifiant exact. Un motif interne vous sera demandé à chaque ouverture de ses opérations ; il est enregistré au journal et n’est jamais envoyé à l’utilisateur. Lecture seule, aucune exportation.</Msg>
      <div className="card">
        <form className="toolbar" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void search(); }}>
          <div className="field search-field"><label htmlFor="dt-q">Utilisateur (e-mail ou identifiant exact)</label><Icon name="search-outline" /><input id="dt-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className="btn secondary" disabled={!q.trim()}><Icon name="search-outline" />Rechercher</button>
        </form>
        {error && <div className="card-pad"><Msg tone="danger" icon="alert-circle">{error}</Msg></div>}
        {found && !found.length && <Empty title="Aucun utilisateur trouvé" text="La recherche est exacte : vérifiez l’e-mail ou l’identifiant complet." />}
        {found && found.length > 0 && (
          <ul className="list">
            {found.map((u) => (
              <li key={u.uid}>
                <span className="avatar" aria-hidden="true">{initials(u.firstName, u.lastName, u.email)}</span>
                <div className="grow"><b>{`${u.firstName} ${u.lastName}`.trim() || '—'}</b><span className="caption subtle">{u.email}</span></div>
                <button className="btn primary sm" onClick={() => setTarget(u)}><Icon name="receipt-outline" />Consulter les opérations</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <section className="card">
        <div className="card-head" style={{ paddingBottom: 14 }}><h2 className="h-sec">Vos dernières consultations</h2><span className="caption subtle">les vôtres uniquement</span></div>
        <ul className="list">
          {(mine.data?.items ?? []).map((m, i) => (
            <li key={i}>
              <span className="dot-ico"><Icon name={m.action === 'data.delete' ? 'trash-outline' : 'eye-outline'} /></span>
              <div className="grow"><b>{m.target}</b><span className="caption subtle">{fmtDateTime(m.atMs)}{m.action === 'data.delete' ? ` · 1 opération supprimée${effectsText(m.effects) ? ` (+ ${effectsText(m.effects)})` : ''}` : ''} · motif : {reasonLabel(m.reasonCode)}</span></div>
            </li>
          ))}
          {mine.data && !mine.data.items.length && <li><span className="caption subtle">Aucune consultation pour l’instant.</span></li>}
        </ul>
      </section>
      {!can('data.delete') && <p className="caption subtle" style={{ margin: 0 }}><Icon name="lock-closed-outline" /> Consultation seule : la suppression d’une opération est réservée au Super Admin.</p>}
      {target && <ReasonDialog user={target} onClose={() => setTarget(null)} />}
    </>
  );
}
