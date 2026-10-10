/**
 * Saisie vocale et écrite des tontines — module PUR.
 *
 * « Tontine 10 000 », « J'ai cotisé ma tontine du bureau », « J'ai reçu la
 * tontine » : on reconnaît l'intention (cotiser / recevoir), puis on PROPOSE
 * la tontine correspondante — par son nom, sinon par le montant, sinon par
 * l'échéance la plus proche. La carte de confirmation l'affiche ; rien n'est
 * enregistré sans « Tout valider ».
 *
 * Expressions locales pour « recevoir la cagnotte » : dans
 * `core/entry/vocabulary.json` (`tontinePayout`), INACTIVES tant que le
 * fondateur ne les a pas validées (`actif: true`).
 */
import type { Tontine, TontineEntry } from './types';
import type { ISODate } from './dates';
import { normalizeText } from './ai/parser';
import { activeTontines, nextContribution, nextPayout, scheduleState, type ItemState } from './tontine';
import vocabulary from './entry/vocabulary.json';

export type TontineIntent = 'contribution' | 'payout';

/** Formulations courantes (français standard), toujours actives. */
const PAYOUT_PHRASES = ['recu la tontine', 'recu ma tontine', 'recu la cagnotte', 'recu ma cagnotte', 'touche la tontine', 'touche ma tontine', 'touche la cagnotte', 'c est mon tour'];
const TONTINE_WORDS = /\b(tontine|tontines|cotise|cotiser|cotisation|cotisations|cagnotte|susu|njangi|collecteur)\b/;
const STOP = new Set(['tontine', 'tontines', 'la', 'le', 'les', 'du', 'de', 'des', 'ma', 'mon', 'mes', 'et', 'au', 'aux']);

type PayoutVocabulary = { phrase: string; actif: boolean }[];

/** Expressions locales validées par le fondateur (`actif: true`) ; aucune par défaut. */
export function localPayoutPhrases(vocab: { tontinePayout?: PayoutVocabulary } = vocabulary as { tontinePayout?: PayoutVocabulary }): string[] {
  return (vocab.tontinePayout ?? []).filter((x) => x.actif).map((x) => normalizeText(x.phrase));
}

/** Intention « tontine » d'une phrase (null : la phrase ne parle pas de tontine). */
export function tontineIntent(text: string, vocab?: { tontinePayout?: PayoutVocabulary }): TontineIntent | null {
  const n = normalizeText(text);
  const payout = [...PAYOUT_PHRASES, ...localPayoutPhrases(vocab)];
  if (payout.some((p) => n.includes(p))) return 'payout';
  return TONTINE_WORDS.test(n) ? 'contribution' : null;
}

export interface TontineMatch {
  tontine: Tontine;
  item: ItemState;
  kind: TontineIntent;
  /** Comment la tontine a été retrouvée (affiché sur la carte). */
  by: 'name' | 'amount' | 'due';
}

/**
 * Tontine correspondant à la phrase : nom, puis montant, puis échéance la plus
 * proche (cotisation à faire, ou cagnotte à recevoir). null si aucune tontine active.
 */
export function matchTontine(input: { text: string; amount: number | null; kind: TontineIntent; tontines: Tontine[]; entries: TontineEntry[]; today: ISODate }): TontineMatch | null {
  const n = ` ${normalizeText(input.text)} `;
  const candidates = activeTontines(input.tontines)
    .map((t) => {
      const states = scheduleState(t, input.entries, input.today);
      const item = input.kind === 'payout' ? nextPayout(states) : nextContribution(states);
      return item ? { t, item } : null;
    })
    .filter((x): x is { t: Tontine; item: ItemState } => !!x);
  if (!candidates.length) return null;
  const words = (t: Tontine) => normalizeText(t.name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
  const byName = candidates.find((c) => words(c.t).some((w) => n.includes(` ${w} `)));
  if (byName) return { tontine: byName.t, item: byName.item, kind: input.kind, by: 'name' };
  if (input.amount) {
    const byAmount = candidates.find((c) => (input.kind === 'payout' ? c.item.payout : c.item.contribution) === input.amount);
    if (byAmount) return { tontine: byAmount.t, item: byAmount.item, kind: input.kind, by: 'amount' };
  }
  const nearest = [...candidates].sort((a, b) => (input.kind === 'payout' ? a.item.date : a.item.dueDate).localeCompare(input.kind === 'payout' ? b.item.date : b.item.dueDate))[0];
  return { tontine: nearest.t, item: nearest.item, kind: input.kind, by: 'due' };
}

/** Lien d'une ligne de la carte de confirmation avec une tontine. */
export interface DraftTontine {
  id: string;
  period: number;
  kind: TontineIntent;
}

type DraftLike = {
  type: 'expense' | 'income' | 'savings';
  amount: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  date: ISODate;
  payee: string | null;
  uncertain: ('type' | 'amount' | 'category' | 'account')[];
  source: string;
  tontine?: DraftTontine | null;
};

/**
 * Enrichit la carte de confirmation : si la phrase parle de tontine et qu'une
 * tontine suivie correspond, la (première) ligne lui est liée — montant de
 * l'échéance si la phrase n'en donne pas, sens (cotisation = dépense,
 * cagnotte = revenu). Sans phrase de tontine ni tontine active : inchangé.
 * `drafts` vide (phrase sans montant comprise) : une ligne est proposée.
 */
export function applyTontine<D extends DraftLike>(
  drafts: D[],
  input: { text: string; tontines: Tontine[]; entries: TontineEntry[]; today: ISODate; defaultAccountId: string | null; payoutCategory: string; contributionCategory: string; contributionSubcategory?: string | null },
): D[] | null {
  const kind = tontineIntent(input.text);
  if (!kind) return null;
  const first = drafts[0];
  const match = matchTontine({ text: input.text, amount: first?.amount ?? null, kind, tontines: input.tontines, entries: input.entries, today: input.today });
  if (!match) return null;
  const amount = first?.amount ?? (kind === 'payout' ? match.item.payout : match.item.contribution);
  const base: DraftLike = first ?? { type: 'expense', amount: null, categoryId: null, subcategoryId: null, accountId: match.tontine.accountId ?? input.defaultAccountId, date: input.today, payee: null, uncertain: [], source: input.text };
  const linked = {
    ...base,
    type: kind === 'payout' ? 'income' : 'expense',
    amount,
    categoryId: kind === 'payout' ? input.payoutCategory : input.contributionCategory,
    subcategoryId: kind === 'payout' ? null : input.contributionSubcategory !== undefined ? input.contributionSubcategory : base.subcategoryId,
    accountId: base.accountId ?? match.tontine.accountId ?? input.defaultAccountId,
    payee: match.tontine.name,
    // Le sens et la catégorie viennent de la tontine retrouvée : ils ne sont plus « à vérifier ».
    uncertain: base.uncertain.filter((f) => f !== 'type' && f !== 'category' && (f !== 'amount' || !!first?.amount)),
    tontine: { id: match.tontine.id, period: match.item.period, kind },
  } as D;
  return [linked, ...drafts.slice(1)];
}
