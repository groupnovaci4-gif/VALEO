// Tests de `src/coop/sync.ts` (préparation de la charge utile de synchro).
//
// Lancer : `yarn test` — le script transpile d'abord le module (pur, sans
// dépendance d'exécution) vers `.sync-build/`, puis exécute ce fichier avec le
// lanceur de tests intégré de Node. Aucune dépendance supplémentaire.
import assert from "node:assert/strict";
import test from "node:test";

const { prepareSync, sameRecord } = await import("../.sync-build/sync.js");

const BASE = "2026-01-01T08:00:00.000Z";

const etat = (rows) => ({
  saison: "Campagne 2025-2026",
  staff: [],
  members: [],
  collections: [],
  loans: [],
  mandats: [],
  depenses: [],
  settlements: [],
  ...rows,
});

const membre = (id, extra = {}) => ({ id, nom: "Kouassi", village: "Sikensi", updatedAt: BASE, ...extra });

test("un enregistrement inchangé conserve son horodatage d'origine", () => {
  const serveur = etat({ members: [membre("m1")] });
  const local = etat({ members: [membre("m1")] });
  const { data, deletions } = prepareSync(local, serveur);
  assert.equal(data.members[0].updatedAt, BASE, "un enregistrement intact ne doit pas être ré-estampillé");
  assert.deepEqual(deletions, {});
});

test("un enregistrement modifié est ré-estampillé", () => {
  const serveur = etat({ members: [membre("m1")] });
  const local = etat({ members: [membre("m1", { village: "Divo" })] });
  const { data } = prepareSync(local, serveur);
  assert.notEqual(data.members[0].updatedAt, BASE);
  assert.ok(data.members[0].updatedAt > BASE, "l'horodatage doit être plus récent que celui du serveur");
});

test("une création reçoit un horodatage", () => {
  const serveur = etat({ members: [] });
  const local = etat({ members: [{ id: "m2", nom: "Aya", village: "Divo" }] });
  const { data } = prepareSync(local, serveur);
  assert.ok(data.members[0].updatedAt, "toute création doit être horodatée");
});

test("un enregistrement absent est déclaré comme suppression explicite", () => {
  const serveur = etat({ members: [membre("m1"), membre("m2")] });
  const local = etat({ members: [membre("m1")] });
  const { deletions } = prepareSync(local, serveur);
  assert.deepEqual(deletions, { members: ["m2"] });
});

test("sans référence serveur, rien n'est déclaré supprimé", () => {
  // Premier envoi (hors-ligne au démarrage) : ne jamais demander de suppression.
  const local = etat({ members: [membre("m1")], collections: [{ id: "c1", kg: 10 }] });
  const { deletions, data } = prepareSync(local, null);
  assert.deepEqual(deletions, {});
  assert.ok(data.collections[0].updatedAt);
});

test("le second envoi consécutif ne ré-estampille pas (pas de boucle)", () => {
  const serveur = etat({ members: [membre("m1")] });
  const local = etat({ members: [membre("m1", { village: "Divo" })] });
  const premier = prepareSync(local, serveur);
  // Après un PUT réussi, la charge utile devient la nouvelle référence.
  const second = prepareSync(local, premier.data);
  assert.equal(second.data.members[0].updatedAt, premier.data.members[0].updatedAt);
  assert.deepEqual(second.deletions, {});
});

test("les autres tableaux d'entités sont traités de la même façon", () => {
  const serveur = etat({
    collections: [{ id: "c1", kg: 100, updatedAt: BASE }],
    loans: [{ id: "l1", amount: 5000, updatedAt: BASE }],
    settlements: [{ id: "s1", amount: 100, updatedAt: BASE }],
  });
  const local = etat({
    collections: [{ id: "c1", kg: 100, updatedAt: BASE }, { id: "c2", kg: 50 }],
    loans: [{ id: "l1", amount: 9999, updatedAt: BASE }],
    settlements: [],
  });
  const { data, deletions } = prepareSync(local, serveur);
  assert.equal(data.collections[0].updatedAt, BASE, "collecte intacte");
  assert.ok(data.collections[1].updatedAt, "nouvelle collecte horodatée");
  assert.ok(data.loans[0].updatedAt > BASE, "avance modifiée ré-estampillée");
  assert.deepEqual(deletions, { settlements: ["s1"] });
});

test("sameRecord ignore updatedAt mais rien d'autre", () => {
  assert.equal(sameRecord({ id: "a", v: 1, updatedAt: "x" }, { id: "a", v: 1, updatedAt: "y" }), true);
  assert.equal(sameRecord({ id: "a", v: 1 }, { id: "a", v: 2 }), false);
  assert.equal(sameRecord({ id: "a", v: 1 }, { id: "a", v: 1, extra: null }), false);
  // Un champ imbriqué modifié (ex. signature, momo) doit être détecté.
  assert.equal(sameRecord({ id: "a", momo: { n: "1" } }, { id: "a", momo: { n: "2" } }), false);
});
