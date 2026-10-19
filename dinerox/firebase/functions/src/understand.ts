/**
 * Repli de compréhension (docs/ia-comprend-tout.md §1.2, §5, §6) : une phrase que le TÉLÉPHONE
 * n'a pas comprise est TRADUITE par Haiku en une intention de la liste fermée.
 *
 *  - Entrée : la phrase (300 caractères au plus) et la langue SEULEMENT. Aucune donnée de la
 *    personne (ni soldes, ni comptes, ni noms de tontines ou d'objectifs) ; le modèle renvoie
 *    les mots tels quels (« bureau », « moto ») et c'est le téléphone qui les rapproche.
 *  - Texte système FIXE (mis en cache) : liste fermée des intentions, schéma de réponse, noms
 *    STANDARD des rubriques — identiques pour tout le monde.
 *  - Sortie : schéma JSON fermé, revérifiée ici puis sur le téléphone. La phrase n'est jamais
 *    journalisée ni stockée.
 * Les listes sont le miroir de `src/core/ai/intent.ts` et `sections.ts` (test : tests/ia-repli.test.ts).
 */
import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_MODEL } from './assistant';

export const UNDERSTAND_TOPICS = [
  'available', 'account_balance', 'set_aside', 'total_accounts', 'accounts_list', 'per_day', 'until_payday',
  'envelope_remaining', 'envelopes_over', 'to_allocate',
  'spent_month', 'spent_category', 'top_category', 'compare_months', 'income_month', 'month_summary', 'can_afford', 'goal_feasibility', 'reduce_spending', 'why_no_savings', 'contribution_sim',
  'saved_month', 'savings_balance', 'ten_percent',
  'goal_status', 'goal_monthly', 'goal_eta', 'reserve_balance', 'season_status',
  'tontine_next', 'tontine_amount', 'tontine_turn', 'tontine_paid', 'tontine_late',
  'debts_owe', 'debts_owed', 'debt_with', 'debt_next_due',
  'recurring_amount', 'support_year', 'recurring_next', 'next_payday', 'due_week',
  'net_worth', 'asset_value', 'last_expenses', 'biggest_expense', 'margin', 'fixed_charges', 'last_month_summary', 'independence', 'score', 'rewards', 'family_spent',
] as const;
export const UNDERSTAND_ACTIONS = ['save', 'withdraw_savings', 'transfer', 'goal_contribute', 'goal_create', 'debt_repayment', 'debt_create', 'recurring_confirm', 'reserve_use', 'envelope_budget', 'recurring_create'] as const;
export const UNDERSTAND_REASONS = ['delete', 'edit_past', 'subscription', 'security', 'members', 'export', 'settings', 'real_money'] as const;
export const UNDERSTAND_SECTIONS = [
  'home', 'budget', 'goals', 'history', 'accounts', 'savings', 'tontines', 'obligations', 'seasons', 'simulate', 'debts', 'assets', 'recurring', 'assistant', 'analysis', 'calendar',
  'independence', 'rewards', 'score', 'family', 'reports', 'notifications', 'categories', 'invite', 'whatsapp', 'review', 'subscription', 'settings', 'admin',
] as const;
const PERIODS = ['week', 'month', 'last_month', 'year'] as const;
const KINDS = ['question', 'action', 'open', 'forbidden', 'unknown'] as const;

export const UNDERSTAND_MAX_CHARS = 300;
export const UNDERSTAND_TIMEOUT_MS = 8_000;

export interface UnderstandInput {
  text: string;
  language: 'fr' | 'en';
  /** Porte d'entrée : son quota existant est consommé (§6). */
  door: 'entry' | 'assistant';
  spaceId?: string;
}

/** Seuls ces champs passent ; tout le reste (soldes, noms…) est ignoré. */
export function validateUnderstandInput(raw: unknown): UnderstandInput | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = typeof r.text === 'string' ? r.text.trim() : '';
  if (!text || text.length > UNDERSTAND_MAX_CHARS) return { error: 'text/invalid' };
  if (r.door !== 'entry' && r.door !== 'assistant') return { error: 'door/invalid' };
  return { text, language: r.language === 'en' ? 'en' : 'fr', door: r.door, ...(typeof r.spaceId === 'string' && r.spaceId.length <= 128 ? { spaceId: r.spaceId } : null) };
}

const word = { type: ['string', 'null'], maxLength: 40 } as const;
export const UNDERSTAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'topic', 'action', 'section', 'reason', 'amount', 'period', 'direction', 'words'],
  properties: {
    kind: { type: 'string', enum: [...KINDS] },
    topic: { type: ['string', 'null'], enum: [...UNDERSTAND_TOPICS, null] },
    action: { type: ['string', 'null'], enum: [...UNDERSTAND_ACTIONS, null] },
    section: { type: ['string', 'null'], enum: [...UNDERSTAND_SECTIONS, null] },
    reason: { type: ['string', 'null'], enum: [...UNDERSTAND_REASONS, null] },
    amount: { type: ['number', 'null'] },
    period: { type: ['string', 'null'], enum: [...PERIODS, null] },
    direction: { type: ['string', 'null'], enum: ['i_owe', 'owed_to_me', null] },
    words: {
      type: 'object',
      additionalProperties: false,
      required: ['target', 'from', 'to', 'category'],
      properties: { target: word, from: word, to: word, category: word },
    },
  },
} as const;

