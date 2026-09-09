// L'identifiant d'enregistrement est une CLÉ DE STOCKAGE : sur Firestore, la
// clé de document se dérive de (coopérative, id). Deux enregistrements d'une
// même coopérative qui partagent un `id` n'en font plus qu'un — la seconde
// écriture écrase la première, sans erreur.
//
// L'ancienne version tirait 7 caractères de `Math.random()`, soit ~36 bits
// d'un générateur non cryptographique. Ces tests fixent le niveau attendu.
import test from "node:test";
import assert from "node:assert/strict";

import { uid, staffTag, makeTicket } from "../.sync-build/lib.js";

test("uid consomme la source cryptographique quand elle existe", () => {
  // LE contrôle qui mord. Un test de collision ne convient pas ici : avec
  // l'ancien uid (~36 bits), 200 000 tirages n'entrent en collision qu'une
  // fois sur quatre environ — un tel test laisse passer trois fois sur
  // quatre une implémentation cassée, et rassure à tort. On vérifie donc la
  // propriété directement, ce qui est déterministe.
  const vrai = globalThis.crypto;
  let appels = 0;
  try {
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues(tableau) {
          appels++;
          return vrai && vrai.getRandomValues ? vrai.getRandomValues(tableau) : tableau;
        },
      },
      configurable: true,
    });
    uid();
    assert.equal(appels, 1, "uid doit tirer depuis crypto.getRandomValues");
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: vrai, configurable: true });
  }
});

test("uid ne se répète pas sur un tirage massif", () => {
  // Contrôle grossier, complémentaire du précédent : il attrape une
  // implémentation devenue constante ou quasi constante, pas une entropie
  // simplement insuffisante.
  const n = 100_000;
  const vus = new Set();
  for (let i = 0; i < n; i++) vus.add(uid());
  assert.equal(vus.size, n, `collision observée sur ${n} tirages`);
});

test("uid porte assez d'entropie pour servir de clé", () => {
  // 96 bits en hexadécimal = 24 caractères. Le repli sans `crypto` est plus
  // long encore. En dessous de ~16 caractères, on retombe sur l'ordre de
  // grandeur qui posait problème.
  const e = uid();
  assert.ok(e.length >= 16, `uid trop court : ${e.length} caractères (${e})`);
});

test("uid n'est pas dérivé du seul horodatage", () => {
  // Deux appels dans la même milliseconde doivent différer : sinon deux
  // pesées enregistrées d'affilée porteraient le même identifiant.
  const debut = Date.now();
  const a = uid(), b = uid();
  assert.notEqual(a, b);
  assert.ok(Date.now() - debut < 50, "les tirages doivent rester immédiats");
});

test("le trigramme du bordereau reste stable et lisible", () => {
  // `staffTag` hache l'identifiant en entier : allonger `uid` ne casse rien,
  // mais le format du numéro de bordereau, lui, ne doit pas bouger.
  const t = staffTag(uid());
  assert.match(t, /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{3}$/, `trigramme inattendu : ${t}`);
  assert.match(makeTicket(uid(), 7), /^P-[A-Z]{3}-0007$/);
});

test("le repli sans crypto reste sans collision", () => {
  // On retire `crypto` du global pour éprouver le chemin de repli, celui qui
  // servira sur un appareil où l'API n'est pas exposée.
  const vrai = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    const vus = new Set();
    for (let i = 0; i < 50_000; i++) vus.add(uid());
    assert.equal(vus.size, 50_000, "collision sur le chemin de repli");
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: vrai, configurable: true });
  }
});
