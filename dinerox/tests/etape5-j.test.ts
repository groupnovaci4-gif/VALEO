/**
 * Refonte finale — décisions du fondateur sur l'étape 10 (DECISIONS.md B5bis, E5, J4).
 *  1. B5bis : l'Accueil n'affiche que les 3 messages les plus importants (alertes et échéances
 *     d'abord), puis « Voir les N › » vers l'écran Notifications, où TOUS restent consultables ;
 *     la cloche affiche le vrai nombre de non-lus.
 *  2. E5 : les messages du même type sont regroupés (7 « paiement régulier détecté » → « 7 paiements
 *     réguliers détectés », qui ouvre la liste détaillée) ; un groupe lu = tous ses messages lus.
 *  6. J4 : bouton « Saisir » posé DANS la barre (pilule vert foncé 48 × 36, libellé dessous, toucher
 *     48 dp) ; « Votre analyse » = graphique bleu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUPABLE_KINDS, groupToRead, homeToRead, markRead, readTargets, visibleToRead, type ToReadItem } from '../src/features/notifications/toRead';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const item = (id: string, over: Partial<ToReadItem> = {}): ToReadItem => ({ id, kind: 'coach', tone: 'info', text: id, keys: [], origin: 'insight', ...over });
const text = (kind: string, count: number) => `${count} × ${kind}`;

describe('E5 — regroupement des messages du même type', () => {
  const payments = Array.from({ length: 7 }, (_, i) => item(`rec_${i}`, { insightKind: 'recurring_payment' }));
  it('7 « paiement régulier détecté » → UN message « 7 … », qui ouvre la liste détaillée', () => {
    const out = groupToRead(payments, text);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('7 × recurring_payment');
    expect(out[0].link).toBe('/notifications');
    expect(out[0].members?.map((m) => m.id)).toEqual(payments.map((p) => p.id));
  });
  it('un seul message d’un type : laissé tel quel', () => {
    expect(groupToRead([payments[0]], text)).toEqual([payments[0]]);
  });
  it('alertes budget et échéances : jamais regroupées (une par une, comme la maquette)', () => {
    const alerts = [item('env_a', { kind: 'budget', tone: 'danger', insightKind: 'envelope_threshold' }), item('env_b', { kind: 'budget', tone: 'danger', insightKind: 'envelope_threshold' })];
    const dues = [item('debt_a', { insightKind: 'debt_due', dueDate: '2026-10-28' }), item('debt_b', { insightKind: 'debt_due', dueDate: '2026-10-30' })];
    expect(groupToRead([...alerts, ...dues], text)).toHaveLength(4);
    expect(GROUPABLE_KINDS).not.toContain('envelope_threshold');
    expect(GROUPABLE_KINDS).not.toContain('debt_due');
  });
  it('le groupe garde la place du premier de ses messages', () => {
    const out = groupToRead([item('a', { insightKind: 'goal_eta' }), item('x'), item('b', { insightKind: 'goal_eta' })], text);
    expect(out.map((x) => x.id)).toEqual(['grp_goal_eta', 'x']);
  });
  it('E1 : lire (× ou fin d’« Écouter ») un groupe = lire chacun de ses messages ; il ne revient pas', () => {
    const [grp] = groupToRead(payments, text);
    let store = {};
    for (const t of readTargets({ ...grp, reminder: false })) store = markRead(store, t, 1000, '2026-10-22');
    expect(visibleToRead(payments, store, 2000, '2026-10-22')).toHaveLength(0);
  });
  it('textes du regroupement (FR + EN), nouvelles clés seulement', () => {
    const f = fr as Record<string, string>, e = en as Record<string, string>;
    for (const k of GROUPABLE_KINDS) {
      expect(f[`toRead.group.${k}`], k).toMatch(/\{count\}/);
      expect(e[`toRead.group.${k}`], k).toMatch(/\{count\}/);
    }
    expect(f['toRead.group.recurring_payment']).toBe('{count} paiements réguliers détectés');
    expect(e['toRead.group.recurring_payment']).toBe('{count} recurring payments detected');
    // L'ancien texte est gardé (aucune clé supprimée).
    expect(f['ins.recurring_payment']).toBe('Paiement régulier détecté : {name}, environ {amount} par mois.');
  });
});

describe('B5bis — 3 messages à l’Accueil, alertes et échéances d’abord, « Voir les N › »', () => {
  const list = [item('conseil', { kind: 'advice', tone: 'advice', origin: 'advice' }), item('info1'), item('alerte', { kind: 'budget', tone: 'danger' }), item('echeance', { dueDate: '2026-10-28' }), item('attention', { tone: 'warning' }), item('analyse', { kind: 'analysis', origin: 'analysis' })];
  it('les 3 plus importants : alertes (danger puis attention), puis échéances', () => {
    const { shown, total } = homeToRead(list, 3);
    expect(shown.map((x) => x.id)).toEqual(['alerte', 'attention', 'echeance']);
    expect(total).toBe(6);
  });
  it('moins de 3 messages : tous, dans le même ordre d’importance', () => {
    expect(homeToRead([item('a'), item('b', { tone: 'danger' })], 3).shown.map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('l’Accueil passe par homeToRead et propose « Voir les N › » vers Notifications', () => {
    const l = read('src/features/notifications/ToReadList.tsx');
    expect(l).toMatch(/homeToRead\(/);
    expect(l).toMatch(/t\('toRead\.seeAll', \{ count: total \}\)/);
    expect(l).toMatch(/router\.push\('\/notifications'\)/);
    expect((fr as Record<string, string>)['toRead.seeAll']).toBe('Voir les {count} ›');
    expect((en as Record<string, string>)['toRead.seeAll']).toBe('See all {count} ›');
  });
  it('mention « Selon les opérations enregistrées… » (règle 17) dès qu’un message du coach est à lire, même non affiché', () => {
    expect(read('src/features/notifications/ToReadList.tsx')).toMatch(/\{items\.some\(\(x\) => x\.kind === 'coach'\) \? \(\s*<Text[^>]*>\s*\{t\('coach\.disclaimer'\)\}/);
  });
  // Décision du fondateur (22/10) : la cloche = « À lire · N » (tests/cloche.test.ts).
  it('la cloche : le nombre de « À lire · N » (useToRead().unread)', () => {
    expect(read('src/features/notifications/useToRead.ts')).toMatch(/export function useToReadCount\(\): number \{\s*return useToRead\(\)\.unread;/);
  });
  it('l’écran Notifications garde TOUS les messages : constats + conseil, coach, analyse', () => {
    const n = read('src/app/notifications.tsx');
    expect(n).toMatch(/insights\.map/);
    expect(n).toMatch(/useToRead\(\)/);
    expect(n).toMatch(/origin !== 'insight'/);
  });
});

describe('J4 — barre du bas et icône de « Votre analyse »', () => {
  const tabs = read('src/app/(tabs)/_layout.tsx');
  const mic = tabs.slice(tabs.indexOf('function MicTabButton'));
  // Décision du fondateur (22/10) : pilule de la couleur de la marque, comme la maquette
  // (#0F4A3A en clair, #4FB08F en sombre) — voir tests/barre-du-bas.test.ts.
  it('« Saisir » : pilule 48 × 36 (rayon 18) de la couleur de la marque, DANS la barre, libellé dessous', () => {
    expect(mic).toMatch(/width: 48, height: 36, borderRadius: 18/);
    expect(mic).toMatch(/backgroundColor: bar\.pill/);
    expect(mic).not.toMatch(/MIC_LIFT/);
    expect(mic).toMatch(/<TabLabel text=\{t\("entry\.mic"\)\}/);
  });
  it('même action, même accessibilité, zone de toucher 48 dp', () => {
    expect(mic).toMatch(/accessibilityLabel=\{keyboardFirst \? t\("entry\.mic\.labelKeyboard"\) : t\("entry\.mic\.label"\)\}/);
    expect(mic).toMatch(/onLongPress=/);
    expect(mic).toMatch(/minWidth: 48, minHeight: 48/);
  });
  it('« Votre analyse » : graphique bleu, quel que soit le ton', () => {
    const l = read('src/features/notifications/ToReadList.tsx');
    const look = l.slice(l.indexOf('function look'), l.indexOf('export function ToReadList'));
    expect(look.indexOf("x.kind === 'analysis'")).toBeLessThan(look.indexOf("x.tone === 'danger'"));
    expect(look).toMatch(/kind === 'analysis'\) return \{ bg: p\.blueBg, fg: p\.blueFg, icon: 'analytics' \}/);
  });
});
