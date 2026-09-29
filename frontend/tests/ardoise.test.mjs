// L'ARDOISE EN KILOS du pisteur, et le bénéfice d'une expédition usine.
//
// Deux règles de métier, toutes deux nouvelles et toutes deux contre-intuitives
// pour qui lit un bilan comptable :
//
//   1. un MANQUANT ne se rembourse pas en argent, il se rembourse en POIDS ;
//   2. un EXCÉDENT ne va pas dans la caisse, il est versé sur la COMMISSION.
//
// Le mandat est confié pour rapporter un poids équivalent : c'est le poids qui
// fait foi, pas le franc. Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";

const {
  ardoiseKg, pisteurStats, livraisonKey, repartirVerif, beneficeSortie, prixMoyenLivraison, livraisons,
} = await import("../.sync-build/lib.js");

const STAFF = [
  { id: "pat", nom: "Patron", role: "patron" },
  { id: "mag", nom: "Bakary", role: "commis" },
  { id: "pis", nom: "Yao", role: "pisteur" },
];
const MEMBRES = [{ id: "mA", nom: "Planteur A" }, { id: "mB", nom: "Planteur B" }];

const col = (id, kg, livId, jour, extra = {}) => ({
  id, seq: 1, memberId: "mA", byStaffId: "pis", coopId: "co1",
  date: `2026-02-0${jour}T09:00:00.000Z`,
  kg, prixKg: 1000, commissionRate: 25, cropId: "cacao",
  brut: kg * 1000, retenues: [], net: kg * 1000, paye: kg * 1000, reste: 0,
  method: "espece", note: "", origine: "bord_champ",
  saison: "Campagne 2025-2026",
  livraison: { id: livId, date: `2026-02-0${jour}T18:00:00.000Z`, byStaffId: "pis" },
  ...extra,
});

const base = (collections, extra = {}) => ({
  saison: "Campagne 2025-2026", staff: STAFF, members: MEMBRES, collections, sorties: [],
  loans: [], mandats: [], depenses: [], settlements: [], priceHistory: [],
  coop: { nom: "C", momo: [] }, ...extra,
});

/** UNE pesée globale du magasinier, répartie exactement sur le chargement. */
function verifier(data, livId, kgGlobal, jour) {
  const cible = data.collections.filter((c) => livraisonKey(c) === livId);
  const parts = repartirVerif(cible, kgGlobal);
  const quote = new Map(cible.map((c, i) => [c.id, parts[i]]));
  return {
    ...data,
    collections: data.collections.map((c) =>
      quote.has(c.id)
        ? { ...c, verif: { kg: quote.get(c.id), byStaffId: "mag", date: `2026-02-0${jour}T20:00:00.000Z`, note: "" } }
        : c,
    ),
  };
}

/* ------------------------------ le manquant ------------------------------ */

test("un déficit crée une dette en KILOS, et rien d'autre", () => {
  let d = base([col("c1", 1000, "liv-1", 1)]);
  d = verifier(d, "liv-1", 900, 2);

  const a = ardoiseKg(d, "pis");
  assert.equal(a.detteKg, 100, "100 kg payés et jamais reçus : 100 kg dus");
  assert.equal(a.acquisKg, 0);
  assert.equal(a.acquisValeur, 0);
});

test("le manquant n'ampute PLUS la caisse", () => {
  let d = base([col("c1", 1000, "liv-1", 1)], { mandats: [{ id: "m1", pisteurId: "pis", amount: 1_000_000, date: "2026-02-01" }] });
  d = verifier(d, "liv-1", 900, 2);

  const st = pisteurStats("pis", d);
  // 1 000 000 de mandat − 1 000 000 payés au planteur = 0. Le manquant de
  // 100 kg ne s'y ajoute pas : il se rembourse en marchandise.
  assert.equal(st.solde, 0, "la caisse ne dit QUE le mandat non dépensé");
  assert.equal(st.detteKg, 100);
});

/* ------------------------------ l'excédent ------------------------------- */

test("un excédent comble d'abord la dette, le reliquat seul est acquis", () => {
  let d = base([col("c1", 1000, "liv-1", 1), col("c2", 1000, "liv-2", 3)]);
  d = verifier(d, "liv-1", 900, 2);   // déficit 100
  d = verifier(d, "liv-2", 1120, 4);  // excédent 120

  const a = ardoiseKg(d, "pis");
  assert.equal(a.detteKg, 0, "les 100 kg dus sont comblés");
  assert.equal(a.acquisKg, 20, "seuls les 20 kg au-delà de la dette lui restent");
  assert.equal(a.acquisValeur, 20 * 1000);
});

