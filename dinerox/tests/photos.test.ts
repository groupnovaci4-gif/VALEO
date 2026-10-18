/**
 * Design : photos d'ambiance, une seule par écran. Registre unique (`config/photos.ts`) :
 * chaque fichier existe, reste léger (< 120 Ko, l'application est installée sur des
 * téléphones d'entrée de gamme), a sa licence dans SOURCES.md, est embarqué dans
 * l'application (jamais téléchargé) et apparaît à un seul endroit.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHOTOS, type PhotoSlot } from '../src/config/photos';

const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'assets/photos');
const slots = Object.keys(PHOTOS) as PhotoSlot[];

/** Tous les fichiers source (.ts/.tsx) sous `src`. */
function sources(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}
const usages = sources().flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<PhotoBanner\s+photo="([^"]+)"/g)].map((m) => ({ file: f, slot: m[1] })));

describe('photos : registre unique', () => {
  it('les 7 emplacements prévus, chacun avec un fichier différent', () => {
    expect(slots.sort()).toEqual(['budget', 'goals', 'homeAdvice', 'reserve', 'savings', 'tontines', 'welcome']);
    const files = slots.map((s) => PHOTOS[s].file);
    expect(new Set(files).size).toBe(files.length);
  });
  it.each(slots)('%s : le fichier existe et pèse moins de 120 Ko', (slot) => {
    const path = join(DIR, PHOTOS[slot].file);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(120 * 1024);
  });
  it.each(slots)('%s : licence et source dans SOURCES.md', (slot) => {
    expect(readFileSync(join(DIR, 'SOURCES.md'), 'utf8')).toContain(`\`${PHOTOS[slot].file}\``);
  });
  it.each(slots)('%s : image embarquée dans l’application (require local, jamais téléchargée)', (slot) => {
    const src = readFileSync(join(ROOT, 'src/components/ui/photoSources.ts'), 'utf8');
    expect(src).toMatch(new RegExp(`${slot}: require\\('../../../assets/photos/${PHOTOS[slot].file.replace('.', '\\.')}'\\)`));
    expect(src).not.toMatch(/https?:\/\//);
  });
});

describe('photos : une seule par écran', () => {
  it.each(slots)('%s : affichée une seule fois, sur l’écran prévu', (slot) => {
    const found = usages.filter((u) => u.slot === slot);
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe(join(ROOT, PHOTOS[slot].screen));
  });
  it('aucun écran n’a plus d’une photo, et aucune photo hors registre', () => {
    const perFile = new Map<string, number>();
    for (const u of usages) perFile.set(u.file, (perFile.get(u.file) ?? 0) + 1);
    expect([...perFile.values()].every((n) => n === 1)).toBe(true);
    expect(usages.every((u) => (slots as string[]).includes(u.slot))).toBe(true);
    // L'Accueil montre la photo du conseil (carte du coach) : pas d'autre photo sur l'écran lui-même.
    expect(usages.some((u) => u.file.endsWith(join('(tabs)', 'index.tsx')))).toBe(false);
  });
});
