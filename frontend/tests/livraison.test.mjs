// Vérification GLOBALE d'une livraison : le magasinier pèse le chargement en
// une fois, plus planteur par planteur. Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const {
  livraisons, livraisonKey, repartirVerif, stockStats, pisteurStats,
  manquantVerif, poidsPlusVerif, estVerifiee, aVerifier,
} = await import("../.sync-build/lib.js");

const STAFF = [
  { id: "pat", nom: "Patron", role: "patron" },
  { id: "mag", nom: "Bakary", role: "commis" },
  { id: "pis", nom: "Yao", role: "pisteur" },
  { id: "pis2", nom: "Konan", role: "pisteur" },
];
const MEMBRES = [
  { id: "mA", nom: "Planteur A" }, { id: "mB", nom: "Planteur B" }, { id: "mC", nom: "Planteur C" },
];

const col = (id, memberId, kg, byStaffId, livId, extra = {}) => ({
  id, seq: 1, memberId, byStaffId, coopId: "co1", date: "2026-02-01T09:00:00.000Z",
  kg, prixKg: 1800, commissionRate: 25, cropId: "cacao", brut: kg * 1800, retenues: [],
  net: kg * 1800, paye: kg * 1800, reste: 0, method: "espece", note: "", origine: "bord_champ",
  livraison: { id: livId, date: "2026-02-02T08:00:00.000Z", byStaffId },
  ...extra,
});

const base = (collections, sorties = []) => ({
  saison: "Campagne 2025-2026", staff: STAFF, members: MEMBRES, collections, sorties,
  loans: [], mandats: [], depenses: [], settlements: [], priceHistory: [], coop: { nom: "C", momo: [] },
});

/** Ce que fait `verifyLivraison` du store : UNE pesée, répartie exactement. */
function verifier(data, livId, kgGlobal, byStaffId = "mag", note = "") {
  const cible = data.collections.filter((c) => livraisonKey(c) === livId);
  const parts = repartirVerif(cible, kgGlobal);
  const quote = new Map(cible.map((c, i) => [c.id, parts[i]]));
  return {
    ...data,
    collections: data.collections.map((c) =>
      quote.has(c.id) ? { ...c, verif: { kg: quote.get(c.id), byStaffId, date: "2026-02-02T10:00:00.000Z", note } } : c,
    ),
  };
}

// Le chargement de l'exemple : 850 + 1 200 + 1 500 = 3 550 kg.
const CHARGEMENT = () => base([
  col("cA", "mA", 850, "pis", "liv-1"),
  col("cB", "mB", 1200, "pis", "liv-1"),
  col("cC", "mC", 1500, "pis", "liv-1"),
]);

/* ------------------------- Test 1 — plusieurs planteurs ------------------- */

test("Test 1 — 850 + 1 200 + 1 500 donne 3 550 kg déclarés, vérifiés 3 520 → déficit 30", () => {
  const d = CHARGEMENT();
  const [avant] = livraisons(d);
  assert.equal(avant.kgDeclare, 3550, "le poids déclaré global est la somme des pesées du pisteur");
  assert.equal(avant.collections.length, 3);
  assert.equal(avant.verifiee, false);

  const apres = verifier(d, "liv-1", 3520);
  const [l] = livraisons(apres);
  assert.equal(l.kgDeclare, 3550);
  assert.equal(l.kgVerifie, 3520);
  assert.equal(l.ecart, -30);
  assert.equal(l.deficit, 30);
  assert.equal(l.excedent, 0);
  assert.equal(l.verifiee, true);
});

test("une seule opération de vérification pour tout le chargement", () => {
  // Trois planteurs, mais UNE ligne dans la file du magasinier.
  const d = CHARGEMENT();
  assert.equal(livraisons(d, { statut: "en_attente" }).length, 1);
  const apres = verifier(d, "liv-1", 3520);
  assert.equal(livraisons(apres, { statut: "en_attente" }).length, 0, "la file se vide d'un coup");
  assert.equal(aVerifier(apres).length, 0, "plus aucune collecte en attente");
});

/* ---------------------------- Test 2 — excédent --------------------------- */

