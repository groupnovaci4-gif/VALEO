/**
 * Résout chaque icône de l'inventaire : Ionicons (glyphe existant) ou Fluent Emoji 3D (dossier
 * de la bibliothèque, par le glyphe Unicode). Usage :
 *   node docs/design-pro/icones/resolve.mjs <dossier fluentui-emoji> <liste des chemins 3D>
 * Écrit docs/design-pro/icones/data.json.
 *
 * Teinte de peau : MOYENNE-FONCÉE (Medium-Dark) pour tout personnage ou main qui existe en
 * plusieurs teintes (décision du fondateur, 2026-10-21).
 * Autres sources : 'compo:<fichier>' (icônes composées validées, ../../design-pro-icones-composees),
 * 'slot:<nom>=<emoji>' (emplacement d'une icône à dessiner plus tard, provisoirement l'emoji ;
 * le fichier garde le nom <nom>), 'logo:<opérateur>' (operateurs.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, RUBRIQUES } from './inventaire.mjs';

const [fluentDir, list3d] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const glyphs = JSON.parse(fs.readFileSync('node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json', 'utf8'));
const norm = (g) => g.replace(/️/g, '');
const byGlyph = new Map();
for (const dir of fs.readdirSync(path.join(fluentDir, 'assets'))) {
  const m = JSON.parse(fs.readFileSync(path.join(fluentDir, 'assets', dir, 'metadata.json'), 'utf8'));
  byGlyph.set(norm(m.glyph), dir);
}
const pngs = fs.readFileSync(list3d, 'utf8').split('\n').filter(Boolean);
const TONE = 'Medium-Dark';
const png3d = (dir) => pngs.find((p) => p.startsWith(`assets/${dir}/3D/`)) ?? pngs.find((p) => p.startsWith(`assets/${dir}/${TONE}/3D/`)) ?? null;
const operators = JSON.parse(fs.readFileSync(path.join(here, 'operateurs.json'), 'utf8')).operateurs;
const problems = [];
const asset = (v) => {
  if (!v) return null;
  if (v.startsWith('ion:')) {
    const n = v.slice(4);
    if (glyphs[n] == null) problems.push(`Ionicons inconnu : ${n}`);
    return { kind: 'ion', name: n, code: glyphs[n] ?? null };
  }
  if (v.startsWith('compo:')) return { kind: 'compo', slug: v.slice(6), src: `design-pro-icones-composees/${v.slice(6)}.png` };
  if (v.startsWith('logo:')) {
    const op = operators.find((o) => o.id === v.slice(5));
    if (!op) problems.push(`opérateur inconnu : ${v}`);
    return { kind: 'logo', operator: v.slice(5) };
  }
  if (v.startsWith('slot:')) {
    const [slug, glyph] = v.slice(5).split('=');
    return { ...asset(glyph), kind: 'slot', slug, placeholder: glyph };
  }
  const dir = byGlyph.get(norm(v));
  const file = dir ? png3d(dir) : null;
  if (!file) problems.push(`Fluent 3D absent : ${v}`);
  const toned = file?.includes(`/${TONE}/`);
  return { kind: 'emoji', glyph: v, dir: dir ?? null, file, toned, slug: dir ? dir.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (toned ? '-medium-dark' : '') : null };
};
const current = (v) => (v.startsWith('ion:') ? asset(v) : { kind: 'system', glyph: v });
const items = ITEMS.map((it) => ({ ...it, cur: it.cur.map(current), p: asset(it.p), choose: it.choose?.map(asset) }));
fs.writeFileSync(path.join(here, 'data.json'), JSON.stringify({ rubriques: RUBRIQUES, items }, null, 1));
const uniq = new Set(items.flatMap((i) => [i.p, ...(i.choose ?? [])]).filter((a) => (a?.kind === 'emoji' || a?.kind === 'slot') && a.file).map((a) => a.file));
console.log(`${items.length} icônes ; ${items.filter((i) => i.choose).length} « À CHOISIR » ; ${items.filter((i) => i.logo === 'operator').length} logos d'opérateurs ; ${items.filter((i) => i.logo === 'brand').length} logos de marque (Ionicons)`);
for (const r of RUBRIQUES) console.log(`  ${String(items.filter((i) => i.r === r).length).padStart(3)}  ${r}`);
console.log(`${uniq.size} images Fluent 3D distinctes ; ${new Set(items.filter((i) => i.p?.kind === 'compo').map((i) => i.p.slug)).size} icônes composées`);
console.log(problems.length ? problems.join('\n') : 'aucun problème');
fs.writeFileSync(path.join(fluentDir, '..', 'fluent-needed.txt'), [...uniq].join('\n'));
