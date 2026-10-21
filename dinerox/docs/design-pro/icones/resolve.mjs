/**
 * Résout chaque icône de l'inventaire : Ionicons (glyphe existant) ou Fluent Emoji 3D (dossier
 * de la bibliothèque, par le glyphe Unicode). Usage :
 *   node docs/design-pro/icones/resolve.mjs <dossier fluentui-emoji> <liste des chemins 3D>
 * Écrit docs/design-pro/icones/data.json.
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
const png3d = (dir) => pngs.find((p) => p.startsWith(`assets/${dir}/3D/`)) ?? pngs.find((p) => p.startsWith(`assets/${dir}/Default/3D/`)) ?? null;
const problems = [];
const asset = (v) => {
  if (!v) return null;
  if (v.startsWith('ion:')) {
    const n = v.slice(4);
    if (glyphs[n] == null) problems.push(`Ionicons inconnu : ${n}`);
    return { kind: 'ion', name: n, code: glyphs[n] ?? null };
  }
  const dir = byGlyph.get(norm(v));
  const file = dir ? png3d(dir) : null;
  if (!file) problems.push(`Fluent 3D absent : ${v}`);
  return { kind: 'emoji', glyph: v, dir: dir ?? null, file, slug: dir ? dir.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null };
};
const current = (v) => (v.startsWith('ion:') ? asset(v) : { kind: 'system', glyph: v });
const items = ITEMS.map((it) => ({ ...it, cur: it.cur.map(current), p: asset(it.p), choose: it.choose?.map(asset) }));
fs.writeFileSync(path.join(here, 'data.json'), JSON.stringify({ rubriques: RUBRIQUES, items }, null, 1));
const uniq = new Set(items.flatMap((i) => [i.p, ...(i.choose ?? [])]).filter((a) => a?.kind === 'emoji' && a.file).map((a) => a.file));
console.log(`${items.length} icônes ; ${items.filter((i) => i.choose).length} « À CHOISIR » ; ${items.filter((i) => i.logo).length} « logo officiel ? »`);
for (const r of RUBRIQUES) console.log(`  ${String(items.filter((i) => i.r === r).length).padStart(3)}  ${r}`);
console.log(`${uniq.size} images Fluent 3D distinctes (propositions + candidates)`);
console.log(problems.length ? problems.join('\n') : 'aucun problème');
fs.writeFileSync(path.join(fluentDir, '..', 'fluent-needed.txt'), [...uniq].join('\n'));
