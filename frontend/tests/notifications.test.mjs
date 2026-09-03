// Alertes par rôle : livraison à vérifier, écarts, restes cloisonnés.
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { buildNotifications } = await import("../.sync-build/lib.js");

const STAFF = [
  { id: "pat", nom: "Patron", role: "patron" },
  { id: "mag", nom: "Bakary", role: "commis" },
  { id: "pis", nom: "Yao", role: "pisteur" },
  { id: "pis2", nom: "Konan", role: "pisteur" },
];
const MEMBRES = [
  { id: "m1", nom: "Kouassi", village: "Gomon", code: "VAL-1000-AA" },
  { id: "m2", nom: "Aya", village: "Divo", code: "VAL-2000-BB" },
];

const col = (id, byStaffId, kg, extra = {}) => ({
  id, seq: 1, memberId: "m1", byStaffId, date: "2026-02-01T09:00:00.000Z",
  kg, prixKg: 1800, cropId: "cacao", brut: kg * 1800, retenues: [], net: kg * 1800,
  paye: kg * 1800, reste: 0, method: "espece", note: "", ...extra,
});

const etat = (collections = [], loans = []) => ({
  saison: "Campagne 2025-2026", staff: STAFF, members: MEMBRES, collections, loans,
  mandats: [], depenses: [], settlements: [], sorties: [], priceHistory: [], coop: { nom: "C", momo: [] },
});

const SESSION = {
  patron: { side: "coop", role: "patron", staffId: "pat" },
  magasinier: { side: "coop", role: "commis", staffId: "mag" },
  pisteur: { side: "coop", role: "pisteur", staffId: "pis" },
  planteur: { side: "planteur", memberId: "m1" },
};

const titres = (d, s) => buildNotifications(d, s).items.map((i) => i.title);
const compte = (d, s) => buildNotifications(d, s).count;

/* ------------------- Demande d'avance : planteur → patron ---------------- */

