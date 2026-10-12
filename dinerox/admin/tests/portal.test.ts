import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inviteUrl, parseInviteUrl } from '../src/pages/inviteUrl';
import { ACTION_TEXTS, actionLang, at } from '../src/pages/actionTexts';
import { codeOf, errorText } from '../src/messages';
import { brand } from '../../src/config/brand';

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const SRC = files(new URL('../src', import.meta.url).pathname).filter((f) => /\.(ts|tsx|css)$/.test(f));

describe('portail : règles de sécurité et de marque', () => {
  it('n’importe jamais Firestore (tout passe par les Cloud Functions bo…)', () => {
    for (const f of SRC) expect(readFileSync(f, 'utf8'), f).not.toMatch(/firebase\/firestore|getFirestore/);
  });
  it('n’écrit en dur ni le nom, ni les couleurs, ni l’adresse de la marque (lus dans brand.ts)', () => {
    // Le nom (casse exacte : l'identifiant technique du projet d'émulation n'est pas le nom affiché),
    // l'adresse de support et les couleurs (toutes casses).
    const colors = [brand.supportEmail, ...Object.values(brand.colors)].map((v) => v.toLowerCase());
    for (const f of SRC) {
      const raw = readFileSync(f, 'utf8');
      expect(raw.includes(brand.name), `${f} contient « ${brand.name} »`).toBe(false);
      for (const v of colors) expect(raw.toLowerCase().includes(v), `${f} contient « ${v} »`).toBe(false);
    }
  });
});

describe('liens d’invitation', () => {
  it('jeton après « # » (lien copié) ou en paramètre (lien de suite d’un e-mail)', () => {
    const url = inviteUrl('inv1', 'abc_DEF-123', 'https://bo.exemple');
    expect(url).toBe('https://bo.exemple/invitation?i=inv1#t=abc_DEF-123');
    expect(parseInviteUrl(url)).toEqual({ inviteId: 'inv1', token: 'abc_DEF-123' });
    expect(parseInviteUrl('https://bo.exemple/invitation?i=inv1&t=xyz')).toEqual({ inviteId: 'inv1', token: 'xyz' });
    expect(parseInviteUrl('https://bo.exemple/invitation?i=inv1')).toBeNull();
    expect(parseInviteUrl('pas une adresse')).toBeNull();
  });
});

describe('page d’action des e-mails : FR et EN', () => {
  it('mêmes clés et mêmes paramètres dans les deux langues', () => {
    expect(Object.keys(ACTION_TEXTS.en).sort()).toEqual(Object.keys(ACTION_TEXTS.fr).sort());
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(ACTION_TEXTS.fr) as (keyof typeof ACTION_TEXTS.fr)[]) expect(params(ACTION_TEXTS.en[k]), k).toBe(params(ACTION_TEXTS.fr[k]));
  });
  it('langue : paramètre « lang » de Firebase, sinon celle du navigateur ; français par défaut', () => {
    expect(actionLang(new URLSearchParams('lang=en'), 'fr-FR')).toBe('en');
    expect(actionLang(new URLSearchParams('lang=fr'), 'en-US')).toBe('fr');
    expect(actionLang(new URLSearchParams(''), 'en-GB')).toBe('en');
    expect(actionLang(new URLSearchParams(''), 'wo-SN')).toBe('fr');
    expect(at('fr', 'resetFor', { email: 'a@b.ci' })).toBe('Pour le compte a@b.ci');
  });
});

describe('messages d’erreur', () => {
  it('le code du serveur est lu même quand le SDK ajoute le statut HTTP', () => {
    expect(codeOf({ message: 'bo/login-failed [401]' })).toBe('bo/login-failed');
    expect(errorText({ message: 'bo/permission [403]' })).toContain('Action refusée');
    expect(errorText({ message: 'inconnu' })).toBe('Une erreur est survenue. Réessayez.');
  });
});
