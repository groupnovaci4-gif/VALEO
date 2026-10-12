/**
 * Portail : routes. Une page n'apparaît que si le rôle a la permission ; ouverte à
 * la main sans droit, elle affiche « Vous n'avez pas accès » (le serveur refuse aussi).
 */
import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session';
import { useTheme } from './theme';
import type { Permission } from './api';
import { Denied, homePath, Shell } from './components/Shell';
import { ToastProvider } from './components/ui';
import Login from './pages/Login';
import Invitation from './pages/Invitation';
import Action from './pages/Action';
import Dashboard from './pages/Dashboard';
import Stats from './pages/Stats';
import Users from './pages/Users';
import UserPage from './pages/User';
import Data from './pages/Data';
import Ops from './pages/Ops';
import Audit from './pages/Audit';
import Team from './pages/Team';

function Frame({ theme, children }: { theme: 'light' | 'dark'; children: ReactNode }) {
  return (
    <div className={`frame t-${theme}`}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

export default function App() {
  const { status, can } = useSession();
  const { pref, theme, setPref } = useTheme();
  const loc = useLocation();
  const [title, setTitle] = useState('');

  // Pages publiques (sans session) : invitation et page d'action des e-mails Firebase.
  if (loc.pathname === '/invitation') return <Frame theme={theme}><Invitation /></Frame>;
  if (loc.pathname === '/action') return <Frame theme={theme}><Action /></Frame>;
  if (status === 'loading') return <Frame theme={theme}><div className="center-page" role="status"><span className="caption subtle">Chargement…</span></div></Frame>;
  if (status === 'signedOut') return <Frame theme={theme}><Routes><Route path="*" element={<Login />} /></Routes></Frame>;

  const page = (t: string, perm: Permission, el: ReactNode, dynamicTitle = false) => (
    <Shell title={dynamicTitle ? title || t : t} theme={pref} setTheme={setPref}>
      {can(perm) ? el : <Denied perm={perm} />}
    </Shell>
  );
  return (
    <Frame theme={theme}>
      <Routes>
        <Route path="/tableau-de-bord" element={page('Tableau de bord', 'stats.view', <Dashboard />)} />
        <Route path="/statistiques" element={page('Statistiques', 'stats.view', <Stats />)} />
        <Route path="/utilisateurs" element={page('Utilisateurs', 'users.view', <Users />)} />
        <Route path="/utilisateurs/:uid" element={page('Fiche', 'users.view', <UserPage setTitle={setTitle} />, true)} />
        <Route path="/donnees" element={page('Données', 'data.view', <Data />)} />
        <Route path="/donnees/:uid" element={page('Opérations', 'data.view', <Ops setTitle={setTitle} />, true)} />
        <Route path="/journal" element={page('Journal d’audit', 'audit.view', <Audit />)} />
        <Route path="/equipe" element={page('Équipe et rôles', 'staff.manage', <Team />)} />
        <Route path="*" element={<Navigate to={homePath(can)} replace />} />
      </Routes>
    </Frame>
  );
}
