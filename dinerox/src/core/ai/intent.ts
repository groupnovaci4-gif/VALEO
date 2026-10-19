/**
 * Compréhension LOCALE d'une phrase (docs/ia-comprend-tout.md §1, §2, §4). Module PUR,
 * déterministe, sans réseau : une phrase → UNE intention de la liste fermée. Rien n'est exécuté
 * ici (aucune écriture) : une question est calculée par `localAnswers.ts`, une action devient une
 * carte de validation (`actionCard.ts`), une ambiguïté devient une question avec des choix tirés
 * des données de la personne. Une phrase non comprise → `unknown` (repli Haiku, §1.2).
 *
 * Chemin : interdit (§2.4) → ouvrir un écran → question (§2.1) → action (§2.2) → saisie
 * existante (`core/entry/parse.ts` : dépenses, revenus, cotisations et cagnottes de tontine,
 * règles 18 et 22) → inconnu. Le vocabulaire vient de l'application (`vocabulary.ts`).
 */
import { normalizeText, parseIntent } from './parser';
import { amountSpans } from '../entry/numbers';
import { parseEntryText, type EntryContext, type EntryDraft } from '../entry/parse';
import { matchKeyword } from '../entry/keywords';
import { applyTontine } from '../tontineEntry';
import { tontineContributionCategory } from '../tontine';
import { accountPositions } from '../position';
import { defaultSpendingAccountId } from '../savingsCircle';
import { toMinor, type CurrencyCode } from '../money';
import type { ISODate } from '../dates';
import type { SpaceData } from '../types';
import { bestEntity, buildVocabulary, entitiesOf, matchEntities, sameWord, toRef, tokens, type EntityKind, type EntityRef, type Vocabulary, type VocabularyOptions } from './vocabulary';
import type { SectionId } from './sections';

// ─── Liste fermée des intentions ─────────────────────────────────────

export const QUESTION_TOPICS = [
  // Argent (§2.1)
  'available', 'account_balance', 'set_aside', 'total_accounts', 'accounts_list', 'per_day', 'until_payday',
  // Budget
  'envelope_remaining', 'envelopes_over', 'to_allocate',
  // Dépenses et revenus (sujets de parser.ts / answers.ts)
  'spent_month', 'spent_category', 'top_category', 'compare_months', 'income_month', 'month_summary', 'can_afford', 'goal_feasibility', 'reduce_spending', 'why_no_savings', 'contribution_sim',
  // Épargne
  'saved_month', 'savings_balance', 'ten_percent',
  // Objectifs, réserve, moments forts
  'goal_status', 'goal_monthly', 'goal_eta', 'reserve_balance', 'season_status',
  // Tontines
  'tontine_next', 'tontine_amount', 'tontine_turn', 'tontine_paid', 'tontine_late',
  // Dettes et crédits
  'debts_owe', 'debts_owed', 'debt_with', 'debt_next_due',
  // Famille, obligations, échéances
  'recurring_amount', 'support_year', 'recurring_next', 'next_payday', 'due_week',
  // Patrimoine, historique, analyse, indépendance, score, famille
  'net_worth', 'asset_value', 'last_expenses', 'biggest_expense', 'margin', 'fixed_charges', 'last_month_summary', 'independence', 'score', 'rewards', 'family_spent',
] as const;
export type Topic = (typeof QUESTION_TOPICS)[number];

