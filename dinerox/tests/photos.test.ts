/**
 * Design : photo d'ambiance. Décision du fondateur (2026-10-18) : une SEULE photo dans
 * l'application, celle de l'écran de bienvenue. Registre unique (`config/photos.ts`) :
 * le fichier existe, reste léger (< 120 Ko, téléphones d'entrée de gamme), a sa licence
 * dans SOURCES.md, est embarqué dans l'application (jamais téléchargé) et n'est affiché
 * qu'une fois. Aucune autre image ne reste dans `assets/photos` (APK plus léger).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHOTOS } from '../src/config/photos';

const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'assets/photos');

/** Tous les fichiers source (.ts/.tsx) sous `src`. */
function sources(dir = join(ROOT, 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}
const usages = sources().flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/PHOTO_SOURCES\.(\w+)/g)].map((m) => ({ file: f, slot: m[1] })));

describe('photo : registre unique, une seule entrée', () => {
  it('seule la photo de l’écran de bienvenue est enregistrée', () => {
    expect(PHOTOS).toEqual({ welcome: { file: 'bienvenue-plein.webp', screen: 'src/app/(auth)/welcome.tsx' } });
  });
  it('le fichier existe et pèse moins de 120 Ko', () => {
    const path = join(DIR, PHOTOS.welcome.file);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(120 * 1024);
  });
  it('licence et source dans SOURCES.md', () => {
    expect(readFileSync(join(DIR, 'SOURCES.md'), 'utf8')).toContain(`\`${PHOTOS.welcome.file}\``);
  });
  it('aucune autre image dans assets/photos (APK plus léger)', () => {
    expect(readdirSync(DIR).filter((f) => !f.endsWith('.md'))).toEqual([PHOTOS.welcome.file]);
  });
  it('image embarquée dans l’application (require local, jamais téléchargée)', () => {
    const src = readFileSync(join(ROOT, 'src/components/ui/photoSources.ts'), 'utf8');
    expect(src).toContain(`welcome: require('../../../assets/photos/${PHOTOS.welcome.file}')`);
    expect(src).not.toMatch(/https?:\/\//);
  });
  it('affichée une seule fois, sur l’écran de bienvenue', () => {
    expect(usages).toEqual([{ file: join(ROOT, PHOTOS.welcome.screen), slot: 'welcome' }]);
  });
});
