// Décalage de l'horloge du téléphone (B-03).
//
// `prepareSync` horodate depuis l'horloge LOCALE et le serveur garde la
// version au `updatedAt` le plus récent. Une horloge en avance est ramenée au
// présent côté serveur ; une horloge en RETARD ne l'est pas — et ne peut pas
// l'être, un agent qui pèse le matin et synchronise le soir ayant
// légitimement un horodatage ancien.
//
// Conséquence : sur un téléphone qui retarde, les MODIFICATIONS sont ignorées
// en silence — 200, « Synchronisé », rien d'enregistré. Le serveur ne peut pas
// corriger ; il dit son heure, et ces fonctions en tirent l'avertissement.
import test from "node:test";
import assert from "node:assert/strict";

import { ecartHorloge, messageHorloge, SEUIL_HORLOGE_MS } from "../.sync-build/lib.js";

const T0 = Date.parse("2026-03-01T12:00:00Z");
const iso = (ms) => new Date(T0 + ms).toISOString();

test("une horloge juste ne déclenche rien", () => {
  const h = ecartHorloge(iso(0), T0);
  assert.equal(h.alerte, false);
  assert.equal(messageHorloge(h), null);
});

test("une dérive ordinaire ne déclenche rien", () => {
  // Deux minutes : sous le seuil. Alerter là-dessus serait du bruit, et le
  // bruit finit par être ignoré — y compris le jour où il compte.
  const h = ecartHorloge(iso(0), T0 + 2 * 60_000);
  assert.equal(h.alerte, false);
  assert.equal(messageHorloge(h), null);
});

test("un téléphone EN RETARD est signalé, et le message le dit", () => {
  // Serveur à 12 h, téléphone à 11 h : le sens dangereux.
  const h = ecartHorloge(iso(0), T0 - 60 * 60_000);
  assert.equal(h.alerte, true);
  assert.equal(h.enRetard, true);
  assert.equal(h.minutes, 60);
  const m = messageHorloge(h);
  assert.match(m, /retarde/);
  assert.match(m, /ne pas être enregistrées/,
    "le message doit dire la CONSÉQUENCE, pas seulement constater le décalage");
});

test("un téléphone EN AVANCE est signalé sans dramatiser", () => {
  const h = ecartHorloge(iso(0), T0 + 60 * 60_000);
  assert.equal(h.alerte, true);
  assert.equal(h.enRetard, false);
  const m = messageHorloge(h);
  assert.match(m, /avance/);
  assert.doesNotMatch(m, /risquent/,
    "une horloge en avance est ramenée par le serveur : pas de perte à annoncer");
});

test("le seuil est bien celui qu'on croit", () => {
  const juste = ecartHorloge(iso(0), T0 - SEUIL_HORLOGE_MS);
  assert.equal(juste.alerte, false, "au seuil exact, pas d'alerte");
  const au_dela = ecartHorloge(iso(0), T0 - SEUIL_HORLOGE_MS - 1000);
  assert.equal(au_dela.alerte, true);
});

test("un grand écart s'exprime en heures", () => {
  const h = ecartHorloge(iso(0), T0 - 400 * 24 * 60 * 60_000);
  assert.match(messageHorloge(h), / h\./, `message : ${messageHorloge(h)}`);
});

test("une heure serveur absente ou illisible ne casse rien", () => {
  // Un serveur plus ancien n'envoie pas l'en-tête : l'application doit
  // continuer sans avertissement, jamais planter.
  for (const v of [null, undefined, "", "pas une date", "2026-13-45T99:99:99Z"]) {
    assert.equal(ecartHorloge(v), null, `valeur : ${v}`);
    assert.equal(messageHorloge(ecartHorloge(v)), null);
  }
});
