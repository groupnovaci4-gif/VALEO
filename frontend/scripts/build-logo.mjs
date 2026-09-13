#!/usr/bin/env node
// VALEO — génère la version imprimable du logo (bordereaux, reçus).
//
// Pourquoi un script : le logo source fait ~1 Mo. L'embarquer tel quel en
// base64 dans le HTML d'impression alourdirait CHAQUE reçu généré, sur des
// téléphones d'entrée de gamme. On produit donc une vignette de 240 px,
// compositée sur blanc (le papier), et on l'écrit en data-URI dans un module
// TypeScript versionné — aucune lecture de fichier à l'exécution, donc rien à
// charger hors-ligne.
//
// Aucune dépendance : décodage et encodage PNG faits ici avec `zlib`, comme
// `import-geo.mjs` qui n'en a pas non plus.
//
//   node scripts/build-logo.mjs [source.png] [--width 240]

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decoderPNG, encoderPNG, recadrerSurContenu, reduireSurBlanc } from "./png.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

/* -------------------------------- Main ---------------------------------- */

const args = process.argv.slice(2);
const iw = args.indexOf("--width");
const LARGEUR_CIBLE = iw >= 0 ? Number(args[iw + 1]) : 240;
const source = resolve(RACINE, args.find((a) => !a.startsWith("--") && a !== String(LARGEUR_CIBLE)) || "assets/images/valeo-logo.png");
const sortie = resolve(RACINE, "src/coop/logo-print.ts");

const buf = readFileSync(source);
const brut = decoderPNG(buf);
// Recadré sur le motif avant réduction : la marge transparente d'un export
// devient du BLANC une fois aplatie, et le reçu affiche la vignette dans une
// boîte de taille fixe (62 px). Sans recadrage, ce vide mange la place du
// logo — sur du papier, à cette taille, ça se voit.
const { rgba, largeur, hauteur } = recadrerSurContenu(brut.rgba, brut.largeur, brut.hauteur);
const ihdr = brut.ihdr;

const nl = Math.min(LARGEUR_CIBLE, largeur);
const nh = Math.max(1, Math.round((hauteur * nl) / largeur));
const png = encoderPNG(reduireSurBlanc(rgba, largeur, hauteur, nl, nh), nl, nh);
const dataUri = `data:image/png;base64,${png.toString("base64")}`;

writeFileSync(
  sortie,
  `// VALEO — logo imprimable (bordereaux, reçus). GÉNÉRÉ, ne pas éditer à la main.
//
// Produit par \`yarn brand:build\` depuis \`assets/images/valeo-logo.png\`.
// Après avoir remplacé le logo source, relancer la commande pour que les reçus
// portent la nouvelle identité.
//
// Source : ${brut.largeur}×${brut.hauteur} → recadrée ${largeur}×${hauteur} → ${nl}×${nh}, composité sur blanc (papier).
export const VALEO_LOGO_PRINT =
  "${dataUri}";
`,
  "utf8",
);

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
console.log(`Logo imprimable généré : ${nl}×${nh}`);
console.log(`  source   ${ko(buf.length)}  (${brut.largeur}×${brut.hauteur}, type couleur ${ihdr.couleur}) → recadrée ${largeur}×${hauteur}`);
console.log(`  vignette ${ko(png.length)}  → data-URI ${ko(dataUri.length)}`);
console.log(`  écrit dans src/coop/logo-print.ts`);
