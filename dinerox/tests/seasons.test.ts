import { describe, expect, it } from 'vitest';
import { SEASON_EVENTS, lastYearDate, lastYearSpending, nextSeasonDate, sanitizeSeasonDates, seasonBehind, seasonPlan, seasonReminders } from '../src/core/seasons';
import type { GoalContribution } from '../src/core/types';
import { goal, tx } from './helpers';

const catalog = sanitizeSeasonDates([
  { eventId: 'tabaski', date: '2027-05-16', country: 'CI' },
  { eventId: 'tabaski', date: '2027-05-17', country: 'SN' },
  { eventId: 'tabaski', date: '2026-05-27', country: 'CI' },
  { eventId: 'school_start', date: '2027-09-13', country: null },
  { eventId: 'school_start', date: '2026-09-14' },
  { eventId: 'broken', date: '16/05/2027' },
  null,
  { date: '2027-01-01' },
]);

describe('moments forts : dates', () => {
  it('aucune date codée en dur : le catalogue des événements ne contient aucune date', () => {
    expect(JSON.stringify(SEASON_EVENTS)).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}/);
  });

  it('date du catalogue distant : celle du pays de l’utilisateur, sinon celle valable partout', () => {
    expect(nextSeasonDate('tabaski', 'CI', '2026-10-15', catalog)).toBe('2027-05-16');
    expect(nextSeasonDate('tabaski', 'SN', '2026-10-15', catalog)).toBe('2027-05-17');
    expect(nextSeasonDate('school_start', 'CI', '2026-10-15', catalog)).toBe('2027-09-13');
  });

  it('date inconnue (pays absent, événement absent, dates passées) : « date à préciser »', () => {
    expect(nextSeasonDate('tabaski', 'CM', '2026-10-15', catalog)).toBeNull();
    expect(nextSeasonDate('easter', 'CI', '2026-10-15', catalog)).toBeNull();
    expect(nextSeasonDate('tabaski', 'CI', '2027-06-01', catalog)).toBeNull();
  });

  it('documents mal formés ignorés', () => {
    expect(catalog.map((c) => c.eventId)).toEqual(['tabaski', 'tabaski', 'tabaski', 'school_start', 'school_start']);
  });

  it('date corrigée par l’utilisateur : c’est la date du moment (objectif) qui fait foi', () => {
    const g = goal({ id: 'tab', categoryId: 'seasons', templateId: 'tabaski', targetAmount: 100_000, targetDate: '2027-05-20' });
    const reminders = seasonReminders({ goals: [g], goalContributions: [] }, '2026-10-15');
    expect(reminders.map((r) => r.date)).toEqual(['2027-03-21', '2027-04-20', '2027-05-13']);
  });
});

describe('moments forts : montant et plan', () => {
  it('plan hebdomadaire sur les semaines réelles : rentrée dans 8 semaines, 120 000 → 15 000 par semaine', () => {
    const p = seasonPlan({ targetAmount: 120_000, saved: 0, date: '2026-12-10', currency: 'XOF' }, '2026-10-15');
    expect([p.daysLeft, p.weeksLeft, p.weekly, p.plan.remaining]).toEqual([56, 8, 15_000, 120_000]);
  });

  it('plan : déjà mis de côté déduit, arrondi vers le haut ; sans date, pas de rythme', () => {
    expect(seasonPlan({ targetAmount: 120_000, saved: 30_000, date: '2026-12-10', currency: 'XOF' }, '2026-10-15').weekly).toBe(11_500);
    expect(seasonPlan({ targetAmount: 120_000, saved: 0, date: null, currency: 'XOF' }, '2026-10-15')).toMatchObject({ weekly: null, daysLeft: null });
    expect(seasonPlan({ targetAmount: 1_000, saved: 0, date: '2026-10-17', currency: 'EUR' }, '2026-10-15').weekly).toBe(1_000);
  });

  it('prérempli avec ce qui a été dépensé à la même période l’an dernier (catégories de l’événement)', () => {
    const event = SEASON_EVENTS.find((e) => e.id === 'school_start')!;
    const last = lastYearDate('school_start', 'CI', '2027-09-13', catalog);
    expect(last).toBe('2026-09-14');
    const data = {
      transactions: [
        tx({ type: 'expense', amount: 60_000, accountId: 'a', date: '2026-09-01', categoryId: 'cat_education' }),
        tx({ type: 'expense', amount: 25_000, accountId: 'a', date: '2026-09-15', categoryId: 'cat_education' }),
        tx({ type: 'expense', amount: 99_000, accountId: 'a', date: '2026-09-05', categoryId: 'cat_food' }),
        tx({ type: 'expense', amount: 40_000, accountId: 'a', date: '2026-06-01', categoryId: 'cat_education' }),
      ],
    };
    expect(lastYearSpending(data, event, last, 'XOF')).toBe(85_000);
    expect(lastYearSpending({ transactions: [] }, event, last, 'XOF')).toBeNull();
  });

  it('rappels J-60, J-30, J-7 (futurs seulement ; aucun si date à préciser ou moment atteint)', () => {
    const g = goal({ id: 's', categoryId: 'seasons', targetAmount: 120_000, targetDate: '2026-12-10' });
    expect(seasonReminders({ goals: [g], goalContributions: [] }, '2026-10-15')).toEqual([
      { goalId: 's', date: '2026-11-10', days: 30 },
      { goalId: 's', date: '2026-12-03', days: 7 },
    ]);
    const undated = goal({ id: 'u', categoryId: 'seasons', targetAmount: 50_000, targetDate: null });
    const done: GoalContribution = { id: 'c', createdAt: 1, updatedAt: 1, createdBy: 'u', goalId: 's', amount: 120_000, date: '2026-10-01' };
    expect(seasonReminders({ goals: [undated], goalContributions: [] }, '2026-10-15')).toEqual([]);
    expect(seasonReminders({ goals: [g], goalContributions: [done] }, '2026-10-15')).toEqual([]);
    // Un objectif classique à date n'est pas un moment fort.
    expect(seasonReminders({ goals: [goal({ targetAmount: 1, targetDate: '2026-12-10' })], goalContributions: [] }, '2026-10-15')).toEqual([]);
  });

  it('épargne en retard à J-30 : sous le rythme attendu depuis la création', () => {
    const g = goal({ id: 's', categoryId: 'seasons', targetAmount: 120_000, targetDate: '2026-12-10' });
    const c = (amount: number): GoalContribution => ({ id: `c${amount}`, createdAt: 1, updatedAt: 1, createdBy: 'u', goalId: 's', amount, date: '2026-10-01' });
    // Créé le 10 octobre (61 jours), on est à J-30 : environ la moitié attendue.
    expect(seasonBehind(g, [c(20_000)], '2026-11-10', '2026-10-10')).toBe(true);
    expect(seasonBehind(g, [c(70_000)], '2026-11-10', '2026-10-10')).toBe(false);
    // Plus de 30 jours avant : pas encore signalé.
    expect(seasonBehind(g, [], '2026-11-01', '2026-10-10')).toBe(false);
  });
});
