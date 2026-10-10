/**
 * Mini-conversation de saisie (1.9) — module PUR, déterministe, testé.
 *
 * L'application ne rédige JAMAIS librement : chaque réponse est une suite de
 * phrases-modèles (`Sentence` = clé i18n + paramètres, FR et EN), et chaque
 * montant, total, pourcentage d'enveloppe et « reste par jour » est calculé ici
 * ou dans `core/` — jamais par l'IA. Rien n'est enregistré ici : la validation
 * (« oui » ou « Tout valider ») est décidée par l'écran.
 *
 *  - reformulation (`recap`) : salutation ou accusé de réception, lignes, total,
 *    compte utilisé, puis une question OU « Je les enregistre ? » ;
 *  - au plus `MAX_QUESTIONS` questions par note vocale ; au-delà, les lignes
 *    concernées restent « à vérifier » ;
 *  - réponses dites (`interpretReply`) : oui, annule, montant corrigé, ligne
 *    retirée, ligne ajoutée, date, compte, réponse à une question, question ;
 *  - après une correction, reformulation COURTE (`applyCommand`) : ce qui a
 *    changé + le nouveau total ;
 *  - après l'enregistrement (`savedSummary`) : nombre d'opérations, total, UNE
 *    phrase pour les enveloppes qui franchissent un seuil, nouveau reste par jour.
 */
import VOCAB from './vocabulary.json';
import { accountHints, normalizeText, parseIntent, resolveAccountHint } from '../ai/parser';
import { amountSpans } from './numbers';
import { lineConfidence, parseEntryText, relativeDate, type EntryContext, type EntryDraft, type EntryQuestion } from './parse';
import { toMinor, type CurrencyCode } from '../money';
import { LEVEL_RANK, resolveEnvelopeId, type EnvelopeStatus } from '../budget';
import { hasDefinedBudget } from '../coach/envelopeAlerts';
import { parseISODate, type ISODate, type MonthKey } from '../dates';
import type { DailyAllowance } from '../dailyAllowance';
import type { Account, BudgetPlan, Envelope } from '../types';

/** Une phrase de DineroX : clé i18n + paramètres (montants en unités mineures, formatés par l'écran). */
export interface Sentence {
  key: string;
  params?: Record<string, string | number>;
  /** Ligne d'opération (affichée en puce). */
  bullet?: boolean;
}

export const MAX_QUESTIONS = 2;

export interface ConvState {
  drafts: EntryDraft[];
  /** Questions déjà posées pour cette note vocale. */
  asked: number;
  /** Question en attente de réponse. */
  pending: { index: number; question: EntryQuestion } | null;
}

/** Libellés fournis par l'écran (catégorie, compte) : le module reste pur et sans traduction. */
export interface ConvLabels {
  /** Libellé d'une ligne (sous-catégorie, sinon catégorie ; « Épargne » pour un versement). */
  line: (d: EntryDraft) => string;
  account: (id: string | null) => string;
}

// ─── Questions ─────────────────────────────────────────────────────

/** Pose la question suivante s'il en reste à poser ; au-delà de 2, les lignes restent « à vérifier ». */
function advance(s: ConvState): ConvState {
  if (s.pending) return s;
  const index = s.drafts.findIndex((d) => d.question);
  if (index < 0) return s;
  if (s.asked >= MAX_QUESTIONS) return { ...s, drafts: s.drafts.map((d) => (d.question ? { ...d, question: null, confidence: lineConfidence({ ...d, question: null }) } : d)) };
  return { ...s, pending: { index, question: s.drafts[index].question! }, asked: s.asked + 1 };
}

