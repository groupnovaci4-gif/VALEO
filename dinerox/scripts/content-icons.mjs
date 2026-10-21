/**
 * Génère le registre des icônes de contenu (design-pro, docs/design-system.md › Icônes) depuis la
 * planche validée par le fondateur (docs/design-pro/icones/data.json) :
 *   - src/components/ui/contentIcons.generated.ts : identifiant → icône, emoji → icône (pur, testé) ;
 *   - src/components/ui/contentIconAssets.generated.ts : icône → fichier (require, application).
 * Les fichiers WebP (1x / @2x / @3x) sont dans assets/icons3d/ et assets/operators/.
 * Usage : node scripts/content-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const { items } = JSON.parse(fs.readFileSync(path.join(root, 'docs/design-pro/icones/data.json'), 'utf8'));
const operators = JSON.parse(fs.readFileSync(path.join(root, 'src/config/operators.json'), 'utf8')).operateurs;

// Sans le sélecteur de variante (U+FE0F) : « 🏍️ » et « 🏍 » désignent la même icône.
const norm = (g) => g.replace(/️/g, '');
const is3d = (a) => a && ['emoji', 'compo', 'slot'].includes(a.kind) && a.slug;

const byId = {};
const byEmoji = {};
for (const i of items) if (is3d(i.p)) byId[i.id] = i.p.slug;
// 1) l'emoji proposé lui-même ; 2) l'emoji ACTUEL de la ligne, s'il n'est pas déjà pris.
for (const i of items) if (is3d(i.p) && i.p.glyph) byEmoji[norm(i.p.glyph)] ??= i.p.slug;
for (const i of items) if (is3d(i.p)) for (const c of i.cur) if (c.kind === 'system') byEmoji[norm(c.glyph)] ??= i.p.slug;

const slugs = [...new Set(Object.values(byId))].sort();
for (const s of slugs) for (const suf of ['', '@2x', '@3x']) {
  if (!fs.existsSync(path.join(root, 'assets/icons3d', `${s}${suf}.webp`))) throw new Error(`fichier manquant : assets/icons3d/${s}${suf}.webp`);
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const head = '/* Généré par scripts/content-icons.mjs depuis docs/design-pro/icones/data.json — ne pas modifier à la main. */\n';

fs.writeFileSync(
  path.join(root, 'src/components/ui/contentIcons.generated.ts'),
  `${head}/** Identifiant (catégorie, sous-catégorie, revenu, type de compte « acc.* », famille d'objectif « goal.* », modèle d'objectif…) → icône. */
export const ICON_BY_ID: Record<string, string> = ${JSON.stringify(sorted(byId), null, 2)};

/** Emoji (sans U+FE0F) → icône : emojis proposés par la planche, puis emojis actuels de l'application. */
export const ICON_BY_EMOJI: Record<string, string> = ${JSON.stringify(sorted(byEmoji), null, 2)};

export const CONTENT_ICON_SLUGS: readonly string[] = ${JSON.stringify(slugs, null, 2)};
`,
);

const req = (dir, s) => `  ${JSON.stringify(s)}: require('../../../assets/${dir}/${s}.webp'),`;
fs.writeFileSync(
  path.join(root, 'src/components/ui/contentIconAssets.generated.ts'),
  `${head}/** Icône → fichier embarqué (Metro choisit @2x / @3x selon l'écran). */
export const ICON_ASSETS: Record<string, number> = {
${slugs.map((s) => req('icons3d', s)).join('\n')}
};

/** Logos des opérateurs (assets/operators, sources : docs/design-pro/logos/SOURCES.md). */
export const OPERATOR_ASSETS: Record<string, number> = {
${operators.filter((o) => o.logo).map((o) => req('operators', o.logo)).join('\n')}
};
`,
);
console.log(`${slugs.length} icônes, ${Object.keys(byId).length} identifiants, ${Object.keys(byEmoji).length} emojis, ${operators.filter((o) => o.logo).length} logos`);
