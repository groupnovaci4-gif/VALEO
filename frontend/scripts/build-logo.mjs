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

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");

/* ------------------------------ Décodage -------------------------------- */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function lireChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("Ce fichier n'est pas un PNG.");
  const out = { idat: [], plte: null, trns: null };
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      out.ihdr = {
        largeur: data.readUInt32BE(0),
        hauteur: data.readUInt32BE(4),
        profondeur: data[8],
        couleur: data[9],
        entrelace: data[12],
      };
    } else if (type === "IDAT") out.idat.push(Buffer.from(data));
    else if (type === "PLTE") out.plte = Buffer.from(data);
    else if (type === "tRNS") out.trns = Buffer.from(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  return out;
}

// Nombre d'octets par pixel selon le type de couleur PNG.
const CANAUX = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Annule le filtrage par ligne (PNG stocke chaque ligne préfixée du filtre). */
function defiltrer(brut, largeur, hauteur, bpp) {
  const parLigne = largeur * bpp;
  const out = Buffer.alloc(hauteur * parLigne);
  let src = 0;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[src++];
    const ligne = brut.subarray(src, src + parLigne);
    src += parLigne;
    const dst = y * parLigne;
    const haut = y > 0 ? dst - parLigne : -1;
    for (let x = 0; x < parLigne; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = haut >= 0 ? out[haut + x] : 0;
      const c = haut >= 0 && x >= bpp ? out[haut + x - bpp] : 0;
      const v = ligne[x];
      out[dst + x] =
        filtre === 0 ? v
        : filtre === 1 ? (v + a) & 0xff
        : filtre === 2 ? (v + b) & 0xff
        : filtre === 3 ? (v + ((a + b) >> 1)) & 0xff
        : filtre === 4 ? (v + paeth(a, b, c)) & 0xff
        : (() => { throw new Error(`Filtre PNG inconnu : ${filtre}`); })();
    }
  }
  return out;
}

/** Ramène n'importe quel type de couleur PNG à du RGBA 8 bits. */
function versRGBA(px, { largeur, hauteur, couleur }, plte, trns) {
  const n = largeur * hauteur;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let r, v, b, a = 255;
    if (couleur === 0) { r = v = b = px[i]; }
    else if (couleur === 2) { r = px[i * 3]; v = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (couleur === 3) {
      const idx = px[i];
      r = plte[idx * 3]; v = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    else if (couleur === 4) { r = v = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { r = px[i * 4]; v = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    out[i * 4] = r; out[i * 4 + 1] = v; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return out;
}

/* ---------------------- Réduction + aplatissage --------------------------- */

/**
 * Réduction par moyenne de zone, et composition sur BLANC.
 *
 * Le reçu est imprimé sur du papier : aplatir la transparence sur blanc évite
 * les fonds noirs des visionneuses PDF, et permet de sortir en RGB (plus léger
 * que RGBA).
 */
function reduireSurBlanc(rgba, largeur, hauteur, nl, nh) {
  const out = Buffer.alloc(nl * nh * 3);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * hauteur) / nh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * hauteur) / nh));
    for (let x = 0; x < nl; x++) {
      const x0 = Math.floor((x * largeur) / nl);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * largeur) / nl));
      let sr = 0, sv = 0, sb = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * largeur + xx) * 4;
          const a = rgba[i + 3] / 255;
          // Composition sur blanc, en amont de la moyenne.
          sr += rgba[i] * a + 255 * (1 - a);
          sv += rgba[i + 1] * a + 255 * (1 - a);
          sb += rgba[i + 2] * a + 255 * (1 - a);
          n++;
        }
      }
      const d = (y * nl + x) * 3;
      out[d] = Math.round(sr / n);
      out[d + 1] = Math.round(sv / n);
      out[d + 2] = Math.round(sb / n);
    }
  }
  return out;
}

/* ------------------------------ Encodage -------------------------------- */

