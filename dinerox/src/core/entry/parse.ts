/**
 * Saisie en langage courant (voix transcrite ou phrase écrite) — module PUR,
 * déterministe, testé. Transforme un texte en PROPOSITIONS d'opérations ;
 * rien n'est enregistré ici : la carte de confirmation fait valider chaque
 * ligne. Un champ incertain est SIGNALÉ (`uncertain`), jamais deviné en silence.
 *
 *  - plusieurs opérations dans une phrase (« taxi 1 000, garba 500, crédit 1 000 ») ;
 *  - montants en chiffres et en lettres ;
 *  - dates relatives (« hier », « ce matin », « lundi ») ;
 *  - compte cité (« par Wave ») s'il correspond à un compte de l'utilisateur ;
 *  - sens entrée / sortie (« reçu », « salaire », « on m'a remboursé » = entrée) ;
 *  - questions (« Combien j'ai dépensé… ? ») reconnues et renvoyées à l'assistant.
 */
import { accountHints, normalizeText, parseIntent, extractPayee, resolveAccountHint, type ParsedIntent } from '../ai/parser';
import { addDays, parseISODate, type ISODate } from '../dates';
import { toMinor, type CurrencyCode } from '../money';
import type { Account, Category } from '../types';
import { amountSpans, hasUnvalidatedUnit } from './numbers';
import VOCAB from './vocabulary.json';

export type EntryField = 'amount' | 'type' | 'category' | 'account';

export interface EntryDraft {
  type: 'expense' | 'income';
  /** Unités mineures ; null = montant non compris (enregistrement impossible). */
  amount: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  date: ISODate;
  payee: string | null;
  /** Champs à confirmer (surlignés sur la carte). */
  uncertain: EntryField[];
  /** Extrait de la phrase à l'origine de la ligne. */
  source: string;
  /** Réserve choisie sur la carte (« Prendre sur la réserve ? ») ; jamais déduite par le parseur. */
  reserveId?: string | null;
}

export type EntryParse =
  | { kind: 'entries'; items: EntryDraft[] }
  | { kind: 'question'; intent: Extract<ParsedIntent, { kind: 'question' }> }
  /** Transfert ou projet : pris en charge par l'assistant (même confirmation). */
  | { kind: 'assistant'; intent: ParsedIntent }
  /** Ni montant ni catégorie reconnus : « opération ou question ? ». */
  | { kind: 'ambiguous' }
  | { kind: 'empty' };

export interface EntryContext {
  today: ISODate;
  currency: CurrencyCode;
  accounts: Account[];
  categories: Category[];
  /** Compte par défaut (dernier utilisé, sinon premier compte courant). */
  defaultAccountId: string | null;
}

interface VocabEntry {
  targets: string[];
  words: string[];
}
const vocab = VOCAB as unknown as {
  expense: VocabEntry[];
  income: VocabEntry[];
  incomeMarkers: string[];
  expenseMarkers: string[];
  todayWords: string[];
  slangUnits: { word: string; actif: boolean }[];
};

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => new RegExp(`(?:^|[^a-z0-9])${escape(w)}s?(?=$|[^a-z0-9])`);
const hasWord = (text: string, w: string) => wordRe(w).test(text);
const SLANG_OFF = vocab.slangUnits.filter((u) => !u.actif).map((u) => u.word);

/** Première entrée du vocabulaire présente dans le texte. */
function findVocab(text: string, table: VocabEntry[]): VocabEntry | null {
  for (const e of table) if (e.words.some((w) => hasWord(text, w))) return e;
  return null;
}

/** Catégorie réellement disponible chez l'utilisateur, dans l'ordre des cibles. */
function resolveTarget(targets: string[], categories: Category[]): { categoryId: string; subcategoryId: string | null } | null {
  const byId = new Map(categories.filter((c) => !c.deleted).map((c) => [c.id, c]));
  for (const id of targets) {
    const c = byId.get(id);
    if (!c) continue;
    if (c.parentId) {
      if (byId.has(c.parentId)) return { categoryId: c.parentId, subcategoryId: c.id };
      continue;
    }
    return { categoryId: c.id, subcategoryId: null };
  }
  return null;
}

type Direction = 'income' | 'expense' | null;
function direction(text: string): Direction {
  // Les tournures d'entrée d'abord : « on m'a payé » n'est pas « j'ai payé ».
  if (vocab.incomeMarkers.some((w) => hasWord(text, w))) return 'income';
  if (vocab.expenseMarkers.some((w) => hasWord(text, w))) return 'expense';
  return null;
}

const WEEKDAYS: [string, number][] = [
  ['dimanche', 0], ['lundi', 1], ['mardi', 2], ['mercredi', 3], ['jeudi', 4], ['vendredi', 5], ['samedi', 6],
  ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3], ['thursday', 4], ['friday', 5], ['saturday', 6],
];

/** Date relative citée, sinon null. « lundi » = le dernier lundi passé (aujourd'hui si on est lundi). */
export function relativeDate(text: string, today: ISODate): ISODate | null {
  if (/\bavant[- ]hier\b/.test(text)) return addDays(today, -2);
  if (/\bhier\b|\byesterday\b/.test(text)) return addDays(today, -1);
  if (vocab.todayWords.some((w) => hasWord(text, w))) return today;
  for (const [w, d] of WEEKDAYS) {
    if (hasWord(text, w)) {
      const cur = parseISODate(today).getDay();
      return addDays(today, -((cur - d + 7) % 7));
    }
  }
  return null;
}

