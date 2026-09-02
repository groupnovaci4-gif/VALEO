// Corrections métier : origine des poids, vérification magasin, avances.
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const {
  migrate, stockStats, origineOf, estBordChamp, estVerifiee, kgEnStock,
  ecartVerif, aVerifier, restesAgent, resteAgentTotal, avancesInfo, memberCultures,
} = await import("../.sync-build/lib.js");
const { prepareSync } = await import("../.sync-build/sync.js");

const STAFF = [
  { id: "pat", nom: "Patron", role: "patron" },
  { id: "mag", nom: "Bakary", role: "commis" },
  { id: "pis", nom: "Yao", role: "pisteur" },
];

const col = (id, byStaffId, kg, extra = {}) => ({
  id, seq: 1, memberId: "m1", byStaffId, date: "2026-02-01T09:00:00.000Z",
  kg, prixKg: 1800, cropId: "cacao", brut: kg * 1800, retenues: [], net: kg * 1800,
  paye: kg * 1800, reste: 0, method: "espece", note: "", ...extra,
});
// Collecte bord-champ d'un pisteur : `addCollection` fige toujours l'origine.
const colPisteur = (id, kg, extra = {}) => col(id, "pis", kg, { origine: "bord_champ", ...extra });
const colMagasin = (id, byStaffId, kg, extra = {}) => col(id, byStaffId, kg, { origine: "magasin", ...extra });

const base = (collections, sorties = []) => ({
  saison: "Campagne 2025-2026", staff: STAFF, members: [], collections, sorties,
  loans: [], mandats: [], depenses: [], settlements: [], priceHistory: [], coop: { nom: "C", momo: [] },
});

/* ---------------- RÉGRESSION : demande d'avance du planteur --------------- */

test("migrate n'ajoute pas de cultures à une fiche qui n'en a pas", () => {
  // C'est CE point qui cassait la demande d'avance : `prepareSync` renvoie
  // toutes les lignes, le serveur voyait `cultures` apparaître sur la fiche du
  // planteur — un champ qu'il n'a pas le droit de modifier — et refusait tout
  // le PUT (403), avance comprise.
  const serveur = { members: [{ id: "m1", code: "VAL-1000-AA", nom: "Kouassi", village: "Gomon", momo: null, photo: null }] };
  const local = migrate(JSON.parse(JSON.stringify(serveur)));
  assert.equal("cultures" in local.members[0], false, "aucun champ inventé sur la fiche");
});

test("recharger l'état du serveur ne produit aucune modification à renvoyer", () => {
  // `coops` renseigné, comme dans toute réponse du serveur : sans lui, migrate
  // fabrique une coopérative héritée avec un identifiant aléatoire, donc non
  // reproductible d'un appel à l'autre.
  const serveur = {
    coops: [{ id: "co1", nom: "Coop", momo: [], filieres: [] }],
    members: [{ id: "m1", coopId: "co1", code: "VAL-1000-AA", nom: "Kouassi", village: "Gomon", momo: null, photo: null }],
    collections: [], loans: [], staff: [], mandats: [], depenses: [], settlements: [], sorties: [],
  };
  const reference = migrate(JSON.parse(JSON.stringify(serveur)));
  const local = migrate(JSON.parse(JSON.stringify(serveur)));
  // Le planteur crée sa demande d'avance, et rien d'autre.
  local.loans.push({ id: "ln1", memberId: "m1", type: "argent", amount: 25000, motif: "Santé", date: "2026-03-01T09:00:00.000Z", status: "en_attente", soldeRestant: 0, decidedBy: null });
  const { data } = prepareSync(local, reference);
  assert.equal(data.members[0].updatedAt, undefined, "la fiche planteur ne doit PAS être marquée modifiée");
  assert.ok(data.loans[0].updatedAt, "seule la demande d'avance est horodatée");
});

test("les cultures restent dérivées à la lecture", () => {
  assert.deepEqual(memberCultures({ cropId: "cafe", superficie: 4 }), [{ cropId: "cafe", superficie: 4 }]);
  assert.deepEqual(memberCultures({}), []);
});

/* -------------------------- Origine du poids ------------------------------ */

test("une collecte antérieure à la vérification reste comptée en magasin", () => {
  // Aucune collecte existante ne doit être perdue : sans le champ `origine`,
  // la livraison a déjà eu lieu à l'époque. La déduire du rôle du pisteur
  // ferait chuter le stock du magasin et créerait une file d'attente fictive
  // pour des livraisons faites depuis longtemps.
  const d = base([col("c1", "pis", 100), col("c2", "mag", 50), col("c3", "pat", 30)]);
  assert.equal(origineOf(d.collections[0], d), "magasin");
  assert.equal(estBordChamp(d.collections[0], d), false);
  assert.deepEqual(aVerifier(d), [], "aucune file d'attente rétroactive");
  assert.equal(stockStats(d, { scope: "all" }).stock, 180, "le stock existant est préservé");
});

test("l'origine figée sur la collecte fait foi", () => {
  const d = base([col("c1", "pis", 100, { origine: "bord_champ" }), col("c2", "pis", 50, { origine: "magasin" })]);
  assert.equal(estBordChamp(d.collections[0], d), true);
  assert.equal(estBordChamp(d.collections[1], d), false);
});

/* --------------------- Stock = vérifié, jamais déclaré -------------------- */

