/**
 * E1 / E1b — Connexion : mot de passe PUIS code, tous deux vérifiés par le serveur
 * (essais limités par compte, refus journalisés). Première connexion : QR code,
 * premier code, 8 codes de secours affichés une seule fois.
 */
import { useEffect, useState } from 'react';
import { sendPasswordResetEmail, signInWithCustomToken } from 'firebase/auth';
import QRCode from 'qrcode';
import { auth } from '../firebase';
import { call } from '../api';
import { codeOf, errorText } from '../messages';
import { brand } from '../brand';
import { Icon } from '../icons';
import { useSession } from '../session';
import { AuthLayout, OtpInput, Steps } from '../components/AuthLayout';
import { Msg } from '../components/ui';

type Step = 'password' | 'code' | 'enroll' | 'codes';
const TRUST: [string, string][] = [
  ['shield-checkmark-outline', 'Chaque action est vérifiée par le serveur.'],
  ['finger-print-outline', 'Double vérification à chaque connexion.'],
  ['document-lock-outline', 'Toutes les actions sont enregistrées au journal.'],
];
const ISSUER = `${brand.name} Back-office`;

export default function Login() {
  const { notice, clearNotice } = useSession();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!secret) return;
    const uri = `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=30`;
    void QRCode.toDataURL(uri, { margin: 1, width: 400, errorCorrectionLevel: 'M' }).then(setQr);
  }, [secret, email]);

  const start = async () => {
    setError(null);
    setInfo(null);
    clearNotice();
    setBusy(true);
    try {
      const r = await call<{ challenge: string; enroll: { secret: string } | null }>('boLoginStart', { email: email.trim(), password });
      setChallenge(r.challenge);
      setSecret(r.enroll?.secret ?? null);
      setCode('');
      setStep(r.enroll ? 'enroll' : 'code');
    } catch (e) {
      setError(codeOf(e) === 'bo/password-too-short' ? 'Ce mot de passe est trop court pour le back-office (12 caractères au moins). Utilisez « Mot de passe oublié » pour en choisir un nouveau.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await call<{ token: string; recoveryCodes: string[] | null }>('boLoginVerify', { email: email.trim(), challenge, code: useRecovery ? recovery : code });
      if (r.recoveryCodes?.length) {
        // Les codes de secours s'affichent AVANT d'entrer : une seule fois.
        setCodes(r.recoveryCodes);
        setPendingToken(r.token);
        setStep('codes');
      } else await signInWithCustomToken(auth, r.token);
    } catch (e) {
      const c = codeOf(e);
      setError(errorText(e));
      if (c === 'bo/locked' || c === 'bo/login-failed') {
        setStep('password');
        setPassword('');
      }
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) return setError('Indiquez d’abord votre adresse e-mail.');
    await sendPasswordResetEmail(auth, email.trim()).catch(() => undefined);
    // Même réponse que l'adresse existe ou non.
    setInfo('Si cette adresse a un accès, un lien pour choisir un nouveau mot de passe vient d’être envoyé.');
  };

  return (
    <AuthLayout trust={TRUST}>
      {step === 'password' && (
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <Steps labels={['Mot de passe', 'Code de vérification']} current={0} />
          <div>
            <h1>Connexion</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>Espace réservé à l’équipe {brand.name}.</p>
          </div>
          {notice && <Msg tone="warning" icon="time-outline">{notice}</Msg>}
          <div className="field">
            <label htmlFor="lg-e">Adresse e-mail</label>
            <input id="lg-e" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="lg-p">Mot de passe</label>
            <input id="lg-p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required aria-invalid={!!error} aria-describedby={error ? 'lg-err' : undefined} />
            {error && <span className="err-text" id="lg-err" role="alert">{error}</span>}
          </div>
          {info && <Msg tone="info" icon="mail-outline">{info}</Msg>}
          <button className="btn primary" style={{ width: '100%' }} disabled={busy || !email || !password}>
            <Icon name="log-in-outline" />
            Continuer
          </button>
          <button type="button" className="btn tertiary sm" style={{ justifySelf: 'start' }} onClick={() => void forgot()}>
            <Icon name="key-outline" />
            Mot de passe oublié
          </button>
          <p className="caption subtle" style={{ margin: 0 }}>Aucun compte ne peut être créé ici. Problème d’accès : contactez un Super Admin.</p>
        </form>
      )}

      {(step === 'code' || step === 'enroll') && (
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <Steps labels={['Mot de passe', step === 'enroll' ? 'Activer la double vérification' : 'Code de vérification']} current={1} />
          {step === 'enroll' ? (
            <>
              <div>
                <h1>Activez la double vérification</h1>
                <p className="muted" style={{ margin: '6px 0 0' }}>Scannez ce QR code avec une application d’authentification (Google Authenticator, Microsoft Authenticator…), puis saisissez le code affiché.</p>
              </div>
              <div className="qr">{qr ? <img src={qr} alt={`QR code à scanner pour ${ISSUER}`} /> : <span className="skel" style={{ width: 200, height: 200 }} />}</div>
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>Impossible de scanner ? Saisir la clé à la main</summary>
                <p className="secret" aria-label="Clé secrète">{secret}</p>
              </details>
            </>
          ) : (
            <div>
              <h1>Saisissez votre code</h1>
              <p className="muted" style={{ margin: '6px 0 0' }}>Ouvrez votre application d’authentification et saisissez le code à 6 chiffres affiché pour <b>{ISSUER}</b>.</p>
            </div>
          )}
          {useRecovery ? (
            <div className="field">
              <label htmlFor="lg-r">Code de secours</label>
              <input id="lg-r" className="input" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX" value={recovery} onChange={(e) => setRecovery(e.target.value)} />
              <span className="help">Chaque code de secours ne sert qu’une fois.</span>
            </div>
          ) : (
            <OtpInput value={code} onChange={setCode} />
          )}
          {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
          <button className="btn primary" style={{ width: '100%' }} disabled={busy || (useRecovery ? recovery.trim().length < 8 : code.length !== 6)}>
            <Icon name="log-in-outline" />
            {step === 'enroll' ? 'Activer et se connecter' : 'Vérifier et se connecter'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {step === 'code' && (
              <button type="button" className="btn tertiary sm" onClick={() => { setUseRecovery((v) => !v); setError(null); }}>
                <Icon name="key-outline" />
                {useRecovery ? 'Utiliser le code de l’application' : 'Utiliser un code de secours'}
              </button>
            )}
            <button type="button" className="btn tertiary sm" onClick={() => { setStep('password'); setPassword(''); setError(null); setUseRecovery(false); }}>
              <Icon name="arrow-back-outline" />
              Changer de compte
            </button>
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="login-card">
          <Steps labels={['Mot de passe', 'Activer la double vérification']} current={2} />
          <div>
            <h1>Vos codes de secours</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>Si vous perdez votre téléphone, chacun de ces codes remplace une fois le code de l’application. Notez-les et gardez-les en lieu sûr : ils ne seront plus jamais affichés.</p>
          </div>
          <ul className="codes" aria-label="Codes de secours">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <button className="btn primary" style={{ width: '100%' }} onClick={() => pendingToken && void signInWithCustomToken(auth, pendingToken)}>
            <Icon name="checkmark-circle-outline" />
            J’ai noté mes codes, continuer
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
