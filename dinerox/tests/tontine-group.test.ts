/**
 * Croissance, étape 3 — tontine partagée : logique PURE du serveur
 * (firebase/functions/src/tontineGroup.ts). Chaque décision du fondateur a son test.
 */
import { describe, expect, it } from 'vitest';
import * as tg from '../firebase/functions/src/tontineGroup';
import { nthDate as coreNthDate } from '../src/core/tontine';

const NOW = Date.UTC(2026, 9, 14, 10);
const ORG = 'org';
const A = 'awa';
const B = 'kofi';
const OUT = 'inconnu';

const base = (over: Partial<tg.CreateInput> = {}): tg.CreateInput => ({
  name: 'Tontine du marché',
  currency: 'XOF',
  amountPerShare: 10000,
  frequency: 'weekly',
  startDate: '2026-10-19',
  slotsCount: 4,
  organizerLabel: 'Fatou',
  ...over,
});

/** Groupe de 4 places : l'organisateur (s1), Awa (s2), Kofi (s3), une place libre (s4). */
function group(): tg.Group {
  let g = tg.createGroup(base(), ORG, NOW).group;
  g = tg.approveJoin(g, ORG, { uid: A, label: 'Awa' }, ['s2'], NOW).group;
  g = tg.approveJoin(g, ORG, { uid: B, label: 'Kofi' }, ['s3'], NOW).group;
  return g;
}

const code = (f: () => unknown) => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return (e as tg.TgFailure).code;
  }
};

describe('création', () => {
  it('tournante uniquement, places numérotées : seule la place de l’organisateur est liée', () => {
    const { group, history } = tg.createGroup(base({ organizerSlots: 2 }), ORG, NOW);
    expect(group.type).toBe('rotating');
    expect(group.slots.map((s) => [s.slotId, s.turnOrder, s.uid, s.label])).toEqual([
      ['s1', 1, ORG, 'Fatou'],
      ['s2', 2, ORG, 'Fatou'],
      ['s3', 3, null, null],
      ['s4', 4, null, null],
    ]);
    expect(group.memberUids).toEqual([ORG]);
    expect(history[0]).toMatchObject({ action: 'create', visibility: 'all' });
    expect(JSON.stringify(group)).not.toMatch(/phone|téléphone|tel/i);
  });
  it('paramètres invalides refusés', () => {
    expect(tg.validateCreate(base({ name: '' }))).toContain('tg/name');
    expect(tg.validateCreate(base({ amountPerShare: 0 }))).toContain('tg/amount');
    expect(tg.validateCreate(base({ amountPerShare: 10.5 }))).toContain('tg/amount');
    expect(tg.validateCreate(base({ frequency: 'yearly' }))).toContain('tg/frequency');
    expect(tg.validateCreate(base({ frequency: 'custom' }))).toContain('tg/customDays');
    expect(tg.validateCreate(base({ slotsCount: 1 }))).toContain('tg/slots');
    expect(tg.validateCreate(base({ slotsCount: 51 }))).toContain('tg/slots');
    expect(tg.validateCreate(base({ organizerSlots: 4 }))).toContain('tg/organizerSlots');
    expect(tg.validateCreate(base({ startDate: '19/10/2026' }))).toContain('tg/startDate');
    expect(tg.validateCreate(base({ organizerLabel: ' ' }))).toContain('tg/label');
  });
  it('dates : identiques au carnet personnel (T1)', () => {
    for (const frequency of ['daily', 'weekly', 'biweekly', 'monthly', 'custom'] as const) {
      const g = { frequency, cycleStart: '2026-01-31', customDays: 10 };
      for (let i = 0; i < 14; i++) expect(tg.nthDate(g, i), `${frequency} ${i}`).toBe(coreNthDate({ frequency, startDate: '2026-01-31', customDays: 10 }, i));
    }
  });
});