test("l'excédent acquis va dans la COMMISSION, jamais dans la caisse", () => {
  let d = base([col("c1", 1000, "liv-1", 1)], { mandats: [{ id: "m1", pisteurId: "pis", amount: 1_000_000, date: "2026-02-01" }] });
  d = verifier(d, "liv-1", 1050, 2);  // excédent 50 → 50 000 F

  const st = pisteurStats("pis", d);
  assert.equal(st.solde, 0, "la caisse ignore l'excédent");
  // La commission se gagne sur le poids VÉRIFIÉ : les 1 050 kg entrés en
  // magasin, pas les 1 000 déclarés au bord-champ.
  assert.equal(st.commissionBase, 1050 * 25, "commission sur le poids entré en magasin");
  assert.equal(st.commission, 1050 * 25 + 50 * 1000, "l'excédent s'y ajoute");
  assert.equal(st.aVerser, st.commission, "rien d'autre ne lui est dû");
});

test("l'excédent est valorisé au prix FIGÉ, pas au prix courant", () => {
  let d = base([col("c1", 1000, "liv-1", 1, { prixKg: 800 })]);
  d = verifier(d, "liv-1", 1100, 2);
  // Le barème courant de la coopérative ne doit rien y changer.
  d = { ...d, coop: { ...d.coop, prices: { cacao: 2500 } } };

  assert.equal(ardoiseKg(d, "pis").acquisValeur, 100 * 800);
});

test("deux prix figés différents : moyenne pondérée du chargement", () => {
  let d = base([
    col("c1", 1000, "liv-1", 1, { prixKg: 1000 }),
    col("c2", 3000, "liv-1", 1, { prixKg: 2000 }),
  ]);
  const [l] = livraisons(d);
  assert.equal(prixMoyenLivraison(l), (1000 * 1000 + 3000 * 2000) / 4000);

  d = verifier(d, "liv-1", 4100, 2);  // excédent 100
  assert.equal(ardoiseKg(d, "pis").acquisValeur, Math.round(100 * 1750));
});

/* ------------------------------ l'ordre --------------------------------- */

test("un excédent ANTÉRIEUR n'efface pas un déficit postérieur", () => {
  let d = base([col("c1", 1000, "liv-1", 1), col("c2", 1000, "liv-2", 3)]);
  d = verifier(d, "liv-1", 1100, 2);  // excédent 100, acquis
  d = verifier(d, "liv-2", 900, 4);   // déficit 100, né APRÈS

  const a = ardoiseKg(d, "pis");
  assert.equal(a.acquisKg, 100, "l'excédent d'hier lui était déjà acquis");
  assert.equal(a.detteKg, 100, "le déficit d'aujourd'hui reste dû");
});

/* --------------------------- entre campagnes ----------------------------- */

test("la dette en kilos SUIT l'agent d'une campagne à l'autre", () => {
  let d = base([
    col("c1", 1000, "liv-1", 1, { saison: "Campagne 2024-2025" }),
    col("c2", 1000, "liv-2", 3),
  ]);
  d = verifier(d, "liv-1", 900, 2);   // déficit 100, campagne PRÉCÉDENTE
  d = verifier(d, "liv-2", 1050, 4);  // excédent 50, campagne courante

  const a = ardoiseKg(d, "pis");
  assert.equal(a.detteKg, 50, "la dette de l'an dernier est comblée à moitié, pas effacée");
  assert.equal(a.acquisKg, 0, "rien n'est acquis tant que la dette court");
});

test("pisteurStats lit l'ardoise sur l'état COMPLET, pas sur la campagne", () => {
  let d = base([
    col("c1", 1000, "liv-1", 1, { saison: "Campagne 2024-2025" }),
    col("c2", 1000, "liv-2", 3),
  ]);
  d = verifier(d, "liv-1", 900, 2);
  d = verifier(d, "liv-2", 1000, 4);

  const campagne = { ...d, collections: d.collections.filter((c) => c.saison === "Campagne 2025-2026") };
  // Sans l'état complet, la dette de la campagne close disparaîtrait — au
  // bénéfice de l'agent, et sans que personne ne le voie.
  assert.equal(pisteurStats("pis", campagne, d).detteKg, 100);
  assert.equal(pisteurStats("pis", campagne).detteKg, 0, "le piège que le troisième argument évite");
});

