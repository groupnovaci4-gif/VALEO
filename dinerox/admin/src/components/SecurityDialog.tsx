/** Réglages › Mot de passe et codes de secours : chaque changement exige le code du moment. */
import { useState } from 'react';
import { call } from '../api';
import { errorText } from '../messages';
import { useSession } from '../session';
import { Icon } from '../icons';
import { Dialog, Msg } from './ui';
import { OtpInput } from './AuthLayout';

export function SecurityDialog({ onClose }: { onClose: () => void }) {
  const { me, logout } = useSession();
  const [tab, setTab] = useState<'password' | 'codes'>('password');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (tab === 'password') {
      if (pw.length < 12) return setError('Le mot de passe doit contenir au moins 12 caractères.');
      if (pw !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    }
    setBusy(true);
    try {
      if (tab === 'password') {
        await call('boChangePassword', { password: pw, code });
        await logout();
      } else {
        const r = await call<{ recoveryCodes: string[] }>('boNewRecoveryCodes', { code });
        setCodes(r.recoveryCodes);
      }
    } catch (e) {
      setError(errorText(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Mot de passe et codes de secours"
      intro={`Compte ${me?.email ?? ''}. Chaque changement demande le code de votre application d’authentification.`}
      icon="key-outline"
      onClose={onClose}
      footer={
        codes ? (
          <><span /><button className="btn primary" onClick={onClose}>J’ai noté mes codes</button></>
        ) : (
          <>
            <button className="btn outline" onClick={onClose}>Annuler</button>
            <button className="btn primary" disabled={busy || code.length !== 6} onClick={() => void submit()}>
              <Icon name="save-outline" />
              {tab === 'password' ? 'Changer le mot de passe' : 'Créer de nouveaux codes'}
            </button>
          </>
        )
      }
    >
      {codes ? (
        <>
          <Msg tone="success" icon="checkmark-circle">Nouveaux codes de secours : les anciens ne fonctionnent plus. Notez-les, ils ne seront plus affichés.</Msg>
          <ul className="codes">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Que voulez-vous changer ?">
            <button aria-pressed={tab === 'password'} onClick={() => setTab('password')}>Mot de passe</button>
            <button aria-pressed={tab === 'codes'} onClick={() => setTab('codes')}>Codes de secours ({me?.recoveryLeft ?? 0} restants)</button>
          </div>
          {tab === 'password' ? (
            <>
              <div className="field">
                <label htmlFor="sd-p">Nouveau mot de passe</label>
                <input id="sd-p" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                <span className="help">12 caractères au moins. Vous serez ensuite déconnecté : reconnectez-vous avec le nouveau mot de passe.</span>
              </div>
              <div className="field">
                <label htmlFor="sd-c">Confirmez le mot de passe</label>
                <input id="sd-c" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </>
          ) : (
            <Msg tone="info" icon="information-circle">Huit nouveaux codes remplaceront les anciens.</Msg>
          )}
          <OtpInput value={code} onChange={setCode} label="Code de votre application" />
          {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
        </>
      )}
    </Dialog>
  );
}
