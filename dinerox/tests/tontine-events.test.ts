import { describe, expect, it } from 'vitest';
import { tontineEvents } from '../src/core/coach/tontineEvents';
import { voiceMessage } from '../src/core/coach/voice';
import { buildFinanceSummary } from '../src/core/ai/summary';
import { fr } from '../src/i18n/fr';
import { emptySpaceData, type Tontine, type TontineEntry } from '../src/core/types';

const tontine = (p: Partial<Tontine>): Tontine => ({
  id: 't1', createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'rotating', name: 'Tontine de Koffi', organizerName: 'Maman Akissi', currency: 'XOF',
  amountPerShare: 10_000, sharesHeld: 1, frequency: 'monthly', startDate: '2026-08-16', membersCount: 10, myTurns: [4], status: 'active', ...p,
});
const paid = (period: number, date: string): TontineEntry => ({ id: `e${period}`, createdAt: 1, updatedAt: 1, createdBy: 'u', tontineId: 't1', kind: 'contribution', period, amount: 10_000, date, status: 'done' });
const render = (key: string, params: Record<string, string | number>) => ((fr as Record<string, string>)[key] ?? '').replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
const run = (t: Tontine, entries: TontineEntry[], today: string) => tontineEvents({ tontines: [t], tontineEntries: entries }, 'XOF', today, 'u', 0, { firstName: 'Awa' });

describe('coach : tontines', () => {
  it('tontine_due : cotisation demain', () => {
    const e = run(tontine({}), [paid(1, '2026-08-16'), paid(2, '2026-09-16')], '2026-10-15');
    expect(e.filter((x) => x.kind !== 'tontine_all_on_time').map((x) => [x.kind, x.id])).toEqual([['tontine_due', 'tontine_due_t1_3']]);
  });
  it('tontine_late : échéance passée sans cotisation', () => {
    const e = run(tontine({}), [paid(1, '2026-08-16')], '2026-09-20');
    expect(e.filter((x) => x.kind !== 'tontine_all_on_time').map((x) => [x.kind, x.severity])).toEqual([['tontine_late', 'warning']]);
  });
  it('tontine_payout_soon : ma cagnotte dans 7 jours ou moins', () => {
    const entries = [paid(1, '2026-08-16'), paid(2, '2026-09-16'), paid(3, '2026-10-16')];
    const e = run(tontine({}), entries, '2026-11-10');
    expect(e.filter((x) => x.kind === 'tontine_payout_soon').map((x) => x.params.amount)).toEqual([100_000]);
    expect(run(tontine({}), entries, '2026-11-05').filter((x) => x.kind === 'tontine_payout_soon')).toEqual([]);
  });
  it('tontine_all_on_time : toutes les cotisations du mois dernier à l’heure (célébration)', () => {
    const e = run(tontine({}), [paid(1, '2026-08-16'), paid(2, '2026-09-15')], '2026-10-03');
    const c = e.find((x) => x.kind === 'tontine_all_on_time');
    expect(c?.severity).toBe('celebration');
    expect(render(c!.textKey, c!.params)).toBe("Bravo Awa : toutes vos cotisations de tontine du mois dernier ont été faites à l'heure.");
    expect(run(tontine({}), [paid(1, '2026-08-16'), paid(2, '2026-09-20')], '2026-10-03').some((x) => x.kind === 'tontine_all_on_time')).toBe(false);
  });
  it('voix : aucun montant ni nom sans speakAmounts ; affichage avec les montants', () => {
    const all = [...run(tontine({}), [paid(1, '2026-08-16')], '2026-09-20'), ...run(tontine({}), [paid(1, '2026-08-16'), paid(2, '2026-09-16')], '2026-10-15'), ...run(tontine({}), [paid(1, '2026-08-16'), paid(2, '2026-09-16'), paid(3, '2026-10-16')], '2026-11-10')];
    const money = all.filter((x) => x.kind !== 'tontine_all_on_time');
    expect(new Set(money.map((x) => x.kind))).toEqual(new Set(['tontine_late', 'tontine_due', 'tontine_payout_soon']));
    for (const e of money) {
      const v = voiceMessage(e, false, (k) => k in fr);
      const spoken = render(v.key, v.params);
      expect(spoken).not.toMatch(/\d/);
      expect(spoken).not.toMatch(/Koffi|Akissi/);
      expect(render(e.textKey, e.params)).toMatch(/\d/);
    }
  });
  it('résumé IA : aucune tontine, aucun surnom ni organisateur', () => {
    const d = { ...emptySpaceData(), tontines: [tontine({})] };
    expect(JSON.stringify(buildFinanceSummary(d, 'XOF', '2026-10-15', (id) => id))).not.toMatch(/Koffi|Akissi|tontine/i);
  });
});