/* ------------------------- la caisse et l'avance ------------------------- */

test("caisse négative : il a avancé sa poche, et cela lui est dû avec sa commission", () => {
  let d = base([col("c1", 1000, "liv-1", 1)], { mandats: [{ id: "m1", pisteurId: "pis", amount: 600_000, date: "2026-02-01" }] });
  d = verifier(d, "liv-1", 1020, 2);  // excédent 20 → 20 000 F

  const st = pisteurStats("pis", d);
  assert.equal(st.solde, 600_000 - 1_000_000, "il a payé 1 000 000 avec 600 000 de mandat");
  assert.equal(st.aRendre, 0, "il ne doit rien rendre");
  assert.equal(st.aVerser, st.commission + 400_000, "avance remboursée ET commission");
});

/* ---------------------- le bénéfice d'une expédition --------------------- */

const sortie = (extra = {}) => ({
  id: "s1", coopId: "co1", cropId: "cacao", kg: 1000, type: "expedition",
  date: "2026-03-01", byStaffId: "pat", note: "", ...extra,
});

test("bénéfice = recette usine − (achat + transport + frais de route)", () => {
  const b = beneficeSortie(sortie({ kgUsine: 980, prixUsine: 1500, prixRevient: 1000, transport: 60_000, fraisRoute: 15_000 }));
  assert.equal(b.recette, 980 * 1500);
  assert.equal(b.achat, 1000 * 1000);
  assert.equal(b.cout, 1_000_000 + 60_000 + 15_000);
  assert.equal(b.benefice, 1_470_000 - 1_075_000);
});

test("la freinte est visible : le poids livré n'est pas le poids constaté", () => {
  assert.equal(beneficeSortie(sortie({ kg: 1000, kgUsine: 980 })).freinte, 20);
  assert.equal(beneficeSortie(sortie({ kg: 1000, kgUsine: 1010 })).freinte, -10, "un gain de poids est un nombre négatif, pas zéro");
});

test("une expédition à PERTE affiche un bénéfice négatif, jamais zéro", () => {
  const b = beneficeSortie(sortie({ kgUsine: 900, prixUsine: 900, prixRevient: 1000, transport: 50_000 }));
  assert.ok(b.benefice < 0, "masquer une perte reviendrait à la cacher au patron");
  assert.equal(b.benefice, 810_000 - 1_050_000);
});

test("tant que l'usine n'a pas répondu, l'expédition est marquée non renseignée", () => {
  assert.equal(beneficeSortie(sortie()).renseigne, false);
  assert.equal(beneficeSortie(sortie({ kgUsine: 980, prixUsine: 1500 })).renseigne, true);
});

/* ============ POINT FINANCIER DU PISTEUR — les tests demandés ============= */

test("Test 1 — la commission ne porte QUE sur le poids vérifié", () => {
  // Poids brut 10 300, poids constaté au magasin 10 050, barème 25 F/kg.
  let d = base([col("c1", 10_300, "liv-1", 1)]);
  d = verifier(d, "liv-1", 10_050, 2);
  const st = pisteurStats("pis", d);
  assert.equal(st.commissionBase, 10_050 * 25, "251 250 F, sur le constaté");
  assert.notEqual(st.commissionBase, 10_300 * 25, "jamais sur le brut");
  assert.equal(st.poids, 10_300, "le brut reste lisible, il ne paie pas");
  assert.equal(st.poidsRemis, 10_050);
});

test("Test 1bis — un manquant réduit la commission, un excédent l'augmente", () => {
  // C'est la conséquence directe, et c'est ce qui donne sa portée au constat
  // du magasinier : sans elle, peser ne changerait rien pour personne.
  let manque = base([col("c1", 1000, "liv-1", 1)]);
  manque = verifier(manque, "liv-1", 900, 2);
  assert.equal(pisteurStats("pis", manque).commissionBase, 900 * 25);

  let plus = base([col("c2", 1000, "liv-2", 1)]);
  plus = verifier(plus, "liv-2", 1100, 2);
  assert.equal(pisteurStats("pis", plus).commissionBase, 1100 * 25);
});

