/**
 * Garde-fous de la compréhension par l'IA (1.9, `parseVoiceEntry`) — module PUR,
 * déterministe, testé. L'IA PROPOSE ; ce module vérifie tout avant affichage :
 *
 *  - schéma : une réponse non conforme est REJETÉE en bloc (retour au parseur local) ;
 *  - règle 3 — anti-invention : chaque montant doit avoir été RÉELLEMENT prononcé
 *    (« trente mille », « 30 mille », « 30 000 », « 30.000 » après normalisation) ;
 *    sinon le montant est retiré et la ligne marquée « à vérifier » ;
 *  - règle 4 — catégorie : identifiant existant, actif et du bon sens ; sinon
 *    question « Je la mets dans Autres, ou je crée la catégorie X ? » ;
 *  - devise : un montant dans une autre devise que celle de l'espace n'est jamais
 *    converti (règle 5) : montant à vérifier.
 */
import { addDays, isISODate, type ISODate } from '../dates';
import { toMinor, type CurrencyCode } from '../money';
import type { Account, Category } from '../types';
import { accountHints, normalizeText, resolveAccountHint } from '../ai/parser';
import { amountSpans } from './numbers';
import { learnableWord } from './keywords';
import { applySelfCorrections, lineConfidence, stripFillers, type EntryContext, type EntryDraft, type EntryField, type EntryQuestion } from './parse';

/** Une ligne telle que renvoyée par l'IA (schéma partagé avec `firebase/functions/src/voiceEntry.ts`). */
export interface AiLine {
  type: 'expense' | 'income' | 'savings_deposit';
  /** Montant en unités de la devise TELLES QUE PRONONCÉES (30000 pour « trente mille »). */
  amount: number | null;
  /** Faux si l'utilisateur a cité une autre devise que celle de l'espace. */
  currencyFromSpace: boolean;
  categoryId: string | null;
  subcategoryId?: string | null;
  accountName?: string | null;
  date?: string | null;
  sourceText: string;
  confidence: number;
  question?: string | null;
}

export const AI_MAX_LINES = 30;
const TYPES = new Set(['expense', 'income', 'savings_deposit']);
const isStr = (x: unknown, max: number) => typeof x === 'string' && x.length <= max;
const optStr = (x: unknown, max: number) => x === undefined || x === null || isStr(x, max);

/** Réponse conforme au schéma ? Sinon null (TOUTE la réponse est rejetée). */
export function validateAiOutput(raw: unknown): AiLine[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const lines = (raw as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length > AI_MAX_LINES) return null;
  const out: AiLine[] = [];
  for (const l of lines) {
    if (!l || typeof l !== 'object') return null;
    const x = l as Record<string, unknown>;
    if (!TYPES.has(x.type as string)) return null;
    if (!(x.amount === null || (typeof x.amount === 'number' && Number.isFinite(x.amount) && x.amount > 0 && x.amount < 1e13))) return null;
    if (typeof x.currencyFromSpace !== 'boolean') return null;
    if (!(x.categoryId === null || isStr(x.categoryId, 80))) return null;
    if (!optStr(x.subcategoryId, 80) || !optStr(x.accountName, 80) || !optStr(x.question, 300)) return null;
    if (!(x.date === undefined || x.date === null || (typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date)))) return null;
    if (!isStr(x.sourceText, 500)) return null;
    if (typeof x.confidence !== 'number' || !(x.confidence >= 0 && x.confidence <= 1)) return null;
    out.push({
      type: x.type as AiLine['type'],
      amount: x.amount as number | null,
      currencyFromSpace: x.currencyFromSpace,
      categoryId: x.categoryId as string | null,
      subcategoryId: (x.subcategoryId as string | null | undefined) ?? null,
      accountName: (x.accountName as string | null | undefined) ?? null,
      date: (x.date as string | null | undefined) ?? null,
      sourceText: x.sourceText as string,
      confidence: x.confidence,
      question: (x.question as string | null | undefined) ?? null,
    });
  }
  return out;
}

/** Montants réellement prononcés (unités de la devise), après remplissage et auto-corrections retirés. */
export function spokenAmounts(transcript: string): number[] {
  // Les deux montants d'une auto-correction ont été prononcés : on garde aussi le texte brut.
  const norm = normalizeText(transcript);
  const values = [...amountSpans(norm), ...amountSpans(applySelfCorrections(stripFillers(norm)))].map((s) => s.value);
  return [...new Set(values)];
}

/** Le montant figure-t-il dans la transcription ? (comparaison exacte, à l'unité près). */
export function amountWasSpoken(amount: number, spoken: number[]): boolean {
  return spoken.some((v) => Math.abs(v - amount) < 0.005);
}

/** Catégorie VALIDE chez l'utilisateur pour ce sens : identifiant existant, actif, bon sens. */
export function validCategory(categories: Category[], kind: 'expense' | 'income', categoryId: string | null, subcategoryId: string | null): { categoryId: string; subcategoryId: string | null } | null {
  if (!categoryId) return null;
  const live = new Map(categories.filter((c) => !c.deleted && c.disabled !== true).map((c) => [c.id, c]));
  let cat = live.get(categoryId);
  let sub = subcategoryId ? live.get(subcategoryId) : undefined;
  // L'IA a donné une sous-catégorie comme catégorie : on remonte au parent.
  if (cat?.parentId) {
    sub = cat;
    cat = live.get(cat.parentId);
  }
  if (!cat || cat.kind !== kind || cat.parentId) return null;
  if (subcategoryId && !sub) return { categoryId: cat.id, subcategoryId: null };
  if (sub && (sub.parentId !== cat.id || sub.kind !== kind)) return { categoryId: cat.id, subcategoryId: null };
  return { categoryId: cat.id, subcategoryId: sub?.id ?? null };
}

