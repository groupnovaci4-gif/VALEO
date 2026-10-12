/** E10 — Journal d'audit (audit.view) : ajout seul, chaîné, sans montant. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { call, type AuditEntry } from '../api';
import { Icon } from '../icons';
import { fmtDateTime } from '../format';
import { errorText } from '../messages';
import { Badge, Dialog, Empty, ErrorState, Loading, RESULT_BADGE } from '../components/ui';
import { ACTION_OPTIONS, actionLabel, effectsText, reasonLabel, roleName } from './auditLabels';

const detailText = (d: Record<string, unknown> | null) => (d ? Object.entries(d).map(([k, v]) => `${k} : ${v === null ? '—' : String(v)}`).join('\n') : '—');

export default function Audit() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const result = params.get('resultat') ?? '';
  const target = params.get('cible') ?? '';
  const [input, setInput] = useState(target);
  const [pages, setPages] = useState<(number | null)[]>([null]);
  const [data, setData] = useState<{ entries: AuditEntry[]; next: number | null; chainOk: boolean | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => setPages([null]), [action, result, target]);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    (async () => {
      // Cible : identifiant exact, ou e-mail exact résolu par une recherche exacte.
      let targetUid = target || undefined;
      if (target.includes('@')) targetUid = (await call<{ users: { uid: string }[] }>('boSearchUsers', { q: target })).users[0]?.uid ?? '__aucun__';
      return call<{ entries: AuditEntry[]; next: number | null; chainOk: boolean | null }>('boListAudit', { action: action || undefined, result: result || undefined, targetUid, cursor: pages[pages.length - 1] });
    })().then((r) => alive && setData(r), (e) => alive && setError(e));
    return () => { alive = false; };
  }, [action, result, target, pages, n]);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  return (
    <>
      <div className="rowbetween">
        <p className="small muted" style={{ margin: 0 }}>Ajout seul : aucune ligne ne peut être modifiée ni supprimée. Aucun montant n’y figure.</p>
        {data?.chainOk === true && <Badge def={['b-success', 'link-outline', 'Chaîne d’empreintes vérifiée sur cette page']} />}
        {data?.chainOk === false && <Badge def={['b-danger', 'warning', 'Chaîne d’empreintes rompue : alerter un Super Admin']} />}
      </div>
      <div className="card">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); set('cible', input.trim()); }}>
          <div className="field"><label htmlFor="au-t">Action</label><select id="au-t" className="select" value={action} onChange={(e) => set('action', e.target.value)}><option value="">Toutes</option>{ACTION_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="au-r">Résultat</label><select id="au-r" className="select" value={result} onChange={(e) => set('resultat', e.target.value)}><option value="">Tous</option><option value="ok">Réussi</option><option value="denied">Refusé</option><option value="error">Erreur</option></select></div>
          <div className="field search-field"><label htmlFor="au-q">Cible (e-mail ou identifiant exact)</label><Icon name="search-outline" /><input id="au-q" className="input" type="search" value={input} onChange={(e) => setInput(e.target.value)} /></div>
        </form>
        {error ? <ErrorState text={errorText(error)} onRetry={() => setN((x) => x + 1)} /> : !data ? <Loading /> : !data.entries.length ? <Empty icon="document-text-outline" title="Aucune ligne" text="Aucune action ne correspond à ces filtres." /> : (
          <>
            <div className="tablewrap"><table className="stack">
              <caption className="sr">Journal des actions, de la plus récente à la plus ancienne</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Auteur</th><th scope="col">Action</th><th scope="col">Cible</th><th scope="col">Motif interne</th><th scope="col">Résultat</th><th scope="col"><span className="sr">Détail</span></th></tr></thead>
              <tbody>{data.entries.map((a) => (
                <tr key={a.seq}>
                  <td data-label="Date" className="tnum">{fmtDateTime(a.atMs)}</td>
                  <td data-label="Auteur"><b style={{ fontWeight: 600 }}>{a.actorEmail ?? 'Personne non identifiée'}</b><div className="caption subtle">{roleName(a.actorRole)}</div></td>
                  <td data-label="Action">{actionLabel(a.action, a.result)}<div className="mono">{a.action}{a.code ? ` · ${a.code}` : ''}</div></td>
                  <td data-label="Cible">{a.targetDisplay ?? '—'}</td>
                  <td data-label="Motif interne" className="muted">{reasonLabel(a.reasonCode, a.reasonNote)}</td>
                  <td data-label="Résultat"><Badge def={RESULT_BADGE[a.result]} /></td>
                  <td className="nolabel" style={{ textAlign: 'right' }}><button className="btn tertiary sm" onClick={() => setDetail(a)} aria-label={`Voir le détail de la ligne du ${fmtDateTime(a.atMs)}`}>Détail<Icon name="chevron-forward" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="pager"><span className="small muted tnum">Page {pages.length} · 25 lignes par page</span><div className="actions">
              <button className="btn outline sm" disabled={pages.length < 2} onClick={() => setPages((p) => p.slice(0, -1))}><Icon name="chevron-back" />Précédent</button>
              <button className="btn outline sm" disabled={data.next === null} onClick={() => setPages((p) => [...p, data.next])}>Suivant<Icon name="chevron-forward" /></button>
            </div></div>
          </>
        )}
      </div>
      {detail && (
        <Dialog title={actionLabel(detail.action, detail.result)} intro={`${fmtDateTime(detail.atMs)} · ${detail.actorEmail ?? 'personne non identifiée'} (${roleName(detail.actorRole)})`} icon="document-text-outline" tone="neutral" onClose={() => setDetail(null)}
          footer={<><span /><button className="btn outline" onClick={() => setDetail(null)}>Fermer</button></>}>
          <div className="recap">
            <div className="r"><span className="muted">Action</span><span className="mono">{detail.action}</span></div>
            <div className="r"><span className="muted">Cible</span><b>{detail.targetDisplay ?? '—'}</b></div>
            <div className="r"><span className="muted">Résultat</span><Badge def={RESULT_BADGE[detail.result]} /></div>
            {detail.code && <div className="r"><span className="muted">Code</span><span className="mono">{detail.code}</span></div>}
            <div className="r"><span className="muted">Motif interne</span><span>{reasonLabel(detail.reasonCode, detail.reasonNote)}</span></div>
            {detail.effects && <div className="r"><span className="muted">Effets</span><span>{effectsText(detail.effects)}</span></div>}
          </div>
          <div className="diff">
            <div><div className="caption subtle" style={{ marginBottom: 6 }}>Avant</div><pre>{detailText(detail.before)}</pre></div>
            <div><div className="caption subtle" style={{ marginBottom: 6 }}>Après</div><pre>{detailText(detail.after)}</pre></div>
          </div>
          <p className="caption subtle" style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="link-outline" />Ligne n° {detail.seq} · empreinte {detail.hash.slice(0, 4)}…{detail.hash.slice(-4)} · précédente {detail.prevHash.slice(0, 4)}…{detail.prevHash.slice(-4)} · aucun montant enregistré</p>
        </Dialog>
      )}
    </>
  );
}