test("Test 1ter — tant que le magasin n'a pas pesé, la commission ATTEND", () => {
  const d = base([col("c1", 1000, "liv-1", 1)]);   // livrée, pas vérifiée
  const st = pisteurStats("pis", d);
  assert.equal(st.commissionBase, 0, "rien n'est acquis sans constat");
  assert.equal(st.commissionEnAttente, 1000 * 25, "mais c'est annoncé");
});

test("Test 3 — aucun excédent quand le constaté est inférieur ou égal", () => {
  let egal = base([col("c1", 1000, "liv-1", 1)]);
  egal = verifier(egal, "liv-1", 1000, 2);
  const a = pisteurStats("pis", egal);
  assert.equal(a.acquisKg, 0, "aucun poids + inventé");
  assert.equal(a.poidsPlus, 0);
  assert.equal(a.detteKg, 0);

  let moins = base([col("c2", 1000, "liv-2", 1)]);
  moins = verifier(moins, "liv-2", 940, 2);
  const b = pisteurStats("pis", moins);
  assert.equal(b.acquisKg, 0, "un manquant ne produit pas d'excédent");
  assert.equal(b.detteKg, 60, "il produit une dette en kilos");
});

test("Test 4 — un achat à crédit devient une dette envers le planteur", () => {
  // 500 kg à 1 800 F = 900 000 ; le pisteur verse 600 000 sur-le-champ.
  // Les 300 000 restants sont dus au producteur, pas avancés de sa poche.
  let d = base([col("c1", 500, "liv-1", 1, {
    prixKg: 1800, brut: 900_000, net: 900_000, paye: 600_000, reste: 300_000,
  })]);
  d = verifier(d, "liv-1", 500, 2);
  const st = pisteurStats("pis", d, d);
  assert.equal(st.detteProducteurs, 300_000, "la dette est visible sur SON point financier");
  assert.equal(st.achats, 600_000, "seul l'argent réellement sorti entame le mandat");
});

test("Test 5 — acheter à crédit ne crée AUCUN apport personnel", () => {
  // Mandat 600 000, achat de 900 000 dont 600 000 payés : il a tout dépensé,
  // rien avancé. Le solde est nul, pas négatif.
  let d = base([col("c1", 500, "liv-1", 1, {
    prixKg: 1800, brut: 900_000, net: 900_000, paye: 600_000, reste: 300_000,
  })], { mandats: [{ id: "m1", pisteurId: "pis", amount: 600_000, date: "2026-02-01" }] });
  d = verifier(d, "liv-1", 500, 2);
  const st = pisteurStats("pis", d, d);
  assert.equal(st.solde, 0, "le crédit ne rend pas le solde négatif");
  assert.equal(Math.max(0, -st.solde), 0, "donc aucun montant « avancé de sa poche »");
  assert.equal(st.detteProducteurs, 300_000, "c'est une dette producteur, et rien d'autre");
});

test("Test 5bis — l'écran ne parle plus de poche ni d'argent personnel", () => {
  // Règle de vocabulaire, vérifiée sur la source : le modèle métier dit que le
  // pisteur n'engage pas son argent, l'interface ne doit donc plus l'affirmer.
  // On ne regarde que ce qui ATTEINT l'écran : les commentaires ont le droit
  // d'expliquer la règle en la nommant, et le test ne doit pas interdire de
  // documenter ce qu'il fait respecter.
  const sansCommentaires = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  for (const f of ["src/coop/screens.tsx", "src/coop/sheets.tsx"]) {
    const texte = sansCommentaires(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    assert.ok(!/de sa poche|de votre poche|[Aa]rgent personnel/.test(texte),
      `« ${f} » affiche encore « poche » ou « argent personnel »`);
  }
});

test("Test 6 — la règle reste générique quel que soit le produit", () => {
  // Le barème est FIGÉ par collecte (invariant 6) : deux produits, deux taux,
  // et la commission suit chacun sur son propre poids vérifié.
  let d = base([
    col("cacao", 1000, "liv-1", 1, { cropId: "cacao", prixKg: 1800, commissionRate: 25 }),
    col("anac", 2000, "liv-2", 1, { cropId: "anacarde", prixKg: 900, commissionRate: 15 }),
  ]);
  d = verifier(d, "liv-1", 1010, 2);
  d = verifier(d, "liv-2", 1980, 2);
  const st = pisteurStats("pis", d);
  assert.equal(st.commissionBase, 1010 * 25 + 1980 * 15, "chaque produit à son taux figé");
});
