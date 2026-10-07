/** Lot A, phase 4 — rappel du soir : jour déjà saisi, heure passée, passage en hebdomadaire après 7 jours. */
import { describe, expect, it } from 'vitest';
import { lastEntryAt, planEntryReminders } from '../src/core/entry/reminder';

const at = (d: string, h = 12, m = 0) => {
  const x = new Date(`${d}T00:00:00`);
  x.setHours(h, m, 0, 0);
  return x.getTime();
};
const days = (ds: Date[]) => ds.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours()}h`);

describe('rappel du soir', () => {
  it('désactivé : aucun rappel', () => {
    expect(planEntryReminders({ now: at('2026-10-07'), enabled: false, hour: 20, lastEntryAt: null })).toEqual([]);
  });
  it('aucune saisie aujourd’hui : rappel ce soir à l’heure choisie, puis chaque soir', () => {
    const r = days(planEntryReminders({ now: at('2026-10-07', 12), enabled: true, hour: 20, lastEntryAt: at('2026-10-06', 9) }));
    expect(r.slice(0, 3)).toEqual(['2026-10-07 20h', '2026-10-08 20h', '2026-10-09 20h']);
  });
  it('une saisie a déjà eu lieu aujourd’hui : pas de rappel ce soir', () => {
    const r = days(planEntryReminders({ now: at('2026-10-07', 12), enabled: true, hour: 20, lastEntryAt: at('2026-10-07', 8) }));
    expect(r[0]).toBe('2026-10-08 20h');
    expect(r).not.toContain('2026-10-07 20h');
  });
  it('heure déjà passée : pas de rappel dans le passé', () => {
    const r = days(planEntryReminders({ now: at('2026-10-07', 21), enabled: true, hour: 20, lastEntryAt: at('2026-10-06') }));
    expect(r[0]).toBe('2026-10-08 20h');
  });
  it('après 7 jours sans saisie : un rappel par semaine seulement', () => {
    const r = days(planEntryReminders({ now: at('2026-10-07', 12), enabled: true, hour: 20, lastEntryAt: at('2026-10-01', 9) }));
    // Quotidien jusqu'au 8 (7 jours après le 1er), puis le 15, le 22…
    expect(r.slice(0, 4)).toEqual(['2026-10-07 20h', '2026-10-08 20h', '2026-10-15 20h', '2026-10-22 20h']);
  });
  it('inactivité déjà longue : directement hebdomadaire', () => {
    const r = days(planEntryReminders({ now: at('2026-10-07', 12), enabled: true, hour: 19, lastEntryAt: at('2026-09-01', 9) }));
    expect(r.length).toBeGreaterThan(0);
    for (let i = 1; i < r.length; i++) expect(new Date(r[i].slice(0, 10)).getTime() - new Date(r[i - 1].slice(0, 10)).getTime()).toBe(7 * 86_400_000);
  });
  it('dernière saisie : opérations créées par l’utilisateur, hors récurrences générées et supprimées', () => {
    expect(
      lastEntryAt(
        [
          { createdAt: 5, createdBy: 'u1' },
          { createdAt: 9, createdBy: 'u1', recurringId: 'rec1' },
          { createdAt: 8, createdBy: 'u2' },
          { createdAt: 7, createdBy: 'u1', deleted: true },
        ],
        'u1',
      ),
    ).toBe(5);
    expect(lastEntryAt([], 'u1')).toBeNull();
  });
});
