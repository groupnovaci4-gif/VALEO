/** Mise en page des écrans sans session : panneau de marque (fond nuit) + formulaire. */
import type { ReactNode } from 'react';
import { Icon } from '../icons';
import { brand, LOGO, TAGLINE } from '../brand';

export function AuthLayout({ trust, children }: { trust: [string, string][]; children: ReactNode }) {
  return (
    <div className="login">
      <section className="login-brand" aria-label={brand.name}>
        <div>
          <img className="logo-xl" src={LOGO} alt={`Logo ${brand.name}`} />
          <h2>
            {brand.name}
            <br />
            Back-office
          </h2>
          <p className="tag">
            {TAGLINE}
            <br />
            <b>Espace réservé à l’équipe.</b>
          </p>
        </div>
        <div className="trust">
          {trust.map(([icon, text]) => (
            <div key={text}>
              <Icon name={icon} />
              {text}
            </div>
          ))}
        </div>
      </section>
      <section className="login-form">{children}</section>
    </div>
  );
}

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="steps" aria-label={`Étape ${current + 1} sur ${labels.length}`}>
      {labels.map((l, i) => (
        <span key={l} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep" />}
          <span className={`st${i === current ? ' on' : ''}`}>
            {i < current ? <Icon name="checkmark-circle" /> : <span className="n">{i + 1}</span>}
            {l}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Code à 6 chiffres en 6 cases (saisie, collage, retour arrière). */
export function OtpInput({ value, onChange, label = 'Code à 6 chiffres' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const focus = (i: number) => document.querySelectorAll<HTMLInputElement>('.otp input')[i]?.focus();
  return (
    <div className="field">
      <span className="flabel" id="otp-l">{label}</span>
      <div className="otp" role="group" aria-labelledby="otp-l">
        {digits.map((d, i) => (
          <input
            key={i}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            value={d.trim()}
            aria-label={`Chiffre ${i + 1}`}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, '');
              if (!typed) return;
              const next = (value.slice(0, i) + typed + value.slice(i + typed.length)).slice(0, 6);
              onChange(next);
              focus(Math.min(5, i + typed.length));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace') {
                e.preventDefault();
                const at = value[i] ? i : Math.max(0, i - 1);
                onChange(value.slice(0, at) + value.slice(at + 1));
                focus(at);
              }
            }}
            onPaste={(e) => {
              const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
              if (p) {
                e.preventDefault();
                onChange(p);
                focus(Math.min(5, p.length));
              }
            }}
          />
        ))}
      </div>
      <span className="help">Le code change toutes les 30 secondes.</span>
    </div>
  );
}