test("le stock du magasin n'intègre que le poids vérifié", () => {
  // L'exemple de la règle métier : 500 patron + 300 magasinier + 1000 déclarés
  // par le pisteur, vérifiés à 980.
  const d = base([
    colMagasin("c1", "pat", 500),
    colMagasin("c2", "mag", 300),
    colPisteur("c3", 1000, { verif: { kg: 980, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } }),
  ]);
  assert.equal(stockStats(d, { scope: "all" }).stock, 1780);
});

test("un poids déclaré non vérifié n'entre pas en stock", () => {
  const d = base([colMagasin("c1", "pat", 500), colPisteur("c2", 1000)]);
  const st = stockStats(d, { scope: "all" });
  assert.equal(st.stock, 500, "les 1000 kg annoncés ne sont pas encore en magasin");
  assert.equal(st.attente, 1000, "mais le magasinier sait ce qui l'attend");
});

test("la vérification transfère le poids du pisteur vers le magasin", () => {
  const avant = base([colPisteur("c1", 1000)]);
  assert.equal(stockStats(avant, { scope: "mine", staffId: "pis" }).stock, 1000, "encore dans son véhicule");
  assert.equal(stockStats(avant, { scope: "all" }).stock, 0);

  const apres = base([colPisteur("c1", 1000, { verif: { kg: 980, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } })]);
  assert.equal(stockStats(apres, { scope: "mine", staffId: "pis" }).stock, 0, "remis au magasin");
  assert.equal(stockStats(apres, { scope: "all" }).stock, 980);
});

test("les sorties continuent de retrancher du stock", () => {
  const d = base(
    [colMagasin("c1", "mag", 1000)],
    [{ id: "s1", cropId: "cacao", kg: 400, type: "expedition", date: "2026-02-03T09:00:00.000Z", byStaffId: "mag", note: "" }],
  );
  assert.equal(stockStats(d, { scope: "all" }).stock, 600);
});

test("l'écart de vérification reste lisible", () => {
  const c = colPisteur("c1", 1000, { verif: { kg: 980, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } });
  assert.equal(ecartVerif(c), -20);
  assert.equal(estVerifiee(c), true);
  assert.equal(kgEnStock(c, base([c])), 980);
  assert.equal(ecartVerif(colPisteur("c2", 1000)), 0, "pas d'écart tant qu'il n'y a pas de vérification");
});

test("la file de vérification liste les collectes bord-champ en attente", () => {
  const d = base([
    colPisteur("c1", 1000),
    colPisteur("c2", 500, { verif: { kg: 500, byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } }),
    colMagasin("c3", "mag", 300),
  ]);
  assert.deepEqual(aVerifier(d).map((c) => c.id), ["c1"]);
  assert.deepEqual(aVerifier(d, "pis").map((c) => c.id), ["c1"]);
  assert.deepEqual(aVerifier(d, "mag"), []);
});

/* --------------------- Restes dus : cloisonnés par agent ------------------ */

test("un pisteur ne voit que les restes dus qu'il a lui-même générés", () => {
  const d = base([
    colPisteur("c1", 100, { paye: 80000, reste: 100000 }),
    colMagasin("c2", "mag", 100, { paye: 30000, reste: 150000 }),
  ]);
  assert.deepEqual(restesAgent(d, "pis").map((c) => c.id), ["c1"]);
  assert.equal(resteAgentTotal(d, "pis", "m1"), 100000);
  assert.equal(resteAgentTotal(d, "mag", "m1"), 150000);
});

test("un reste déjà soldé disparaît de la liste de l'agent", () => {
  const d = base([colPisteur("c1", 100, { paye: 80000, reste: 100000, resteSolde: 100000 })]);
  assert.deepEqual(restesAgent(d, "pis"), []);
});

/* ------------------------- Situation des avances -------------------------- */

test("la situation des avances éclaire la décision du pisteur", () => {
  const d = base([]);
  d.loans = [
    { id: "l1", memberId: "m1", amount: 50000, status: "approuve", soldeRestant: 20000, date: "2026-01-05T09:00:00.000Z" },
    { id: "l2", memberId: "m1", amount: 30000, status: "en_attente", soldeRestant: 0, date: "2026-02-05T09:00:00.000Z" },
    { id: "l3", memberId: "m1", amount: 10000, status: "rembourse", soldeRestant: 0, date: "2025-12-05T09:00:00.000Z" },
    { id: "l4", memberId: "m1", amount: 99000, status: "refuse", soldeRestant: 0, date: "2026-01-01T09:00:00.000Z" },
    { id: "l5", memberId: "m2", amount: 77000, status: "approuve", soldeRestant: 77000, date: "2026-01-01T09:00:00.000Z" },
  ];
  const info = avancesInfo("m1", d);
  assert.equal(info.reste, 20000, "reste à rembourser");
  assert.equal(info.attente, 30000, "demande déjà soumise au patron");
  assert.equal(info.accorde, 60000, "approuvées + remboursées");
  assert.equal(info.nbRembourse, 1);
  assert.equal(info.list.length, 4, "les avances d'un autre planteur ne comptent pas");
});

test("les dettes ne sont pas cloisonnées par campagne", () => {
  const d = base([]);
  d.saison = "Campagne 2026-2027";
  d.loans = [{ id: "l1", memberId: "m1", amount: 50000, status: "approuve", soldeRestant: 50000, saison: "Campagne 2025-2026", date: "2025-11-05T09:00:00.000Z" }];
  assert.equal(avancesInfo("m1", d).reste, 50000, "une dette suit le planteur d'une campagne à l'autre");
});
