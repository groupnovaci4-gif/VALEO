/**
 * Refonte finale, étape 4 — NOTIFICATIONS « À lire » (DECISIONS.md B5, E1 à E4).
 * Module pur `src/features/notifications/toRead.ts` + branchements (accueil, budget, cloche, Écouter).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REMIND_AFTER_DAYS, markRead, mergeToRead, pruneReadStore, visibleToRead, type ReadStore, type ToReadItem } from '../src/features/notifications/toRead';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-20T09:00:00Z');

const item = (id: string, over: Partial<ToReadItem> = {}): ToReadItem => ({ id, kind: 'budget', tone: 'danger', text: id, keys: [id], ...over });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('E1 — un message disparaît au × ou à la fin de « Écouter »', () => {
  it('lu (×) : il disparaît', () => {
    const a = item('env_maison');
    let store: ReadStore = {};
    expect(ids(visibleToRead([a], store, T0, '2026-10-20'))).toEqual(['env_maison']);
    store = markRead(store, { id: a.id, reminder: false }, T0, '2026-10-20');
    expect(visibleToRead([a], store, T0 + 60_000, '2026-10-20')).toEqual([]);
  });
  it('« Écouter » arrivé à la fin : même effet que × (le bouton prévient à la fin, pas à l’arrêt)', () => {
    const btn = read('src/features/coach/ListenButton.tsx');
    expect(btn).toMatch(/onEnd\?: \(\) => void/);
    expect(btn).toMatch(/if \(r\.spoken\) onEnd\?\.\(\)/);
    const list = read('src/features/notifications/ToReadList.tsx');
    expect(list).toMatch(/<ListenButton text=\{x\.text\} onEnd=\{\(\) => dismiss\(x\)\} \/>/);
    expect(list).toMatch(/onPress=\{\(\) => dismiss\(x\)\}/);
  });
});

describe('E2 — UN seul rappel, après 3 jours (ou la veille d’une échéance), jamais en permanence', () => {
  const a = item('env_maison');
  const store = markRead({}, { id: a.id, reminder: false }, T0, '2026-10-20');
  it(`revient en rappel après ${REMIND_AFTER_DAYS} jours si toujours d’actualité`, () => {
    expect(REMIND_AFTER_DAYS).toBe(3);
    expect(visibleToRead([a], store, T0 + 2 * DAY, '2026-10-22')).toEqual([]);
    const back = visibleToRead([a], store, T0 + 3 * DAY, '2026-10-23');
    expect(ids(back)).toEqual(['env_maison']);
    expect(back[0].reminder).toBe(true);
  });
  it('le rappel lu : plus jamais (même 10 jours plus tard)', () => {
    const s2 = markRead(store, { id: a.id, reminder: true }, T0 + 3 * DAY, '2026-10-23');
    expect(visibleToRead([a], s2, T0 + 10 * DAY, '2026-10-30')).toEqual([]);
  });
  it('échéance : rappel la VEILLE, même avant 3 jours', () => {
    const due = item('debt_yao', { kind: 'coach', tone: 'info', dueDate: '2026-10-22' });
    const s = markRead({}, { id: due.id, reminder: false }, T0, '2026-10-20');
    expect(visibleToRead([due], s, T0 + 0.5 * DAY, '2026-10-20')).toEqual([]);
    const eve = visibleToRead([due], s, T0 + 1 * DAY, '2026-10-21');
    expect(ids(eve)).toEqual(['debt_yao']);
    expect(eve[0].reminder).toBe(true);
  });
  it('lu la veille même de l’échéance : pas de second passage le lendemain', () => {
    const due = item('debt_yao', { dueDate: '2026-10-22' });
    const s = markRead({}, { id: due.id, reminder: false }, T0 + DAY, '2026-10-21');
    expect(visibleToRead([due], s, T0 + 2 * DAY, '2026-10-22')).toEqual([]);
  });
  it('situation réglée : le message n’est plus produit, il ne revient pas', () => {
    expect(visibleToRead([], store, T0 + 5 * DAY, '2026-10-25')).toEqual([]);
  });
  it('une situation NOUVELLE (autre identifiant) crée un nouveau message', () => {
    const next = item('env_maison_2026-11');
    expect(ids(visibleToRead([a, next], store, T0 + DAY, '2026-10-21'))).toEqual(['env_maison_2026-11']);
  });
  it('mémoire locale nettoyée après 60 jours', () => {
    expect(pruneReadStore(store, T0 + 59 * DAY)).toEqual(store);
    expect(pruneReadStore(store, T0 + 61 * DAY)).toEqual({});
  });
});

describe('E3 — tous les messages, sans doublon dans une même liste', () => {
  const alert = item('ins_env_maison', { keys: ['ins_env_maison', 'envelope:maison'] });
  const coachSame = item('ins_env_maison', { kind: 'coach', tone: 'warning' });
  const coachEnv = item('envalert_maison_2026-10', { kind: 'budget', keys: ['envalert_maison_2026-10', 'envelope:maison'] });
  const coachDue = item('debt_yao', { kind: 'coach', tone: 'info' });
  const advice = item('rec_spend_more', { kind: 'advice', tone: 'advice', keys: ['rec_spend_more', 'rec:spend_more'] });
  const coachRec = item('rec_spend_more_2026-10', { kind: 'coach', tone: 'advice', keys: ['rec_spend_more_2026-10', 'rec:spend_more'] });
  const analysis = item('rec_goals_gap', { kind: 'analysis', tone: 'info', keys: ['rec_goals_gap', 'rec:goals_gap'] });
  const merged = mergeToRead([[alert], [advice], [coachSame, coachEnv, coachRec, coachDue], [analysis]]);
  it('chaque type est présent : alerte budget, conseil du jour, votre coach, votre analyse', () => {
    expect(merged.map((x) => x.kind)).toEqual(['budget', 'advice', 'coach', 'analysis']);
  });
  it('un point du coach qui répète une alerte (même identifiant ou même enveloppe) ou un conseil n’apparaît pas deux fois', () => {
    expect(ids(merged)).toEqual(['ins_env_maison', 'rec_spend_more', 'debt_yao', 'rec_goals_gap']);
  });
  it('liste du Budget : seulement les messages du budget', () => {
    expect(ids(merged.filter((x) => x.kind === 'budget'))).toEqual(['ins_env_maison']);
  });
  it('aucune source supprimée de l’application : alertes, coach, conseil (et l’explication IA), analyse', () => {
    const hook = read('src/features/notifications/useToRead.ts');
    for (const k of ['insights', 'summary', 'adviceOfDay(', 'recommendations[0]']) expect(hook).toContain(k);
    const list = read('src/features/notifications/ToReadList.tsx');
    expect(list).toMatch(/<AdviceAi /);
    expect(list).toMatch(/<SourceTag /);
    expect(list).toMatch(/t\('coach\.disclaimer'\)/);
  });
});

describe('E4 / B5 — affichage', () => {
  it('accueil : « À lire · N », « Disparaît une fois lu ou écouté », étiquette par message', () => {
    const list = read('src/features/notifications/ToReadList.tsx');
    for (const k of ['toRead.title', 'toRead.hint', 'toRead.dismiss']) expect(list).toContain(`'${k}'`);
    expect(list).toMatch(/toRead\.label\.\$\{x\.kind\}/);
    expect(read('src/features/home/ToRead.tsx')).toMatch(/<ToReadList /);
  });
  it('cloche : le nombre de messages à lire', () => {
    const h = read('src/components/AppHeader.tsx');
    expect(h).toMatch(/useToReadCount\(\)/);
  });
  it('onglet Budget : mêmes messages du budget, même comportement, « Tout marquer comme lu »', () => {
    const b = read('src/app/(tabs)/budget.tsx');
    expect(b).toMatch(/<ToReadList [^>]*budgetOnly/);
    expect(read('src/features/notifications/ToReadList.tsx')).toContain("'toRead.markAllRead'");
  });
  it('mémorisation LOCALE par identifiant, par compte', () => {
    const s = read('src/services/readState.ts');
    expect(s).toMatch(/storageKey\(uid, 'toRead'\)/);
  });
  const keys = {
    'toRead.title': ['À lire · {count}', 'To read · {count}'],
    'toRead.hint': ['Disparaît une fois lu ou écouté', 'Disappears once read or listened to'],
    'toRead.label.budget': ['Alerte budget', 'Budget alert'],
    'toRead.label.advice': ['Conseil du jour', 'Tip of the day'],
    'toRead.label.coach': ['Votre coach', 'Your coach'],
    'toRead.label.analysis': ['Votre analyse', 'Your analysis'],
    'toRead.dismiss': ['Marquer comme lu', 'Mark as read'],
    'toRead.markAllRead': ['Tout marquer comme lu', 'Mark all as read'],
    'toRead.reminder': ['Rappel', 'Reminder'],
  } as const;
  it.each(Object.entries(keys))('texte %s (FR et EN)', (k, [f, e]) => {
    expect((fr as Record<string, string>)[k]).toBe(f);
    expect((en as Record<string, string>)[k]).toBe(e);
  });
});
