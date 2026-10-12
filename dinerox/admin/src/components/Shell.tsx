/**
 * Gabarit du portail : barre latérale (fond nuit de la marque) + titre de page.
 * Seules les entrées autorisées s'affichent ; un groupe vide disparaît.
 * Ordinateur : barre complète ; tablette : icônes + bulle ; téléphone : tiroir (☰).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { brand, LOGO } from '../brand';
import { useSession } from '../session';
import type { Permission } from '../api';
import type { ThemePref } from '../theme';
import { initials, remaining } from '../format';
import { SecurityDialog } from './SecurityDialog';

export const NAV: { title: string; items: { to: string; icon: string; label: string; perm: Permission }[] }[] = [
  { title: 'Pilotage', items: [
    { to: '/tableau-de-bord', icon: 'grid-outline', label: 'Tableau de bord', perm: 'stats.view' },
    { to: '/statistiques', icon: 'bar-chart-outline', label: 'Statistiques', perm: 'stats.view' },
  ] },
  { title: 'Gestion', items: [
    { to: '/utilisateurs', icon: 'people-outline', label: 'Utilisateurs', perm: 'users.view' },
    { to: '/donnees', icon: 'receipt-outline', label: 'Données', perm: 'data.view' },
  ] },
  { title: 'Contrôle', items: [
    { to: '/journal', icon: 'document-text-outline', label: 'Journal d’audit', perm: 'audit.view' },
    { to: '/equipe', icon: 'shield-checkmark-outline', label: 'Équipe et rôles', perm: 'staff.manage' },
  ] },
];

/** Première page autorisée (ex. Support → Utilisateurs). */
export function homePath(can: (p: Permission) => boolean): string {
  return NAV.flatMap((g) => g.items).find((i) => can(i.perm))?.to ?? '/acces-refuse';
}

interface Props {
  title: string;
  theme: ThemePref;
  setTheme: (p: ThemePref) => void;
  children: ReactNode;
}

export function Shell({ title, theme, setTheme, children }: Props) {
  const { me, can, logout } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [security, setSecurity] = useState(false);
  const [, tick] = useState(0);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const side = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Le tiroir (téléphone) se referme après un choix ; Échap le referme aussi.
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);
  useEffect(() => {
    document.querySelector('.frame')?.classList.toggle('nav-open', open);
    if (open) side.current?.querySelector<HTMLElement>('a, button, input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = `${title} — ${brand.name} Back-office`;
  }, [title]);

  const [first, ...rest] = (me?.displayName ?? '').split(' ');
  return (
    <div className="app">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Aller au contenu
      </a>
      <nav className="side" id="side" aria-label="Navigation principale" ref={side}>
        <div className="brandrow">
          <img src={LOGO} alt={`Logo ${brand.name}`} />
          <div className="txt">
            <div className="nm">{brand.name}</div>
            <div className="sub">Back-office</div>
          </div>
          <button className="btn icon-only side-close" style={{ background: 'transparent', color: 'var(--onNight)' }} onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <Icon name="close" />
          </button>
        </div>
        {can('users.view') && (
          <form
            className="ssearch"
            role="search"
            data-tip="Rechercher un utilisateur"
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
              if (q) nav(`/utilisateurs?q=${encodeURIComponent(q)}`);
            }}
          >
            <Icon name="search-outline" />
            <label className="sr" htmlFor="ss">Rechercher un utilisateur par e-mail ou identifiant exact</label>
            <input id="ss" name="q" type="search" placeholder="E-mail ou identifiant exact" autoComplete="off" />
          </form>
        )}
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div className="navgroup" role="group" aria-label={g.title} key={g.title}>
              <div className="navsec" aria-hidden="true">{g.title}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className="navlink" data-tip={i.label} aria-label={i.label}>
                  <Icon name={i.icon} />
                  <span className="lbl">{i.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="side-bottom">
          <div className="profile-mini">
            <span className="avatar" aria-hidden="true">{initials(first ?? '', rest.join(' '), me?.email)}</span>
            <div className="txt">
              <div className="who">{me?.displayName}</div>
              <div className="rl"><Icon name="shield-checkmark" />{me?.roleName}</div>
            </div>
            <span className="sr">Connecté : {me?.displayName}, {me?.roleName}</span>
          </div>
          <button className="navlink" data-tip="Réglages" aria-label="Réglages" aria-expanded={settings} aria-controls="settings" onClick={() => setSettings((s) => !s)}>
            <Icon name="settings-outline" />
            <span className="lbl">Réglages</span>
            <Icon name="chevron-down" className="chev-rot" />
          </button>
          <div className="settings" id="settings" hidden={!settings}>
            <div className="t" id="th">Thème</div>
            <div className="themeseg" role="radiogroup" aria-labelledby="th">
              {([['light', 'sunny-outline', 'Clair'], ['dark', 'moon-outline', 'Sombre'], ['auto', 'contrast-outline', 'Auto']] as const).map(([v, i, l]) => (
                <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}>
                  <Icon name={i} />
                  {l}
                </button>
              ))}
            </div>
            {me && (
              <div className="session">
                <Icon name="lock-closed" />
                <span>Session vérifiée par code · expire dans {remaining(me.sessionExpiresAt)}</span>
              </div>
            )}
            <button className="btn tertiary sm" style={{ color: 'var(--brandGreen)', justifyContent: 'flex-start', padding: '0 4px' }} onClick={() => setSecurity(true)}>
              <Icon name="key-outline" />
              Mot de passe et codes de secours
            </button>
          </div>
          <button className="navlink danger" data-tip="Se déconnecter" aria-label="Se déconnecter" onClick={() => void logout()}>
            <Icon name="log-out-outline" />
            <span className="lbl">Se déconnecter</span>
          </button>
        </div>
      </nav>
      <div className="nav-scrim" onClick={() => setOpen(false)} />
      <main className="main" id="main" tabIndex={-1} ref={mainRef}>
        <div className="content">
          <div className="content-inner">
            <header className="pagetitle">
              <button ref={menuBtn} className="btn outline icon-only menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-controls="side" aria-expanded={open}>
                <Icon name="menu-outline" />
              </button>
              <h1>{title}</h1>
            </header>
            {children}
          </div>
        </div>
      </main>
      {security && <SecurityDialog onClose={() => setSecurity(false)} />}
    </div>
  );
}

export function Denied({ perm }: { perm: Permission }) {
  const { me, can } = useSession();
  const nav = useNavigate();
  return (
    <div className="card">
      <div className="state">
        <span className="pill" style={{ background: 'var(--warningBg)', color: 'var(--warning)' }}>
          <Icon name="lock-closed-outline" />
        </span>
        <h3>Vous n’avez pas accès à cette page</h3>
        <p className="small">
          Votre rôle ({me?.roleName}) n’a pas la permission <span className="mono">{perm}</span>. Le serveur refuserait aussi ces données, et enregistrerait le refus au journal.
        </p>
        <button className="btn secondary sm" onClick={() => nav(homePath(can))}>
          <Icon name="home-outline" />
          Revenir à ma page d’accueil
        </button>
      </div>
    </div>
  );
}
