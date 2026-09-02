// Stock réel en magasin : entrées (pesées) − sorties. Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { stockStats, stockDispo, scopeSaison, sortieType } = await import("../.sync-build/lib.js");

const CAMPAGNE = "Campagne 2025-2026";
const PRECEDENTE = "Campagne 2024-2025";

const collecte = (id, extra = {}) => ({
  id, seq: 1, memberId: "mb-1", byStaffId: "st-magasin", date: "2026-02-01T09:00:00.000Z",
  kg: 100, prixKg: 1800, cropId: "cacao", brut: 180000, retenues: [], net: 180000,
  paye: 180000, reste: 0, method: "espece", note: "", saison: CAMPAGNE, ...extra,
});

const sortie = (id, extra = {}) => ({
  id, cropId: "cacao", kg: 30, type: "expedition", byStaffId: "st-magasin",
  date: "2026-02-05T09:00:00.000Z", destinataire: "SACO", note: "", saison: CAMPAGNE, ...extra,
});

const etat = (extra = {}) => ({
  saison: CAMPAGNE, prixKg: 1800, seq: 1, memberSeq: 1, commissionRate: 25,
  coop: { nom: "Coop", momo: [] }, coops: [], prices: { cacao: 1800 }, commissions: { cacao: 25 },
  staff: [], members: [], collections: [], loans: [], mandats: [], depenses: [],
  settlements: [], sorties: [], priceHistory: [], ...extra,
});

test("le stock baisse quand une sortie est enregistrée", () => {
  // C'était le défaut : sans sorties, le stock ne pouvait que monter.
  const avant = stockStats(etat({ collections: [collecte("c1")] }));
  assert.equal(avant.stock, 100);

  const apres = stockStats(etat({ collections: [collecte("c1")], sorties: [sortie("s1")] }));
  assert.equal(apres.entrees, 100);
  assert.equal(apres.sorties, 30);
  assert.equal(apres.stock, 70);
});

test("le stock est calculé produit par produit", () => {
  const data = etat({
    collections: [collecte("c1", { cropId: "cacao", kg: 100 }), collecte("c2", { cropId: "cafe", kg: 40 })],
    sorties: [sortie("s1", { cropId: "cacao", kg: 30 })],
  });
  const st = stockStats(data);
  assert.equal(st.rows.find((r) => r.cropId === "cacao").stock, 70);
  assert.equal(st.rows.find((r) => r.cropId === "cafe").stock, 40, "une sortie de cacao n'entame pas le café");
  assert.equal(st.stock, 110);
});

test("un produit sans aucun mouvement n'apparaît pas", () => {
  const st = stockStats(etat({ collections: [collecte("c1")] }));
  assert.deepEqual(st.rows.map((r) => r.cropId), ["cacao"]);
});

test("scope « mine » ne compte que les mouvements de l'agent", () => {
  // Portée « mine » = ce qu'un pisteur a collecté et PAS ENCORE REMIS au
  // magasin. Ses collectes bord-champ y restent tant que le magasinier ne les
  // a pas vérifiées ; une fois vérifiées, elles passent au magasin.
  const staff = [{ id: "st-a", nom: "A", role: "pisteur" }, { id: "st-b", nom: "B", role: "pisteur" }];
  const data = etat({
    staff,
    collections: [
      collecte("c1", { byStaffId: "st-a", kg: 100, origine: "bord_champ" }),
      collecte("c2", { byStaffId: "st-b", kg: 60, origine: "bord_champ" }),
    ],
    sorties: [sortie("s1", { byStaffId: "st-a", kg: 30 })],
  });
  assert.equal(stockStats(data, { scope: "mine", staffId: "st-a" }).stock, 70);
  assert.equal(stockStats(data, { scope: "mine", staffId: "st-b" }).stock, 60);
  // Le magasin, lui, ne compte rien tant que rien n'est vérifié.
  assert.equal(stockStats(data, { scope: "all" }).stock, -30, "seule la sortie est effective");
  assert.equal(stockStats(data, { scope: "all" }).attente, 160, "160 kg annoncés, à vérifier");
});

test("une pesée faite au magasin entre en stock sans vérification", () => {
  const staff = [{ id: "st-magasin", nom: "Bakary", role: "commis" }];
  const data = etat({ staff, collections: [collecte("c1")], sorties: [sortie("s1")] });
  assert.equal(stockStats(data, { scope: "all" }).stock, 70);
  assert.equal(stockStats(data, { scope: "all" }).attente, 0);
});

test("un stock négatif est affiché, pas masqué", () => {
  // Il signale une erreur de saisie : le borner à zéro la rendrait invisible.
  const data = etat({ collections: [collecte("c1", { kg: 50 })], sorties: [sortie("s1", { kg: 80 })] });
  assert.equal(stockStats(data).stock, -30);
});

test("stockDispo borne une nouvelle sortie au stock restant", () => {
  const data = etat({ collections: [collecte("c1", { kg: 100 })], sorties: [sortie("s1", { kg: 30 })] });
  assert.equal(stockDispo(data, "cacao"), 70);
  assert.equal(stockDispo(data, "hevea"), 0, "aucun mouvement : rien à sortir");
});

test("le stock est cloisonné par campagne", () => {
  const data = etat({
    collections: [collecte("c1", { kg: 100 }), collecte("c0", { kg: 500, saison: PRECEDENTE })],
    sorties: [sortie("s1", { kg: 30 }), sortie("s0", { kg: 400, saison: PRECEDENTE })],
  });
  assert.equal(stockStats(scopeSaison(data, CAMPAGNE)).stock, 70);
  assert.equal(stockStats(scopeSaison(data, PRECEDENTE)).stock, 100);
});

test("tous les motifs de sortie retranchent du stock", () => {
  for (const t of ["expedition", "vente", "transfert", "perte"]) {
    const data = etat({ collections: [collecte("c1", { kg: 100 })], sorties: [sortie("s1", { kg: 25, type: t })] });
    assert.equal(stockStats(data).stock, 75, `motif ${t}`);
    assert.equal(sortieType(t).id, t);
  }
  assert.equal(sortieType("inconnu").id, "perte", "motif inconnu : repli sur le dernier");
});