describe('personne n’est membre sans l’avoir demandé', () => {
  it('seul l’organisateur valide une demande, sur une place libre, avec le nom choisi par la personne', () => {
    const g = tg.createGroup(base(), ORG, NOW).group;
    expect(code(() => tg.approveJoin(g, A, { uid: A, label: 'Awa' }, ['s2'], NOW))).toBe('tg/not-organizer');
    expect(code(() => tg.approveJoin(g, ORG, { uid: A, label: 'Awa' }, ['s1'], NOW))).toBe('tg/slot-taken');
    expect(code(() => tg.approveJoin(g, ORG, { uid: A, label: '' }, ['s2'], NOW))).toBe('tg/label');
    expect(code(() => tg.approveJoin(g, ORG, { uid: A, label: 'Awa' }, [], NOW))).toBe('tg/slot');
    const r = tg.approveJoin(g, ORG, { uid: A, label: 'Awa' }, ['s2'], NOW);
    expect(r.group.memberUids).toEqual([ORG, A]);
    expect(r.group.slots[1]).toMatchObject({ uid: A, label: 'Awa' });
    expect(r.history[0]).toMatchObject({ action: 'join_approved', by: ORG, slotUid: A });
  });
  it('groupe complet : plus de place libre', () => {
    let g = group();
    expect(tg.hasFreeSlot(g)).toBe(true);
    g = tg.approveJoin(g, ORG, { uid: 'z', label: 'Zoé' }, ['s4'], NOW).group;
    expect(tg.hasFreeSlot(g)).toBe(false);
  });
});

describe('ordre des tours et tirage', () => {
  it('ordre fixé par l’organisateur : permutation complète, inscrite à l’historique', () => {
    const g = group();
    expect(code(() => tg.setOrder(g, A, ['s4', 's3', 's2', 's1'], NOW))).toBe('tg/not-organizer');
    expect(code(() => tg.setOrder(g, ORG, ['s1', 's1', 's2', 's3'], NOW))).toBe('tg/order');
    const r = tg.setOrder(g, ORG, ['s4', 's3', 's2', 's1'], NOW);
    expect(r.group.slots.map((s) => [s.slotId, s.turnOrder])).toEqual([['s1', 4], ['s2', 3], ['s3', 2], ['s4', 1]]);
    expect(r.history[0]).toMatchObject({ action: 'order', visibility: 'all', info: { order: ['s4', 's3', 's2', 's1'] } });
  });
  it('tirage au sort côté serveur UNE SEULE FOIS, résultat et date inscrits, visibles de tous', () => {
    const g = group();
    let k = 0;
    const seq = [0.9, 0.1, 0.5];
    const r = tg.draw(g, ORG, () => seq[k++ % seq.length], NOW);
    expect(r.group.drawnAt).toBe(NOW);
    expect(new Set(r.group.slots.map((s) => s.turnOrder))).toEqual(new Set([1, 2, 3, 4]));
    expect(r.history[0]).toMatchObject({ action: 'draw', visibility: 'all', at: NOW });
    expect(code(() => tg.draw(r.group, ORG, Math.random, NOW))).toBe('tg/already-drawn');
    expect(code(() => tg.draw(g, A, Math.random, NOW))).toBe('tg/not-organizer');
  });
});

describe('trésorier', () => {
  it('un seul, choisi par l’organisateur parmi les membres qui ont accepté', () => {
    const g = group();
    expect(code(() => tg.setTreasurer(g, A, B, NOW))).toBe('tg/not-organizer');
    expect(code(() => tg.setTreasurer(g, ORG, OUT, NOW))).toBe('tg/treasurer');
    expect(code(() => tg.setTreasurer(g, ORG, ORG, NOW))).toBe('tg/treasurer');
    const r = tg.setTreasurer(g, ORG, A, NOW);
    expect(r.group.treasurerUid).toBe(A);
    expect(tg.setTreasurer(r.group, ORG, B, NOW).group.treasurerUid).toBe(B);
    expect(tg.setTreasurer(r.group, ORG, null, NOW).group.treasurerUid).toBeNull();
  });
});