export const ACTION_KINDS = ['save', 'withdraw_savings', 'transfer', 'goal_contribute', 'goal_create', 'debt_repayment', 'debt_create', 'recurring_confirm', 'reserve_use', 'envelope_budget', 'recurring_create'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const FORBIDDEN_REASONS = ['delete', 'edit_past', 'subscription', 'security', 'members', 'export', 'settings', 'real_money'] as const;
export type ForbiddenReason = (typeof FORBIDDEN_REASONS)[number];

export type Period = 'week' | 'month' | 'last_month' | 'year';
export type AskField = 'from' | 'to' | 'account' | 'tontine' | 'goal' | 'debt' | 'reserve' | 'envelope' | 'recurring' | 'season' | 'asset';

export interface QuestionIntent {
  kind: 'question';
  topic: Topic;
  ref?: EntityRef | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  /** Unités mineures. */
  amount?: number | null;
  period?: Period;
}

export interface ActionIntent {
  kind: 'action';
  action: ActionKind;
  /** Unités mineures ; null = à saisir sur la carte (surligné). */
  amount: number | null;
  date: ISODate;
  /** Élément concerné : objectif, dette, récurrence, réserve, enveloppe. */
  ref?: EntityRef | null;
  /** Compte d'où part l'argent (ou compte du mouvement). */
  from?: EntityRef | null;
  /** Compte où arrive l'argent. */
  to?: EntityRef | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  /** Nom saisi (nouvelle dette : la personne ; nouvelle récurrence : le libellé ; objectif : le nom). */
  label?: string | null;
  direction?: 'i_owe' | 'owed_to_me';
  type?: 'expense' | 'income';
  dueDay?: number | null;
}

export type Intent =
  | QuestionIntent
  | ActionIntent
  /** Dépenses et revenus (une ou plusieurs lignes) : la carte de la saisie, « Tout valider ». */
  | { kind: 'entry'; drafts: EntryDraft[] }
  | { kind: 'open'; section: SectionId }
  | { kind: 'forbidden'; reason: ForbiddenReason; section: SectionId | null }
  /** Une question au lieu d'une supposition (§4) ; `asked` : questions déjà posées pour cette phrase. */
  | { kind: 'ask'; field: AskField; options: EntityRef[]; intent: QuestionIntent | ActionIntent; asked: number }
  | { kind: 'notFound'; entity: EntityKind; word: string; options: EntityRef[] }
  | { kind: 'unknown' };

export interface IntentContext {
  vocab: Vocabulary;
  entry: EntryContext;
  data: Pick<SpaceData, 'tontines' | 'tontineEntries' | 'categories' | 'accounts' | 'transactions' | 'goals' | 'goalContributions' | 'recurring' | 'envelopes'>;
  /** Ce que chaque compte courant peut payer (solde + découvert − mises de côté). */
  debitable: Record<string, number>;
}

/** Contexte de compréhension de l'espace actif (recalculé quand les données changent). */
export function intentContext(
  data: SpaceData,
  opts: { today: ISODate; currency: CurrencyCode; defaultAccountId?: string | null; catalog?: VocabularyOptions['catalog']; categoryLabel?: (id: string) => string },
): IntentContext {
  const vocab = buildVocabulary(data, { catalog: opts.catalog, categoryLabel: opts.categoryLabel });
  const accounts = data.accounts.filter((a) => !a.deleted && a.active);
  const positions = accountPositions(data, opts.currency, opts.today);
  return {
    vocab,
    data,
    entry: { today: opts.today, currency: opts.currency, accounts, categories: data.categories, defaultAccountId: opts.defaultAccountId ?? defaultSpendingAccountId(accounts, null, opts.currency), catalog: opts.catalog, goals: data.goals },
    debitable: Object.fromEntries(Object.values(positions).map((p) => [p.id, p.debitable])),
  };
}

// ─── Outils ──────────────────────────────────────────────────────────

/** Texte de travail : normalisé, ponctuation retirée, « 50,000 » → « 50000 ». */
export function clean(original: string): string {
  return normalizeText(original.replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2'))
    .replace(/[?!.,;:«»"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (t: string, re: RegExp) => re.test(t);

function amountOf(t: string, currency: CurrencyCode): number | null {
  const spans = amountSpans(t.replace(/\b(10|dix) ?(%|pour ?cent)/g, ' '));
  return spans.length ? toMinor(spans[0].value, currency) : null;
}

function periodOf(t: string): Period {
  if (has(t, /\b(cette semaine|this week|semaine ci)\b/)) return 'week';
  if (has(t, /\b(depuis janvier|cette annee|this year|depuis le debut de l annee|since january)\b/)) return 'year';
  if (has(t, /\b(mois dernier|mois passe|last month)\b/)) return 'last_month';
  return 'month';
}

/** Mot qui suit un mot de rattachement (« tontine du bureau » → « bureau » ; « à Koffi » → « koffi »). */
function wordAfter(t: string, re: RegExp): string | null {
  const m = t.match(re);
  if (!m) return null;
  const w = m[m.length - 1];
  return w && w.length >= 3 && !STOPWORDS.has(w) ? w : null;
}
const STOPWORDS = new Set(['mon', 'ma', 'mes', 'la', 'le', 'les', 'moi', 'toi', 'lui', 'nous', 'vous', 'eux', 'elle', 'quel', 'quelle', 'combien', 'quand', 'pour', 'avec', 'mois', 'semaine', 'annee', 'cette', 'cet', 'deja', 'the', 'my', 'me', 'him', 'her', 'them', 'you', 'avance', 'pret', 'payer', 'paie', 'paye']);

export type Resolved = { ref: EntityRef } | { tied: EntityRef[] } | { notFound: string | null; options: EntityRef[] };

/**
 * Élément d'une sorte cité dans la phrase. Un nom précis introuvable → « Je ne trouve pas »
 * (jamais un autre élément à la place) ; un seul élément de cette sorte → lui ; sinon la
 * question « Lequel ? ».
 */
export function resolve(t: string, ctx: IntentContext, kinds: EntityKind[], named: string | null): Resolved {
  const all = kinds.flatMap((k) => entitiesOf(ctx.vocab, k));
  const { one, tied } = bestEntity(t, ctx.vocab, kinds);
  if (one) return { ref: toRef(one) };
  if (tied.length) return { tied: tied.map(toRef) };
  if (named && !all.some((e) => e.variants.some((v) => v.some((w) => sameWord(w, named))))) return { notFound: named, options: all.map(toRef) };
  if (all.length === 1) return { ref: toRef(all[0]) };
  if (!all.length) return { notFound: named ?? '', options: [] };
  return { tied: all.map(toRef) };
}

/** Catégorie citée : nom complet (le plus précis), sinon mot-clé du catalogue, sinon nom partiel. */
export function categoryIn(text: string, ctx: IntentContext, kind: 'expense' | 'income' = 'expense'): { categoryId: string; subcategoryId: string | null } | null {
  // Le verbe (« j'ai dépensé », « payé ») n'est pas un nom de catégorie (« Autres dépenses »).
  const t = text.replace(/\b(depense|depenser|depensee|paye|payer|spent|spend|paid)\b/g, ' ');
  const toIds = (id: string, parentId: string | null | undefined) => (parentId ? { categoryId: parentId, subcategoryId: id } : { categoryId: id, subcategoryId: null });
  const kindOk = (id: string) => ctx.data.categories.some((c) => c.id === id && c.kind === kind);
  const labels = matchEntities(t, ctx.vocab, ['category']).filter((m) => kindOk(m.entry.id));
  const full = labels.filter((m) => m.full);
  if (full.length) return toIds(full[0].entry.id, full[0].entry.parentId);
  const kw = matchKeyword(t, ctx.vocab.keywords, kind);
  if (kw) return { categoryId: kw.categoryId, subcategoryId: kw.subcategoryId };
  return labels.length ? toIds(labels[0].entry.id, labels[0].entry.parentId) : null;
}

function currentAccounts(ctx: IntentContext) {
  return ctx.entry.accounts.filter((a) => !a.isSavings && a.currency === ctx.entry.currency);
}
function savingsAccounts(ctx: IntentContext) {
  return ctx.entry.accounts.filter((a) => a.isSavings && a.currency === ctx.entry.currency);
}
const accRef = (a: { id: string; name: string }): EntityRef => ({ kind: 'account', id: a.id, label: a.name });

/** Comptes cités, dans l'ordre de la phrase (« de Wave vers Orange Money »). */
function accountsInOrder(t: string, ctx: IntentContext): EntityRef[] {
  const words = tokens(t);
  const found: { ref: EntityRef; at: number; len: number }[] = [];
  for (const e of entitiesOf(ctx.vocab, 'account')) {
    let best: { at: number; len: number } | null = null;
    for (const v of e.variants) {
      const at = words.findIndex((w, i) => v.every((x, j) => words[i + j] !== undefined && sameWord(words[i + j], x)));
      if (at >= 0 && (!best || v.length > best.len)) best = { at, len: v.length };
    }
    if (best) found.push({ ref: toRef(e), ...best });
  }
  // Deux comptes au même endroit (« épargne » = compte d'épargne nommé) : le nom le plus long.
  const out: EntityRef[] = [];
  let end = -1;
  for (const f of found.sort((x, y) => x.at - y.at || y.len - x.len)) {
    if (f.at < end || out.some((r) => r.id === f.ref.id)) continue;
    out.push(f.ref);
    end = f.at + f.len;
  }
  return out;
}

// ─── 1. Interdits (§2.4) ─────────────────────────────────────────────

const FORBIDDEN: { reason: ForbiddenReason; section: SectionId | null; re: RegExp; unless?: RegExp }[] = [
  { reason: 'security', section: 'settings', re: /\b(mot de passe|password|code pin|mon pin|my pin|pin code|deconnecte|deconnecter|deconnexion|log ?out|sign ?out|adresse e ?mail|mon e ?mail|my e ?mail)\b|\b(supprime|supprimer|ferme|fermer|delete|close)( moi)? (mon|my) (compte|account)$/ },
  { reason: 'subscription', section: 'subscription', re: /\b(passe|passer|prends|prendre|achete|acheter|souscris|souscrire|resilie|resilier|annule|annuler|change|changer|upgrade|cancel|subscribe|buy)\b.*\b(formule|abonnement|premium|subscription|plan plus|plus plan|famille plan)\b|\bformule (plus|famille)\b/, unless: /\d/ },
  { reason: 'members', section: 'family', re: /^(invite|inviter|invites)\b|\b(ajoute|ajouter|retire|retirer|enleve|add|remove)\b.*\b(espace famille|espace familial|dans la famille|family space|to my family|membre|member)\b|\binvite (un|une|mon|ma|[a-z]+)\b.*\b(famille|espace)\b/ },
  { reason: 'export', section: 'settings', re: /\b(exporte|exporter|export|telecharge mes donnees|download my data)\b|\b(partage|partager|share)\b.*\b(operations|donnees|depenses|data|transactions)\b/ },
  { reason: 'settings', section: 'settings', re: /\b(change|changer|modifie|modifier|active|activer|desactive|desactiver|mets|mettre|switch|turn on|turn off|enable|disable)\b.*\b(langue|language|theme|mode sombre|mode clair|dark mode|light mode|devise|currency|pays de residence)\b/ },
  { reason: 'real_money', section: null, re: /\b(envoie|envoyer|paie|payer|paye|vire|virer|transfere|transferer|send|pay|transfer)\b.*\b(pour moi|a ma place|on my behalf|for me)\b|\b(fais|faire|effectue|effectuer|lance|make)\b.*\b(un |le )?(virement|paiement|payment|transfer) (a|to) / },
  { reason: 'delete', section: 'history', re: /\b(supprime|supprimer|efface|effacer|delete|remove|erase)\b/ },
  { reason: 'edit_past', section: 'history', re: /\b(modifie|modifier|corrige|corriger|change|changer|annule|annuler|edit|modify|cancel|undo)\b.*\b(depense|depenses|operation|revenu|transfert|hier|derniere|dernier|passe|expense|transaction|yesterday|last)\b|\b(annule|annuler)\b.*\b(d hier|de hier)\b/ },
];

/** Écran concerné par une demande interdite (lien « Ouvrir l'écran »). */
export function forbiddenSection(reason: ForbiddenReason): SectionId | null {
  return FORBIDDEN.find((f) => f.reason === reason)?.section ?? null;
}

function forbidden(t: string): Intent | null {
  for (const f of FORBIDDEN) if (f.re.test(t) && !(f.unless && f.unless.test(t))) return { kind: 'forbidden', reason: f.reason, section: f.section };
  return null;
}

// ─── 2. Ouvrir un écran ─────────────────────────────────────────────

const OPEN = /^(ouvre|ouvrir|ouvres|montre|montre moi|montrer|affiche|afficher|va|vas|aller|allons|emmene moi|amene moi|open|show|show me|go|take me)\b|^(ou|where) (je peux|puis je|est ce que je peux|se trouve|trouver|est|sont|can i|is)\b/;

function openScreen(t: string, ctx: IntentContext): Intent | null {
  if (!OPEN.test(t)) return null;
  const m = matchEntities(t, ctx.vocab, ['section']).filter((x) => x.full);
  return m.length ? { kind: 'open', section: m[0].entry.id as SectionId } : null;
}

// ─── 3. Questions (§2.1) ────────────────────────────────────────────

const QUESTION_START = /^(combien|quand|c est quand|a quand|c est combien|c est dans combien|est ce que|est ce qu|ou en|ou j en|ou part|ou va|quel|quelle|quels|quelles|qu est ce|pourquoi|comment|il me reste|il reste|il y a combien|reste a repartir|total|mes|mon|ma|je dois combien|je suis en retard|prochaine|prochain|bilan|resume|compare|fais moi|dis moi|et en|et pour|si je|si j|how|when|what|where|which|is|am i|do i|did i|can i|will i|if i)\b/;

function question(t: string, original: string, ctx: IntentContext): Intent | null {
  const isQ = original.includes('?') || QUESTION_START.test(t);
  if (!isQ) return null;
  const q = (topic: Topic, extra: Partial<QuestionIntent> = {}): QuestionIntent => ({ kind: 'question', topic, ...extra });
  const cur = ctx.entry.currency;
  const spent = has(t, /\b(depense|depenses|depenser|spent|spend|paye|payer|paid)\b/);

  if (has(t, /^(si (je|j)|if i)\b.*\b(donne|verse|envoie|contribue|cotise|participe|offre|paie|paye|give|pay|send)/)) return q('contribution_sim', { amount: amountOf(t, cur) });
  if (has(t, /pourquoi.*(epargn|economis)|n arrive pas.*(epargn|economis)|why.*\b(save|saving)/)) return q('why_no_savings');
  if (has(t, /\b(depenser moins|reduire mes depenses|diminuer mes depenses|faire des economies|spend less|cut (my )?spending)\b/)) return q('reduce_spending');
  if (has(t, /^compare|par rapport au mois dernier|compared? (to|with) last month/)) return q('compare_months');
  if (has(t, /\b(bilan|resume|recap|synthese) du mois (dernier|passe)\b|last month s? (summary|review)/)) return q('last_month_summary');
  if (has(t, /\b(resume|bilan|synthese|recap)\b|summary of (the|this|my) month|month summary/)) return q('month_summary');
  if (has(t, /\b(atteignable|atteignables|realiste|realistes|tenir mes objectifs|on track|reachable)\b/)) return q('goal_feasibility');

  // Tontines
  if (has(t, /\b(tontine|tontines|cotisation|ramasser|ramasse|mon tour|my turn)\b/) && !spent) {
    const named = wordAfter(t, /\btontine (?:du |de la |de l |des |de |d )?([a-z]+)/) ?? wordAfter(t, /\b([a-z]+) tontine\b/);
    const topic: Topic = has(t, /\b(mon tour|ramasser|ramasse|toucher|touche|recevoir|cagnotte|my turn|collect)\b/)
      ? 'tontine_turn'
      : has(t, /\b(en retard|late|behind)\b/)
        ? 'tontine_late'
        : has(t, /\b(deja (verse|paye|cotise)|already paid|paid so far)\b/)
          ? 'tontine_paid'
          : has(t, /\b(c est combien|how much is)\b|\bcotisation\b.*\bcombien\b|\bcombien\b.*\bcotisation\b/)
            ? 'tontine_amount'
            : 'tontine_next';
    return withRef(q(topic), resolve(t, ctx, ['tontine'], named === 'tontine' ? null : named), 'tontine');
  }

  // Dettes et crédits (une phrase de dépense en dettes reste une question de catégorie)
  if (!spent && has(t, /\b(je dois|dois je|on me doit|me doit|me doivent|dette|dettes|pret|credit|credits|echeance|i owe|owe me|owes me|debt|debts|loan)\b/)) {
    const person = wordAfter(t, /\b(?:a|envers|chez|to)\s+([a-z][a-z-]+)/) ?? wordAfter(t, /^([a-z][a-z-]+) (?:me doit|owes me)/);
    if (has(t, /\b(echeance|prochain paiement|prochain remboursement|next (payment|due|installment))\b/)) return withRef(q('debt_next_due'), resolve(t, ctx, ['debt'], person), 'debt');
    const named = bestEntity(t, ctx.vocab, ['debt']).one;
    if (named) return q('debt_with', { ref: toRef(named) });
    if (person) return withRef(q('debt_with'), resolve(t, ctx, ['debt'], person), 'debt');
    if (has(t, /\b(on me doit|me doit|me doivent|owe me|owes me)\b/)) return q('debts_owed');
    return q('debts_owe');
  }

  if (has(t, /\b(patrimoine|valeur nette|net worth|mes biens|combien je vaux)\b/)) return q('net_worth');
  const asset = bestEntity(t, ctx.vocab, ['asset']).one;
  if (asset && has(t, /\b(vaut|valeur|worth|value)\b/)) return q('asset_value', { ref: toRef(asset) });
  if (has(t, /\b(recompense|recompenses|trophee|trophees|badge|badges|rewards?)\b|qu est ce que j ai gagne|what have i (won|earned)/)) return q('rewards');
  if (has(t, /\b(score|ma note)\b/)) return q('score');
  if (has(t, /\b(independance|liberte financiere|financial independence)\b/)) return q('independence');
  if (has(t, /\b(marge|margin)\b/)) return q('margin');
  if (has(t, /\b(charges fixes|fixed (costs|charges))\b/)) return q('fixed_charges');
  if (has(t, /\b(10 ?%|10 pour ?cent|dix pour ?cent|ten percent|10 percent)/) || has(original.toLowerCase(), /10 ?%/)) return q('ten_percent');

  // Épargne
  if (has(t, /\b(epargne|economise|saved|j ai mis de cote)\b.*\b(ce mois|this month|mois ci)\b|\bepargne nette\b/)) return q('saved_month');
  if (has(t, /\b(sur|dans|in|on) (mon|ma|mes|my|l) ?(compte )?(epargne|savings)\b|\bmy savings\b/)) return q('savings_balance');
  if (has(t, /\b(mis de cote|mise de cote|de cote|set aside|put aside)\b/)) return q('set_aside');

  // Une phrase de DÉPENSE avec une catégorie : la question de catégorie (avant objectifs et réserve).
  if (has(t, /\b(la famille|family)\b.*\b(a depense|ont depense|spent)\b/)) return q('family_spent');
  if (has(t, /\b(dernieres? (depenses|operations)|last (expenses|transactions))\b/)) return q('last_expenses');
  if (has(t, /\b(plus grosse|plus grande|biggest|largest)\b/) && has(t, /\b(depense|expense)\b/)) return q('biggest_expense');
  if (spent) {
    const c = categoryIn(t, ctx);
    if (c) return q('spent_category', { ...c, period: periodOf(t) });
  }

  // Moments forts, réserve, objectifs
  const season = bestEntity(t, ctx.vocab, ['season']).one;
  if (season) return q('season_status', { ref: toRef(season) });
  const reserve = matchEntities(t, ctx.vocab, ['reserve']).filter((m) => m.full);
  if (reserve.length || has(t, /\breserve\b/)) return withRef(q('reserve_balance'), reserve.length ? { ref: toRef(reserve[0].entry) } : resolve(t, ctx, ['reserve'], null), 'reserve');
  const goal = bestEntity(t, ctx.vocab, ['goal']);
  if (goal.one || goal.tied.length || has(t, /\b(objectif|projet|goal)\b/)) {
    const topic: Topic = has(t, /\b(par mois|chaque mois|per month|a month|mensuel)\b/) ? 'goal_monthly' : has(t, /^(quand|when)\b|\b(quelle date|dans combien de temps|j aurai|will i have)\b/) ? 'goal_eta' : 'goal_status';
    return withRef(q(topic), goal.one ? { ref: toRef(goal.one) } : goal.tied.length ? { tied: goal.tied.map(toRef) } : resolve(t, ctx, ['goal'], null), 'goal');
  }

  // Famille, obligations, échéances
  if (has(t, /\b(soutiens?|support)\b.*\b(annee|an|year)\b|total des soutiens/)) return q('support_year');
  if (has(t, /\b(prochaine paie|prochain salaire|la paie tombe|next (pay|salary|payday)|salaire tombe)\b/)) return q('next_payday');
  if (has(t, /\b(semaine|week|prochains jours|bientot)\b/) && has(t, /\b(payer|regler|paie|pay|due)\b/)) return q('due_week');
  const rec = bestEntity(t, ctx.vocab, ['recurring']).one;
  if (rec && has(t, /\b(par mois|chaque mois|per month|a month)\b/)) return q('recurring_amount', { ref: toRef(rec) });
  if (rec && has(t, /\b(quand|when|prochain|prochaine|next)\b/) && !spent) return q('recurring_next', { ref: toRef(rec) });

  // Reste par jour, budget
  if (has(t, /\b(par jour|per day|a day|chaque jour)\b/)) return q('per_day');
  if (has(t, /\b(jusqu a|until)\b.*\b(paie|salaire|pay|payday)\b/)) return q('until_payday');
  if (has(t, /\b(enveloppes?|budgets?|envelopes?)\b.*\b(depassee|depassees|depasse|over)\b|\bover budget\b/)) return q('envelopes_over');
  if (has(t, /\b(reste a repartir|a repartir|left to (allocate|assign))\b/)) return q('to_allocate');
  if (has(t, /\b(reste|restant|left|il me reste|il reste)\b/) && !spent) {
    const env = bestEntity(t, ctx.vocab, ['envelope']).one;
    if (env) return q('envelope_remaining', { ref: toRef(env) });
    const c = categoryIn(t, ctx);
    const viaCat = c ? ctx.data.envelopes.find((e) => !e.deleted && e.active && (e.categoryIds.includes(c.categoryId) || (c.subcategoryId && e.categoryIds.includes(c.subcategoryId)))) : undefined;
    if (viaCat) return q('envelope_remaining', { ref: { kind: 'envelope', id: viaCat.id, label: viaCat.name } });
  }

  // Argent et comptes
  if (has(t, /\b(total (de |of )?(mes |tous mes |my |all my )?(comptes|accounts))\b/)) return q('total_accounts');
  if (has(t, /^(mes comptes|my accounts)$/)) return q('accounts_list');
  if (has(t, /\b(disponible|available|argent dispo)\b/)) return q('available');
  if (has(t, /\b(combien|how much|solde|balance|il y a)\b/) && !spent) {
    const acc = bestEntity(t, ctx.vocab, ['account']).one;
    if (acc) return q('account_balance', { ref: toRef(acc) });
  }

  // Historique et dépenses
  if (has(t, /\b(dernieres? (depenses|operations)|last (expenses|transactions))\b/)) return q('last_expenses');
  if (has(t, /\b(plus grosse|plus grande|biggest|largest)\b/) && has(t, /\b(depense|expense)\b/)) return q('biggest_expense');
  if (has(t, /\b(la famille|family)\b.*\b(a depense|ont depense|spent)\b/)) return q('family_spent');
  if (has(t, /\b(ou|quoi)\b.*\b(part|va|passe)\b.*\bargent\b|depense le plus|plus gros poste|where does my money go/)) return q('top_category');
  if (has(t, /\b(puis|peux|pourrais|est ce que)\b.*\b(acheter|payer|m offrir|me permettre)\b|ai je les moyens|can i (afford|buy)/)) return q('can_afford', { amount: amountOf(t, cur) });
  const c = categoryIn(t, ctx);
  if (c && (spent || has(t, /^(combien|how much|et en|et pour|and on)\b/))) return q('spent_category', { ...c, period: periodOf(t) });
  if (has(t, /\b(gagne|recu|revenu|revenus|earned|income|entre)\b/)) return q('income_month');
  if (spent) return q('spent_month');
  return null;
}

/** Complète une intention avec l'élément résolu, ou la transforme en question / « introuvable ». */
export function withRef<T extends QuestionIntent | ActionIntent>(intent: T, r: Resolved, field: AskField, asked = 0): Intent {
  if ('ref' in r) return { ...intent, ref: r.ref };
  if ('tied' in r) return { kind: 'ask', field, options: r.tied, intent, asked };
  return { kind: 'notFound', entity: r.options[0]?.kind ?? (field as EntityKind), word: r.notFound ?? '', options: r.options };
}

// ─── 4. Actions (§2.2) ──────────────────────────────────────────────

function action(t: string, ctx: IntentContext): Intent | null {
  const cur = ctx.entry.currency;
  const today = ctx.entry.today;
  const amount = amountOf(t, cur);
  const a = (kind: ActionKind, extra: Partial<ActionIntent> = {}): ActionIntent => ({ kind: 'action', action: kind, amount, date: today, ...extra });
  const accounts = accountsInOrder(t, ctx);
  const isSavingsAcc = (r: EntityRef) => ctx.entry.accounts.some((x) => x.id === r.id && x.isSavings);
  const savingsWord = has(t, /\b(epargne|savings)\b/);

  // Reprendre de l'épargne : « Sors 30 000 de mon épargne vers Wave ».
  if (has(t, /\b(sors|sortir|retire|retirer|prends|prendre|enleve|enlever|take|withdraw)\b.*\b(de|from|sur) (mon |ma |l |my )?(epargne|savings)\b/)) {
    const from = accounts.find(isSavingsAcc) ?? null;
    const to = accounts.find((r) => !isSavingsAcc(r)) ?? null;
    return complete(a('withdraw_savings', { from, to }), ctx);
  }
  // Prendre sur la réserve : « Prends 40 000 sur la réserve famille pour les funérailles ».
  if (has(t, /\b(prends|prendre|utilise|utiliser|take|use)\b.*\breserve\b/)) {
    const r = bestEntity(t, ctx.vocab, ['reserve']).one;
    const c = categoryIn(t.replace(/\breserve [a-z]+\b/, ' '), ctx);
    return complete(a('reserve_use', { ref: r ? toRef(r) : null, from: accounts.find((x) => !isSavingsAcc(x)) ?? null, ...(c ?? {}) }), ctx);
  }
  // Mettre de côté : « Retire 100 000 de l'argent disponible pour le mettre en épargne », « Mets 50 000 de côté ».
  const saveVerb = /\b(mets|mettre|met|garde|garder|place|placer|verse|verser|retire|retirer|enleve|transfere|depose|put|keep|set|move)\b/;
  const saveTarget = /\b(de cote|en epargne|sur (mon |ma |l |my )?(compte )?epargne|dans (mon |ma |l )?(compte )?epargne|aside|into (my )?savings|to (my )?savings)\b/;
  const savedPast = /^(j ai|je viens d|i)\s?(epargne|economise|mis de cote|saved|put aside)\b/;
  const goalCited = bestEntity(t, ctx.vocab, ['goal']).one;
  if (((saveVerb.test(t) && saveTarget.test(t)) || savedPast.test(t)) && !goalCited) {
    const from = accounts.find((r) => !isSavingsAcc(r)) ?? null;
    const to = accounts.find(isSavingsAcc) ?? null;
    return complete(a('save', { from, to }), ctx);
  }
  // Ajouter à un objectif : « Ajoute 25 000 à ma moto ».
  if (goalCited && has(t, /\b(ajoute|ajouter|verse|verser|mets|mettre|met|garde|add|put|save)\b/) && amount) {
    return complete(a('goal_contribute', { ref: toRef(goalCited), from: accounts[0] ?? null }), ctx);
  }
  // Remboursement : « J'ai remboursé 50 000 à Koffi (avec Orange Money) ».
  if (has(t, /\b(j ai rembourse|je rembourse|rembourse|i repaid|i paid back|repaid|paid back)\b/) && !has(t, /\b(m a rembourse|on m a rembourse)\b/)) {
    const person = wordAfter(t, /\b(?:a|to)\s+([a-z][a-z-]+)/);
    const r = resolve(t, ctx, ['debt'], person);
    if ('ref' in r || 'notFound' in r || person) return complete(withRefAction(a('debt_repayment', { from: accounts.find((x) => !isSavingsAcc(x)) ?? null }), r, 'debt'), ctx);
  }
  // Nouvelle dette : « Koffi m'a prêté 100 000 », « J'ai prêté 20 000 à Awa ».
  const lentMe = t.match(/^([a-z][a-z-]+) m a (prete|avance)\b|^([a-z][a-z-]+) lent me\b/);
  if (lentMe) {
    const name = (lentMe[1] ?? lentMe[3])!;
    return complete(a('debt_create', { direction: 'i_owe', label: cap(name), to: accounts.find((x) => !isSavingsAcc(x)) ?? null }), ctx);
  }
  if (has(t, /\b(j ai prete|je prete|i lent)\b/)) {
    const name = wordAfter(t, /\b(?:a|to)\s+([a-z][a-z-]+)/);
    if (name) return complete(a('debt_create', { direction: 'owed_to_me', label: cap(name), from: accounts.find((x) => !isSavingsAcc(x)) ?? null }), ctx);
  }
  // Montant d'une enveloppe : « Mets le transport à 50 000 ce mois-ci ».
  const env = bestEntity(t, ctx.vocab, ['envelope']).one;
  if (env && amount && has(t, /^(mets|mettre|fixe|fixer|passe|passer|set|change)\b/) && has(t, /\b(a|to)\s+\d/)) return a('envelope_budget', { ref: toRef(env) });
  // Nouvelle récurrence : « Chaque mois j'envoie 50 000 à Maman », « Le loyer c'est 100 000 le 5 ».
  const monthly = has(t, /\b(chaque mois|tous les mois|par mois|every month|each month|mensuellement)\b/);
  const dueDay = t.match(/\bc est \d[\d ]* le (\d{1,2})\b|\ble (\d{1,2})\s*(du mois)?$/);
  if (amount && (monthly || dueDay)) {
    const person = wordAfter(t, /\b(?:a|to)\s+([a-z][a-z-]+)/);
    const c = categoryIn(t, ctx) ?? (person && has(t, /\b(envoie|envoye|donne|send|give)\b/) ? { categoryId: 'cat_family', subcategoryId: null } : null);
    const label = person ? cap(person) : c ? null : null;
    const day = dueDay ? Number(dueDay[1] ?? dueDay[2]) : null;
    const income = has(t, /\b(salaire|recois|je touche|salary|i receive|i get paid)\b/);
    return complete(a('recurring_create', { type: income ? 'income' : 'expense', label, dueDay: day && day >= 1 && day <= 31 ? day : null, ...(c ?? {}), from: accounts[0] ?? null }), ctx);
  }
  // Échéance réglée ou reçue : « J'ai payé le loyer », « Le salaire est tombé ».
  const rec = bestEntity(t, ctx.vocab, ['recurring']).one ?? recurringByCategory(t, ctx);
  if (rec && !amount && has(t, /\b(j ai paye|j ai regle|est tombe|est arrive|est rentre|i paid|has arrived|came in|is in)\b/) && !has(t, /\btontine\b/)) {
    return a('recurring_confirm', { ref: toRef(rec), amount: null });
  }
  // Transfert entre mes comptes : « Envoie 10 000 de Wave vers Orange Money » ; retrait en espèces.
  if (amount && accounts.length >= 2 && has(t, /\b(envoie|envoye|transfere|transferer|vire|virer|mets|depose|move|send|transfer)\b/) && !savingsWord) {
    return complete(a('transfer', { from: accounts[0], to: accounts[1] }), ctx);
  }
  if (amount && accounts.length === 1 && !isSavingsAcc(accounts[0]) && has(t, /\b(enleve|enlever|retire|retirer|retrait|withdraw)\b/)) {
    const cash = currentAccounts(ctx).find((x) => x.type === 'cash' && x.id !== accounts[0].id);
    return complete(a('transfer', { from: accounts[0], to: cash ? accRef(cash) : null }), ctx);
  }
  return null;
}

/** Récurrence désignée par sa catégorie (« I paid the rent » → la récurrence du loyer), si elle est unique. */
function recurringByCategory(t: string, ctx: IntentContext) {
  const c = categoryIn(t, ctx, 'expense') ?? categoryIn(t, ctx, 'income');
  if (!c) return null;
  const rules = ctx.data.recurring.filter((r) => !r.deleted && r.active && (c.subcategoryId ? r.subcategoryId === c.subcategoryId : r.categoryId === c.categoryId));
  if (rules.length !== 1) return null;
  return ctx.vocab.entries.find((e) => e.kind === 'recurring' && e.id === rules[0].id) ?? null;
}

function withRefAction(intent: ActionIntent, r: Resolved, field: AskField): ActionIntent | Intent {
  return withRef(intent, r, field);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * Ce qui manque encore → une question avec des boutons tirés des données (§4). Les comptes :
 * « l'argent disponible » n'est pas un compte — un seul compte courant peut couvrir le montant
 * → il est proposé ; sinon « Depuis quel compte ? ». Le montant manquant n'est pas une question :
 * il est surligné sur la carte.
 */
export function complete(intent: Intent, ctx: IntentContext, asked = 0): Intent {
  if (intent.kind !== 'action') return intent;
  let x: ActionIntent = intent;
  const ask = (field: AskField, options: EntityRef[]): Intent => ({ kind: 'ask', field, options, intent: x, asked });
  const current = currentAccounts(ctx);
  const savings = savingsAccounts(ctx);
  const covering = (amount: number | null) => current.filter((c) => amount === null || (ctx.debitable[c.id] ?? 0) >= amount);
  switch (x.action) {
    case 'save': {
      if (!x.from) {
        const ok = covering(x.amount);
        if (ok.length !== 1) return ask('from', (ok.length ? ok : current).map(accRef));
        x = { ...x, from: accRef(ok[0]) };
      }
      if (!x.to) {
        if (savings.length === 1) x = { ...x, to: accRef(savings[0]) };
        else if (savings.length > 1) return ask('to', savings.map(accRef));
        else return { kind: 'notFound', entity: 'account', word: 'epargne', options: [] };
      }
      return x;
    }
    case 'withdraw_savings': {
      if (!x.from) {
        if (savings.length === 1) x = { ...x, from: accRef(savings[0]) };
        else if (savings.length > 1) return ask('from', savings.map(accRef));
        else return { kind: 'notFound', entity: 'account', word: 'epargne', options: [] };
      }
      return x.to ? x : ask('to', current.map(accRef));
    }
    case 'transfer': {
      if (!x.from) return ask('from', current.map(accRef));
      const from = x.from.id;
      return x.to ? x : ask('to', current.filter((c) => c.id !== from).map(accRef));
    }
    case 'goal_contribute': {
      if (x.from) return x;
      const goal = ctx.data.goals.find((g) => g.id === x.ref?.id);
      const linked = goal?.accountId ? ctx.entry.accounts.find((c) => c.id === goal.accountId) : undefined;
      if (linked) return { ...x, from: accRef(linked) };
      if (savings.length === 1) return { ...x, from: accRef(savings[0]) };
      return ask('account', ctx.entry.accounts.map(accRef));
    }
    case 'reserve_use': {
      if (!x.ref) {
        const reserves = entitiesOf(ctx.vocab, 'reserve').map(toRef);
        if (reserves.length === 1) x = { ...x, ref: reserves[0] };
        else if (reserves.length > 1) return ask('reserve', reserves);
        else return { kind: 'notFound', entity: 'reserve', word: '', options: [] };
      }
      return x.from ? x : ask('account', covering(x.amount).map(accRef));
    }
    case 'debt_repayment':
      return x.from ? x : ask('account', covering(x.amount).map(accRef));
    case 'debt_create':
      if (x.direction === 'i_owe') return x.to ? x : ask('account', current.map(accRef));
      return x.from ? x : ask('account', covering(x.amount).map(accRef));
    case 'recurring_create':
      return x.from ? x : ask('account', current.map(accRef));
    default:
      return x;
  }
}

/** Réponse à une question « Lequel ? » : le choix complète l'intention (au plus 2 questions, §4). */
export function answerAsk(ask: Extract<Intent, { kind: 'ask' }>, optionId: string, ctx: IntentContext): Intent {
  const opt = ask.options.find((o) => o.id === optionId);
  if (!opt) return ask;
  const i = ask.intent;
  const field = ask.field;
  const next: QuestionIntent | ActionIntent =
    field === 'from' || field === 'to' || field === 'account'
      ? i.kind === 'action'
        ? field === 'account'
          ? i.action === 'debt_create' && i.direction === 'i_owe'
            ? { ...i, to: opt }
            : { ...i, from: opt }
          : { ...i, [field]: opt }
        : i
      : { ...i, ref: opt };
  return complete(next, ctx, ask.asked + 1);
}

// ─── 5. Saisie (dépenses, revenus, tontines) ────────────────────────

function entry(original: string, ctx: IntentContext): Intent | null {
  const r = parseEntryText(original, ctx.entry);
  if (r.kind === 'savings') {
    const d = r.deposit;
    const acc = (id: string | null) => (id ? ctx.entry.accounts.find((x) => x.id === id) : undefined);
    const from = acc(d.fromAccountId);
    const to = acc(d.savingsAccountId);
    return complete({ kind: 'action', action: 'save', amount: d.amount, date: d.date, from: from ? accRef(from) : null, to: to ? accRef(to) : null }, ctx);
  }
  if (r.kind === 'assistant') {
    const p = r.intent;
    if (p.kind === 'goal') return { kind: 'action', action: 'goal_create', amount: p.amount === null ? null : toMinor(p.amount, ctx.entry.currency), date: ctx.entry.today, label: p.name };
    return null;
  }
  if (r.kind !== 'entries' && r.kind !== 'ambiguous') return null;
  const items = r.kind === 'entries' ? r.items : [];
  const cats = ctx.data.categories;
  const hasCat = (id: string) => cats.some((c) => c.id === id && !c.deleted);
  const tontineCat = tontineContributionCategory(cats);
  const withTontine = applyTontine(items, {
    text: original,
    tontines: ctx.data.tontines,
    entries: ctx.data.tontineEntries,
    today: ctx.entry.today,
    defaultAccountId: ctx.entry.defaultAccountId,
    payoutCategory: hasCat('inc_tontine') ? 'inc_tontine' : 'inc_other',
    contributionCategory: tontineCat.categoryId,
    contributionSubcategory: tontineCat.subcategoryId,
  });
  const drafts = withTontine ?? items;
  // Une ligne sans montant (ni tontine reconnue) n'est pas comprise : repli.
  if (!drafts.length || drafts.every((d) => d.amount === null && !d.tontine)) return null;
  return { kind: 'entry', drafts };
}

// ─── Point d'entrée ─────────────────────────────────────────────────

/** Comprend une phrase sur le téléphone. `unknown` : la phrase peut partir au repli (Haiku). */
export function understand(original: string, ctx: IntentContext): Intent {
  const t = clean(original);
  if (!t) return { kind: 'unknown' };
  const steps = [() => forbidden(t), () => openScreen(t, ctx), () => question(t, original, ctx), () => action(t, ctx), () => entry(original.replace(/(\d)[,](\d{3})(?!\d)/g, '$1$2'), ctx), () => legacyQuestion(original, ctx)];
  for (const s of steps) {
    const r = s();
    if (r) return r;
  }
  return { kind: 'unknown' };
}

/** Sujets de l'ancien parseur (`parser.ts`), s'ils n'ont pas été reconnus plus haut. */
function legacyQuestion(original: string, ctx: IntentContext): Intent | null {
  const p = parseIntent(original, ctx.entry.today);
  if (p.kind !== 'question') return null;
  const amount = p.amount === null ? null : toMinor(p.amount, ctx.entry.currency);
  // Anciens sujets : « solde » = argent disponible ; « reste pour X » = enveloppe de la catégorie.
  if (p.topic === 'balance') return { kind: 'question', topic: 'available' };
  if (p.topic === 'remaining_category') {
    const env = ctx.data.envelopes.find((e) => !e.deleted && e.active && !!p.categoryId && e.categoryIds.includes(p.categoryId));
    return env ? { kind: 'question', topic: 'envelope_remaining', ref: { kind: 'envelope', id: env.id, label: env.name } } : { kind: 'question', topic: 'spent_category', categoryId: p.categoryId, period: 'month' };
  }
  return { kind: 'question', topic: p.topic, categoryId: p.categoryId, amount };
}
