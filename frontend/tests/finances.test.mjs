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

/* ================= §9 — LES CHIFFRES DE LA SPÉCIFICATION ================= */

const { buildNotifications, pese, peutSolder, pisteurStats } =
  await import("../.sync-build/lib.js");

/**
 * Le cas chiffré demandé, reproduit à l'unité près.
 *
 * Enveloppe 10 000 000 · mandat pisteur 2 000 000 · excédent 20 kg à 1 800 F
 * · argent avancé 200 000 · commission 125 000 → total dû 361 000.
 */
function casChiffre() {
  const c = (id, kg, prix, paye, livId, jour) => ({
    ...col(id, kg, paye, livId, jour), prixKg: prix,
    commissionRate: 100, brut: kg * prix, net: kg * prix, reste: kg * prix - paye,
  });
  let d = base();
  d.budgets = [{
    id: "b1", coopId: "co1", saison: SAISON, libelle: "Campagne", montant: 10_000_000,
    debut: "2026-10-01", fin: "2026-12-31", note: "", byStaffId: "cpt",
    date: "2026-10-01T08:00:00.000Z",
  }];
  d.mandats = [{
    id: "m1", coopId: "co1", saison: SAISON, pisteurId: "pis",
    amount: 2_000_000, date: "2026-10-02T08:00:00.000Z", note: "",
  }];
  // 1 000 kg à 1 800 F = 1 800 000, puis 250 kg à 1 600 F = 400 000.
  d.collections = [c("c1", 1000, 1800, 1_800_000, "liv-1", 3)];
  d = verifier(d, "liv-1", 1020, 4);              // 20 kg d'excédent
  d.collections = [...d.collections, c("c2", 250, 1600, 400_000, null, 5)];
  return d;
}

test("§9 — VALEO produit exactement les chiffres de la spécification", () => {
  const s = situationAgent(casChiffre(), "pis");
  assert.equal(s.gainExcedent, 36_000, "20 kg × 1 800 F, au prix FIGÉ du chargement");
  assert.equal(s.avancePerso, 200_000, "2 200 000 d'achats pour 2 000 000 de mandat");
  assert.equal(s.commission, 125_000, "1 250 kg × 100 F/kg");
  assert.equal(s.totalDu, 361_000, "125 000 + 36 000 + 200 000");
  assert.equal(s.statut, "a_payer");
});

test("§9 — le solde du mandat se lit bien avant le second achat", () => {
  // La spécification annonce « solde 100 000 » ET « argent personnel 200 000 » :
  // ce sont deux MOMENTS, jamais le même. Tant qu'il reste du mandat, la caisse
  // est positive ; le dépassement la rend négative, et c'est alors une dette de
  // la coopérative, plus un solde à rendre.
  const d = casChiffre();
  const avant = { ...d, collections: d.collections.filter((x) => x.id === "c1") };
  const s1 = pisteurStats("pis", avant, avant);
  assert.equal(s1.solde, 200_000, "2 000 000 − 1 800 000");
  assert.equal(s1.aRendre, 200_000, "il détient encore cet argent");

  const s2 = pisteurStats("pis", d, d);
  assert.equal(s2.solde, -200_000);
  assert.equal(s2.aRendre, 0, "il n'a plus rien à rendre : il a avancé");
});

test("§9 — l'enveloppe reste cohérente une fois l'agent payé", () => {
  const d = casChiffre();
  const t = tresorerie(d);
  assert.equal(t.enveloppe, 10_000_000);
  assert.equal(t.attribue, 2_000_000);
  assert.equal(t.duAgents, 361_000);
  assert.equal(t.disponible, 10_000_000 - 2_000_000 - 361_000);
});

/* ===================== PÉRIMÈTRE DU RÔLE À L'ÉCRAN ======================= */

test("le comptable n'est pas un rôle de terrain", () => {
  // C'est cette règle qui décide de l'affichage : l'énumérer à la main dans un
  // écran est exactement ce qui a rendu le comptable invisible dans l'équipe.
  assert.equal(pese("pisteur"), true);
  assert.equal(pese("commis"), true);
  assert.equal(pese("patron"), true);
  assert.equal(pese("comptable"), false);
  assert.equal(pese(undefined), false, "un rôle absent ne pèse pas");
});

test("le comptable ne reçoit AUCUNE alerte de reste à payer", () => {
  // Le serveur lui refuse `settlements` : une cloche qui lui réclame de solder
  // un planteur lui demanderait un geste impossible (invariant 21).
  const d = { ...base(), collections: [col("c1", 100, 50_000, null, 3)] };
  const bell = (role) => buildNotifications(d, { side: "coop", role, staffId: "x" });

  const patron = bell("patron").items.filter((n) => n.id.startsWith("rd"));
  assert.ok(patron.length > 0, "le patron, lui, doit être alerté");
  assert.equal(bell("comptable").items.filter((n) => n.id.startsWith("rd")).length, 0);
  assert.equal(peutSolder("comptable"), false);
  assert.equal(peutSolder("commis"), true);
});

test("le comptable garde l'information financière qu'il a le droit de lire", () => {
  // Ne rien lui montrer serait l'autre excès : il suit les achats et les
  // règlements. Seule l'ACTION qu'il ne peut pas faire disparaît.
  const d = { ...base(), collections: [col("c1", 100, 100_000, null, 3)] };
  const items = buildNotifications(d, { side: "coop", role: "comptable", staffId: "x" }).items;
  assert.ok(items.some((n) => n.id.startsWith("pp")), "les pesées payées restent lisibles");
});

/* ================== CLOISONNEMENT PAR CAMPAGNE (inv. 14) ================== */

const { scopeSaison } = await import("../.sync-build/lib.js");

test("une enveloppe de la campagne PRÉCÉDENTE ne gonfle pas celle en cours", () => {
  const d = scenario();
  d.budgets = [...d.budgets, {
    id: "b0", coopId: "co1", saison: "Campagne 2025-2026", libelle: "Ancienne",
    montant: 7_000_000, debut: "2025-10-01", fin: "2025-12-31", note: "",
    byStaffId: "cpt", date: "2025-10-01T08:00:00.000Z",
  }];
  // L'écran passe TOUJOURS une vue restreinte à la campagne active.
  const t = tresorerie(scopeSaison(d), d);
  assert.equal(t.enveloppe, 10_000_000,
    "seule l'enveloppe de la campagne en cours compte");
});

test("un règlement de la campagne PRÉCÉDENTE ne solde pas la dette en cours", () => {
  // Le plus grave des deux : le pisteur apparaîtrait payé alors qu'il ne l'est
  // pas, parce qu'on lui aurait compté un versement de l'an dernier.
  const d = scenario();
  d.reglements = [{
    id: "r0", coopId: "co1", saison: "Campagne 2025-2026", staffId: "pis",
    amount: 275_000, date: "2025-11-05T08:00:00.000Z", byStaffId: "cpt",
    method: "espece", note: "",
  }];
  const s = situationAgent(scopeSaison(d), "pis", d);
  assert.equal(s.regle, 0, "rien n'a été versé sur CETTE campagne");
  assert.equal(s.statut, "a_payer");
  assert.equal(s.reste, 275_000);
});

test("un enregistrement SANS campagne reste compté (données antérieures)", () => {
  // `inSaison` laisse passer ce qui n'a pas de campagne : les écritures créées
  // avant ce champ ne doivent pas disparaître des comptes.
  const d = scenario();
  const { saison, ...sansSaison } = d.budgets[0];
  d.budgets = [sansSaison];
  assert.equal(tresorerie(scopeSaison(d), d).enveloppe, 10_000_000);
});