describe('paiements : des statuts, aucun argent', () => {
  it('un membre ne déclare QUE son propre paiement', () => {
    const g = group();
    expect(code(() => tg.declarePayment(g, null, A, { period: 1, slotId: 's3' }, NOW))).toBe('tg/not-your-slot');
    expect(code(() => tg.declarePayment(g, null, OUT, { period: 1, slotId: 's2' }, NOW))).toBe('tg/not-member');
    expect(code(() => tg.declarePayment(g, null, A, { period: 5, slotId: 's2' }, NOW))).toBe('tg/period');
    const r = tg.declarePayment(g, null, A, { period: 1, slotId: 's2' }, NOW);
    expect(r.payment).toMatchObject({ id: '1_1_s2', data: { status: 'declared', declaredBy: A, uid: A } });
    expect(r.payment?.data).not.toHaveProperty('amount');
    expect(r.history[0]).toMatchObject({ action: 'declare', visibility: 'managers', slotUid: A });
  });
  it('confirmation par l’organisateur OU le trésorier ; l’historique note qui a confirmé ; « payé » public', () => {
    let g = tg.setTreasurer(group(), ORG, A, NOW).group;
    const declared = tg.declarePayment(g, null, B, { period: 1, slotId: 's3' }, NOW).payment!.data;
    expect(code(() => tg.confirmPayment(g, declared, B, { period: 1, slotId: 's3' }, NOW))).toBe('tg/not-manager');
    const r = tg.confirmPayment(g, declared, A, { period: 1, slotId: 's3' }, NOW);
    expect(r.payment?.data).toMatchObject({ status: 'confirmed', confirmedBy: A });
    expect(r.group.paid['1_1_s3']).toBe(true);
    expect(r.history[0]).toMatchObject({ action: 'confirm', visibility: 'all', by: A, info: { confirmedBy: A } });
    g = r.group;
    expect(code(() => tg.confirmPayment(g, r.payment!.data, ORG, { period: 1, slotId: 's3' }, NOW))).toBe('tg/already-confirmed');
    // Place sans compte, payée en main propre : l'organisateur peut confirmer.
    expect(tg.confirmPayment(g, null, ORG, { period: 1, slotId: 's4' }, NOW).group.paid['1_1_s4']).toBe(true);
  });
  it('contestation : seulement une déclaration, par un gestionnaire, visible des gestionnaires et de la personne', () => {
    const g = group();
    expect(code(() => tg.disputePayment(g, null, ORG, { period: 1, slotId: 's2' }, NOW))).toBe('tg/not-declared');
    const declared = tg.declarePayment(g, null, A, { period: 1, slotId: 's2' }, NOW).payment!.data;
    expect(code(() => tg.disputePayment(g, declared, B, { period: 1, slotId: 's2' }, NOW))).toBe('tg/not-manager');
    const r = tg.disputePayment(g, declared, ORG, { period: 1, slotId: 's2' }, NOW);
    expect(r.payment?.data).toMatchObject({ status: 'disputed', disputedBy: ORG });
    expect(r.history[0]).toMatchObject({ visibility: 'managers', slotUid: A });
  });
});

describe('statuts visibles (décision 7)', () => {
  it('tous voient « payé » ou « pas encore » ; « en retard », « déclaré », « contesté » : organisateur, trésorier, personne concernée', () => {
    let g = tg.setTreasurer(group(), ORG, A, NOW).group;
    const s3 = g.slots.find((s) => s.slotId === 's3')!;
    const s2 = g.slots.find((s) => s.slotId === 's2')!;
    const later = '2026-11-30'; // période 1 (19/10) passée
    // Kofi (s3) n'a pas payé le tour 1 : en retard pour lui, l'organisateur et la trésorière ; « pas encore » pour les autres.
    expect(tg.slotStatusFor(g, null, s3, 1, B, later)).toBe('late');
    expect(tg.slotStatusFor(g, null, s3, 1, ORG, later)).toBe('late');
    expect(tg.slotStatusFor(g, null, s3, 1, A, later)).toBe('late'); // trésorière
    g = tg.setTreasurer(g, ORG, null, NOW).group;
    expect(tg.slotStatusFor(g, null, s3, 1, A, later)).toBe('not_yet'); // simple membre
    // Déclaration d'Awa : visible d'elle et de l'organisateur, « pas encore » pour Kofi.
    const declared = tg.declarePayment(g, null, A, { period: 1, slotId: 's2' }, NOW).payment!.data;
    expect(tg.slotStatusFor(g, declared, s2, 1, A, later)).toBe('declared');
    expect(tg.slotStatusFor(g, declared, s2, 1, ORG, later)).toBe('declared');
    expect(tg.slotStatusFor(g, declared, s2, 1, B, later)).toBe('not_yet');
    // Confirmé : « payé » pour tout le monde.
    g = tg.confirmPayment(g, declared, ORG, { period: 1, slotId: 's2' }, NOW).group;
    for (const viewer of [A, B, ORG]) expect(tg.slotStatusFor(g, null, s2, 1, viewer, later)).toBe('paid');
    // Avant l'échéance : « pas encore », jamais « en retard ».
    expect(tg.slotStatusFor(g, null, s3, 1, ORG, '2026-10-19')).toBe('not_yet');
  });
});