/** Catégorie « Autres » du bon sens, si l'utilisateur l'a. */
export function otherCategory(categories: Category[], kind: 'expense' | 'income'): string | null {
  const id = kind === 'expense' ? 'cat_other' : 'inc_other';
  return categories.some((c) => c.id === id && !c.deleted && c.disabled !== true) ? id : null;
}

/** Question « Je n'ai pas de catégorie pour X. Autres, ou je crée X ? ». */
export function unknownCategoryQuestion(word: string, categories: Category[], kind: 'expense' | 'income'): EntryQuestion {
  const other = otherCategory(categories, kind);
  return {
    id: 'unknownCategory',
    word,
    options: [...(other ? [{ id: 'other', categoryId: other, subcategoryId: null }] : []), { id: 'create', categoryId: null, subcategoryId: null }],
  };
}

function resolveAccountName(name: string | null | undefined, accounts: Account[]): Account | null {
  if (!name) return null;
  const n = normalizeText(name);
  const live = accounts.filter((a) => !a.deleted && a.active);
  return live.find((a) => normalizeText(a.name) === n) ?? live.find((a) => n.length >= 3 && normalizeText(a.name).includes(n)) ?? accountHints(n).map((h) => resolveAccountHint(h, live)).find(Boolean) ?? null;
}

function safeDate(d: string | null | undefined, today: ISODate): ISODate {
  if (!isISODate(d) || d > today || d < addDays(today, -366)) return today;
  return d;
}

/**
 * Lignes de l'IA → propositions de la carte, APRÈS les garde-fous. Un montant non
 * prononcé est retiré (« à vérifier ») ; une catégorie inexistante devient une question.
 */
export function aiLinesToDrafts(lines: AiLine[], transcript: string, ctx: EntryContext): EntryDraft[] {
  const spoken = spokenAmounts(transcript);
  const live = ctx.accounts.filter((a) => !a.deleted && a.active);
  const savingsAccounts = live.filter((a) => a.isSavings);
  return lines.map((l) => {
    const uncertain = new Set<EntryField>();
    const amountOk = l.amount !== null && l.currencyFromSpace && amountWasSpoken(l.amount, spoken);
    const amount = amountOk ? toMinor(l.amount as number, ctx.currency as CurrencyCode) : null;
    if (amount === null) uncertain.add('amount');
    // Date absente, invalide, future ou de plus d'un an : la date du jour (comme le parseur local).
    const date = safeDate(l.date, ctx.today);
    const named = resolveAccountName(l.accountName, live);
    const source = l.sourceText.slice(0, 200);
    if (l.type === 'savings_deposit') {
      const target = named?.isSavings ? named : savingsAccounts.length === 1 ? savingsAccounts[0] : null;
      if (!target) uncertain.add('account');
      const from = named && !named.isSavings ? named.id : ctx.defaultAccountId;
      const d: EntryDraft = { type: 'savings', amount, categoryId: null, subcategoryId: null, accountId: from, date, payee: null, uncertain: [...uncertain], source, savings: { savingsAccountId: target?.id ?? null, goalId: null } };
      return { ...d, confidence: lineConfidence(d) };
    }
    const kind = l.type;
    const cat = validCategory(ctx.categories, kind, l.categoryId, l.subcategoryId ?? null);
    let question: EntryQuestion | null = null;
    if (!cat) {
      uncertain.add('category');
      question = unknownCategoryQuestion(learnableWord(source) ?? source.slice(0, 30), ctx.categories, kind);
    }
    let accountId = ctx.defaultAccountId;
    if (l.accountName) {
      if (named && !named.isSavings) accountId = named.id;
      else uncertain.add('account');
    }
    if (!accountId) uncertain.add('account');
    const categoryId = cat?.categoryId ?? null;
    const subcategoryId = cat?.subcategoryId ?? null;
    const d: EntryDraft = { type: kind, amount, categoryId, subcategoryId, accountId, date, payee: null, uncertain: [...uncertain], source, suggested: { categoryId, subcategoryId }, question };
    return { ...d, confidence: lineConfidence(d) };
  });
}

/**
 * Choix final entre l'analyse locale et celle de l'IA. La réponse de l'IA n'est
 * retenue que si elle est conforme au schéma ET apporte au moins une ligne dont le
 * montant a été prononcé ; sinon le parseur local reste seul (aucun blocage).
 */
export function chooseUnderstanding(local: EntryDraft[], aiRaw: unknown, transcript: string, ctx: EntryContext): { drafts: EntryDraft[]; source: 'local' | 'ai' } {
  const lines = aiRaw === null || aiRaw === undefined ? null : validateAiOutput(aiRaw);
  if (!lines || !lines.length) return { drafts: local, source: 'local' };
  const drafts = aiLinesToDrafts(lines, transcript, ctx);
  if (!drafts.some((d) => d.amount !== null)) return { drafts: local, source: 'local' };
  return { drafts, source: 'ai' };
}

/** Usage du jour renvoyé par `parseVoiceEntry` (« 2/3 »), ou null s'il est absent ou incohérent. */
export function aiUsage(raw: unknown): { used: number; limit: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { used, limit } = raw as { used?: unknown; limit?: unknown };
  if (!Number.isInteger(used) || !Number.isInteger(limit) || (limit as number) <= 0 || (used as number) < 0 || (used as number) > (limit as number)) return null;
  return { used: used as number, limit: limit as number };
}
