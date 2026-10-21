/**
 * « Argent disponible » : UN seul chiffre dans l'application (audit design-pro, § 15.1).
 * L'Accueil affiche `positionOf().available` (argent disponible D : comptes courants moins les
 * mises de côté) ; l'ancien `moneyPosition().available` est le TOTAL des comptes courants, un
 * autre chiffre. Avec la démonstration du 21 octobre : 655 500 FCFA contre 705 500 FCFA.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moneyPosition } from '../src/core/balance';
import { buildDemoData } from '../src/core/demo';
import { positionOf } from '../src/core/position';
import { buildFinanceSummary } from '../src/core/ai/summary';

const TODAY = '2026-10-21';
const demo = buildDemoData({ now: Date.parse(`${TODAY}T10:00:00`), uid: 'demo', today: TODAY, label: (k) => k });
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('argent disponible : un seul chiffre', () => {
  it('le piège existe : total des comptes courants ≠ argent disponible de l’Accueil', () => {
    const old = moneyPosition(demo.accounts, demo.transactions, demo.goals, demo.goalContributions, 'XOF', TODAY);
    expect(old.available).not.toBe(positionOf(demo, 'XOF', TODAY).available);
    expect(old.free).toBe(positionOf(demo, 'XOF', TODAY).available);
  });

  it('écran Comptes : le montant sous « Argent disponible » vient de useFinance().money, comme l’Accueil', () => {
    const screen = src('src/app/accounts/index.tsx');
    expect(screen).toContain("t('home.available')");
    expect(screen).toMatch(/\{[^}]*\bmoney: *(\w+)[^}]*\} *= *useFinance\(\)/);
    const name = screen.match(/\bmoney: *(\w+)/)![1];
    expect(screen).toContain(`money(${name}.available)`);
    expect(screen).not.toMatch(/\bposition\.available\b/);
  });

  it('résumé de l’assistant en ligne : position.available = argent disponible de l’Accueil, total des comptes nommé à part', () => {
    const s = buildFinanceSummary(demo, 'XOF', TODAY, (id) => id);
    const p = positionOf(demo, 'XOF', TODAY);
    const old = moneyPosition(demo.accounts, demo.transactions, demo.goals, demo.goalContributions, 'XOF', TODAY);
    expect(s.position.available).toBe(p.available);
    expect(s.position.currentAccounts).toBe(old.available);
    expect(s.position.savings).toBe(old.savings);
    // Plus de champ « free » : deux noms pour un même chiffre, c'est ce qui créait l'ambiguïté.
    expect(Object.keys(s.position).sort()).toEqual(['available', 'currentAccounts', 'savings']);
  });
});
