// VALEO — base des localités de Côte d'Ivoire (sélection structurée).
//
// Module volontairement PUR (aucune dépendance d'exécution hors le JSON de
// données) afin d'être testable directement par Node : `yarn test`.
//
// La base est produite par `scripts/import-geo.mjs` à partir d'un CSV
// hiérarchique : pour charger une base officielle complète, on remplace le CSV
// et on relance le script — aucun code applicatif à modifier.
import base from "./geo/ci-geo.json";

export const NIVEAUX = ["district", "region", "departement", "sousPrefecture", "village"] as const;
export type Niveau = (typeof NIVEAUX)[number];

export type Lieu = { id: string; n: string; t: Niveau; p?: string };
export type BaseGeo = {
  version: string;
  pays: string;
  source: string;
  niveaux: string[];
  complet: Record<string, boolean>;
  lieux: Lieu[];
};

export const geo: BaseGeo = base as unknown as BaseGeo;

export const LIBELLE_NIVEAU: Record<Niveau, string> = {
  district: "District",
  region: "Région",
  departement: "Département / Ville",
  sousPrefecture: "Sous-préfecture",
  village: "Village / Localité",
};

/**
 * Localisation enregistrée sur une fiche.
 *
 * On conserve **à la fois** l'identifiant et le nom de chaque niveau :
 * l'identifiant permet les regroupements fiables (statistiques par région,
 * par village…), le nom garde la fiche lisible même si la base évolue.
 */
export type Localisation = {
  districtId?: string;
  district?: string;
  regionId?: string;
  region?: string;
  departementId?: string;
  departement?: string;
  sousPrefectureId?: string;
  sousPrefecture?: string;
  villageId?: string;
  village?: string;
  /** Village saisi librement : la base ne le contient pas encore. */
  villageLibre?: boolean;
};

/* ------------------------------- Index ---------------------------------- */

const parId = new Map<string, Lieu>();
const enfants = new Map<string, Lieu[]>(); // clé : `${parentId ?? ""}|${niveau}`

for (const l of geo.lieux) {
  parId.set(l.id, l);
  const cle = `${l.p || ""}|${l.t}`;
  const liste = enfants.get(cle);
  if (liste) liste.push(l);
  else enfants.set(cle, [l]);
}

/** Le niveau est-il alimenté dans la base chargée ? */
export const niveauDisponible = (t: Niveau): boolean => !!geo.complet[t];

export const lieuParId = (id?: string | null): Lieu | undefined => (id ? parId.get(id) : undefined);

/** Localités d'un niveau donné rattachées à un parent (ordre alphabétique). */
export const enfantsDe = (parentId: string | null | undefined, t: Niveau): Lieu[] =>
  enfants.get(`${parentId || ""}|${t}`) || [];

