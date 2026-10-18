/*
 * Amorçage de données dans les ÉMULATEURS (jamais en production) : écrit directement des
 * documents d'un espace, en contournant les règles (jeton « owner » de l'émulateur). Sert aux
 * parcours qui doivent montrer un état difficile à produire au clic : échéances anciennes
 * (« À régulariser »), solde négatif après deux téléphones, tontine dont le cycle est passé.
 */
const PROJECT = 'demo-dinerox';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

/** uid d'un compte de l'émulateur d'authentification : connexion e-mail / mot de passe (émulateur). */
async function uidOf(email, password = 'motdepasse123') {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.localId) throw new Error(`compte introuvable : ${email}`);
  return j.localId;
}

/** Valeur JS → valeur Firestore REST. */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

/** Écrit (ou remplace) un document `spaces/{uid}/{col}/{id}`. */
async function put(uid, col, doc) {
  const now = Date.now();
  const full = { createdAt: now, updatedAt: now, createdBy: uid, ...doc };
  const fields = Object.fromEntries(Object.entries(full).map(([k, x]) => [k, enc(x)]));
  fields.syncedAt = { timestampValue: new Date().toISOString() };
  const r = await fetch(`${FS}/spaces/${uid}/${col}/${doc.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`écriture refusée ${col}/${doc.id} : ${r.status} ${await r.text()}`);
}

/** Documents d'une collection de l'espace (champs texte seulement : id, name…). */
async function list(uid, col) {
  const r = await fetch(`${FS}/spaces/${uid}/${col}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const j = await r.json();
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).filter(([, v]) => 'stringValue' in v).map(([k, v]) => [k, v.stringValue])) }));
}

/** Met à jour un champ du profil financier (`users/{uid}.financial.<champ>`). */
async function setFinancial(uid, key, value) {
  const r = await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=financial.${key}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { financial: { mapValue: { fields: { [key]: enc(value) } } } } }),
  });
  if (!r.ok) throw new Error(`profil refusé : ${r.status}`);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Date décalée de `months` mois et `days` jours depuis aujourd'hui. */
const shift = (months, days = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return iso(d);
};

module.exports = { uidOf, put, list, setFinancial, iso, shift };