describe('départ et compte supprimé', () => {
  it('un membre qui part perd l’accès ; sa place devient « ancien membre » ; l’organisateur ne peut pas partir', () => {
    const g = tg.setTreasurer(group(), ORG, A, NOW).group;
    expect(code(() => tg.leave(g, ORG, NOW))).toBe('tg/organizer-cannot-leave');
    expect(code(() => tg.leave(g, OUT, NOW))).toBe('tg/not-member');
    const r = tg.leave(g, A, NOW);
    expect(r.group.memberUids).not.toContain(A);
    expect(r.group.slots[1]).toMatchObject({ uid: null, label: null, former: true });
    expect(r.group.treasurerUid).toBeNull();
  });
  it('compte de l’organisateur supprimé : le trésorier reprend ; sans trésorier, groupe figé (lecture seule)', () => {
    const withT = tg.setTreasurer(group(), ORG, A, NOW).group;
    const r = tg.accountDeleted(withT, ORG, NOW);
    expect(r.group).toMatchObject({ organizerUid: A, treasurerUid: null, status: 'active' });
    expect(r.history.map((h) => h.action)).toEqual(['account_deleted', 'organizer_transferred']);
    const orphan = tg.accountDeleted(group(), ORG, NOW).group;
    expect(orphan.status).toBe('orphaned');
    expect(code(() => tg.setOrder(orphan, ORG, ['s1', 's2', 's3', 's4'], NOW))).toBe('tg/orphaned');
    // Un membre supprimé : place libérée, historique intact (rien n'est effacé).
    expect(tg.accountDeleted(group(), B, NOW).group.slots[2]).toMatchObject({ uid: null, former: true });
  });
});

describe('cycles et paramètres', () => {
  it('nouveau cycle seulement après le dernier tour ; mêmes membres et même ordre', () => {
    const g = group();
    expect(code(() => tg.newCycle(g, ORG, '2026-11-01', NOW))).toBe('tg/cycle-not-finished');
    const last = tg.nthDate(g, 3); // 4 places hebdomadaires
    const r = tg.newCycle(g, ORG, last, NOW);
    expect(r.group.cycle).toBe(2);
    expect(r.group.cycleStart).toBe(tg.nthDate(g, 4));
    expect(r.group.memberUids).toEqual(g.memberUids);
    expect(code(() => tg.newCycle(g, A, last, NOW))).toBe('tg/not-organizer');
  });
  it('paramètres : nom, cotisation, cagnotte, par l’organisateur, inscrits à l’historique', () => {
    const g = group();
    expect(code(() => tg.updateSettings(g, A, { name: 'X' }, NOW))).toBe('tg/not-organizer');
    const r = tg.updateSettings(g, ORG, { amountPerShare: 15000, name: 'Tontine du quartier' }, NOW);
    expect(r.group).toMatchObject({ amountPerShare: 15000, name: 'Tontine du quartier' });
    expect(r.history[0]).toMatchObject({ action: 'settings', info: { fields: ['name', 'amountPerShare'] } });
  });
});

