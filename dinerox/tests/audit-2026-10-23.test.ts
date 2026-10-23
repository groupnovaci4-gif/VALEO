/**
 * Audit de sécurité et de régression du 23/10 (docs/audits/audit-securite-regression-2026-10-23.md),
 * partie 1 — branche design-pro : tests de COMPORTEMENT des correctifs R2, R3, R6, R7, R9, R11, R12,
 * R13 (les écrans R1, R4, R5, R8, R10 sont vérifiés par les parcours e2e).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupToRead, markRead, readKeyOf, readTargets, visibleToRead, type ReadStore, type ToReadItem } from '../src/features/notifications/toRead';
import { VoiceQueue, InterruptedError, type PreparedProvider } from '../src/services/voice/queue';
import { amountDirection } from '../src/features/home/dayGroups';
import { goalPaceKind } from '../src/features/goals/goalTile';
import { bellBadge } from '../src/theme/finalPalette';
import { contrastRatio } from '../src/theme/contrast';
import type { GoalPlan } from '../src/core/goals';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const T0 = Date.parse('2026-10-23T09:00:00Z');
const DAY = '2026-10-23';

/** Un message tel que `useToRead` le construit : sa clé de lecture suit l'espace ET le texte affiché. */
const msg = (id: string, text: string, space = 'perso', over: Partial<ToReadItem> = {}): ToReadItem => ({ id, kind: 'coach', tone: 'info', text, keys: [], readKey: readKeyOf(space, id, text), ...over });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const readAll = (store: ReadStore, xs: (ToReadItem & { reminder: boolean })[]) => xs.reduce((s, x) => readTargets(x).reduce((acc, t) => markRead(acc, t, T0, DAY), s), store);

describe('R2 — un message lu revient quand sa situation change (identifiant + empreinte du texte)', () => {
  it('même identifiant, même texte : reste lu ; texte différent : visible à nouveau', () => {
    const a = msg('rec_pace_goal1', 'À ce rythme, Moto en mars 2027.');
    const store = readAll({}, visibleToRead([a], {}, T0, DAY));
    expect(visibleToRead([a], store, T0 + 60_000, DAY)).toEqual([]);
    const changed = msg('rec_pace_goal1', 'À ce rythme, Moto en juin 2027.');
    expect(ids(visibleToRead([changed], store, T0 + 60_000, DAY))).toEqual(['rec_pace_goal1']);
  });
  it('l’empreinte est stable et dépend du texte', () => {
    expect(readKeyOf('s', 'x', 'abc')).toBe(readKeyOf('s', 'x', 'abc'));
    expect(readKeyOf('s', 'x', 'abc')).not.toBe(readKeyOf('s', 'x', 'abd'));
  });
});

describe('R3 — mémoire « lu » par espace actif (Privé / Famille)', () => {
  it('lu dans l’espace Privé : toujours à lire dans l’espace Famille', () => {
    const perso = msg('ins_budget', 'Budget Maison dépassé.', 'perso');
    const store = readAll({}, visibleToRead([perso], {}, T0, DAY));
    expect(visibleToRead([perso], store, T0 + 1000, DAY)).toEqual([]);
    const famille = msg('ins_budget', 'Budget Maison dépassé.', 'famille');
    expect(ids(visibleToRead([famille], store, T0 + 1000, DAY))).toEqual(['ins_budget']);
  });
});

describe('R2 — un regroupement lu ne masque jamais un message nouveau', () => {
  const group = (kind: string, n: number) => `${n} × ${kind}`;
  it('« 2 paiements réguliers » lu, puis un 3ᵉ arrive : le nouveau est à lire', () => {
    const a = msg('rp_a', 'Netflix chaque mois', 'perso', { insightKind: 'recurring_payment' });
    const b = msg('rp_b', 'Canal+ chaque mois', 'perso', { insightKind: 'recurring_payment' });
    const shown = groupToRead(visibleToRead([a, b], {}, T0, DAY), group);
    expect(shown).toHaveLength(1);
    const store = readAll({}, shown);
    const c = msg('rp_c', 'Orange chaque mois', 'perso', { insightKind: 'recurring_payment' });
    const after = groupToRead(visibleToRead([a, b, c], store, T0 + 1000, DAY), group);
    expect(ids(after)).toEqual(['rp_c']);
  });
  it('un membre dont le texte change revient aussi', () => {
    const a = msg('rp_a', 'Netflix 5 000', 'perso', { insightKind: 'recurring_payment' });
    const b = msg('rp_b', 'Canal+ 8 000', 'perso', { insightKind: 'recurring_payment' });
    const store = readAll({}, groupToRead(visibleToRead([a, b], {}, T0, DAY), group));
    const a2 = msg('rp_a', 'Netflix 6 500', 'perso', { insightKind: 'recurring_payment' });
    expect(ids(groupToRead(visibleToRead([a2, b], store, T0 + 1000, DAY), group))).toEqual(['rp_a']);
  });
});