test("une demande d'avance alerte le patron", () => {
  const d = etat([], [{ id: "l1", memberId: "m1", type: "argent", amount: 200000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", status: "en_attente", soldeRestant: 0, origine: "planteur" }]);
  const n = buildNotifications(d, SESSION.patron);
  const dem = n.items.find((i) => i.title === "Demande d'avance en attente");
  assert.ok(dem, "le patron doit être alerté");
  assert.match(dem.sub, /Kouassi/);
  assert.match(dem.sub, /200 000/);
  assert.equal(dem.kind, "action", "elle appelle une décision");
});

test("le planteur suit le statut de sa demande", () => {
  const d = etat([], [{ id: "l1", memberId: "m1", amount: 200000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", status: "en_attente", soldeRestant: 0 }]);
  assert.ok(titres(d, SESSION.planteur).includes("Demande en attente"));

  const approuve = etat([], [{ id: "l1", memberId: "m1", amount: 150000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", decidedAt: "2026-03-02T09:00:00.000Z", status: "approuve", soldeRestant: 150000 }]);
  assert.ok(titres(approuve, SESSION.planteur).includes("Avance accordée"));

  const refuse = etat([], [{ id: "l1", memberId: "m1", amount: 200000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", decidedAt: "2026-03-02T09:00:00.000Z", status: "refuse", soldeRestant: 0 }]);
  assert.ok(titres(refuse, SESSION.planteur).includes("Avance refusée"));
});

test("le montant accordé peut être inférieur au montant demandé", () => {
  // Demande 200 000, accordé 150 000 : c'est le montant accordé qui vit.
  const d = etat([], [{ id: "l1", memberId: "m1", amount: 150000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", decidedAt: "2026-03-02T09:00:00.000Z", status: "approuve", soldeRestant: 150000 }]);
  const n = buildNotifications(d, SESSION.patron).items.find((i) => i.title === "Avance accordée");
  assert.match(n.sub, /150 000/);
});

test("le pisteur n'est pas alerté des demandes adressées au patron", () => {
  const d = etat([], [{ id: "l1", memberId: "m1", amount: 200000, date: "2026-03-01T09:00:00.000Z", status: "en_attente", soldeRestant: 0 }]);
  assert.equal(titres(d, SESSION.pisteur).includes("Demande d'avance en attente"), false);
});

/* ------------------ Livraison au magasin : patron + magasinier ----------- */

test("une livraison à vérifier alerte le patron ET le magasinier", () => {
  const d = etat([col("c1", "pis", 1000, { origine: "bord_champ" })]);

  const pat = buildNotifications(d, SESSION.patron).items.find((i) => i.id === "vfc1");
  assert.ok(pat, "le patron doit savoir qu'un poids attend une vérification");
  assert.equal(pat.kind, "action");
  assert.match(pat.sub, /Yao/, "l'alerte nomme le pisteur");
  assert.match(pat.sub, /1 000 kg/);

  const mag = buildNotifications(d, SESSION.magasinier).items.find((i) => i.id === "vfc1");
  assert.ok(mag, "le magasinier doit savoir qu'il a une pesée à faire");
  assert.equal(mag.kind, "action");
});

test("l'alerte disparaît une fois la vérification faite", () => {
  const d = etat([col("c1", "pis", 1000, { origine: "bord_champ", verif: { kg: 980, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } })]);
  assert.equal(buildNotifications(d, SESSION.magasinier).items.some((i) => i.id === "vfc1"), false);
});

test("une pesée faite au magasin n'attend aucune vérification", () => {
  const d = etat([col("c1", "mag", 300, { origine: "magasin" })]);
  assert.equal(buildNotifications(d, SESSION.patron).items.some((i) => i.id.startsWith("vf")), false);
});

test("le pisteur n'est pas alerté de sa propre livraison", () => {
  // Il a déjà son suivi de remise sur son accueil.
  const d = etat([col("c1", "pis", 1000, { origine: "bord_champ" })]);
  assert.equal(buildNotifications(d, SESSION.pisteur).items.some((i) => i.id.startsWith("vf")), false);
});

/* --------------------------- Écarts de vérification ---------------------- */

test("le patron est informé d'un manquant et d'un poids plus", () => {
  const manque = etat([col("c1", "pis", 1000, { origine: "bord_champ", verif: { kg: 980, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } })]);
  const m = buildNotifications(manque, SESSION.patron).items.find((i) => i.id === "ecc1");
  assert.equal(m.title, "Manquant après vérification");
  assert.match(m.sub, /1 000 kg → 980 kg \(-20 kg\)/);
  assert.equal(m.kind, "info", "constat, pas action : la caisse est déjà ajustée");

  const plus = etat([col("c1", "pis", 980, { origine: "bord_champ", verif: { kg: 1000, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } })]);
  const p = buildNotifications(plus, SESSION.patron).items.find((i) => i.id === "ecc1");
  assert.equal(p.title, "Poids plus constaté");
  assert.match(p.sub, /\(\+20 kg\)/);
});

test("aucune alerte quand la vérification tombe juste", () => {
  const d = etat([col("c1", "pis", 1000, { origine: "bord_champ", verif: { kg: 1000, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } })]);
  assert.equal(buildNotifications(d, SESSION.patron).items.some((i) => i.id.startsWith("ec")), false);
});

/* ------------------ Restes dus : cloisonnement du pisteur ---------------- */

test("le pisteur n'est alerté que des restes qu'il a lui-même générés", () => {
  // C'était la fuite : sa cloche annonçait les restes du patron et du
  // magasinier, qu'il n'a ni le droit de voir ni celui de solder.
  const d = etat([
    col("c1", "pis", 100, { origine: "bord_champ", paye: 80000, reste: 100000 }),
    col("c2", "mag", 100, { origine: "magasin", memberId: "m2", paye: 30000, reste: 150000 }),
    col("c3", "pat", 100, { origine: "magasin", memberId: "m2", paye: 0, reste: 180000 }),
  ]);
  const restes = buildNotifications(d, SESSION.pisteur).items.filter((i) => i.title === "Reste à payer au planteur");
  assert.equal(restes.length, 1, "un seul reste : le sien");
  assert.match(restes[0].sub, /Kouassi/);
  assert.match(restes[0].sub, /100 000/);
  assert.equal(restes.some((r) => /Aya/.test(r.sub)), false, "rien sur le planteur d'un autre agent");
});

test("le reste généré par un autre pisteur reste invisible", () => {
  const d = etat([col("c1", "pis2", 100, { origine: "bord_champ", paye: 80000, reste: 100000 })]);
  assert.equal(buildNotifications(d, SESSION.pisteur).items.some((i) => i.title === "Reste à payer au planteur"), false);
});

test("le patron et le magasinier voient tous les restes", () => {
  const d = etat([
    col("c1", "pis", 100, { origine: "bord_champ", paye: 80000, reste: 100000 }),
    col("c2", "mag", 100, { origine: "magasin", memberId: "m2", paye: 30000, reste: 150000 }),
  ]);
  for (const s of [SESSION.patron, SESSION.magasinier]) {
    const restes = buildNotifications(d, s).items.filter((i) => i.title === "Reste à payer au planteur");
    assert.equal(restes.length, 2, "les deux planteurs concernés");
  }
});

test("le compteur d'actions du pisteur ne compte que ce qui le regarde", () => {
  const d = etat(
    [col("c1", "mag", 100, { origine: "magasin", paye: 30000, reste: 150000 })],
    [{ id: "l1", memberId: "m1", amount: 200000, date: "2026-03-01T09:00:00.000Z", status: "en_attente", soldeRestant: 0 }],
  );
  assert.equal(compte(d, SESSION.pisteur), 0, "ni le reste du magasinier, ni la demande adressée au patron");
  assert.ok(compte(d, SESSION.patron) >= 2);
});
