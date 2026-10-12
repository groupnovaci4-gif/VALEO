/** E2 — Tableau de bord (stats.view). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, type AuditEntry } from '../api';
import { useSession } from '../session';
import { Icon } from '../icons';
import { ago, countryName, fmtDateTime, fmtNumber, fmtPercent } from '../format';
import { errorText } from '../messages';
import { Badge, ErrorState, Loading, RESULT_BADGE, useLoad } from '../components/ui';
import { HBars } from '../components/HBars';
import { LineChart } from '../components/LineChart';
import { actionLabel } from './auditLabels';
import { loadStats, pointsOf } from './stats-data';
import { CreateUserDialog } from './dialogs/CreateUser';

export default function Dashboard() {
  const { can } = useSession();
  const nav = useNavigate();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [create, setCreate] = useState(false);
  const stats = useLoad(() => loadStats(days), [days]);
  const audit = useLoad(() => (can('audit.view') ? call<{ entries: AuditEntry[] }>('boListAudit', {}) : Promise.resolve({ entries: [] })), []);
  if (stats.error) return <div className="card"><ErrorState text={errorText(stats.error)} onRetry={stats.reload} /></div>;
  if (!stats.data) return <div className="card"><Loading /></div>;
  const { current: c, series } = stats.data;
  const paid = c.plans.plus + c.plans.family;
  const signups = pointsOf(series, 'signups');
  const totalSignups = signups.reduce((a, p) => a + p.value, 0);
  const countries = Object.entries(c.byCountry ?? {}).sort((a, b) => b[1] - a[1]);
  const top = countries.slice(0, 3).map(([k, v]) => [countryName(k), v] as [string, number]);
  const others = countries.slice(3).reduce((a, [, v]) => a + v, 0);
  return (
    <>
      <p className="caption subtle" style={{ margin: '-12px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon name="time-outline" />Chiffres mis à jour {ago(c.generatedAt)}
      </p>
      <section className="kpis" aria-label="Chiffres clés">
        <div className="card kpi hero">
          <div className="lbl"><span className="ico"><Icon name="people" /></span>Utilisateurs</div>
          <div className="val">{fmtNumber(c.users)}</div>
          <div className="meta">dont {fmtNumber(c.signups)} inscrits aujourd’hui</div>
        </div>
        <div className="card kpi">
          <div className="lbl"><span className="ico"><Icon name="pulse" /></span>Actifs sur 7 jours</div>
          <div className="val">{fmtNumber(c.active7)}</div>
          <div className="meta">soit {fmtPercent(c.active7, c.users)} des comptes</div>
        </div>
        <div className="card kpi">
          <div className="lbl"><span className="ico"><Icon name="layers" /></span>Formules payantes</div>
          <div className="val">{fmtNumber(paid)}</div>
          <div className="planbar" role="img" aria-label={`Gratuit ${fmtPercent(c.plans.free, c.users)}, Plus ${fmtPercent(c.plans.plus, c.users)}, Famille ${fmtPercent(c.plans.family, c.users)}`}>
            <span style={{ width: `${c.users ? (c.plans.free / c.users) * 100 : 100}%`, background: 'var(--track)' }} />
            <span style={{ width: `${c.users ? (c.plans.plus / c.users) * 100 : 0}%`, background: 'var(--primary)' }} />
            <span style={{ width: `${c.users ? (c.plans.family / c.users) * 100 : 0}%`, background: 'var(--accent)' }} />
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--primary)' }} />Plus {fmtNumber(c.plans.plus)}</span>
            <span><i style={{ background: 'var(--accent)' }} />Famille {fmtNumber(c.plans.family)}</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="lbl"><span className="ico" style={{ background: 'var(--dangerBg)', color: 'var(--danger)' }}><Icon name="ban" /></span>Comptes suspendus</div>
          <div className="val">{fmtNumber(c.suspended)}</div>
          <div className="meta"><Icon name="time-outline" />à cette heure</div>
        </div>
      </section>
      <section className="charts">
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="h-sec">Inscriptions par jour</h2>
              <p className="caption subtle" style={{ margin: '2px 0 0' }}>{days} derniers jours · total {fmtNumber(totalSignups)}</p>
            </div>
            <div className="seg" role="group" aria-label="Période">
              {([7, 30, 90] as const).map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} j</button>)}
            </div>
          </div>
          <LineChart points={signups} unit="Inscriptions" />
        </div>
        <div className="card">
          <div className="card-head"><h2 className="h-sec">Répartition des formules</h2></div>
          <div className="hbars">
            <HBars rows={[['Gratuit', c.plans.free], ['Plus', c.plans.plus], ['Famille', c.plans.family]]} total={c.users} />
          </div>
        </div>
      </section>
      <section className="two">
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="h-sec">Actifs sur 7 jours</h2>
              <p className="caption subtle" style={{ margin: '2px 0 0' }}>Données disponibles depuis le déploiement du back-office</p>
            </div>
          </div>
          <LineChart points={pointsOf(series, 'active7')} unit="Actifs sur 7 jours" />
        </div>
        {can('audit.view') ? (
          <div className="card">
            <div className="card-head">
              <h2 className="h-sec">Dernières actions</h2>
              <button className="btn tertiary sm" onClick={() => nav('/journal')}>Tout le journal <Icon name="chevron-forward" /></button>
            </div>
            <ul className="list" style={{ marginTop: 8 }}>
              {(audit.data?.entries ?? []).slice(0, 4).map((a) => (
                <li key={a.seq}>
                  <span className="dot-ico"><Icon name={a.result === 'ok' ? 'checkmark-circle-outline' : 'close-circle-outline'} /></span>
                  <div className="grow"><b>{actionLabel(a.action, a.result)}</b><span className="caption subtle">{a.actorEmail ?? '—'} · {fmtDateTime(a.atMs)}</span></div>
                  <Badge def={RESULT_BADGE[a.result]} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2 className="h-sec">Comptes par pays</h2></div>
            <div className="hbars"><HBars rows={[...top, ...(others ? [['Autres', others] as [string, number]] : [])]} total={c.users} /></div>
          </div>
        )}
      </section>
      {(can('users.view') || can('users.create') || can('audit.view')) && (
        <section aria-label="Accès rapides">
          <h2 className="h-sec" style={{ marginBottom: 12 }}>Accès rapides</h2>
          <div className="quick">
            {can('users.view') && <button className="qa" onClick={() => nav('/utilisateurs')}><Icon name="search-outline" />Rechercher un utilisateur<Icon name="chevron-forward" className="chev" /></button>}
            {can('users.create') && <button className="qa" onClick={() => setCreate(true)}><Icon name="person-add-outline" />Créer un utilisateur<Icon name="chevron-forward" className="chev" /></button>}
            {can('users.view') && <button className="qa" onClick={() => nav('/utilisateurs?statut=suspended')}><Icon name="ban-outline" />Comptes suspendus<Icon name="chevron-forward" className="chev" /></button>}
            {can('audit.view') && <button className="qa" onClick={() => nav('/journal')}><Icon name="document-text-outline" />Journal d’audit<Icon name="chevron-forward" className="chev" /></button>}
          </div>
        </section>
      )}
      {create && <CreateUserDialog onClose={() => setCreate(false)} />}
    </>
  );
}