// ── R12 : un seul chargement par compte ; une lecture faite pendant le chargement n'est jamais perdue ──
const disk = new Map<string, unknown>();
let pending: { key: string; resolve: (v: unknown) => void }[] = [];
let reads = 0;
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock('../src/services/storage', () => ({
  storageKey: (uid: string, ...parts: string[]) => ['t', uid, ...parts].join(':'),
  readJSON: (key: string) => {
    reads++;
    return new Promise((resolve) => pending.push({ key, resolve }));
  },
  writeJSON: async (key: string, v: unknown) => void disk.set(key, v),
}));

describe('R12 — chargement de la mémoire « lu »', () => {
  beforeEach(() => {
    pending = [];
    reads = 0;
    disk.clear();
    vi.resetModules();
  });
  it('deux écrans qui demandent le chargement en même temps : UNE seule lecture', async () => {
    const rs = await import('../src/services/readState');
    const a = rs.loadReadState('u1');
    const b = rs.loadReadState('u1');
    expect(reads).toBe(1);
    pending.forEach((p) => p.resolve({ old: { readAt: T0, readDay: DAY } }));
    await Promise.all([a, b]);
    expect(Object.keys(rs.readStateSnapshot().store)).toEqual(['old']);
  });
  it('un message fermé pendant le chargement ne réapparaît pas quand la mémoire arrive', async () => {
    const rs = await import('../src/services/readState');
    const loading = rs.loadReadState('u1');
    rs.setReadState('u1', { fresh: { readAt: T0, readDay: DAY } });
    pending.forEach((p) => p.resolve({ old: { readAt: T0, readDay: DAY } }));
    await loading;
    expect(Object.keys(rs.readStateSnapshot().store).sort()).toEqual(['fresh', 'old']);
    expect(rs.readStateSnapshot().loaded).toBe(true);
  });
});

// ── R13 : « Écouter » ne compte comme lu qu'à la VRAIE fin de la lecture ──
function provider(id: string, speak: () => Promise<void | false>, log: string[] = []): PreparedProvider {
  return {
    id,
    isAvailable: async () => true,
    speak: async () => {
      log.push(id);
      return speak();
    },
    stop: async () => undefined,
  };
}