test("Test 2 — vérifié 3 580 sur 3 550 déclarés → excédent de 30 kg", () => {
  const [l] = livraisons(verifier(CHARGEMENT(), "liv-1", 3580));
  assert.equal(l.ecart, 30);
  assert.equal(l.excedent, 30);
  assert.equal(l.deficit, 0);
});

/* --------------------------- Test 3 — aucun écart ------------------------- */

test("Test 3 — vérifié 3 550 sur 3 550 déclarés → écart nul", () => {
  const [l] = livraisons(verifier(CHARGEMENT(), "liv-1", 3550));
  assert.equal(l.ecart, 0);
  assert.equal(l.deficit, 0);
  assert.equal(l.excedent, 0);
});

/* ---------------------------- Test 4 — le stock --------------------------- */

test("Test 4 — seul le poids vérifié global entre en stock", () => {
  const d = CHARGEMENT();
  // Avant vérification : rien. La marchandise est encore dans le véhicule.
  assert.equal(stockStats(d, { scope: "all" }).stock, 0);
  assert.equal(stockStats(d, { scope: "all" }).attente, 3550, "annoncée, jamais comptée");

  const apres = verifier(d, "liv-1", 3520);
  const st = stockStats(apres, { scope: "all" });
  assert.equal(st.entrees, 3520, "le poids constaté, pas le déclaré");
  assert.equal(st.stock, 3520);
  assert.notEqual(st.stock, 3550, "jamais le poids déclaré");
  assert.notEqual(st.stock, 7070, "jamais la somme du déclaré ET du vérifié");
  assert.equal(st.attente, 0);
});

test("le stock d'une livraison vérifiée reste juste après une sortie", () => {
  const d = verifier(CHARGEMENT(), "liv-1", 3520);
  d.sorties = [{ id: "so1", type: "vente", cropId: "cacao", kg: 500, byStaffId: "mag", date: "2026-02-03T09:00:00.000Z" }];
  assert.equal(stockStats(d, { scope: "all" }).stock, 3020);
});

test("la répartition est exacte au kilo près, quels que soient les poids", () => {
  // Sans correction du résidu, le stock différerait du poids réellement pesé.
  for (const global of [3520, 3550, 3580, 3333, 1, 0]) {
    const parts = repartirVerif(CHARGEMENT().collections, global);
    const somme = Math.round(parts.reduce((s, x) => s + x, 0) * 1000) / 1000;
    assert.equal(somme, global, `répartition de ${global} kg`);
  }
});

/* -------------------------- Test 5 — traçabilité -------------------------- */

test("Test 5 — les poids individuels des planteurs restent conservés", () => {
  const apres = verifier(CHARGEMENT(), "liv-1", 3520);
  const [l] = livraisons(apres);
  const parPlanteur = Object.fromEntries(l.collections.map((c) => [c.memberId, c.kg]));
  assert.deepEqual(parPlanteur, { mA: 850, mB: 1200, mC: 1500 }, "les pesées d'origine ne bougent pas");
  // Et le montant réglé au bord-champ n'est pas rouvert.
  assert.equal(l.collections.every((c) => c.paye === c.kg * 1800), true);
});

test("le détail reste rattaché au pisteur et à la livraison", () => {
  const [l] = livraisons(verifier(CHARGEMENT(), "liv-1", 3520));
  assert.equal(l.byStaffId, "pis");
  assert.equal(l.id, "liv-1");
  assert.equal(l.verifPar, "mag");
  assert.equal(l.verifDate, "2026-02-02T10:00:00.000Z");
  assert.equal(l.collections.every((c) => c.livraison.id === "liv-1"), true);
});

/* ------------------- Test 6 — l'historique ne disparaît pas --------------- */

test("Test 6 — la livraison vérifiée reste consultable", () => {
  const apres = verifier(CHARGEMENT(), "liv-1", 3520, "mag", "Humidité");
  const hist = livraisons(apres, { statut: "verifiee" });
  assert.equal(hist.length, 1, "elle ne disparaît pas une fois le poids en stock");
  const [l] = hist;
  assert.equal(l.byStaffId, "pis");            // quel pisteur
  assert.equal(l.date, "2026-02-02T08:00:00.000Z"); // quand
  assert.equal(l.kgDeclare, 3550);             // déclaré
  assert.equal(l.kgVerifie, 3520);             // vérifié
  assert.equal(l.deficit, 30);                 // écart
  assert.equal(l.note, "Humidité");
  assert.equal(l.collections.length, 3);       // détail des planteurs
});

