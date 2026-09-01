// Tests des formules dérivées de `src/coop/lib.ts` : justification de caisse
// d'un agent et commission figée. Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { pisteurStats, collectionComm, memberStats, outstandingReste } = await import("../.sync-build/lib.js");

const PISTEUR = "st-pisteur";

const collecte = (id, extra = {}) => ({
  id, seq: 1, memberId: "mb-1", byStaffId: PISTEUR, date: "2026-02-01T09:00:00.000Z",
  kg: 100, prixKg: 1800, cropId: "cacao", brut: 180000, retenues: [], net: 180000,
  paye: 180000, reste: 0, method: "espece", note: "", ...extra,
});

const etat = (extra = {}) => ({
  saison: "Campagne 2025-2026", prixKg: 1800, seq: 1, memberSeq: 1, commissionRate: 25,
  coop: { nom: "Coop", momo: [] }, coops: [], prices: { cacao: 1800 }, commissions: { cacao: 25 },
  staff: [], members: [], collections: [], loans: [], mandats: [], depenses: [],
  settlements: [], priceHistory: [], ...extra,
});

test("la caisse compte les anciens restes soldés par l'agent", () => {
  // Mandat 1 000 000. Pesée de 540 000 payée en entier, plus 200 000 d'ancien
  // reste soldé à cette occasion : l'agent a sorti 740 000 F de sa caisse.
  const data = etat({
    mandats: [{ id: "md-1", pisteurId: PISTEUR, amount: 1_000_000, date: "2026-02-01T08:00:00.000Z", note: "" }],
    collections: [collecte("c1", { kg: 300, net: 540000, brut: 540000, paye: 540000, oldRegle: 200000 })],
    settlements: [{ id: "s1", memberId: "mb-1", byStaffId: PISTEUR, amount: 200000, method: "espece",
                    date: "2026-02-01T09:00:00.000Z", viaPesee: true }],
  });
  const st = pisteurStats(PISTEUR, data);
  assert.equal(st.achatsPesees, 540000);
  assert.equal(st.soldes, 200000);
  assert.equal(st.achats, 740000, "les soldes d'anciens restes sortent aussi de la caisse");
  assert.equal(st.solde, 260000, "solde en caisse à justifier");
});

test("un solde hors livraison est également décompté", () => {
  const data = etat({
    mandats: [{ id: "md-1", pisteurId: PISTEUR, amount: 500000, date: "2026-02-01T08:00:00.000Z", note: "" }],
    settlements: [{ id: "s1", memberId: "mb-1", byStaffId: PISTEUR, amount: 120000, method: "espece",
                    date: "2026-02-02T09:00:00.000Z", viaPesee: false }],
  });
  assert.equal(pisteurStats(PISTEUR, data).solde, 380000);
});

test("le solde payé par un AUTRE agent n'entame pas ma caisse", () => {
  const data = etat({
    mandats: [{ id: "md-1", pisteurId: PISTEUR, amount: 500000, date: "2026-02-01T08:00:00.000Z", note: "" }],
    settlements: [{ id: "s1", memberId: "mb-1", byStaffId: "st-autre", amount: 120000, method: "espece",
                    date: "2026-02-02T09:00:00.000Z" }],
  });
  assert.equal(pisteurStats(PISTEUR, data).solde, 500000);
});

test("les dépenses de tournée restent décomptées", () => {
  const data = etat({
    mandats: [{ id: "md-1", pisteurId: PISTEUR, amount: 300000, date: "2026-02-01T08:00:00.000Z", note: "" }],
    depenses: [{ id: "d1", pisteurId: PISTEUR, category: "carburant", amount: 25000,
                 date: "2026-02-01T10:00:00.000Z", note: "" }],
  });
  assert.equal(pisteurStats(PISTEUR, data).solde, 275000);
});

test("la commission utilise le barème figé sur la collecte", () => {
  const data = etat({
    commissions: { cacao: 60 }, // le barème courant a changé depuis
    coops: [{ id: "c", prices: { cacao: 1800 }, commissions: { cacao: 60 } }],
    collections: [collecte("c1", { kg: 100, commissionRate: 25 })],
  });
  assert.equal(collectionComm(data, data.collections[0]), 25);
  assert.equal(pisteurStats(PISTEUR, data).commission, 2500, "la commission ne doit pas être recalculée rétroactivement");
});

test("sans barème figé (données antérieures) on retombe sur le barème courant", () => {
  const data = etat({ commissions: { cacao: 30 }, collections: [collecte("c1", { kg: 100 })] });
  assert.equal(collectionComm(data, data.collections[0]), 30);
  assert.equal(pisteurStats(PISTEUR, data).commission, 3000);
});

test("le reste dû d'un reçu tient compte de ce qui a été soldé ensuite", () => {
  const cols = [collecte("c1", { paye: 0, reste: 180000, resteSolde: 50000 })];
  assert.equal(outstandingReste(cols[0]), 130000);
  const st = memberStats("mb-1", cols);
  assert.equal(st.reste, 130000);
  assert.equal(st.paye, 50000, "le reste soldé compte comme payé");
});