describe('R13 — lecture interrompue ou fin non confirmée : pas « lu »', () => {
  it('interrompue (appel, coupure du système) : « stopped », sans essayer une autre voix', async () => {
    const log: string[] = [];
    const q = new VoiceQueue(() => [
      provider('premium', () => Promise.reject(new InterruptedError()), log),
      provider('device', async () => undefined, log),
    ]);
    expect(await q.enqueue('bonjour', { language: 'fr' })).toEqual({ spoken: false, reason: 'stopped' });
    expect(log).toEqual(['premium']);
  });
  it('fin jamais signalée (garde-fou de durée, voix lente) : « stopped »', async () => {
    const q = new VoiceQueue(() => [provider('device', async () => false)]);
    expect(await q.enqueue('bonjour', { language: 'fr' })).toEqual({ spoken: false, reason: 'stopped' });
  });
  it('fin réelle : « spoken »', async () => {
    const q = new VoiceQueue(() => [provider('device', async () => undefined)]);
    expect(await q.enqueue('bonjour', { language: 'fr' })).toEqual({ spoken: true, by: 'device' });
  });
  it('la voix de l’appareil distingue fin, arrêt et garde-fou', () => {
    const d = read('src/services/voice/device.ts');
    expect(d).toMatch(/onStopped: \(\) => \(clearTimeout\(guard\), reject\(new InterruptedError\(\)\)\)/);
    expect(d).toMatch(/setTimeout\(\(\) => resolve\(false\)/);
    expect(read('src/services/voice/premium.ts')).toMatch(/setTimeout\(\(\) => resolve\(false\), 30_000\)/);
  });
});

describe('R9 — un ajustement positif garde son « + »', () => {
  it('sens du montant : sortie, entrée, neutre', () => {
    expect(amountDirection({ type: 'adjustment', direction: 'in' })).toBe('in');
    expect(amountDirection({ type: 'adjustment', direction: 'out' })).toBe('out');
    expect(amountDirection({ type: 'income' })).toBe('in');
    expect(amountDirection({ type: 'expense' })).toBe('out');
    expect(amountDirection({ type: 'transfer' })).toBe('none');
  });
  it('les deux listes d’opérations utilisent ce même sens', () => {
    expect(read('src/features/home/RecentByDay.tsx')).toMatch(/amountDirection\(tx\)/);
    expect(read('src/features/rows.tsx')).toMatch(/amountDirection\(tx\)/);
  });
});

describe('R11 — pastille de la cloche lisible (contraste ≥ 4,5:1) dans les deux thèmes', () => {
  it.each([false, true])('sombre = %s', (dark) => {
    const b = bellBadge(dark);
    expect(contrastRatio(b.fg, b.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('la cloche utilise ces couleurs', () => {
    expect(read('src/components/AppHeader.tsx')).toMatch(/bellBadge\(dark\)/);
  });
});

describe('R7 — l’objectif en retard est signalé sur sa vignette', () => {
  const plan = (over: Partial<GoalPlan>): GoalPlan => ({ reached: false, overdue: false, requiredMonthly: null, estimatedDate: null, ...over }) as GoalPlan;
  it('en retard avant tout rythme ; atteint : rien', () => {
    expect(goalPaceKind(plan({ overdue: true, requiredMonthly: 10_000 }))).toBe('overdue');
    expect(goalPaceKind(plan({ requiredMonthly: 10_000 }))).toBe('monthly');
    expect(goalPaceKind(plan({ estimatedDate: '2027-03-01' }))).toBe('atPace');
    expect(goalPaceKind(plan({ reached: true, overdue: true }))).toBeNull();
  });
  it('la vignette l’écrit en rouge ; la phrase de l’enfant est écrite dans le Budget', () => {
    // Aucun parcours e2e ne se connecte en enfant : vérifié dans le code.
    const g = read('src/app/(tabs)/goals.tsx');
    expect(g).toMatch(/paceKind === 'overdue'\s*\? t\('goal\.calc\.overdue'/);
    expect(g).toMatch(/paceAlert: paceKind === 'overdue'/);
    expect(read('src/features/goals/GoalTileCard.tsx')).toMatch(/tone=\{paceAlert \? 'danger' : 'subtle'\}/);
    expect(read('src/app/(tabs)/budget.tsx')).toMatch(/\{child \? \(\s*<Text[^>]*>\s*\{t\('child\.askParent\.why'\)\}/);
  });
});

describe('R4 — « M’expliquer ce conseil (IA) » reste sur le conseil, même lu (écran Notifications)', () => {
  // L'appel réel demande un compte en ligne, une formule payante et le consentement : vérifié dans le code.
  it('l’écran Notifications (tous les messages, lus ou non) porte l’explication et la provenance du conseil', () => {
    const n = read('src/app/notifications.tsx');
    expect(n).toMatch(/x\.kind === 'advice' && advice \? \([\s\S]{0,200}<SourceTag source=\{advice\.source\} \/>\s*<AdviceAi adviceId=\{advice\.id\} text=\{x\.text\} \/>/);
    expect(n).toMatch(/const \{ all, advice, topRec \} = useToRead\(\)/);
  });
});

describe('R6 — « À lire » calculé UNE fois (cloche, accueil, budget, notifications)', () => {
  it('un seul fournisseur calcule ; les écrans le lisent', () => {
    const hook = read('src/features/notifications/useToRead.ts');
    expect(hook).toMatch(/export function ToReadProvider/);
    expect(hook).toMatch(/export function useToRead\(\)[\s\S]{0,200}useContext\(ToReadContext\)/);
    expect(read('src/app/_layout.tsx') + read('src/features/coach/CoachProvider.tsx')).toMatch(/<ToReadProvider>/);
  });
});
