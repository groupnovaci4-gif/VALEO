/**
 * Refonte finale (docs/design-pro-maquette-finale/DECISIONS.md), étape 1 — A3, A5, A6 :
 * icônes du fondateur (gaz, coiffure, cochon DE PROFIL, cuisine) et logos des opérateurs
 * (fichiers du fondateur, tuile blanche arrondie, image entière).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_ICON_SLUGS, accountMark, iconSlugFor } from '../src/components/ui/contentIconMap';
import operators from '../src/config/operators.json';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');

describe('A5 — icônes du fondateur embarquées', () => {
  it('bonbonne de gaz : le fichier du fondateur REMPLACE le provisoire', () => {
    expect(sha('assets/icons3d/bonbonne_gaz.webp')).toBe('4260ca124be9d136c0becdb2232d7b509eda6db9651ee0832cc00d476959cec8');
    expect(iconSlugFor({ ids: ['sub_housing_gas'] })).toBe('bonbonne_gaz');
  });
  it('coiffure, cochon et cuisine : nouvelles icônes (1x, 2x, 3x), fichiers du fondateur', () => {
    expect(sha('assets/icons3d/coiffure.webp')).toBe('02ca224ac02c35278c995a969401450d71be156230a59b8342fe96f951f4d3ec');
    expect(sha('assets/icons3d/pig.webp')).toBe('748cdf6a192c93221c48f108bb7e15faef666ee1eb300ac144c7928a747947b3');
    expect(sha('assets/icons3d/cooking.webp')).toBe('c752a2b22ff1b9de14da89d25579cd3cc59cbdaa86fb4a18eac27b2cbc7b4315');
    for (const slug of ['coiffure', 'pig', 'cooking']) expect(CONTENT_ICON_SLUGS).toContain(slug);
  });
  it('coiffure / beauté : le dessin du fondateur', () => {
    expect(iconSlugFor({ ids: ['sub_clothing_beauty'] })).toBe('coiffure');
  });
  it('épargne = cochon DE PROFIL partout, jamais la tête de face', () => {
    expect(CONTENT_ICON_SLUGS).not.toContain('pig-face');
    expect(iconSlugFor({ ids: ['cat_savings'] })).toBe('pig');
    expect(iconSlugFor({ ids: ['savings'] })).toBe('pig');
    expect(iconSlugFor({ emoji: '🐷' })).toBe('pig');
    expect(accountMark({ type: 'savings', provider: 'none' })).toEqual({ kind: '3d', slug: 'pig' });
    expect(read('src/components/ui/contentIcons.generated.ts')).not.toContain('pig-face');
  });
});

describe('A6 — logos des opérateurs : fichiers du fondateur', () => {
  const files: Record<string, string> = {
    orange: '8d57790ee7d7c9128d2af30a47f3c2a4933f4a78fb777cf160abc92cc437be8e',
    mtn: '6926ec0ae9466b93f245191836ce72adaf70d3adbcf0a39dd81fc9eed65d48a9',
    wave: '9c8e576357d4c00ae46ec4a7db327f3b09b25d03f39f1a1c64743d923b1c7d11',
    moov: '4f211f25438d354d9f7ff84bab4160ba142184608c02ffa5ec23d6814039a3ee',
    airtel: '8dea80ca618de251416c9ff104c37d2cb23645d19d828efda71e7b0401c62896',
  };
  it('les 5 logos sont les fichiers du fondateur, sans retouche ; plus aucun ancien logo', () => {
    for (const [id, hash] of Object.entries(files)) expect(sha(`assets/operators/${id}.png`), id).toBe(hash);
    expect(fs.readdirSync(path.join(root, 'assets/operators')).sort()).toEqual(Object.keys(files).map((id) => `${id}.png`).sort());
    const withLogo = operators.operateurs.filter((o) => o.logo).map((o) => o.logo).sort();
    expect(withLogo).toEqual(Object.keys(files).sort());
  });
  it('le registre embarque les fichiers PNG du fondateur', () => {
    const gen = read('src/components/ui/contentIconAssets.generated.ts');
    for (const id of Object.keys(files)) expect(gen).toContain(`"${id}": require('../../../assets/operators/${id}.png')`);
  });
  it('tuile BLANCHE arrondie, image ENTIÈRE (contain), en clair comme en sombre', () => {
    const src = read('src/components/ui/ContentIcon.tsx');
    const logo = src.slice(src.indexOf("mark?.kind === 'logo'"), src.indexOf("mark?.kind === 'pill'"));
    expect(logo).toMatch(/backgroundColor: '#FFFFFF'/);
    expect(logo).toMatch(/resizeMode="contain"/);
    expect(logo).toMatch(/borderRadius/);
  });
});
