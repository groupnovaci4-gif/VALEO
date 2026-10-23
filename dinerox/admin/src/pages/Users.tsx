/** E3 — Utilisateurs (users.view) : recherche EXACTE ou liste paginée (25), jamais de lecture globale. */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { call, type UserSummary } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { ago, countryName, countryOptions, fmtDate, initials } from '../format';
import { errorText } from '../messages';
import { Badge, Empty, ErrorState, Loading, PLAN_BADGE, STATUS_BADGE } from '../components/ui';
import { CreateUserDialog } from './dialogs/CreateUser';

export default function Users() {
  const { can } = useSession();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const plan = params.get('formule') ?? '';
  const status = params.get('statut') ?? '';
  const country = params.get('pays') ?? '';
  const [input, setInput] = useState(q);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const [rows, setRows] = useState<UserSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [create, setCreate] = useState(false);
  const [n, setN] = useState(0);
  const cursor = pages[pages.length - 1];

  useEffect(() => setInput(q), [q]);
  useEffect(() => setPages([null]), [q, plan, status, country]);
  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    const p = q ? call<{ users: UserSummary[] }>('boSearchUsers', { q }) : call<{ users: UserSummary[]; next: string | null }>('boListUsers', { cursor, plan: plan || undefined, status: status || undefined, country: country || undefined });
    p.then(
      (r) => { if (alive) { setRows(r.users); setNext('next' in r ? (r.next as string | null) : null); } },
      (e) => alive && setError(e),
    );
    return () => { alive = false; };
  }, [q, plan, status, country, cursor, n]);

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    p.delete('q');
    setParams(p);
  };

  return (
    <div className="card">
      <form className="toolbar" role="search" onSubmit={(e) => { e.preventDefault(); const p = new URLSearchParams(); if (input.trim()) p.set('q', input.trim()); setParams(p); }}>
        <div className="field search-field">
          <label htmlFor="us-q">Rechercher (e-mail, numéro ou identifiant exact)</label>
          <Icon name="search-outline" />
          <input id="us-q" className="input" type="search" placeholder="prenom.nom@exemple.ci, 07 08 09 10 11 ou identifiant" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <div className="field"><label htmlFor="us-p">Formule</label>
          <select id="us-p" className="select" value={plan} onChange={(e) => setFilter('formule', e.target.value)}><option value="">Toutes</option><option value="free">Gratuit</option><option value="plus">Plus</option><option value="family">Famille</option></select></div>
        <div className="field"><label htmlFor="us-s">Statut</label>
          <select id="us-s" className="select" value={status} onChange={(e) => setFilter('statut', e.target.value)}><option value="">Tous</option><option value="suspended">Suspendu</option></select></div>
        <div className="field"><label htmlFor="us-c">Pays</label>
          <select id="us-c" className="select" value={country} onChange={(e) => setFilter('pays', e.target.value)}><option value="">Tous</option>{countryOptions().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div>
        {can('users.create') && <button type="button" className="btn primary" onClick={() => setCreate(true)}><Icon name="person-add-outline" />Créer un utilisateur</button>}
      </form>
      {error ? <ErrorState text={errorText(error)} onRetry={() => setN((x) => x + 1)} /> : !rows ? <Loading /> : !rows.length ? (
        <Empty title="Aucun utilisateur trouvé" text={q ? 'La recherche est exacte : vérifiez l’e-mail, le numéro ou l’identifiant complet.' : 'Aucun compte ne correspond à ces filtres.'}
          action={q || plan || status || country ? <button className="btn primary sm" onClick={() => setParams(new URLSearchParams())}><Icon name="close-outline" />Effacer la recherche</button> : undefined} />
      ) : (
        <>
          <div className="tablewrap"><table className="stack">
            <caption className="sr">Liste des utilisateurs, triée par date d’inscription, 25 par page</caption>
            <thead><tr><th scope="col">Utilisateur</th><th scope="col">Identifiant</th><th scope="col">Pays</th><th scope="col">Formule</th><th scope="col">Statut</th><th scope="col" aria-sort="descending">Inscription <Icon name="arrow-down" /></th><th scope="col">Dernière activité</th><th scope="col"><span className="sr">Ouvrir</span></th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.uid} className="clickable" tabIndex={0} aria-label={`Ouvrir la fiche de ${u.firstName} ${u.lastName}`} onClick={() => nav(`/utilisateurs/${u.uid}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/utilisateurs/${u.uid}`)}>
                <td className="nolabel"><div className="ucell"><span className="avatar" aria-hidden="true">{initials(u.firstName, u.lastName, u.email)}</span><div><b>{`${u.firstName} ${u.lastName}`.trim() || '—'}</b><span>{u.email ?? u.phone}</span></div></div></td>
                <td data-label="Identifiant"><span className="mono">{u.uid}</span></td>
                <td data-label="Pays">{countryName(u.country)}</td>
                <td data-label="Formule"><Badge def={PLAN_BADGE[u.plan] ?? PLAN_BADGE.free} /></td>
                <td data-label="Statut"><Badge def={STATUS_BADGE[u.status]} /></td>
                <td data-label="Inscription" className="tnum">{fmtDate(u.createdAt)}</td>
                <td data-label="Dernière activité" className="muted">{ago(u.lastActiveAt)}</td>
                <td className="nolabel chev" style={{ textAlign: 'right', color: 'var(--textSubtle)' }}><Icon name="chevron-forward" /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="pager">
            <span className="small muted tnum">{q ? 'Résultat de la recherche exacte' : `Page ${pages.length} · 25 par page`}</span>
            <div className="actions">
              <button className="btn outline sm" disabled={pages.length < 2} onClick={() => setPages((p) => p.slice(0, -1))}><Icon name="chevron-back" />Précédent</button>
              <button className="btn outline sm" disabled={!next} onClick={() => setPages((p) => [...p, next])}>Suivant<Icon name="chevron-forward" /></button>
            </div>
          </div>
        </>
      )}
      {create && <CreateUserDialog onClose={() => setCreate(false)} />}
    </div>
  );
}
