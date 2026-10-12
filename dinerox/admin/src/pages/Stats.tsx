/** E2b — Statistiques (stats.view) : chiffres agrégés uniquement. */
import { useState } from 'react';
import { Icon } from '../icons';
import { countryName, fmtNumber } from '../format';
import { errorText } from '../messages';
import { ErrorState, Loading, useLoad } from '../components/ui';
import { HBars } from '../components/HBars';
import { LineChart } from '../components/LineChart';
import { ENTRY_LABELS, loadStats, pointsOf } from './stats-data';

export default function Stats() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [table, setTable] = useState<null | 'signups' | 'active7'>(null);
  const stats = useLoad(() => loadStats(days), [days]);
  if (stats.error) return <div className="card"><ErrorState text={errorText(stats.error)} onRetry={stats.reload} /></div>;
  if (!stats.data) return <div className="card"><Loading /></div>;
  const { current: c, series } = stats.data;
  const signups = pointsOf(series, 'signups');
  const active = pointsOf(series, 'active7');
  const countries = Object.entries(c.byCountry ?? {}).sort((a, b) => b[1] - a[1]);
  const top = countries.slice(0, 4).map(([k, v]) => [countryName(k), v] as [string, number]);
  const others = countries.slice(4).reduce((a, [, v]) => a + v, 0);
  const tableView = (key: 'signups' | 'active7', pts: { day: string; value: number }[]) => (
    <div className="tablewrap"><table><caption className="sr">{key === 'signups' ? 'Inscriptions par jour' : 'Actifs sur 7 jours'}</caption>
      <thead><tr><th scope="col">Jour</th><th scope="col" className="num">Valeur</th></tr></thead>
      <tbody>{pts.map((p) => <tr key={p.day}><td className="tnum">{p.day.split('-').reverse().join('/')}</td><td className="num">{fmtNumber(p.value)}</td></tr>)}</tbody>
    </table></div>
  );
  return (
    <>
      <div className="card"><div className="toolbar">
        <div className="field"><label htmlFor="st-p">Période</label>
          <select id="st-p" className="select" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}>
            <option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={90}>90 derniers jours</option>
          </select></div>
        <div className="grow" /><p className="caption subtle" style={{ margin: 0, alignSelf: 'center' }}><Icon name="lock-closed-outline" /> Chiffres agrégés uniquement · aucune donnée individuelle</p>
      </div></div>
      <section className="two">
        <div className="card"><div className="card-head"><div><h2 className="h-sec">Inscriptions par jour</h2><p className="caption subtle" style={{ margin: '2px 0 0' }}>total {fmtNumber(signups.reduce((a, p) => a + p.value, 0))}</p></div>
          <button className="btn tertiary sm" onClick={() => setTable(table === 'signups' ? null : 'signups')}><Icon name="list-outline" />{table === 'signups' ? 'Voir la courbe' : 'Voir en tableau'}</button></div>
          {table === 'signups' ? tableView('signups', signups) : <LineChart points={signups} unit="Inscriptions" />}</div>
        <div className="card"><div className="card-head"><div><h2 className="h-sec">Actifs sur 7 jours</h2><p className="caption subtle" style={{ margin: '2px 0 0' }}>depuis le déploiement du back-office</p></div>
          <button className="btn tertiary sm" onClick={() => setTable(table === 'active7' ? null : 'active7')}><Icon name="list-outline" />{table === 'active7' ? 'Voir la courbe' : 'Voir en tableau'}</button></div>
          {table === 'active7' ? tableView('active7', active) : <LineChart points={active} unit="Actifs sur 7 jours" />}</div>
      </section>
      <section className="two">
        <div className="card"><div className="card-head"><h2 className="h-sec">Comptes par pays</h2></div>
          <div className="hbars"><HBars rows={[...top, ...(others ? [['Autres', others] as [string, number]] : [])]} total={c.users} /></div></div>
        <div className="card"><div className="card-head"><div><h2 className="h-sec">Saisie des opérations</h2><p className="caption subtle" style={{ margin: '2px 0 0' }}>part des saisies par méthode (statistiques anonymes existantes)</p></div></div>
          <div className="hbars"><HBars rows={ENTRY_LABELS.map(([k, l]) => [l, c.entryShares?.[k] ?? 0])} total={100} percentOnly /></div></div>
      </section>
      <section className="two">
        <div className="card"><div className="card-head"><h2 className="h-sec">Formules</h2></div>
          <div className="hbars"><HBars rows={[['Gratuit', c.plans.free], ['Plus', c.plans.plus], ['Famille', c.plans.family]]} total={c.users} /></div></div>
        <div className="card"><div className="card-head"><h2 className="h-sec">Espaces familiaux</h2></div>
          <div className="card-pad" style={{ display: 'grid', gap: 8 }}><div className="kpi" style={{ padding: 0 }}><div className="val">{fmtNumber(c.families)}</div><div className="meta">familles</div></div></div></div>
      </section>
    </>
  );
}
