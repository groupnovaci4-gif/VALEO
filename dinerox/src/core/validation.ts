/**
 * Validation des formulaires d'identité (inscription, profil). Pure et testée.
 * Principe : un champ n'est signalé en erreur que s'il est réellement
 * invalide ; les champs facultatifs vides sont toujours acceptés.
 */

/** Nom ou prénom : lettres (accents compris), espaces, apostrophes, traits d'union, points. */
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' ’.-]*(?: [\p{L}\p{M}' ’.-]+)*$/u;

export type NameError = 'required' | 'tooLong' | 'invalid';
export function validateName(raw: string, max = 80): NameError | null {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) return 'required';
  if (v.length > max) return 'tooLong';
  return NAME_RE.test(v) ? null : 'invalid';
}

/** Nettoie un nom pour l'enregistrement (espaces superflus retirés). */
export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateEmail(raw: string): 'required' | 'invalid' | null {
  const v = raw.trim();
  if (!v) return 'required';
  return EMAIL_RE.test(v) && v.length <= 254 ? null : 'invalid';
}

/** Téléphone FACULTATIF : vide accepté ; sinon 8 à 15 chiffres, « + » initial possible. */
export function normalizePhone(raw: string): string {
  const v = raw.trim();
  const plus = v.startsWith('+') || v.startsWith('00');
  const digits = v.replace(/^00/, '').replace(/\D/g, '');
  return digits ? `${plus ? '+' : ''}${digits}` : '';
}
export function validatePhone(raw: string): 'invalid' | null {
  const v = raw.trim();
  if (!v) return null;
  if (/[^\d\s+().-]/.test(v)) return 'invalid';
  const digits = normalizePhone(v).replace('+', '');
  return digits.length >= 8 && digits.length <= 15 ? null : 'invalid';
}

export type PasswordError = 'required' | 'weak' | 'tooLong';
export function validatePassword(p: string): PasswordError | null {
  if (!p) return 'required';
  if (p.length < 8) return 'weak';
  if (p.length > 128) return 'tooLong';
  return null;
}

export interface SignUpInput {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
  terms: boolean;
}
export type SignUpField = keyof SignUpInput;

/** Erreurs par champ (clé i18n). Objet vide = formulaire valide. */
export function validateSignUp(i: SignUpInput): Partial<Record<SignUpField, string>> {
  const e: Partial<Record<SignUpField, string>> = {};
  const ln = validateName(i.lastName);
  if (ln) e.lastName = `auth.err.name.${ln}`;
  const fn = validateName(i.firstName);
  if (fn) e.firstName = `auth.err.name.${fn}`;
  const em = validateEmail(i.email);
  if (em) e.email = em === 'required' ? 'auth.err.email.required' : 'auth.err.invalid-email';
  if (validatePhone(i.phone)) e.phone = 'auth.err.phone';
  const pw = validatePassword(i.password);
  if (pw) e.password = pw === 'weak' ? 'auth.err.weak-password' : `auth.err.password.${pw}`;
  if (!e.password && i.confirm !== i.password) e.confirm = 'auth.err.passwordMismatch';
  if (!i.terms) e.terms = 'auth.err.terms';
  return e;
}
