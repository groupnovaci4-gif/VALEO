/**
 * Page d'action des e-mails Firebase (D18 : URL d'action personnalisée, réglée dans la
 * console AU DÉPLOIEMENT seulement). Gère tous les modes : resetPassword, verifyEmail,
 * verifyAndChangeEmail, recoverEmail — pour les utilisateurs de l'app comme pour l'équipe.
 * Un e-mail d'invitation (resetPassword avec un lien de suite /invitation) ouvre
 * directement l'invitation, valable 7 jours grâce à notre propre jeton.
 */
import { useEffect, useState } from 'react';
import { applyActionCode, checkActionCode, confirmPasswordReset, sendPasswordResetEmail, verifyPasswordResetCode } from 'firebase/auth';
import { validatePassword } from '@app/core/validation';
import { auth } from '../firebase';
import { brand, LOGO } from '../brand';
import { Icon } from '../icons';
import { Msg } from '../components/ui';
import Invitation from './Invitation';
import { parseInviteUrl } from './inviteUrl';
import { actionLang, at, type ActionKey } from './actionTexts';

type View =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'reset'; email: string }
  | { kind: 'done'; title: ActionKey; text: ActionKey; email?: string; recover?: boolean };

/**
 * Un code Firebase ne sert qu'une fois : l'appel est fait UNE seule fois par lien, même si
 * l'écran est monté deux fois (mode strict de React, retour arrière).
 */
const runs = new Map<string, Promise<View>>();
function runOnce(href: string, mode: string, oob: string): Promise<View> {
  if (!runs.has(href)) runs.set(href, check(mode, oob));
  return runs.get(href)!;
}
async function check(mode: string, oob: string): Promise<View> {
  if (!oob) return { kind: 'invalid' };
  try {
    if (mode === 'resetPassword') return { kind: 'reset', email: await verifyPasswordResetCode(auth, oob) };
    if (mode === 'verifyEmail') {
      await applyActionCode(auth, oob);
      return { kind: 'done', title: 'verifyTitle', text: 'verifyDone' };
    }
    if (mode === 'verifyAndChangeEmail') {
      await applyActionCode(auth, oob);
      return { kind: 'done', title: 'changeTitle', text: 'changeDone' };
    }
    if (mode === 'recoverEmail') {
      const info = await checkActionCode(auth, oob);
      await applyActionCode(auth, oob);
      return { kind: 'done', title: 'recoverTitle', text: 'recoverDone', email: info.data.email ?? '', recover: true };
    }
    return { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export default function Action({ href = window.location.href }: { href?: string }) {
  const url = new URL(href);
  const params = url.searchParams;
  const lang = actionLang(params);
  const mode = params.get('mode') ?? '';
  const oob = params.get('oobCode') ?? '';
  const cont = params.get('continueUrl') ?? '';
  const t = (k: ActionKey, v: Record<string, string> = {}) => at(lang, k, { app: brand.name, ...v });
  const invite = mode === 'resetPassword' && cont ? parseInviteUrl(cont) : null;

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (invite) return;
    let alive = true;
    void runOnce(href, mode, oob).then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  // Invitation : la page d'invitation, sur le lien de suite (le code Firebase n'est pas utilisé).
  if (invite) return <Invitation href={cont} />;

  const save = async () => {
    setError(null);
    const err = validatePassword(pw);
    if (err) return setError(t(err === 'tooLong' ? 'tooLong' : 'weak'));
    if (pw !== confirm) return setError(t('mismatch'));
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oob, pw);
      setView({ kind: 'done', title: 'resetTitle', text: 'resetDone' });
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/weak-password') setError(t('weak'));
      else if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') setView({ kind: 'invalid' });
      else setError(t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page" style={{ background: 'var(--background)' }}>
      <main className="card" style={{ width: 'min(460px, 100%)', padding: 28, display: 'grid', gap: 20 }} aria-live="polite">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={LOGO} alt="" width={44} height={44} style={{ borderRadius: 12 }} />
          <b style={{ font: "800 20px 'Plus Jakarta Sans', sans-serif" }}>{brand.name}</b>
        </div>
        {view.kind === 'loading' && <p className="muted" role="status">{t('loading')}</p>}
        {view.kind === 'invalid' && (
          <>
            <h1 className="h-sec" style={{ fontSize: 22 }}>{t('invalidTitle')}</h1>
            <Msg tone="danger" icon="link-outline">{t('invalid')}</Msg>
          </>
        )}
        {view.kind === 'reset' && (
          <form style={{ display: 'grid', gap: 16 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div>
              <h1 className="h-sec" style={{ fontSize: 22 }}>{t('resetTitle')}</h1>
              <p className="muted small" style={{ margin: '6px 0 0' }}>{t('resetFor', { email: view.email })}</p>
            </div>
            <div className="field">
              <label htmlFor="ac-p">{t('newPassword')}</label>
              <input id="ac-p" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="ac-h" />
              <span className="help" id="ac-h">{t('newPasswordHelp')}</span>
            </div>
            <div className="field">
              <label htmlFor="ac-c">{t('confirm')}</label>
              <input id="ac-c" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
            <button className="btn primary" disabled={busy || !pw || !confirm}>
              <Icon name="save-outline" />
              {t('save')}
            </button>
          </form>
        )}
        {view.kind === 'done' && (
          <>
            <h1 className="h-sec" style={{ fontSize: 22 }}>{t(view.title)}</h1>
            <Msg tone="success" icon="checkmark-circle">{t(view.text, { email: view.email ?? '' })}</Msg>
            {view.recover && view.email && (
              sent ? (
                <Msg tone="info" icon="mail-outline">{t('recoverSent', { email: view.email })}</Msg>
              ) : (
                <button className="btn outline" onClick={() => void sendPasswordResetEmail(auth, view.email!).then(() => setSent(true), () => setError(t('error')))}>
                  <Icon name="key-outline" />
                  {t('recoverReset')}
                </button>
              )
            )}
            {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
          </>
        )}
      </main>
    </div>
  );
}
