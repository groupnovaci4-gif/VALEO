// COMPTABILITÉ : le scénario complet, de l'enveloppe au règlement.
//
// Tout ce qui est vérifié ici est DÉRIVÉ des écritures métier existantes.
// Aucun solde n'est stocké : un montant recopié quelque part finit toujours
// par mentir, et le jour où les deux chiffres divergent, personne ne sait
// lequel croire.
//
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const {
  situationAgent, dettesAgents, tresorerie, journalFinancier, alertesFin,
  livraisonKey, repartirVerif,
} = await import("../.sync-build/lib.js");

const SAISON = "Campagne 2026-2027";

const STAFF = [
  { id: "pat", nom: "Patron", role: "patron" },
  { id: "mag", nom: "Bakary", role: "commis" },
  { id: "pis", nom: "Jean", role: "pisteur" },
  { id: "cpt", nom: "Aminata", role: "comptable" },
];

const col = (id, kg, paye, livId, jour, extra = {}) => ({
  id, seq: 1, memberId: "mA", byStaffId: "pis", coopId: "co1", saison: SAISON,
  date: `2026-10-0${jour}T09:00:00.000Z`,
  kg, prixKg: 1000, commissionRate: 25, cropId: "cacao",
  brut: kg * 1000, retenues: [], net: kg * 1000, paye, reste: kg * 1000 - paye,
  method: "espece", note: "", origine: "bord_champ",
  ...(livId ? { livraison: { id: livId, date: `2026-10-0${jour}T18:00:00.000Z`, byStaffId: "pis" } } : {}),
  ...extra,
});

const base = (extra = {}) => ({
  saison: SAISON, staff: STAFF, members: [{ id: "mA", nom: "Kouassi" }],
  collections: [], sorties: [], loans: [], mandats: [], depenses: [],
  settlements: [], budgets: [], reglements: [], priceHistory: [],
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
        ? { ...c, verif: { kg: quote.get(c.id), byStaffId: "mag", date: `2026-10-0${jour}T20:00:00.000Z`, note: "" } }
        : c),
  };
}

/* ===================== LE SCÉNARIO COMPLET (§20) ========================= */

/** État après les étapes 1 à 12 du scénario imposé. */
function scenario() {
  let d = base();

  // 1. Le comptable crée une enveloppe de 10 000 000.
  d.budgets = [{
    id: "b1", coopId: "co1", saison: SAISON, libelle: "Campagne cacao",
    montant: 10_000_000, debut: "2026-10-01", fin: "2026-12-31",
    note: "", byStaffId: "cpt", date: "2026-10-01T08:00:00.000Z",
  }];

  // 2. Il attribue 2 000 000 au pisteur Jean.
  d.mandats = [{
    id: "m1", coopId: "co1", saison: SAISON, pisteurId: "pis",
    amount: 2_000_000, date: "2026-10-02T08:00:00.000Z", note: "",
  }];

  // 3. Jean achète pour 1 900 000 (1 900 kg à 1 000 F).
  d.collections = [col("c1", 1900, 1_900_000, "liv-1", 3)];

  // 4-5. Le magasin réceptionne 1 920 kg : 20 kg d'excédent.
  d = verifier(d, "liv-1", 1920, 4);

  // 8. Puis il achète 300 000 alors qu'il ne lui reste que 100 000.
  d.collections = [...d.collections, col("c2", 300, 300_000, null, 5)];

  // 11. Le comptable enregistre une dépense de transport.
  d.depenses = [{
    id: "d1", coopId: "co1", saison: SAISON, pisteurId: "cpt",
    category: "Transport", amount: 75_000, date: "2026-11-01T08:00:00.000Z",
    note: "Camion Abidjan", beneficiaire: "Transporteur Koné", mode: "espece",
  }];
  return d;
}

test("6-7. l'excédent de poids est valorisé et versé au pisteur, automatiquement", () => {
  const s = situationAgent(scenario(), "pis");
  // 20 kg × 1 000 F, au prix FIGÉ sur la collecte.
  assert.equal(s.gainExcedent, 20_000, "aucune saisie humaine : c'est calculé");
  assert.equal(s.detteKg, 0);
});

test("9-10. le dépassement du mandat devient une dette de la coopérative", () => {
  const s = situationAgent(scenario(), "pis");
  // Mandat 2 000 000, achats 1 900 000 + 300 000 = 2 200 000.
  assert.equal(s.avancePerso, 200_000, "il a mis 200 000 de sa poche");
  assert.equal(s.aRendre, 0, "il ne doit rien rendre");
});

test("la situation du pisteur se décompose en trois lignes lisibles", () => {
  const s = situationAgent(scenario(), "pis");
  assert.equal(s.commission, (1900 + 300) * 25, "55 000 de commission");
  assert.equal(s.gainExcedent, 20_000);
  assert.equal(s.avancePerso, 200_000);
  assert.equal(s.totalDu, 275_000, "et leur somme, sans rien mélanger");
  assert.equal(s.statut, "a_payer");
});

test("12. la dépense diminue bien la trésorerie", () => {
  const d = scenario();
  const avec = tresorerie(d);
  const sans = tresorerie({ ...d, depenses: [] });
  assert.equal(avec.depenses, 75_000);
  assert.equal(sans.disponible - avec.disponible, 75_000);
});

