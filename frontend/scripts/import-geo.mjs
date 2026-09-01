#!/usr/bin/env node
/**
 * Import / mise à jour de la base des localités (Côte d'Ivoire).
 *
 * Convertit un fichier CSV hiérarchique en `src/coop/geo/ci-geo.json`, le
 * format consommé par l'application. C'est le SEUL point d'entrée pour
 * remplacer ou enrichir la base : le JSON ne doit jamais être édité à la main.
 *
 *   Usage :
 *     node scripts/import-geo.mjs [source.csv] [--out fichier.json] [--source "libellé"]
 *     yarn geo:build                      # régénère depuis le CSV du dépôt
 *
 * Format du CSV (en-tête obligatoire, séparateur « , » ou « ; ») :
 *
 *     district,region,departement,sousPrefecture,village
 *     Lagunes,Agnéby-Tiassa,Sikensi,Sikensi,Gomon
 *
 * Une ligne = une localité feuille. Les colonnes de droite peuvent être vides :
 * la ligne s'arrête alors au dernier niveau renseigné. Les doublons sont
 * fusionnés, l'ordre alphabétique est appliqué à la génération.
 *
 * Pour charger une base officielle complète (INS / RGPH, GeoNames, HDX) :
 * exportez-la vers ce format à 5 colonnes, puis
 *     node scripts/import-geo.mjs /chemin/base-officielle.csv --source "INS 2021"
 * L'application n'a pas besoin d'être modifiée : elle lit le JSON produit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const NIVEAUX = ["district", "region", "departement", "sousPrefecture", "village"];
// Préfixe d'identifiant par niveau : lisible dans les données enregistrées.
const PREFIXE = { district: "D", region: "R", departement: "DP", sousPrefecture: "SP", village: "V" };

function args() {
  const a = process.argv.slice(2);
  const opt = { src: null, out: null, source: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") opt.out = a[++i];
    else if (a[i] === "--source") opt.source = a[++i];
    else if (!opt.src) opt.src = a[i];
  }
  opt.src = opt.src || resolve(ICI, "../src/coop/geo/ci-decoupage.csv");
  opt.out = opt.out || resolve(ICI, "../src/coop/geo/ci-geo.json");
  return opt;
}

// Analyse CSV minimale mais correcte : gère les guillemets et les « ; ».
function parseCsv(text) {
  const lignes = [];
  let champ = "";
  let ligne = [];
  let quote = false;
  const sep = (text.split("\n")[0] || "").includes(";") ? ";" : ",";
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '"') {
        if (src[i + 1] === '"') { champ += '"'; i++; } else quote = false;
      } else champ += c;
      continue;
    }
    if (c === '"') quote = true;
    else if (c === sep) { ligne.push(champ); champ = ""; }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => l.some((x) => (x || "").trim() !== ""));
}

// Identifiant stable dérivé du nom : deux imports successifs de la même base
// produisent les mêmes ids, donc les fiches déjà enregistrées restent valides.
function slug(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function construire(lignes) {
  const [entete, ...corps] = lignes;
  const cols = entete.map((c) => c.trim());
  const idx = {};
  NIVEAUX.forEach((n) => { idx[n] = cols.indexOf(n); });
  const manquants = NIVEAUX.filter((n) => idx[n] === -1);
  if (manquants.length) {
    throw new Error(`Colonnes absentes du CSV : ${manquants.join(", ")}. Attendu : ${NIVEAUX.join(",")}`);
  }

  const lieux = new Map(); // id -> lieu
  const complet = {};
  NIVEAUX.forEach((n) => { complet[n] = false; });

  for (const ligne of corps) {
    let parent = null;
    for (const niveau of NIVEAUX) {
      const nom = (ligne[idx[niveau]] || "").trim();
      if (!nom) break; // la ligne s'arrête au dernier niveau renseigné
      // L'id inclut le parent : deux villages homonymes dans deux
      // départements différents restent distincts.
      const id = `${PREFIXE[niveau]}-${parent ? `${parent.split("-").slice(1).join("-")}-` : ""}${slug(nom)}`.slice(0, 120);
      if (!lieux.has(id)) {
        const lieu = { id, n: nom, t: niveau };
        if (parent) lieu.p = parent;
        lieux.set(id, lieu);
      }
      complet[niveau] = true;
      parent = id;
    }
  }

  const ordre = Object.fromEntries(NIVEAUX.map((n, i) => [n, i]));
  const liste = [...lieux.values()].sort(
    (a, b) => ordre[a.t] - ordre[b.t] || a.n.localeCompare(b.n, "fr"),
  );
  return { lieux: liste, complet };
}

function main() {
  const opt = args();
  const { lieux, complet } = construire(parseCsv(readFileSync(opt.src, "utf-8")));
  const base = {
    version: new Date().toISOString().slice(0, 10),
    pays: "CI",
    source:
      opt.source ||
      "Découpage administratif de la Côte d'Ivoire (réforme 2011-2012) : districts, régions et départements. Sous-préfectures et villages À IMPORTER depuis une base officielle (voir scripts/import-geo.mjs).",
    niveaux: NIVEAUX,
    complet,
    lieux,
  };
  writeFileSync(opt.out, JSON.stringify(base, null, 0) + "\n", "utf-8");

  const parNiveau = NIVEAUX.map((n) => `${n} ${lieux.filter((l) => l.t === n).length}`).join(" · ");
  console.log(`Base écrite : ${opt.out}`);
  console.log(`  ${lieux.length} localités — ${parNiveau}`);
  const vides = NIVEAUX.filter((n) => !complet[n]);
  if (vides.length) console.log(`  ⚠ niveaux absents de cette base : ${vides.join(", ")}`);
}

main();
