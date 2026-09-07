// Session Firebase : échange, renouvellement, et surtout le repli hors-ligne.
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { jetonUtilisable, doitRenouveler, sessionDepuis, echanger, renouveler, MARGE_MS } =
  await import("../.sync-build/firebase.js");

const T0 = 1_800_000_000_000; // instant de référence, fixe
const CLE = "cle-api-test";

// Faux `fetch` : enregistre les appels, répond ce qu'on lui dit.
function faux(reponses) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url, corps: JSON.parse(init.body) });
    const r = reponses.shift();
    if (r === "panne") throw new Error("réseau coupé");
    return { ok: r.ok !== false, json: async () => r.body };
  };
  f.appels = appels;
  return f;
}

const OK = { body: { idToken: "id-1", refreshToken: "rt-1", expiresIn: "3600" } };

test("sessionDepuis calcule l'expiration en absolu", () => {
  const s = sessionDepuis(OK.body, T0);
  assert.equal(s.idToken, "id-1");
  assert.equal(s.refreshToken, "rt-1");
  assert.equal(s.expireA, T0 + 3600 * 1000);
});

test("sessionDepuis accepte les deux orthographes de l'API Google", () => {
  // L'échange renvoie `expiresIn`, le renouvellement `expires_in` : une seule
  // des deux formes suffirait à casser silencieusement le renouvellement.
  const s = sessionDepuis({ id_token: "id-2", refresh_token: "rt-2", expires_in: "3600" }, T0);
  assert.equal(s.idToken, "id-2");
  assert.equal(s.expireA, T0 + 3600 * 1000);
});

test("sessionDepuis refuse une réponse incomplète", () => {
  for (const mauvais of [null, {}, { idToken: "x" }, { idToken: "x", refreshToken: "y" },
                         { idToken: "x", refreshToken: "y", expiresIn: "0" },
                         { idToken: "x", refreshToken: "y", expiresIn: "plus tard" }]) {
    assert.equal(sessionDepuis(mauvais, T0), null);
  }
});

test("un jeton frais est utilisable, un jeton expiré ne l'est pas", () => {
  const s = sessionDepuis(OK.body, T0);
  assert.equal(jetonUtilisable(s, T0), true);
  assert.equal(jetonUtilisable(s, T0 + 3599_000), true);
  assert.equal(jetonUtilisable(s, T0 + 3601_000), false);
  assert.equal(jetonUtilisable(null, T0), false);
});

test("le renouvellement se déclenche AVANT l'expiration", () => {
  const s = sessionDepuis(OK.body, T0);
  assert.equal(doitRenouveler(s, T0), false);
  assert.equal(doitRenouveler(s, s.expireA - MARGE_MS - 1000), false);
  assert.equal(doitRenouveler(s, s.expireA - MARGE_MS), true);
  assert.equal(doitRenouveler(s, s.expireA + 10_000), true, "expiré = à renouveler");
});

test("échange : le jeton personnalisé part bien vers Identity Toolkit", async () => {
  const f = faux([OK]);
  const s = await echanger(f, CLE, "jeton-perso", T0);
  assert.equal(s.idToken, "id-1");
  assert.match(f.appels[0].url, /signInWithCustomToken\?key=cle-api-test$/);
  assert.deepEqual(f.appels[0].corps, { token: "jeton-perso", returnSecureToken: true });
});

test("renouvellement : le jeton de rafraîchissement part bien", async () => {
  const f = faux([{ body: { id_token: "id-2", refresh_token: "rt-2", expires_in: "3600" } }]);
  const s0 = sessionDepuis(OK.body, T0);
  const s1 = await renouveler(f, CLE, s0, T0 + 3_500_000);
  assert.equal(s1.idToken, "id-2");
  assert.match(f.appels[0].url, /securetoken\.googleapis\.com/);
  assert.equal(f.appels[0].corps.refresh_token, "rt-1");
});

// ------------------------------------------------------------------------- //
// Le point qui compte pour VALEO : hors-ligne, rien ne doit lever.
// ------------------------------------------------------------------------- //

test("hors-ligne, l'échange rend null sans jamais lever", async () => {
  assert.equal(await echanger(faux(["panne"]), CLE, "jeton-perso", T0), null);
});

test("hors-ligne, le renouvellement rend null sans jamais lever", async () => {
  const s = sessionDepuis(OK.body, T0);
  assert.equal(await renouveler(faux(["panne"]), CLE, s, T0), null);
});

test("une réponse en erreur ne produit pas de session bancale", async () => {
  const f = faux([{ ok: false, body: { error: { message: "INVALID_CUSTOM_TOKEN" } } }]);
  assert.equal(await echanger(f, CLE, "jeton-perso", T0), null);
});

test("sans clé d'API, aucun appel réseau n'est tenté", async () => {
  const f = faux([OK]);
  assert.equal(await echanger(f, "", "jeton-perso", T0), null);
  assert.equal(await renouveler(f, "", sessionDepuis(OK.body, T0), T0), null);
  assert.equal(f.appels.length, 0, "aucune requête ne doit partir");
});

test("sans jeton personnalisé, aucun appel non plus", async () => {
  const f = faux([OK]);
  assert.equal(await echanger(f, CLE, "", T0), null);
  assert.equal(f.appels.length, 0);
});