test("13-14. comptable et patron lisent EXACTEMENT les mêmes chiffres", () => {
  // Une seule source de vérité : la fonction ne connaît pas le lecteur.
  const d = scenario();
  const t = tresorerie(d);
  assert.equal(t.enveloppe, 10_000_000);
  assert.equal(t.attribue, 2_000_000);
  assert.equal(t.nonAttribue, 8_000_000);
  assert.equal(t.duAgents, 275_000);
  assert.equal(t.disponible, 10_000_000 - 2_000_000 - 75_000 - 275_000);
  assert.equal(t.disponible, 7_650_000);
});

test("15-16. le règlement fait passer la dette de « à payer » à « payé »", () => {
  const d = scenario();
  assert.equal(situationAgent(d, "pis").statut, "a_payer");

  const partiel = { ...d, reglements: [{
    id: "r1", coopId: "co1", saison: SAISON, staffId: "pis", amount: 100_000,
    date: "2026-11-05T08:00:00.000Z", byStaffId: "cpt", method: "espece", note: "",
  }] };
  const sp = situationAgent(partiel, "pis");
  assert.equal(sp.statut, "partiel");
  assert.equal(sp.reste, 175_000);

  const solde = { ...d, reglements: [...partiel.reglements, {
    id: "r2", coopId: "co1", saison: SAISON, staffId: "pis", amount: 175_000,
    date: "2026-11-06T08:00:00.000Z", byStaffId: "cpt", method: "espece", note: "",
  }] };
  const ss = situationAgent(solde, "pis");
  assert.equal(ss.statut, "paye");
  assert.equal(ss.reste, 0);
  assert.equal(tresorerie(solde).duAgents, 0, "la trésorerie suit");
});

test("un trop-versé s'affiche en négatif, il ne se masque pas", () => {
  const d = { ...scenario(), reglements: [{
    id: "r1", coopId: "co1", saison: SAISON, staffId: "pis", amount: 400_000,
    date: "2026-11-05T08:00:00.000Z", byStaffId: "cpt", method: "espece", note: "",
  }] };
  // Borner à zéro cacherait une erreur de caisse — même raison qu'un stock
  // négatif reste affiché.
  assert.equal(situationAgent(d, "pis").reste, -125_000);
});

test("17. le journal conserve toutes les opérations, du plus récent au plus ancien", () => {
  const d = { ...scenario(), reglements: [{
    id: "r1", coopId: "co1", saison: SAISON, staffId: "pis", amount: 275_000,
    date: "2026-11-05T08:00:00.000Z", byStaffId: "cpt", method: "espece", note: "",
  }] };
  const j = journalFinancier(d);
  const types = j.map((x) => x.type);
  for (const attendu of ["BUDGET", "MANDAT", "ACHAT", "DEPENSE", "REGLEMENT"])
    assert.ok(types.includes(attendu), `le journal doit porter ${attendu}`);
  assert.equal(j.filter((x) => x.type === "ACHAT").length, 2, "les deux achats");
  for (let i = 1; i < j.length; i++)
    assert.ok(j[i - 1].date >= j[i].date, "trié du plus récent au plus ancien");
  // Le sens de chaque montant : ce qui sort est négatif.
  assert.ok(j.find((x) => x.type === "BUDGET").montant > 0);
  assert.ok(j.find((x) => x.type === "DEPENSE").montant < 0);
  assert.ok(j.find((x) => x.type === "REGLEMENT").montant < 0);
});

/* ========================= RÈGLES DE PÉRIMÈTRE =========================== */

test("les frais PERSONNELS d'un pisteur n'entrent pas dans la trésorerie", () => {
  // Invariant 24 : prestataire autonome sur ses frais. Les compter ici les
  // ferait payer deux fois par la coopérative.
  const d = scenario();
  const avec = { ...d, depenses: [...d.depenses, {
    id: "d2", coopId: "co1", saison: SAISON, pisteurId: "pis",
    category: "Carburant", amount: 50_000, date: "2026-11-02T08:00:00.000Z", note: "",
  }] };
  assert.equal(tresorerie(avec).depenses, tresorerie(d).depenses);
});

test("les alertes signalent l'argent avancé et l'enveloppe qui s'épuise", () => {
  const textes = alertesFin(scenario()).map((a) => a.texte).join(" | ");
  assert.ok(/avanc/i.test(textes), "l'avance personnelle doit alerter");

  const serre = { ...scenario() };
  serre.mandats = [{ ...serre.mandats[0], amount: 9_500_000 }];
  const a2 = alertesFin(serre);
  assert.ok(a2.some((x) => /épuisée/i.test(x.texte)), "enveloppe presque vide");

  const depasse = { ...scenario() };
  depasse.mandats = [{ ...depasse.mandats[0], amount: 12_000_000 }];
  assert.ok(alertesFin(depasse).some((x) => x.niveau === "grave"),
    "confier plus que l'enveloppe est grave");
});

test("dettesAgents ne retient que ceux à qui la coopérative doit quelque chose", () => {
  const liste = dettesAgents(scenario());
  assert.equal(liste.length, 1);
  assert.equal(liste[0].staff.id, "pis");
  // Le comptable et le patron n'y figurent pas : ils ne collectent pas.
  assert.ok(!liste.some((x) => x.staff.role === "comptable"));
});

test("une coopérative sans comptabilité ne casse pas", () => {
  // Un état chargé depuis un appareil antérieur au module n'a ni `budgets`
  // ni `reglements`. Tout doit continuer de répondre.
  const d = base();
  delete d.budgets;
  delete d.reglements;
  const t = tresorerie(d);
  assert.equal(t.enveloppe, 0);
  assert.equal(t.disponible, 0);
  assert.deepEqual(journalFinancier(d), []);
  assert.deepEqual(alertesFin(d), []);
});
