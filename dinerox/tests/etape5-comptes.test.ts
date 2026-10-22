/**
 * Refonte finale, étape 8 — COMPTES (DECISIONS.md G1 ; FINAL-comptes.png,
 * ecrans/maquette-comptes-index.html › accountsfull).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountMark } from '../src/components/ui/contentIconMap';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = read('src/app/accounts/index.tsx');

describe('G1 — écran Comptes', () => {
  it('direction B (icônes 3D et logos visibles) : l’écran passe en DesignV2', () => {
    expect(src).toMatch(/<DesignV2>/);
  });
  it('« Comptes » + « + », bandeau « DineroX ne détient pas votre argent » sur fond sable', () => {
    expect(src).toMatch(/title=\{t\('acc\.title'\)\}/);
    expect(src).toMatch(/icon="add"/);
    expect(src).toMatch(/t\('acc\.trackingNotice'\)/);
    expect(src).toMatch(/backgroundColor: colors\.surfaceAlt, borderRadius: 20/);
  });
  it('« Argent disponible » en grand (34/40) dans une carte', () => {
    expect(src).toMatch(/t\('home\.available'\)/);
    expect(src).toMatch(/fontSize: 34, lineHeight: 40/);
  });
  it('comptes puis épargne, en liste (une carte, une ligne de 64 dp par compte, chevron)', () => {
    expect(src).toMatch(/t\('acc\.title'\)/);
    expect(src).toMatch(/t\('sav\.title'\)/);
    expect(src).toMatch(/<AccountRow /);
    const row = read('src/features/rows.tsx');
    const a = row.slice(row.indexOf('export function AccountRow'));
    expect(a).toMatch(/minHeight: 64/);
    expect(a).toMatch(/chevron/);
  });
  it('icônes 3D pour Cash, banque, épargne (cochon de profil) ; logos du fondateur pour les opérateurs', () => {
    expect(accountMark({ type: 'cash', provider: 'none' })).toEqual({ kind: '3d', slug: 'dollar-banknote' });
    expect(accountMark({ type: 'bank', provider: 'bank' })).toEqual({ kind: '3d', slug: 'bank' });
    expect(accountMark({ type: 'savings', provider: 'none' })).toEqual({ kind: '3d', slug: 'pig' });
    expect(accountMark({ type: 'mobile_money', provider: 'orange_money' })).toEqual({ kind: 'logo', operator: 'orange' });
  });
});
