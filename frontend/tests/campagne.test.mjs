// Numérotation des bordereaux par agent et cloisonnement par campagne.
// Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const { staffTag, makeTicket, nextTicketSeq, ticketOf, ticketNo, inSaison, scopeSaison, saisons, pisteurStats, memberStats } =
  await import("../.sync-build/lib.js");

const CAMPAGNE = "Campagne 2025-2026";
const PRECEDENTE = "Campagne 2024-2025";

const collecte = (id, extra = {}) => ({
  id, seq: 1, memberId: "mb-1", byStaffId: "st-a", date: "2026-02-01T09:00:00.000Z",
  kg: 100, prixKg: 1800, cropId: "cacao", brut: 180000, retenues: [], net: 180000,
  paye: 180000, reste: 0, method: "espece", note: "", saison: CAMPAGNE, ...extra,
});

const etat = (extra = {}) => ({
  saison: CAMPAGNE, prixKg: 1800, seq: 1, memberSeq: 1, commissionRate: 25,
  coop: { nom: "Coop", momo: [] }, coops: [], prices: { cacao: 1800 }, commissions: { cacao: 25 },
  staff: [], members: [], collections: [], loans: [], mandats: [], depenses: [],
  settlements: [], priceHistory: [], ...extra,
});

/* ------------------------- Numéro de bordereau ------------------------- */

test("le trigramme d'un agent est stable et propre à son identifiant", () => {
  assert.equal(staffTag("st-magasin"), staffTag("st-magasin"));
  assert.notEqual(staffTag("st-magasin"), staffTag("st-pisteur"));
  assert.match(staffTag("st-magasin"), /^[A-Z]{3}$/);
  // Ni I ni O : trop proches de 1 et 0 sur un bordereau manuscrit.
  assert.ok(!/[IO]/.test(staffTag("st-magasin")));
});

test("deux agents hors-ligne au même rang produisent des numéros différents", () => {
  const a = makeTicket("st-magasin", 42);
  const b = makeTicket("st-pisteur", 42);
  assert.notEqual(a, b, "c'est précisément le doublon que la numérotation corrige");
  assert.match(a, /^P-[A-Z]{3}-0042$/);
});

test("chaque agent a sa propre suite, indépendante des autres", () => {
  const data = etat({
    collections: [
      collecte("c1", { byStaffId: "st-a", seq: 1 }),
      collecte("c2", { byStaffId: "st-a", seq: 2 }),
      collecte("c3", { byStaffId: "st-b", seq: 1 }),
    ],
  });
  assert.equal(nextTicketSeq("st-a", data), 3);
  assert.equal(nextTicketSeq("st-b", data), 2);
  assert.equal(nextTicketSeq("st-neuf", data), 1);
});

test("les reçus de solde consomment la même suite que les pesées de l'agent", () => {
  const data = etat({
    collections: [collecte("c1", { byStaffId: "st-a", seq: 1 })],
    settlements: [{ id: "s1", byStaffId: "st-a", seq: 2, memberId: "mb-1", amount: 100, method: "espece",
                    date: "2026-02-02T09:00:00.000Z" }],
  });
  assert.equal(nextTicketSeq("st-a", data), 3, "un numéro ne doit jamais être réutilisé");
});

test("le numéro affiché est celui figé, avec repli sur l'ancien format", () => {
  assert.equal(ticketOf({ ticket: "P-ABC-0007", seq: 7 }), "P-ABC-0007");
  assert.equal(ticketOf({ seq: 7 }), ticketNo(7), "bordereau émis avant la numérotation par agent");
  assert.equal(ticketOf(null), "—");
});

/* --------------------------- Campagnes (M6) ---------------------------- */

test("une écriture sans campagne est rattachée à la campagne active", () => {
  assert.equal(inSaison({}, CAMPAGNE), true, "les données antérieures ne doivent pas disparaître");
  assert.equal(inSaison({ saison: CAMPAGNE }, CAMPAGNE), true);
  assert.equal(inSaison({ saison: PRECEDENTE }, CAMPAGNE), false);
});

test("scopeSaison ne garde que la production de la campagne visée", () => {
  const data = etat({
    collections: [collecte("c1"), collecte("c2", { saison: PRECEDENTE })],
    mandats: [{ id: "m1", pisteurId: "st-a", amount: 100, date: "x", note: "", saison: PRECEDENTE }],
    depenses: [{ id: "d1", pisteurId: "st-a", amount: 50, category: "sacs", date: "x", note: "", saison: CAMPAGNE }],
  });
  const vue = scopeSaison(data, CAMPAGNE);
  assert.deepEqual(vue.collections.map((c) => c.id), ["c1"]);
  assert.deepEqual(vue.mandats, []);
  assert.deepEqual(vue.depenses.map((d) => d.id), ["d1"]);
});

test("les dettes ne sont PAS filtrées par campagne", () => {
  // Décision métier : un reste dû suit le planteur d'une campagne à l'autre.
  const data = etat({
    collections: [
      collecte("vieux", { saison: PRECEDENTE, paye: 0, reste: 180000 }),
      collecte("recent", { saison: CAMPAGNE, paye: 180000, reste: 0 }),
    ],
  });
  const dette = memberStats("mb-1", data.collections);
  assert.equal(dette.reste, 180000, "la dette de la campagne précédente reste due");

  const production = memberStats("mb-1", scopeSaison(data, CAMPAGNE).collections);
  assert.equal(production.kg, 100, "la production, elle, est bien cloisonnée");
});

test("la caisse d'un agent se justifie campagne par campagne", () => {
  const data = etat({
    mandats: [
      { id: "m1", pisteurId: "st-a", amount: 1_000_000, date: "x", note: "", saison: CAMPAGNE },
      { id: "m0", pisteurId: "st-a", amount: 900_000, date: "x", note: "", saison: PRECEDENTE },
    ],
    collections: [
      collecte("c1", { paye: 400000, saison: CAMPAGNE }),
      collecte("c0", { paye: 800000, saison: PRECEDENTE }),
    ],
    depenses: [{ id: "d1", pisteurId: "st-a", amount: 25000, category: "carburant", date: "x", note: "", saison: CAMPAGNE }],
  });
  const st = pisteurStats("st-a", scopeSaison(data, CAMPAGNE));
  assert.equal(st.mandat, 1_000_000);
  assert.equal(st.achats, 400000);
  assert.equal(st.solde, 575000, "la campagne précédente ne doit pas polluer la caisse courante");
});

test("saisons liste les campagnes présentes, de la plus récente à la plus ancienne", () => {
  const data = etat({
    collections: [collecte("c1", { saison: PRECEDENTE }), collecte("c2", { saison: CAMPAGNE })],
  });
  assert.deepEqual(saisons(data), [CAMPAGNE, PRECEDENTE]);
});