export function startConversation(drafts: EntryDraft[]): ConvState {
  return advance({ drafts, asked: 0, pending: null });
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Réponse à la question en attente (bouton ou voix). */
export function answerPending(s: ConvState, optionId: string): ConvState {
  if (!s.pending) return s;
  const { index, question } = s.pending;
  const o = question.options.find((x) => x.id === optionId);
  if (!o) return s;
  const drafts = s.drafts.map((d, i) => {
    if (i !== index) return d;
    const next: EntryDraft = {
      ...d,
      categoryId: o.categoryId,
      subcategoryId: o.subcategoryId,
      // « Créer la catégorie X » : créée à la validation, avec le mot entendu.
      newCategoryName: o.id === 'create' ? capitalize(question.word) : null,
      uncertain: d.uncertain.filter((f) => f !== 'category'),
      question: null,
    };
    return { ...next, confidence: lineConfidence(next) };
  });
  return advance({ ...s, drafts, pending: null });
}

// ─── Reformulation ─────────────────────────────────────────────────

export type DayPart = 'morning' | 'afternoon' | 'evening';
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Salutation (première interaction de la journée seulement) : « Bonsoir Konan, bien compris. » */
export function greeting(hour: number, firstName: string | null | undefined): Sentence {
  const name = firstName?.trim();
  return { key: `conv.greet.${dayPart(hour)}${name ? '' : '.anon'}`, params: name ? { name } : {} };
}

/** Accusés de réception, en variantes : jamais deux fois la même phrase de suite. */
export const ACKS = ['conv.ack.understood', 'conv.ack.noted', 'conv.ack.ok', 'conv.ack.good'] as const;
export function nextAck(last: string | null): string {
  const i = last ? ACKS.indexOf(last as (typeof ACKS)[number]) : -1;
  return ACKS[(i + 1) % ACKS.length];
}

const sum = (ds: EntryDraft[]) => ds.reduce((s, d) => s + (d.amount ?? 0), 0);

function lineSentence(d: EntryDraft, labels: ConvLabels): Sentence {
  const label = labels.line(d);
  if (d.amount === null) return { key: 'conv.line.noAmount', params: { label }, bullet: true };
  if (d.question || (d.uncertain.includes('category') && d.type !== 'savings')) return { key: 'conv.line.toCheck', params: { amount: d.amount }, bullet: true };
  return { key: `conv.line.${d.type}`, params: { amount: d.amount, label }, bullet: true };
}

/**
 * Total et compte utilisé : toujours dits dans la reformulation (le compte n'est
 * pas redemandé : compte cité, sinon compte par défaut, modifiable d'un toucher).
 * Après une correction : le nouveau total seulement.
 */
function totalSentences(drafts: EntryDraft[], labels: ConvLabels, prefix: 'total' | 'newTotal'): Sentence[] {
  // Aucun montant compris : pas de « Soit 0 F au total » (la ligne est « à vérifier »).
  if (!drafts.length || !drafts.some((d) => d.amount !== null)) return [];
  const types = [...new Set(drafts.map((d) => d.type))];
  const accounts = [...new Set(drafts.map((d) => d.accountId))];
  const account = accounts.map((a) => labels.account(a)).join(', ');
  if (types.length === 1) {
    if (prefix === 'newTotal') return [{ key: 'conv.newTotal', params: { total: sum(drafts) } }];
    return [{ key: `conv.total.${types[0]}`, params: { total: sum(drafts), account } }];
  }
  const out: Sentence[] = types.map((t) => ({ key: `conv.sum.${t}`, params: { total: sum(drafts.filter((d) => d.type === t)) } }));
  if (prefix === 'total') out.push({ key: 'conv.sum.account', params: { account } });
  return out;
}

/** Question en attente, sinon lignes à vérifier, sinon « Je les enregistre ? ». */
function closing(s: ConvState): Sentence[] {
  if (s.pending) {
    const q = s.pending.question;
    return [{ key: `conv.ask.${q.id}`, params: { word: q.word } }];
  }
  const toCheck = s.drafts.filter((d) => d.amount === null || d.uncertain.includes('category') || (d.type === 'savings' && !d.savings?.savingsAccountId)).length;
  if (toCheck) return [{ key: 'conv.toCheck', params: { count: toCheck } }];
  if (!s.drafts.length) return [{ key: 'conv.empty' }];
  return [{ key: s.drafts.length > 1 ? 'conv.confirm.many' : 'conv.confirm.one' }];
}

/**
 * Reformulation complète : « Bonsoir Konan, bien compris. D'après ce que j'ai
 * compris, vous avez dépensé : – … Soit 205 000 F au total, payés depuis Wave.
 * Je les enregistre ? »
 */
export function recap(s: ConvState, labels: ConvLabels, opening: Sentence): Sentence[] {
  const types = new Set(s.drafts.map((d) => d.type));
  const intro: Sentence = { key: types.size === 1 ? `conv.intro.${s.drafts[0]?.type ?? 'expense'}` : 'conv.intro.mixed' };
  return [opening, intro, ...s.drafts.map((d) => lineSentence(d, labels)), ...totalSentences(s.drafts, labels, 'total'), ...closing(s)];
}

// ─── Réponses dites ou écrites ─────────────────────────────────────

export type Command =
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'answer'; optionId: string }
  | { kind: 'amount'; index: number; amount: number }
  | { kind: 'remove'; index: number }
  | { kind: 'add'; drafts: EntryDraft[] }
  | { kind: 'date'; index: number | null; date: ISODate }
  | { kind: 'account'; index: number | null; accountId: string }
  | { kind: 'question' }
  | { kind: 'unknown' };