/* --------------------- Test 7 — plusieurs pisteurs ------------------------ */

test("Test 7 — les livraisons de deux pisteurs restent distinctes", () => {
  const d = base([
    col("cA", "mA", 850, "pis", "liv-1"),
    col("cB", "mB", 1200, "pis", "liv-1"),
    col("cX", "mC", 600, "pis2", "liv-2"),
  ]);
  const toutes = livraisons(d);
  assert.equal(toutes.length, 2);
  const parAgent = Object.fromEntries(toutes.map((l) => [l.byStaffId, l.kgDeclare]));
  assert.deepEqual(parAgent, { pis: 2050, pis2: 600 });
  assert.equal(livraisons(d, { staffId: "pis" }).length, 1);
  assert.equal(livraisons(d, { staffId: "pis2" })[0].kgDeclare, 600);
});

test("vérifier la livraison d'un pisteur ne touche pas celle de l'autre", () => {
  const d = base([
    col("cA", "mA", 850, "pis", "liv-1"),
    col("cX", "mC", 600, "pis2", "liv-2"),
  ]);
  const apres = verifier(d, "liv-1", 800);
  assert.equal(livraisons(apres, { staffId: "pis" })[0].verifiee, true);
  assert.equal(livraisons(apres, { staffId: "pis2" })[0].verifiee, false);
  assert.equal(stockStats(apres, { scope: "all" }).stock, 800, "seule la livraison vérifiée entre en stock");
});

/* ------------- L'écart global se règle sur la caisse du pisteur ----------- */

test("le déficit global est imputé à la caisse du pisteur, au prix figé", () => {
  // 30 kg manquants × 1 800 F = 54 000 F, quelle que soit la répartition.
  const d = verifier(CHARGEMENT(), "liv-1", 3520);
  d.mandats = [{ id: "m1", pisteurId: "pis", amount: 10000000, date: "2026-02-01T08:00:00.000Z", note: "" }];
  const st = pisteurStats("pis", d);
  assert.equal(st.manquant, 54000);
  assert.equal(st.poidsPlus, 0);
  assert.equal(st.poidsRemis, 3520);
  assert.equal(st.solde, 10000000 - 3550 * 1800 - 54000);
});

test("l'excédent global revient au pisteur, au prix figé", () => {
  const d = verifier(CHARGEMENT(), "liv-1", 3580);
  d.mandats = [{ id: "m1", pisteurId: "pis", amount: 10000000, date: "2026-02-01T08:00:00.000Z", note: "" }];
  const st = pisteurStats("pis", d);
  assert.equal(st.poidsPlus, 54000, "30 kg × 1 800");
  assert.equal(st.manquant, 0);
  assert.equal(st.solde, 10000000 - 3550 * 1800 + 54000);
});

test("l'écart est valorisé au prix moyen pondéré quand les prix diffèrent", () => {
  // Deux produits au même chargement : 100 kg à 1 800 et 100 kg à 800.
  // Prix moyen pondéré = 1 300. Un déficit de 10 kg vaut donc 13 000 F.
  const d = base([
    col("c1", "mA", 100, "pis", "liv-1"),
    col("c2", "mB", 100, "pis", "liv-1", { prixKg: 800, cropId: "hevea", net: 80000, paye: 80000, brut: 80000 }),
  ]);
  const apres = verifier(d, "liv-1", 190);
  const st = pisteurStats("pis", apres);
  assert.equal(livraisons(apres)[0].deficit, 10);
  assert.equal(st.manquant, 13000);
});

/* ---------------- Régression : les livraisons anciennes ------------------- */

test("une livraison antérieure, sans identifiant, reste groupée et lisible", () => {
  // Les enregistrements d'avant portent `{date, byStaffId}` sans `id` : on
  // retombe sur « agent + horodatage », qui les regroupe correctement.
  const vieux = (id, memberId, kg) => ({
    ...col(id, memberId, kg, "pis", undefined),
    livraison: { date: "2026-01-15T08:00:00.000Z", byStaffId: "pis" },
  });
  const d = base([vieux("v1", "mA", 500), vieux("v2", "mB", 300)]);
  const [l] = livraisons(d);
  assert.equal(l.kgDeclare, 800);
  assert.equal(l.collections.length, 2, "regroupées malgré l'absence d'identifiant");
});