describe('invitation', () => {
  it('7 jours par défaut, réglable ; expirée refusée', () => {
    const g = group();
    expect(code(() => tg.makeInvite(g, 'g1', A, {}, NOW))).toBe('tg/not-organizer');
    const inv = tg.makeInvite(g, 'g1', ORG, {}, NOW);
    expect(inv.expiresAt - NOW).toBe(7 * 24 * 3600 * 1000);
    expect(inv.showAmount).toBe(false);
    expect(tg.makeInvite(g, 'g1', ORG, { days: 3 }, NOW).expiresAt - NOW).toBe(3 * 24 * 3600 * 1000);
    expect(tg.inviteExpired(inv, NOW + 7 * 24 * 3600 * 1000 + 1)).toBe(true);
  });
  it('aperçu : jamais la liste des membres ; cotisation seulement si l’organisateur l’a cochée', () => {
    const g = group();
    const hidden = tg.invitePreview(tg.makeInvite(g, 'g1', ORG, {}, NOW), g, NOW);
    expect(hidden).toEqual({ name: 'Tontine du marché', frequency: 'weekly', customDays: null, slots: 4, full: false, expired: false });
    expect(JSON.stringify(hidden)).not.toMatch(/Awa|Kofi|Fatou|uid|10000/);
    const shown = tg.invitePreview(tg.makeInvite(g, 'g1', ORG, { showAmount: true }, NOW), g, NOW);
    expect(shown).toMatchObject({ currency: 'XOF', amountPerShare: 10000 });
    expect(JSON.stringify(shown)).not.toMatch(/Awa|Kofi|Fatou/);
  });
});