const CONFIRM = /^(?:(?:oui|ouais|ok|okay|d accord|c est bon|c bon|c est ca|c est exact|exact|exactement|parfait|valide|valider|validez|enregistre|enregistrer|enregistrez|enregistre tout|vas y|allez y|go|tout est bon|confirme|confirmer|yes|yeah|yep|correct|save|confirm)\b[\s,.!]*)+$/;
const CANCEL = /\b(annule|annuler|annulez|laisse tomber|oublie tout|abandonne|abandonner|cancel|forget it)\b/;
const REMOVE = /\b(enleve|enlever|enlevez|retire|retirer|retirez|supprime|supprimer|supprimez|efface|effacer|effacez|enleve moi|remove|delete)\b/;
const ADD = /\b(ajoute|ajouter|ajoutez|rajoute|rajouter|rajoutez|en plus|add)\b/;
const ACCOUNT_VERB = /\b(avec|par|depuis|sur|via|paye|paie|payer|payez|compte|with|from)\b/;
const ORDINALS: [RegExp, number][] = [[/\b(premier|premiere|1er|un|first)\b/, 0], [/\b(deuxieme|second|seconde|deux|second)\b/, 1]];

/** Mots qui ne désignent jamais une ligne. */
const NOT_A_LINE = new Set(['le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'en', 'au', 'aux', 'et', 'est', 'c', 'ce', 'etait', 'non', 'oui', 'pour', 'par', 'avec', 'sur', 'mon', 'ma', 'mes', 'j', 'ai', 'je', 'a', 'un', 'une', 'depense', 'paye', 'payer', 'paie', 'mille', 'francs', 'fcfa', 'enleve', 'retire', 'supprime', 'ajoute', 'autres', 'autre', 'the', 'and']);

function words(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !NOT_A_LINE.has(w));
}

/** Ligne désignée par la phrase (« le loyer », « la santé »), ou null si aucune ou plusieurs à égalité. */
export function findLine(text: string, drafts: EntryDraft[], labels: ConvLabels): number | null {
  const said = new Set(words(text).flatMap((w) => [w, w.replace(/s$/, '')]));
  const scores = drafts.map((d) => {
    const own = new Set([...words(labels.line(d)), ...words(d.source)]);
    return [...own].filter((w) => said.has(w) || said.has(w.replace(/s$/, ''))).length;
  });
  const best = Math.max(0, ...scores);
  if (!best) return null;
  const at = scores.flatMap((s, i) => (s === best ? [i] : []));
  return at.length === 1 ? at[0] : null;
}

/** Compte cité dans la réponse (« avec la banque », « par Wave », ou son nom). */
function citedAccount(text: string, accounts: Account[]): string | null {
  const live = accounts.filter((a) => !a.deleted && a.active && !a.isSavings);
  const byName = live.find((a) => {
    const n = normalizeText(a.name);
    return n.length >= 3 && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`).test(text);
  });
  if (byName) return byName.id;
  for (const h of accountHints(text)) {
    const a = resolveAccountHint(h, live);
    if (a) return a.id;
  }
  return null;
}

function answerOption(text: string, q: EntryQuestion): string | null {
  const v = VOCAB as unknown as { ambiguous: { id: string; options: { id: string; answers?: string[] }[] }[]; unknownCategoryAnswers: Record<string, string[]> };
  const has = (w: string) => new RegExp(`(^|[^a-z0-9])${w}(?=$|[^a-z0-9])`).test(text);
  const answers: Record<string, string[]> = q.id === 'unknownCategory' ? v.unknownCategoryAnswers : Object.fromEntries((v.ambiguous.find((a) => a.id === q.id)?.options ?? []).map((o) => [o.id, o.answers ?? []]));
  const hits = q.options.filter((o) => (answers[o.id] ?? []).some(has));
  if (hits.length === 1) return hits[0].id;
  for (const [re, i] of ORDINALS) if (re.test(text) && q.options[i]) return q.options[i].id;
  return null;
}

/** Interprète une réponse de l'utilisateur pendant la conversation. PUR. */
export function interpretReply(original: string, s: ConvState, ctx: EntryContext, labels: ConvLabels): Command {
  const text = normalizeText(original).replace(/[.!]+$/g, '').trim();
  if (!text) return { kind: 'unknown' };
  const spans = amountSpans(text);
  const target = findLine(text, s.drafts, labels);

  if (s.pending && !spans.length) {
    const opt = answerOption(text, s.pending.question);
    if (opt) return { kind: 'answer', optionId: opt };
  }
  if (CANCEL.test(text) && (target === null || /\btout\b/.test(text)) && !spans.length) return { kind: 'cancel' };
  if (!s.pending && CONFIRM.test(text)) return { kind: 'confirm' };
  if (/\?\s*$/.test(original.trim()) || parseIntent(original, ctx.today).kind === 'question') return { kind: 'question' };
  if (REMOVE.test(text) && target !== null && !spans.length) return { kind: 'remove', index: target };
  if (ADD.test(text) && spans.length) {
    const r = parseEntryText(original.replace(/\b(ajoute|ajouter|ajoutez|rajoute|rajouter|rajoutez)\b/gi, ''), ctx);
    if (r.kind === 'entries') return { kind: 'add', drafts: r.items };
  }
  if (spans.length && (target !== null || s.drafts.length === 1)) return { kind: 'amount', index: target ?? 0, amount: toMinor(spans[spans.length - 1].value, ctx.currency as CurrencyCode) };
  if (!spans.length) {
    const date = relativeDate(text, ctx.today);
    if (date) return { kind: 'date', index: target, date };
    const acc = ACCOUNT_VERB.test(text) || accountHints(text).length ? citedAccount(text, ctx.accounts) : null;
    if (acc) return { kind: 'account', index: target, accountId: acc };
  }
  // « Et 2 000 de taxi » : une nouvelle opération dite à la suite.
  if (spans.length) {
    const r = parseEntryText(original, ctx);
    if (r.kind === 'entries') return { kind: 'add', drafts: r.items };
  }
  return { kind: 'unknown' };
}

/**
 * Applique une correction et renvoie la reformulation COURTE : ce qui a changé,
 * puis le nouveau total (et la question suivante ou « Je les enregistre ? »).
 */
export function applyCommand(s: ConvState, cmd: Command, labels: ConvLabels): { state: ConvState; reply: Sentence[] } {
  const patch = (i: number, p: Partial<EntryDraft>, confirmed: EntryDraft['uncertain']) =>
    s.drafts.map((d, j) => {
      if (j !== i) return d;
      const next = { ...d, ...p, uncertain: d.uncertain.filter((f) => !confirmed.includes(f)) };
      return { ...next, confidence: lineConfidence(next) };
    });
  const done = (state: ConvState, change: Sentence[]) => ({ state, reply: [...change, ...totalSentences(state.drafts, labels, 'newTotal'), ...closing(state)] });
  switch (cmd.kind) {
    case 'answer': {
      const index = s.pending?.index ?? -1;
      const state = answerPending(s, cmd.optionId);
      const d = state.drafts[index];
      return { state, reply: [{ key: 'conv.changed.answer', params: { label: d ? labels.line(d) : '' } }, ...closing(state)] };
    }
    case 'amount': {
      const state = { ...s, drafts: patch(cmd.index, { amount: cmd.amount }, ['amount']) };
      return done(state, [{ key: 'conv.changed.amount', params: { label: labels.line(state.drafts[cmd.index]), amount: cmd.amount } }]);
    }
    case 'remove': {
      const label = labels.line(s.drafts[cmd.index]);
      const drafts = s.drafts.filter((_, i) => i !== cmd.index);
      // La question en attente portait peut-être sur la ligne retirée : on la recalcule.
      const pendingIndex = s.pending ? (s.pending.index === cmd.index ? null : s.pending.index > cmd.index ? s.pending.index - 1 : s.pending.index) : null;
      const state = advance({ ...s, drafts, pending: s.pending && pendingIndex !== null ? { ...s.pending, index: pendingIndex } : null });
      return done(state, [{ key: 'conv.changed.removed', params: { label } }]);
    }
    case 'add': {
      const state = advance({ ...s, drafts: [...s.drafts, ...cmd.drafts] });
      return done(state, [{ key: 'conv.changed.added', params: { count: cmd.drafts.length } }, ...cmd.drafts.map((d) => lineSentence(d, labels))]);
    }
    case 'date': {
      const drafts = cmd.index === null ? s.drafts.map((d) => ({ ...d, date: cmd.date })) : patch(cmd.index, { date: cmd.date }, []);
      const state = { ...s, drafts };
      return done(state, [cmd.index === null ? { key: 'conv.changed.date', params: { date: cmd.date } } : { key: 'conv.changed.dateLine', params: { label: labels.line(drafts[cmd.index]), date: cmd.date } }]);
    }
    case 'account': {
      const drafts = cmd.index === null ? s.drafts.map((d) => (d.type === 'savings' ? d : { ...d, accountId: cmd.accountId, uncertain: d.uncertain.filter((f) => f !== 'account') })) : patch(cmd.index, { accountId: cmd.accountId }, ['account']);
      const state = { ...s, drafts };
      const account = labels.account(cmd.accountId);
      return done(state, [cmd.index === null ? { key: 'conv.changed.account', params: { account } } : { key: 'conv.changed.accountLine', params: { label: labels.line(drafts[cmd.index]), account } }]);
    }
    default:
      return { state: s, reply: [] };
  }
}

// ─── Après l'enregistrement ────────────────────────────────────────

/** Enveloppes qui franchissent un seuil (85 %, 100 %, dépassement) avec cet enregistrement. */
export function crossedEnvelopes(before: EnvelopeStatus[], after: EnvelopeStatus[], month: MonthKey, budgets: BudgetPlan[]): EnvelopeStatus[] {
  const prev = new Map(before.map((s) => [s.envelope.id, s.level]));
  return after.filter((s) => s.level !== 'ok' && hasDefinedBudget(s.envelope, month, budgets) && LEVEL_RANK[s.level] > LEVEL_RANK[prev.get(s.envelope.id) ?? 'ok']);
}

/**
 * « C'est fait : 6 dépenses enregistrées, 205 000 F. Votre enveloppe Logement est
 * à 100 %. Il vous reste 2 150 F par jour jusqu'au 31. » — UNE seule phrase pour
 * toutes les enveloppes (jamais une alerte par ligne).
 */
export function savedSummary(input: { drafts: EntryDraft[]; before: EnvelopeStatus[]; after: EnvelopeStatus[]; month: MonthKey; budgets: BudgetPlan[]; allowance: DailyAllowance | null }): Sentence[] {
  const { drafts } = input;
  const out: Sentence[] = [];
  const types = new Set(drafts.map((d) => d.type));
  const type = drafts[0]?.type ?? 'expense';
  if (types.size === 1) out.push({ key: `conv.done.${type}${drafts.length > 1 ? '.many' : ''}`, params: { count: drafts.length, total: sum(drafts) } });
  else out.push({ key: 'conv.done.mixed', params: { count: drafts.length } });
  const crossed = crossedEnvelopes(input.before, input.after, input.month, input.budgets);
  if (crossed.length === 1) {
    const s = crossed[0];
    const percent = s.budget > 0 ? Math.floor((s.spent * 100) / s.budget) : 100;
    out.push(s.level === 'critical' ? { key: 'conv.done.envelopeOver', params: { envelope: s.envelope.name, over: Math.max(0, s.spent - s.budget) } } : { key: 'conv.done.envelope', params: { envelope: s.envelope.name, percent } });
  } else if (crossed.length > 1) {
    const list = crossed.map((s) => `${s.envelope.name} ${s.budget > 0 ? Math.floor((s.spent * 100) / s.budget) : 100} %`).join(', ');
    out.push({ key: 'conv.done.envelopes', params: { list } });
  }
  const a = input.allowance;
  if (a?.status === 'ok') out.push({ key: 'conv.done.perDay', params: { amount: a.perDay, day: parseISODate(a.until).getDate() } });
  else if (a?.status === 'deficit') out.push({ key: 'conv.done.deficit', params: { amount: a.deficit } });
  return out;
}

/**
 * Propositions après l'enregistrement (jamais appliquées d'office) :
 *  - catégorie de dépense sans enveloppe (une seule fois par catégorie, et
 *    seulement si l'utilisateur a déjà des enveloppes) : « En créer une ? » ;
 *  - salaire reçu : « Voulez-vous répartir ce salaire dans vos enveloppes ? ».
 */
export function followUps(input: { drafts: EntryDraft[]; envelopes: Envelope[]; offered: string[] }): { envelopeFor: string | null; salary: number | null } {
  const active = input.envelopes.filter((e) => !e.deleted && e.active);
  let envelopeFor: string | null = null;
  if (active.length) {
    for (const d of input.drafts) {
      if (d.type !== 'expense' || !d.categoryId || input.offered.includes(d.categoryId)) continue;
      if (!resolveEnvelopeId({ envelopeId: null, categoryId: d.categoryId }, active)) {
        envelopeFor = d.categoryId;
        break;
      }
    }
  }
  const salary = sum(input.drafts.filter((d) => d.type === 'income' && d.categoryId === 'inc_salary'));
  return { envelopeFor, salary: salary > 0 ? salary : null };
}
