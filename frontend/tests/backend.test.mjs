// Où l'application va chercher son API : absolu (mobile) ou même origine (web).
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { resoudreBackend } = await import("../.sync-build/backend.js");

test("une URL configurée est utilisée telle quelle, sur mobile comme sur web", () => {
  for (const web of [true, false]) {
    const b = resoudreBackend("https://valeo-backend.run.app", web);
    assert.equal(b.base, "https://valeo-backend.run.app");
    assert.equal(b.mode, "absolu");
    assert.equal(b.joignable, true);
  }
});

test("la barre finale est retirée", () => {
  // Sans cela : « https://x//api/state », que certains serveurs refusent.
  assert.equal(resoudreBackend("https://x.run.app/", false).base, "https://x.run.app");
  assert.equal(resoudreBackend("https://x.run.app///", false).base, "https://x.run.app");
});

test("sur le web sans URL : même origine, c'est le mode normal sous Hosting", () => {
  const b = resoudreBackend("", true, "https://valeo.web.app");
  assert.equal(b.mode, "meme-origine");
  assert.equal(b.base, "", "le chemin doit rester relatif");
  assert.equal(b.joignable, true);
  assert.match(b.libelle, /valeo\.web\.app/);
  assert.match(b.libelle, /même origine/);
});

test("sur mobile sans URL : aucun serveur, et l'application doit le DIRE", () => {
  // Invariant 27 : hors-ligne d'abord, donc une panne de synchro est
  // invisible si personne ne l'annonce.
  const b = resoudreBackend("", false);
  assert.equal(b.mode, "aucun");
  assert.equal(b.joignable, false);
  assert.equal(b.libelle, "AUCUN");
});

test("une variable vide ou absente se comporte pareil", () => {
  for (const vide of [undefined, null, "", "   "]) {
    assert.equal(resoudreBackend(vide, false).mode, "aucun");
    assert.equal(resoudreBackend(vide, true).mode, "meme-origine");
  }
});

test("le mode même-origine reste lisible sans origine connue", () => {
  assert.equal(resoudreBackend("", true, null).libelle, "même origine");
});

test("le chemin construit est correct dans les deux modes", () => {
  assert.equal(resoudreBackend("https://x.run.app", false).base + "/api/state",
               "https://x.run.app/api/state");
  assert.equal(resoudreBackend("", true, "https://valeo.web.app").base + "/api/state",
               "/api/state");
});