describe('application ↔ serveur (parité) et vue du carnet', () => {
  it('mêmes statuts visibles et mêmes dates que le serveur', async () => {
    const client = await import('../src/core/tontineGroup');
    let g = tg.setTreasurer(group(), ORG, A, NOW).group;
    const declared = tg.declarePayment(g, null, B, { period: 2, slotId: 's3' }, NOW).payment!.data;
    g = tg.confirmPayment(g, null, ORG, { period: 1, slotId: 's2' }, NOW).group;
    const cg = { ...g, id: 'g1' } as unknown as Parameters<typeof client.slotStatusFor>[0];
    for (const viewer of [ORG, A, B, OUT]) {
      for (const today of ['2026-10-18', '2026-10-27', '2026-12-31']) {
        for (const slot of g.slots) {
          for (const period of [1, 2, 3, 4]) {
            const pay = period === 2 && slot.slotId === 's3' ? declared : null;
            expect(client.slotStatusFor(cg, pay, slot, period, viewer, today), `${viewer} ${today} ${slot.slotId} ${period}`).toBe(tg.slotStatusFor(g, pay, slot, period, viewer, today));
          }
        }
      }
    }
    for (let p = 1; p <= 4; p++) expect(client.periodDate(cg, p)).toBe(tg.nthDate(g, p - 1));
    expect(client.cycleFinished(cg, tg.nthDate(g, 3))).toBe(tg.cycleFinished(g, tg.nthDate(g, 3)));
  });

  it('vue « carnet » en mémoire : mes tours, pas de limite consommée, rappels du carnet réutilisables', async () => {
    const client = await import('../src/core/tontineGroup');
    const { tontineReminders } = await import('../src/core/tontine');
    const g = { ...tg.setOrder(group(), ORG, ['s3', 's2', 's1', 's4'], NOW).group, id: 'g1' } as unknown as Parameters<typeof client.asPersonalView>[0];
    const view = client.asPersonalView(g, A);
    expect(view).toMatchObject({ id: 'group:g1', type: 'rotating', sharesHeld: 1, membersCount: 4, myTurns: [2], startDate: '2026-10-19', frequency: 'weekly' });
    // Rappels calculés sur le téléphone : la veille (18/10) puis le jour (19/10) de la 1re échéance.
    const reminders = tontineReminders({ tontines: [view], tontineEntries: [] }, '2026-10-18', { days: 3 });
    expect(reminders.slice(0, 2)).toEqual([
      { tontineId: 'group:g1', period: 1, date: '2026-10-18', when: 'eve' },
      { tontineId: 'group:g1', period: 1, date: '2026-10-19', when: 'day' },
    ]);
  });

  it('rappels locaux : hebdomadaire, mensuel, fin de mois', async () => {
    const client = await import('../src/core/tontineGroup');
    const mk = (frequency: 'weekly' | 'monthly', cycleStart: string) => ({ frequency, cycleStart, customDays: null, slots: [{ slotId: 's1', turnOrder: 1 }, { slotId: 's2', turnOrder: 2 }, { slotId: 's3', turnOrder: 3 }] }) as never;
    expect(client.groupSchedule(mk('weekly', '2026-10-19')).map((x) => x.date)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    expect(client.groupSchedule(mk('monthly', '2026-10-05')).map((x) => x.date)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
    // Fin de mois : 31 janvier → 28 février → 31 mars.
    expect(client.groupSchedule(mk('monthly', '2027-01-31')).map((x) => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(client.nextPeriod(mk('weekly', '2026-10-19'), '2026-10-20')).toEqual({ period: 2, date: '2026-10-26' });
  });

  it('rappel préparé : nom, tour, date ; cotisation seulement si cochée ; jamais de nom de membre', async () => {
    const client = await import('../src/core/tontineGroup');
    const g = { ...group(), id: 'g1' } as never;
    expect(client.reminderParams(g, { period: 2, date: '2026-10-26' }, false)).toEqual({ name: 'Tontine du marché', turn: 2, date: '2026-10-26' });
    expect(client.reminderParams(g, { period: 2, date: '2026-10-26' }, true)).toEqual({ name: 'Tontine du marché', turn: 2, date: '2026-10-26', amount: 10000, currency: 'XOF' });
    expect(JSON.stringify(client.reminderParams(g, { period: 2, date: '2026-10-26' }, true))).not.toMatch(/Awa|Kofi|Fatou/);
  });

  it('résumé de fin de cycle : tours, confirmés, manquants, total suivi', async () => {
    const client = await import('../src/core/tontineGroup');
    let g = group();
    g = tg.confirmPayment(g, null, ORG, { period: 1, slotId: 's1' }, NOW).group;
    g = tg.confirmPayment(g, null, ORG, { period: 1, slotId: 's2' }, NOW).group;
    expect(client.cycleSummary({ ...g, id: 'g1' } as never)).toEqual({ turns: 4, confirmed: 2, missing: 14, total: 160000 });
  });
});

describe('suppression du compte d’un organisateur', () => {
  it('avertissement : seulement pour une tontine active que la personne organise SANS trésorier', async () => {
    const client = await import('../src/core/tontineGroup');
    const mine = { name: 'Tontine du marché', organizerUid: ORG, treasurerUid: null, status: 'active' as const };
    expect(client.deletionWarnings([mine], ORG)).toEqual(['Tontine du marché']);
    expect(client.deletionWarnings([{ ...mine, treasurerUid: A }], ORG)).toEqual([]);
    expect(client.deletionWarnings([mine], A)).toEqual([]); // simple membre
    expect(client.deletionWarnings([{ ...mine, status: 'orphaned' as const }], ORG)).toEqual([]);
    expect(client.deletionWarnings([mine, { ...mine, name: 'Tontine 2' }, { ...mine, name: 'Avec trésorier', treasurerUid: B }], ORG)).toEqual(['Tontine du marché', 'Tontine 2']);
  });
  it('tontine figée : personne n’est promu, mais chaque membre peut toujours la quitter', () => {
    const orphan = tg.accountDeleted(group(), ORG, NOW).group;
    expect(orphan).toMatchObject({ status: 'orphaned', organizerUid: ORG, treasurerUid: null });
    const r = tg.leave(orphan, A, NOW);
    expect(r.group.memberUids).not.toContain(A);
    expect(code(() => tg.confirmPayment(orphan, null, ORG, { period: 1, slotId: 's2' }, NOW))).toBe('tg/orphaned');
  });
});

describe('rappels : un tour déjà payé ne sonne plus', () => {
  it('paiements confirmés de mes places = entrées « faites » du carnet (en mémoire)', async () => {
    const client = await import('../src/core/tontineGroup');
    const { tontineReminders } = await import('../src/core/tontine');
    const g0 = tg.confirmPayment(group(), null, ORG, { period: 1, slotId: 's2' }, NOW).group;
    const g = { ...g0, id: 'g1' } as unknown as Parameters<typeof client.asPersonalView>[0];
    const entries = client.asPersonalEntries(g, A);
    expect(entries).toEqual([expect.objectContaining({ tontineId: 'group:g1', kind: 'contribution', period: 1, status: 'done' })]);
    const reminders = tontineReminders({ tontines: [client.asPersonalView(g, A)], tontineEntries: entries as never }, '2026-10-18', { days: 10 });
    expect(reminders.some((r) => r.period === 1)).toBe(false);
    expect(reminders.some((r) => r.period === 2)).toBe(true);
  });
});