/** Découpe une phrase en segments d'opération : virgules, points-virgules, « et », « puis », puis un segment par montant. */
export function splitSegments(text: string): string[] {
  const coarse = text
    .split(/,(?!\d)|;|\.(?!\d)|\s+(?:et|puis|and|then)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const seg of coarse) {
    const spans = amountSpans(seg);
    if (spans.length <= 1) {
      out.push(seg);
      continue;
    }
    // « taxi 1 000 garba 500 » : un segment se termine après chaque montant.
    let from = 0;
    spans.forEach((s, i) => {
      const end = i === spans.length - 1 ? seg.length : s.end;
      out.push(seg.slice(from, end).trim());
      from = end;
    });
  }
  return out.filter(Boolean);
}

/**
 * Analyse un texte. `original` est le texte tel que dit ou écrit (le
 * bénéficiaire garde sa casse) ; tout le reste travaille sur le texte normalisé.
 */
export function parseEntryText(original: string, ctx: EntryContext): EntryParse {
  const text = normalizeText(original);
  if (!text) return { kind: 'empty' };

  const intent = parseIntent(original, ctx.today);
  if (intent.kind === 'question') return { kind: 'question', intent };
  if (intent.kind === 'transfer' || intent.kind === 'goal') return { kind: 'assistant', intent };

  const accounts = ctx.accounts.filter((a) => !a.deleted && a.active);
  const sentenceDirection = direction(text);
  const segments = splitSegments(text);

  // Un segment sans montant ni catégorie (« ce matin ») n'est qu'un contexte : rattaché au suivant.
  const merged: string[] = [];
  let carry = '';
  for (const seg of segments) {
    const meaningful = amountSpans(seg).length > 0 || findVocab(seg, vocab.expense) || findVocab(seg, vocab.income);
    if (!meaningful) {
      carry = `${carry} ${seg}`.trim();
      continue;
    }
    merged.push(`${carry} ${seg}`.trim());
    carry = '';
  }
  if (carry) {
    if (merged.length) merged[merged.length - 1] = `${merged[merged.length - 1]} ${carry}`;
    else merged.push(carry);
  }

  const items: EntryDraft[] = [];
  // Le sens, la date et le compte cités valent pour l'opération et les SUIVANTES
  // (« ce matin taxi 1 000, garba 500 »), jamais pour celles qui précèdent.
  let lastDirection: Direction = null;
  let lastDate: ISODate | null = null;
  let lastHints: ReturnType<typeof accountHints> = [];
  for (const seg of merged) {
    const uncertain = new Set<EntryField>();
    const spans = amountSpans(seg);
    const slang = hasUnvalidatedUnit(seg, SLANG_OFF);
    const amount = spans.length && !slang ? toMinor(spans[0].value, ctx.currency) : null;
    if (amount === null) uncertain.add('amount');

    const expenseHit = findVocab(seg, vocab.expense);
    const incomeHit = findVocab(seg, vocab.income);
    // Sens : marqueur du segment, sinon celui d'un segment précédent de la même phrase.
    const explicit: Direction = direction(seg) ?? lastDirection ?? (merged.length === 1 ? sentenceDirection : null);
    let type: 'expense' | 'income';
    if (explicit) type = explicit;
    else if (incomeHit && !expenseHit) type = 'income';
    else {
      type = 'expense';
      // « 15 000 maman » : don ou réception ? À confirmer.
      if (expenseHit && incomeHit) uncertain.add('type');
    }
    if (explicit) lastDirection = explicit;

    const hit = type === 'income' ? incomeHit : expenseHit;
    const resolved = hit ? resolveTarget(hit.targets, ctx.categories) : null;
    if (!resolved || uncertain.has('type')) uncertain.add('category');

    // Compte : celui cité s'il existe chez l'utilisateur ; sinon compte par défaut, à confirmer.
    const own = accountHints(seg);
    const hints = own.length ? own : lastHints;
    if (own.length) lastHints = own;
    let accountId = ctx.defaultAccountId;
    if (hints.length) {
      const acc = resolveAccountHint(hints[0], accounts);
      if (acc) accountId = acc.id;
      else uncertain.add('account');
    }
    if (!accountId) uncertain.add('account');

    const ownDate = relativeDate(seg, ctx.today);
    if (ownDate) lastDate = ownDate;
    const date = ownDate ?? lastDate ?? ctx.today;
    const payee = type === 'expense' ? extractPayeeFrom(original, seg) : null;
    items.push({ type, amount, categoryId: resolved?.categoryId ?? null, subcategoryId: resolved?.subcategoryId ?? null, accountId, date, payee, uncertain: [...uncertain], source: seg });
  }

  if (items.length === 1 && items[0].amount === null && items[0].categoryId === null && !findVocab(text, vocab.expense) && !findVocab(text, vocab.income)) return { kind: 'ambiguous' };
  return items.length ? { kind: 'entries', items } : { kind: 'ambiguous' };
}

/** Bénéficiaire (« envoyé 20 000 à maman » → « maman ») : uniquement pour une phrase d'une seule opération. */
function extractPayeeFrom(original: string, segment: string): string | null {
  const p = extractPayee(original);
  return p && normalizeText(segment).includes(normalizeText(p)) ? p : null;
}