/** Comparaison insensible à la casse, aux accents et à la ponctuation. */
export const normaliser = (s?: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Recherche dans un niveau, restreinte aux enfants du parent sélectionné.
 *
 * La recherche ne fait que FILTRER la liste officielle : elle ne permet jamais
 * de créer une localité au passage, donc pas de doublon orthographique.
 */
export function chercher(parentId: string | null | undefined, t: Niveau, q?: string): Lieu[] {
  const liste = enfantsDe(parentId, t);
  const req = normaliser(q);
  if (!req) return liste;
  return liste.filter((l) => normaliser(l.n).includes(req));
}

/** Chaîne des parents, du district jusqu'au lieu (inclus). */
export function cheminDe(id?: string | null): Lieu[] {
  const out: Lieu[] = [];
  let cur = lieuParId(id);
  let garde = 0;
  while (cur && garde++ < NIVEAUX.length + 1) {
    out.unshift(cur);
    cur = lieuParId(cur.p);
  }
  return out;
}

/* --------------------------- Lecture / écriture -------------------------- */

/** Localisation complète déduite d'un lieu sélectionné (remonte ses parents). */
export function localisationDepuisLieu(id?: string | null, villageLibre?: string): Localisation {
  const loc: Localisation = {};
  for (const l of cheminDe(id)) {
    (loc as any)[`${l.t}Id`] = l.id;
    (loc as any)[l.t] = l.n;
  }
  if (villageLibre && !loc.villageId) {
    loc.village = villageLibre.trim();
    loc.villageLibre = true;
  }
  return loc;
}

/**
 * Nom de localité à afficher (et à recopier dans `Member.village`) : le niveau
 * le plus fin renseigné. Les écrans, reçus et bilans existants continuent donc
 * de fonctionner à l'identique.
 */
export function libelleLocalite(loc?: Localisation | null): string {
  if (!loc) return "";
  return loc.village || loc.sousPrefecture || loc.departement || loc.region || loc.district || "";
}

/** Fil d'Ariane lisible : « District › Région › Département › Village ». */
export function cheminLisible(loc?: Localisation | null): string {
  if (!loc) return "";
  return [loc.district, loc.region, loc.departement, loc.sousPrefecture, loc.village]
    .filter(Boolean)
    .join(" › ");
}

/* ------------------------ Compatibilité des données ---------------------- */

/**
 * Rapproche un nom saisi librement d'une localité connue, à un niveau donné.
 * Insensible à la casse et aux accents : « SIKENSI » retrouve « Sikensi ».
 */
export function rapprocher(nom: string | undefined, t: Niveau, parentId?: string | null): Lieu | undefined {
  const req = normaliser(nom);
  if (!req) return undefined;
  const candidats = parentId !== undefined ? enfantsDe(parentId, t) : geo.lieux.filter((l) => l.t === t);
  return candidats.find((l) => normaliser(l.n) === req);
}

/**
 * Reconstruit une Localisation à partir des anciens champs texte, sans jamais
 * rien perdre : ce qui n'est pas retrouvé dans la base est conservé tel quel.
 *
 * Sert à pré-remplir les menus quand on modifie une fiche créée avant la
 * sélection structurée (exigence de compatibilité des données existantes).
 */
export function rapprocherTexte(champs: {
  district?: string;
  region?: string;
  departement?: string;
  village?: string;
}): Localisation {
  const loc: Localisation = {};
  const d = rapprocher(champs.district, "district");
  if (d) { loc.districtId = d.id; loc.district = d.n; }
  else if (champs.district) loc.district = champs.district;

  // Une région est cherchée sous son district quand il est connu, sinon
  // partout : les anciennes fiches n'ont pas toujours les deux.
  const r = rapprocher(champs.region, "region", d ? d.id : undefined);
  if (r) {
    loc.regionId = r.id;
    loc.region = r.n;
    if (!loc.districtId) {
      const parent = lieuParId(r.p);
      if (parent) { loc.districtId = parent.id; loc.district = parent.n; }
    }
  } else if (champs.region) loc.region = champs.region;

  const dp = rapprocher(champs.departement, "departement", loc.regionId || undefined);
  if (dp) {
    loc.departementId = dp.id;
    loc.departement = dp.n;
    if (!loc.regionId) {
      const parent = lieuParId(dp.p);
      if (parent) {
        loc.regionId = parent.id;
        loc.region = parent.n;
        const gp = lieuParId(parent.p);
        if (gp && !loc.districtId) { loc.districtId = gp.id; loc.district = gp.n; }
      }
    }
  } else if (champs.departement) loc.departement = champs.departement;

  if (champs.village) {
    const v = rapprocher(champs.village, "village", loc.departementId || loc.sousPrefectureId || undefined);
    if (v) { loc.villageId = v.id; loc.village = v.n; }
    else {
      // Village inconnu de la base : conservé en saisie libre, jamais effacé.
      loc.village = champs.village;
      loc.villageLibre = true;
      // Le nom correspond peut-être à un département (ancienne saisie « ville »).
      if (!loc.departementId) {
        const commeDept = rapprocher(champs.village, "departement");
        if (commeDept) {
          loc.departementId = commeDept.id;
          loc.departement = commeDept.n;
          const parent = lieuParId(commeDept.p);
          if (parent && !loc.regionId) {
            loc.regionId = parent.id;
            loc.region = parent.n;
            const gp = lieuParId(parent.p);
            if (gp && !loc.districtId) { loc.districtId = gp.id; loc.district = gp.n; }
          }
        }
      }
    }
  }
  return loc;
}
