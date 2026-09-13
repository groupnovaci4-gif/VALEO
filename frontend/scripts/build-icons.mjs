#!/usr/bin/env node
// VALEO — génère les icônes système depuis le logo source.
//
// POURQUOI un script. `app.json` déclare quatre fichiers qu'Expo lit AU BUILD,
// pas à l'exécution : ils ne suivent donc pas `brand.ts`. Les fabriquer à la
// main, c'est quatre recadrages à refaire à chaque changement d'identité — et
// c'est exactement comme ça que l'icône Android s'est retrouvée avec les
// lettres du nom tronquées en bas.
//
// Chaque cible a une contrainte qui lui est propre :
//
//   icon.png          1024  iOS et web. AUCUNE transparence : iOS peint le
//                           canal alpha en NOIR. D'où l'aplatissage sur blanc.
//   adaptive-icon.png 1024  Android applique un MASQUE (cercle, goutte, carré
//                           arrondi selon le constructeur) et ne garantit que
//                           les ~66 % centraux. Le logo est donc réduit dans
//                           cette zone sûre : ce qui déborde serait rogné, et
//                           sur un logo en écusson c'est le nom qui saute.
//   splash-image.png  1024  Écran de démarrage, affiché à 240 pt de large.
//   favicon.png         96  Onglet de navigateur, lu jusqu'à 16 px.
//
//   node scripts/build-icons.mjs [source.png]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decoderPNG, encoderPNG, recadrerSurContenu, reduireSurBlanc } from "./png.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

// Part du côté occupée par le logo. `adaptive` est la contrainte d'Android,
// pas un choix esthétique : au-delà, le masque rogne.
const CIBLES = [
  { fichier: "icon.png", cote: 1024, occupation: 0.92,
    note: "iOS et web — aplati sur blanc, aucune transparence" },
  { fichier: "adaptive-icon.png", cote: 1024, occupation: 0.66,
    note: "Android — zone sûre du masque, rien ne doit déborder" },
  { fichier: "splash-image.png", cote: 1024, occupation: 0.80,
    note: "écran de démarrage" },
  { fichier: "favicon.png", cote: 96, occupation: 1.0,
    note: "onglet de navigateur, lu jusqu'à 16 px" },
];

/** Réduit le logo pour tenir dans `occupation` du côté, puis le centre sur un carré blanc. */
function poser(rgba, largeur, hauteur, cote, occupation) {
  const boite = Math.max(1, Math.round(cote * occupation));
  const echelle = Math.min(boite / largeur, boite / hauteur);
  const nl = Math.max(1, Math.round(largeur * echelle));
  const nh = Math.max(1, Math.round(hauteur * echelle));
  const reduit = reduireSurBlanc(rgba, largeur, hauteur, nl, nh); // RGB, sur blanc

  const toile = Buffer.alloc(cote * cote * 3, 0xff); // blanc opaque
  const dx = Math.floor((cote - nl) / 2);
  const dy = Math.floor((cote - nh) / 2);
  for (let y = 0; y < nh; y++) {
    const src = y * nl * 3;
    const dst = ((y + dy) * cote + dx) * 3;
    reduit.copy(toile, dst, src, src + nl * 3);
  }
  return { toile, nl, nh };
}

const args = process.argv.slice(2);
const source = resolve(RACINE, args.find((a) => !a.startsWith("--")) || "assets/images/valeo-logo.png");
const sortieDir = resolve(RACINE, "assets/images");

const buf = readFileSync(source);
const brut = decoderPNG(buf);
// Recadré sur le motif : la marge transparente d'un export ne doit pas manger
// la place utile d'une icône (voir `recadrerSurContenu`).
const { rgba, largeur, hauteur, recadre } = recadrerSurContenu(brut.rgba, brut.largeur, brut.hauteur);

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
console.log(`Source : ${source.replace(RACINE + "/", "")} — ${brut.largeur}×${brut.hauteur} (${ko(buf.length)})`);
console.log(recadre
  ? `Recadré sur le motif : ${largeur}×${hauteur} (marge transparente retirée)\n`
  : `Aucune marge transparente à retirer\n`);

for (const c of CIBLES) {
  const { toile, nl, nh } = poser(rgba, largeur, hauteur, c.cote, c.occupation);
  const png = encoderPNG(toile, c.cote, c.cote);
  writeFileSync(resolve(sortieDir, c.fichier), png);
  console.log(`  ${c.fichier.padEnd(18)} ${String(c.cote).padStart(4)}²  logo ${nl}×${nh}  ${ko(png.length).padStart(7)}   ${c.note}`);
}

console.log(`
Rappel : ces fichiers sont figés DANS LE BINAIRE au moment du build.
Un redéploiement du backend ne les met pas à jour — il faut reconstruire l'APK.

Si le nom reste illisible sur l'icône Android ou le favicon, c'est attendu :
un logo en écusson complet réduit à 48 dp ne peut pas porter son texte. Fournir
alors un fichier dédié (l'emblème seul) plutôt que d'agrandir le logo, ce qui
le ferait rogner par le masque.`);