const SYSTEM = `Tu traduis une phrase d'une personne qui utilise une application de gestion de budget (Afrique de l'Ouest et du Centre, montants en francs CFA le plus souvent) en UNE intention JSON de la liste fermée ci-dessous. Tu ne réponds JAMAIS à la question, tu ne calcules rien, tu n'inventes rien.

kind :
- "question" : la personne demande un chiffre ou une information → "topic" parmi : ${UNDERSTAND_TOPICS.join(', ')}.
- "action" : la personne veut enregistrer quelque chose → "action" parmi : ${UNDERSTAND_ACTIONS.join(', ')}. Les dépenses et revenus simples ne sont PAS des actions ici (kind "unknown").
- "open" : ouvrir un écran → "section" parmi : ${UNDERSTAND_SECTIONS.join(', ')}.
- "forbidden" : supprimer, modifier le passé, formule ou abonnement, sécurité (mot de passe, code PIN, e-mail, déconnexion), membres et invitations, export ou partage des données, réglages, payer ou envoyer de l'argent réel à la place de la personne → "reason" parmi : ${UNDERSTAND_REASONS.join(', ')}.
- "unknown" : tout le reste, ou en cas de doute.

words : recopie TELS QUELS les mots de la phrase qui désignent l'élément concerné ("target" : une tontine, un objectif, une dette ou une personne, une enveloppe, une récurrence, une réserve, un compte), le compte de départ ("from"), le compte d'arrivée ("to"), la catégorie ("category"). Jamais un mot absent de la phrase. Sinon null.
amount : seulement un montant PRONONCÉ dans la phrase (nombre, sans espace) ; sinon null. period : week, month, last_month, year ou null. direction (dette) : i_owe (la personne doit) ou owed_to_me, sinon null.
Rubriques de l'application : Accueil, Budget, Objectifs, Historique, Comptes, Mon épargne, Mes tontines, Famille et obligations, Moments forts, Puis-je contribuer ?, Dettes et crédits, Patrimoine, Opérations récurrentes, Parler à DineroX, Analyse financière, Calendrier financier, Indépendance financière, Mes récompenses, Mon score, Famille, Rapports, Notifications, Catégories, Parrainage, Formules, Paramètres.
Réponds uniquement par l'objet JSON du schéma.`;

/** Requête au modèle : Haiku, réflexion désactivée, schéma fermé ; la phrase et la langue seulement. */
export function buildUnderstandRequest(input: UnderstandInput): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: 400,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: UNDERSTAND_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: JSON.stringify({ text: input.text, language: input.language }) }],
  };
}

export interface Understanding {
  kind: (typeof KINDS)[number];
  topic: string | null;
  action: string | null;
  section: string | null;
  reason: string | null;
  amount: number | null;
  period: string | null;
  direction: string | null;
  words: { target: string | null; from: string | null; to: string | null; category: string | null };
}

const oneOf = <T extends readonly string[]>(list: T, v: unknown): T[number] | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : null);
const w = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);

/** Réponse du modèle revérifiée : une valeur hors liste ou incohérente → null (« Je n'ai pas compris »). */
export function sanitizeUnderstanding(raw: unknown): Understanding | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = oneOf(KINDS, r.kind);
  if (!kind) return null;
  const out: Understanding = {
    kind,
    topic: oneOf(UNDERSTAND_TOPICS, r.topic),
    action: oneOf(UNDERSTAND_ACTIONS, r.action),
    section: oneOf(UNDERSTAND_SECTIONS, r.section),
    reason: oneOf(UNDERSTAND_REASONS, r.reason),
    amount: typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount > 0 && r.amount < 1e12 ? Math.round(r.amount) : null,
    period: oneOf(PERIODS, r.period),
    direction: oneOf(['i_owe', 'owed_to_me'] as const, r.direction),
    words: { target: w((r.words as Record<string, unknown> | undefined)?.target), from: w((r.words as Record<string, unknown> | undefined)?.from), to: w((r.words as Record<string, unknown> | undefined)?.to), category: w((r.words as Record<string, unknown> | undefined)?.category) },
  };
  if (kind === 'question' && !out.topic) return null;
  if (kind === 'action' && !out.action) return null;
  if (kind === 'open' && !out.section) return null;
  if (kind === 'forbidden' && !out.reason) return null;
  return out;
}

/** Appel au modèle. Renvoie l'intention nettoyée (null : refus ou réponse illisible) et les jetons consommés. */
export async function understandWithClaude(apiKey: string, input: UnderstandInput): Promise<{ understanding: Understanding | null; tokensIn: number; tokensOut: number }> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: UNDERSTAND_TIMEOUT_MS });
  const response = await client.beta.messages.create(buildUnderstandRequest(input));
  const usage = response.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null } | undefined;
  const tokensIn = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
  const tokensOut = usage?.output_tokens ?? 0;
  if (response.stop_reason === 'refusal') return { understanding: null, tokensIn, tokensOut };
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  try {
    return { understanding: sanitizeUnderstanding(JSON.parse(text)), tokensIn, tokensOut };
  } catch {
    return { understanding: null, tokensIn, tokensOut };
  }
}