let TABLE_CRC = null;
function crc32(buf) {
  if (!TABLE_CRC) {
    TABLE_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE_CRC[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([len, corps, crc]);
}

/** Encode du RGB 8 bits, en choisissant le meilleur filtre par ligne. */
function encoderPNG(rgb, largeur, hauteur) {
  const bpp = 3;
  const parLigne = largeur * bpp;
  const lignes = [];
  const essai = Buffer.alloc(parLigne);
  for (let y = 0; y < hauteur; y++) {
    const dst = y * parLigne;
    const haut = y > 0 ? dst - parLigne : -1;
    let meilleur = null, meilleurCout = Infinity, meilleurType = 0;
    for (const type of [0, 1, 2, 4]) {
      let cout = 0;
      for (let x = 0; x < parLigne; x++) {
        const a = x >= bpp ? rgb[dst + x - bpp] : 0;
        const b = haut >= 0 ? rgb[haut + x] : 0;
        const c = haut >= 0 && x >= bpp ? rgb[haut + x - bpp] : 0;
        const v =
          type === 0 ? rgb[dst + x]
          : type === 1 ? (rgb[dst + x] - a) & 0xff
          : type === 2 ? (rgb[dst + x] - b) & 0xff
          : (rgb[dst + x] - paeth(a, b, c)) & 0xff;
        essai[x] = v;
        cout += v < 128 ? v : 256 - v; // heuristique standard de la spec PNG
      }
      if (cout < meilleurCout) { meilleurCout = cout; meilleur = Buffer.from(essai); meilleurType = type; }
    }
    lignes.push(Buffer.concat([Buffer.from([meilleurType]), meilleur]));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;  // profondeur
  ihdr[9] = 2;  // couleur : RGB
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(lignes), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------- Main ---------------------------------- */

const args = process.argv.slice(2);
const iw = args.indexOf("--width");
const LARGEUR_CIBLE = iw >= 0 ? Number(args[iw + 1]) : 240;
const source = resolve(RACINE, args.find((a) => !a.startsWith("--") && a !== String(LARGEUR_CIBLE)) || "assets/images/valeo-logo.png");
const sortie = resolve(RACINE, "src/coop/logo-print.ts");

const buf = readFileSync(source);
const { ihdr, idat, plte, trns } = lireChunks(buf);
if (!ihdr) throw new Error("En-tête IHDR introuvable.");
if (ihdr.profondeur !== 8) throw new Error(`Profondeur ${ihdr.profondeur} bits non gérée : exporter le logo en 8 bits par canal.`);
if (ihdr.entrelace !== 0) throw new Error("PNG entrelacé (Adam7) non géré : réexporter sans entrelacement.");
if (!(ihdr.couleur in CANAUX)) throw new Error(`Type de couleur ${ihdr.couleur} inconnu.`);
if (ihdr.couleur === 3 && !plte) throw new Error("PNG en palette sans table PLTE.");

const bpp = CANAUX[ihdr.couleur];
const px = defiltrer(inflateSync(Buffer.concat(idat)), ihdr.largeur, ihdr.hauteur, bpp);
const rgba = versRGBA(px, ihdr, plte, trns);

const nl = Math.min(LARGEUR_CIBLE, ihdr.largeur);
const nh = Math.max(1, Math.round((ihdr.hauteur * nl) / ihdr.largeur));
const png = encoderPNG(reduireSurBlanc(rgba, ihdr.largeur, ihdr.hauteur, nl, nh), nl, nh);
const dataUri = `data:image/png;base64,${png.toString("base64")}`;

writeFileSync(
  sortie,
  `// VALEO — logo imprimable (bordereaux, reçus). GÉNÉRÉ, ne pas éditer à la main.
//
// Produit par \`yarn brand:build\` depuis \`assets/images/valeo-logo.png\`.
// Après avoir remplacé le logo source, relancer la commande pour que les reçus
// portent la nouvelle identité.
//
// Source : ${ihdr.largeur}×${ihdr.hauteur} → ${nl}×${nh}, composité sur blanc (papier).
export const VALEO_LOGO_PRINT =
  "${dataUri}";
`,
  "utf8",
);

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
console.log(`Logo imprimable généré : ${nl}×${nh}`);
console.log(`  source   ${ko(buf.length)}  (${ihdr.largeur}×${ihdr.hauteur}, type couleur ${ihdr.couleur})`);
console.log(`  vignette ${ko(png.length)}  → data-URI ${ko(dataUri.length)}`);
console.log(`  écrit dans src/coop/logo-print.ts`);
