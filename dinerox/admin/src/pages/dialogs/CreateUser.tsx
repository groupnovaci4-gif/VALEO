/** E5 — Créer un utilisateur (users.create) : formule gratuite, lien pour choisir le mot de passe. */
import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase';
import { call } from '../../api';
import { errorText } from '../../messages';
import { countryOptions } from '../../format';
import { Icon } from '../../icons';
import { Dialog, Msg, useToast } from '../../components/ui';

export function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const countries = countryOptions();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', country: 'CI', currency: 'XOF', language: 'fr' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await call<{ uid: string }>('boCreateUser', { ...f, email: f.email.trim() });
      // Modèle Firebase gratuit (D7) : la personne choisit elle-même son mot de passe.
      await sendPasswordResetEmail(auth, f.email.trim()).catch(() => undefined);
      toast('Utilisateur créé. Lien de définition du mot de passe envoyé.');
      onClose();
      nav(`/utilisateurs/${r.uid}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Créer un utilisateur" intro="Le compte est créé avec la formule gratuite, comme une inscription dans l’app." icon="person-add-outline" onClose={onClose}
      footer={<><button className="btn outline" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy || !f.firstName.trim() || !f.email.trim()} onClick={() => void submit()}><Icon name="send-outline" />Créer et envoyer le lien</button></>}>
      <div className="two" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="cf">Prénom</label><input id="cf" className="input" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
        <div className="field"><label htmlFor="cl">Nom <span className="subtle">(facultatif)</span></label><input id="cl" className="input" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="ce">E-mail</label><input id="ce" className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      <div className="two" style={{ gap: 12 }}>
        <div className="field"><label htmlFor="cc">Pays</label>
          <select id="cc" className="select" value={f.country} onChange={(e) => { const c = countries.find((x) => x.code === e.target.value); setF((x) => ({ ...x, country: e.target.value, currency: c?.currency ?? x.currency })); }}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <span className="help">Devise proposée : {f.currency}</span></div>
        <div className="field"><label htmlFor="cg">Langue</label>
          <select id="cg" className="select" value={f.language} onChange={(e) => set('language', e.target.value)}><option value="fr">Français</option><option value="en">English</option></select></div>
      </div>
      <Msg tone="info" icon="mail-outline">Un lien pour <b>définir le mot de passe</b> sera envoyé à cette adresse. Personne dans l’équipe ne choisit ni ne voit de mot de passe.</Msg>
      {error && <Msg tone="danger" icon="alert-circle">{error}</Msg>}
    </Dialog>
  );
}