test("une pesée au magasin n'est jamais une livraison", () => {
  const d = base([{ ...col("c1", "mA", 300, "mag", "liv-x"), origine: "magasin", livraison: null }]);
  assert.equal(livraisons(d).length, 0);
  assert.equal(stockStats(d, { scope: "all" }).stock, 300, "elle entre directement en stock");
});

/* ------------ L'argent tombe juste : pas de franc perdu ------------------- */

test("le manquant total vaut exactement l'écart global au prix figé", () => {
  // Les montants sont sommés collecte par collecte : si la répartition n'était
  // pas en kilos entiers, la somme des arrondis s'écartait de quelques francs
  // du montant réel de l'écart.
  for (const [global, ecart] of [[3520, 30], [3000, 550], [3549, 1], [1, 3549]]) {
    const d = verifier(CHARGEMENT(), "liv-1", global);
    const st = pisteurStats("pis", d);
    assert.equal(st.manquant, ecart * 1800, `déficit de ${ecart} kg`);
    assert.equal(st.poidsPlus, 0);
  }
});

test("le poids plus total vaut exactement l'excédent global", () => {
  for (const [global, ecart] of [[3580, 30], [4000, 450], [3551, 1]]) {
    const st = pisteurStats("pis", verifier(CHARGEMENT(), "liv-1", global));
    assert.equal(st.poidsPlus, ecart * 1800, `excédent de ${ecart} kg`);
    assert.equal(st.manquant, 0);
  }
});

/* ------- Régression : livraison à MOITIÉ vérifiée (données anciennes) ----- */

test("une livraison déjà vérifiée en partie ne reste pas bloquée", () => {
  // Avant la vérification globale, le magasinier validait collecte par
  // collecte : il pouvait s'arrêter en cours de route. Ces chargements
  // existent donc déjà. Sans traitement, le groupe restait « en attente » et
  // `verifyLivraison` le refusait — invérifiable pour toujours.
  const d = CHARGEMENT();
  d.collections[0] = { ...d.collections[0], verif: { kg: 840, byStaffId: "mag", date: "2026-02-02T09:00:00.000Z" } };

  const [l] = livraisons(d, { statut: "en_attente" });
  assert.ok(l, "elle reste dans la file du magasinier");
  assert.equal(l.verifiee, false);
  assert.equal(l.enAttente.length, 2, "seules les deux non vérifiées restent à peser");
  assert.equal(l.kgEnAttente, 1200 + 1500, "et c'est ce poids-là qu'il doit peser");
  assert.equal(l.kgDeclare, 3550, "le total déclaré du chargement ne change pas");
  assert.equal(l.kgVerifie, 840, "ce qui est déjà vérifié reste compté");

  // Le magasinier pèse le reste : la livraison se referme.
  const parts = repartirVerif(l.enAttente, 2680);
  const quote = new Map(l.enAttente.map((c, i) => [c.id, parts[i]]));
  const fini = {
    ...d,
    collections: d.collections.map((c) =>
      quote.has(c.id) ? { ...c, verif: { kg: quote.get(c.id), byStaffId: "mag", date: "2026-02-02T10:00:00.000Z" } } : c,
    ),
  };
  const [apres] = livraisons(fini);
  assert.equal(apres.verifiee, true);
  assert.equal(apres.kgVerifie, 840 + 2680);
  assert.equal(livraisons(fini, { statut: "en_attente" }).length, 0, "la file se vide");
  assert.equal(stockStats(fini, { scope: "all" }).stock, 3520, "et le stock vaut la somme réellement pesée");
});

test("une livraison entièrement neuve met tout en attente", () => {
  const [l] = livraisons(CHARGEMENT(), { statut: "en_attente" });
  assert.equal(l.enAttente.length, 3);
  assert.equal(l.kgEnAttente, 3550);
  assert.equal(l.kgVerifie, 0);
});
