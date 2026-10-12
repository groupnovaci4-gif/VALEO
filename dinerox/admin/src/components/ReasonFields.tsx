/** Motif interne (liste courte + précision obligatoire pour « Autre »). Jamais envoyé à l'utilisateur. */
import { REASONS } from '../pages/auditLabels';

export interface Reason { code: string; note: string }
export const reasonOk = (r: Reason) => !!r.code && (r.code !== 'other' || r.note.trim().length >= 3);

export function ReasonFields({ value, onChange, legend = 'Motif interne', help, variant = 'radio' }: { value: Reason; onChange: (r: Reason) => void; legend?: string; help?: string; variant?: 'radio' | 'select' }) {
  return (
    <>
      {variant === 'select' ? (
        <div className="field">
          <label htmlFor="reason-sel">{legend}</label>
          <select id="reason-sel" className="select" value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })}>
            <option value="" disabled>Choisir…</option>
            {REASONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
          {help && <span className="help">{help}</span>}
        </div>
      ) : (
      <fieldset className="radio-list">
        <legend className="flabel" style={{ marginBottom: 8 }}>{legend}</legend>
        {REASONS.map(([c, l]) => (
          <label className="radio" key={c}>
            <input type="radio" name="reason" value={c} checked={value.code === c} onChange={() => onChange({ ...value, code: c })} />
            {l}
          </label>
        ))}
      </fieldset>
      )}
      {value.code === 'other' && (
        <div className="field">
          <label htmlFor="reason-note">Précisez le motif</label>
          <textarea id="reason-note" className="input" maxLength={200} placeholder="200 caractères maximum" value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
          <span className="help">Obligatoire pour « Autre ».</span>
        </div>
      )}
      {help && variant === 'radio' && <span className="help">{help}</span>}
    </>
  );
}
