// Sélection géographique structurée (Côte d'Ivoire). Lancer : `yarn test`.
import assert from "node:assert/strict";
import test from "node:test";

const {
  geo, NIVEAUX, enfantsDe, chercher, cheminDe, lieuParId, normaliser,
  localisationDepuisLieu, libelleLocalite, cheminLisible, rapprocher,
  rapprocherTexte, niveauDisponible,
} = await import("../.sync-build/geo.js");

const idDe = (nom, t) => geo.lieux.find((l) => l.n === nom && l.t === t)?.id;

/* ------------------------------ Base chargée ----------------------------- */

test("la base couvre le découpage administratif du pays", () => {
  const compte = (t) => geo.lieux.filter((l) => l.t === t).length;
  assert.equal(compte("district"), 14, "14 districts, dont 2 autonomes");
  // 31 régions + 2 régions miroir pour les districts autonomes, qui n'ont pas
  // ce niveau : la cascade reste ainsi uniforme sur 4 niveaux.
  assert.equal(compte("region"), 33);
  assert.ok(compte("departement") > 100);
  assert.equal(geo.pays, "CI");
});

test("chaque localité déclare un niveau connu et un parent existant", () => {
  for (const l of geo.lieux) {
    assert.ok(NIVEAUX.includes(l.t), `niveau inconnu : ${l.t}`);
    if (l.t === "district") assert.equal(l.p, undefined, "un district n'a pas de parent");
    else assert.ok(lieuParId(l.p), `parent introuvable pour ${l.n}`);
  }
});

test("les identifiants sont uniques", () => {
  const ids = new Set(geo.lieux.map((l) => l.id));
  assert.equal(ids.size, geo.lieux.length);
});

test("la base déclare honnêtement les niveaux qu'elle ne contient pas", () => {
  // Les villages doivent être importés depuis une base officielle : la
  // structure le dit explicitement plutôt que de laisser croire à un trou.
  assert.equal(niveauDisponible("district"), true);
  assert.equal(niveauDisponible("departement"), true);
  assert.equal(niveauDisponible("village"), geo.complet.village);
  if (!geo.complet.village) assert.match(geo.source, /IMPORTER|importer/);
});

/* ------------------------------- Cascade -------------------------------- */

test("chaque niveau ne propose que les enfants du choix précédent", () => {
  const lagunes = idDe("Lagunes", "district");
  const regions = enfantsDe(lagunes, "region").map((l) => l.n);
  assert.deepEqual(regions.sort(), ["Agnéby-Tiassa", "Grands-Ponts", "La Mé"]);

  const agneby = idDe("Agnéby-Tiassa", "region");
  const depts = enfantsDe(agneby, "departement").map((l) => l.n);
  assert.ok(depts.includes("Sikensi"));
  assert.ok(!depts.includes("Korhogo"), "un département d'un autre district ne doit pas apparaître");
});

test("un district sans sélection ne propose rien aux niveaux inférieurs", () => {
  assert.deepEqual(enfantsDe(null, "region"), []);
  assert.deepEqual(enfantsDe(undefined, "departement"), []);
});

test("la recherche filtre la liste officielle sans jamais créer de localité", () => {
  const savanes = idDe("Savanes", "district");
  const poro = idDe("Poro", "region");
  assert.deepEqual(chercher(poro, "departement", "korho").map((l) => l.n), ["Korhogo"]);
  // Insensible aux accents et à la casse.
  assert.deepEqual(chercher(savanes, "region", "PORO").map((l) => l.n), ["Poro"]);
  // Une faute de frappe ne renvoie rien : impossible d'enregistrer un doublon.
  assert.deepEqual(chercher(poro, "departement", "Korogho"), []);
});

test("le chemin remonte jusqu'au district", () => {
  const sikensi = idDe("Sikensi", "departement");
  assert.deepEqual(cheminDe(sikensi).map((l) => l.n), ["Lagunes", "Agnéby-Tiassa", "Sikensi"]);
});

/* --------------------------- Écriture de la fiche ------------------------ */

test("sélectionner un département renseigne toute la hiérarchie", () => {
  const loc = localisationDepuisLieu(idDe("Sikensi", "departement"));
  assert.equal(loc.district, "Lagunes");
  assert.equal(loc.region, "Agnéby-Tiassa");
  assert.equal(loc.departement, "Sikensi");
  assert.ok(loc.districtId && loc.regionId && loc.departementId, "les identifiants permettent les regroupements");
});

test("le nom de localité affiché est le niveau le plus fin renseigné", () => {
  const loc = localisationDepuisLieu(idDe("Sikensi", "departement"));
  assert.equal(libelleLocalite(loc), "Sikensi");
  assert.equal(libelleLocalite({ ...loc, village: "Gomon" }), "Gomon");
  assert.equal(libelleLocalite(null), "");
});

test("un village saisi librement est conservé et signalé comme tel", () => {
  const loc = localisationDepuisLieu(idDe("Sikensi", "departement"), "Gomon");
  assert.equal(loc.village, "Gomon");
  assert.equal(loc.villageLibre, true, "à rapprocher lors de l'import de la base des villages");
  assert.equal(loc.villageId, undefined);
});

test("le fil d'Ariane est lisible", () => {
  const loc = localisationDepuisLieu(idDe("Korhogo", "departement"));
  assert.equal(cheminLisible(loc), "Savanes › Poro › Korhogo");
});

/* --------------------- Compatibilité des données existantes -------------- */

test("une ancienne saisie est rapprochée de la localité officielle", () => {
  // Le planteur avait « SIKENSI » tapé à la main : on le retrouve.
  const loc = rapprocherTexte({ village: "SIKENSI" });
  assert.equal(loc.departement, "Sikensi");
  assert.equal(loc.region, "Agnéby-Tiassa");
  assert.equal(loc.district, "Lagunes");
});

test("une localité inconnue de la base n'est jamais effacée", () => {
  const loc = rapprocherTexte({ village: "Kotobi-Village" });
  assert.equal(loc.village, "Kotobi-Village", "aucune donnée existante ne doit être perdue");
  assert.equal(loc.villageLibre, true);
});

test("les anciens champs de la coopérative sont recomposés", () => {
  const loc = rapprocherTexte({ district: "lagunes", region: "agneby-tiassa", departement: "sikensi" });
  assert.equal(loc.districtId, idDe("Lagunes", "district"));
  assert.equal(loc.regionId, idDe("Agnéby-Tiassa", "region"));
  assert.equal(loc.departementId, idDe("Sikensi", "departement"));
});

test("un champ non reconnu est conservé en texte, sans identifiant", () => {
  const loc = rapprocherTexte({ region: "Région inventée" });
  assert.equal(loc.region, "Région inventée");
  assert.equal(loc.regionId, undefined, "pas d'identifiant : la donnée reste à rapprocher");
});

test("rapprocher est insensible à la casse, aux accents et à la ponctuation", () => {
  assert.equal(normaliser("Agnéby-Tiassa"), "agneby tiassa");
  assert.ok(rapprocher("AGNEBY TIASSA", "region"));
  assert.ok(rapprocher("  bouaké ", "departement"));
  assert.equal(rapprocher("", "region"), undefined);
});

test("deux localités homonymes sous des parents différents restent distinctes", () => {
  // Le département de San-Pédro et sa région portent le même nom.
  const region = idDe("San-Pédro", "region");
  const dept = idDe("San-Pédro", "departement");
  assert.ok(region && dept && region !== dept);
  assert.equal(lieuParId(dept).p, region);
});
