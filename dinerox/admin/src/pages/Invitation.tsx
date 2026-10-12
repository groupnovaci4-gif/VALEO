/**
 * E1c — Accepter l'invitation (sans session). Lien : /invitation?i=<id>#t=<jeton>
 * (jeton dans la partie « # » : jamais envoyé à un serveur web ni gardé par un proxy).
 * Textes validés le 12/10/2026 (docs/backoffice.md §1.3).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call } from '../api';
import { codeOf, errorText } from '../messages';
import { brand } from '../brand';
import { Icon } from '../icons';
import { fmtDate } from '../format';
import { AuthLayout, Steps } from '../components/AuthLayout';
import { parseInviteUrl } from './inviteUrl';

export { parseInviteUrl };
import { Msg } from '../components/ui';

const TRUST: [string, string][] = [
  ['mail-open-outline', 'Invitation personnelle, valable 7 jours, utilisable une seule fois.'],
  ['key-outline', 'Vous choisissez vous-même votre mot de passe.'],
  ['finger-print-outline', 'Double vérification activée juste après.'],
];
const ROLE_LABEL = (r: string) => r || 'collaborateur';

interface View {
  invitedByName: string;
  displayName: string;
  roleName: string;
  email: string;
  expiresAt: number;
}

export default function Invitation({ href = window.location.href }: { href?: string }) {
  const nav = useNavigate();
  const link = parseInviteUrl(href);
  const [view, setView] = useState<View | null>(null);
  const [fatal, setFatal] = useState<string | null>(link ? null : errorText({ message: 'invite/invalid' }));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!link) return;
    call<View>('boViewInvite', link).then(setView, (e) => setFatal(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const accept = async () => {
    setError(null);
    if (password.length < 12) return setError('Le mot de passe doit contenir au moins 12 caractères.');
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    try {
      await call('boAcceptInvite', { ...link, email: email.trim(), password });
      setDone(true);
    } catch (e) {
      const c = codeOf(e);
      if (c === 'invite/wrong-email') setError(errorText(e));
      else if (c.startsWith('invite/password')) setError(errorText(e));
      else setFatal(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout trust={TRUST}>
      <div className="login-card">
        <Steps labels={['Accepter l’invitation', 'Double vérification']} current={done ? 1 : 0} />
        {fatal ? (
          <>
            <h1>Invitation</h1>
            <Msg tone="danger" icon="link-outline">{fatal}</Msg>
          </>
        ) : done ? (
          <>
            <h1>Bienvenue dans l’équipe</h1>
            <Msg tone="success" icon="checkmark-circle">Invitation acceptée. Dernière étape : activez la double vérification pour protéger votre compte.</Msg>
            <button className="btn primary" style={{ width: '100%' }} onClick={() => nav('/connexion')}>
              Continuer
            </button>
          </>
        ) : !view ? (
          <span className="skel" style={{ height: 120 }} />
        ) : (
          <form style={{ display: 'grid', gap: 20 }} onSubmit={(e) => { e.preventDefault(); void accept(); }}>
            <div>
              <h1>Rejoindre l’équipe {brand.name}</h1>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                <b>{view.invitedByName}</b> vous invite à rejoindre l’équipe d’administration de {brand.name} avec le rôle <b>{ROLE_LABEL(view.roleName)}</b>.
              </p>
            </div>
            <Msg tone="info" icon="mail-outline">
              Invitation pour <b>{view.email}</b> · valable jusqu’au <b>{fmtDate(view.expiresAt)}</b>
            </Msg>
            <div className="field">
              <label htmlFor="iv-e">Votre adresse e-mail (celle qui a reçu l’invitation)</label>
              <input id="iv-e" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="iv-p">Choisissez un mot de passe</label>
              <input id="iv-p" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-describedby="iv-h" />
              <span className="help" id="iv-h">12 caractères au moins. Vous seul le connaîtrez.</span>
            </div>
            <div className="field">
              <label htmlFor="iv-c">Confirmez le mot de passe</label>
              <input id="iv-c" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !email || !password || !confirm}>
              <Icon name="checkmark-circle-outline" />
              Accepter l’invitation
            </button>
            <p className="caption subtle" style={{ margin: 0 }}>Vous n’attendiez pas cette invitation ? Fermez simplement cette page.</p>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
