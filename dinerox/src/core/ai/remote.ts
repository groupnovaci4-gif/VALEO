/**
 * Réponse du repli Haiku (`understandPhrase`, docs/ia-comprend-tout.md §1.2, §5) validée SUR LE
 * TÉLÉPHONE. Module PUR. Le modèle n'a reçu que la phrase et la langue : il renvoie des mots
 * (« bureau », « moto »), rapprochés ici des données de la personne. Une valeur hors liste →
 * « Je n'ai pas compris » ; un montant que la personne n'a pas prononcé n'est jamais repris.
 */
import { ACTION_KINDS, FORBIDDEN_REASONS, QUESTION_TOPICS, categoryIn, clean, complete, forbiddenSection, resolve, withRef, type ActionIntent, type ActionKind, type ForbiddenReason, type Intent, type IntentContext, type Period, type QuestionIntent, type Topic } from './intent';
import { SECTIONS, type SectionId } from './sections';
import { bestEntity, toRef, type EntityKind } from './vocabulary';
import { amountSpans } from '../entry/numbers';
import { toMinor } from '../money';

/** Forme de la réponse de la fonction (miroir de `Understanding`, firebase/functions/src/understand.ts). */
export interface RemoteUnderstanding {
  kind: 'question' | 'action' | 'open' | 'forbidden' | 'unknown';
  topic: string | null;
  action: string | null;
  section: string | null;
  reason: string | null;
  amount: number | null;
  period: string | null;
  direction: string | null;
  words: { target: string | null; from: string | null; to: string | null; category: string | null };
}

const TOPIC_KINDS: Partial<Record<Topic, EntityKind[]>> = {
  account_balance: ['account'],
  envelope_remaining: ['envelope'],
  goal_status: ['goal'],
  goal_monthly: ['goal'],
  goal_eta: ['goal'],
  reserve_balance: ['reserve'],
  season_status: ['season'],
  tontine_next: ['tontine'],
  tontine_amount: ['tontine'],
  tontine_turn: ['tontine'],
  tontine_paid: ['tontine'],
  tontine_late: ['tontine'],
  debt_with: ['debt'],
  debt_next_due: ['debt'],
  recurring_amount: ['recurring'],
  recurring_next: ['recurring'],
  asset_value: ['asset'],
};
const ACTION_KINDS_REF: Partial<Record<ActionKind, EntityKind>> = { goal_contribute: 'goal', debt_repayment: 'debt', recurring_confirm: 'recurring', reserve_use: 'reserve', envelope_budget: 'envelope' };

const isIn = <T extends string>(list: readonly T[], v: string | null): v is T => !!v && (list as readonly string[]).includes(v);

export function remoteIntent(raw: unknown, original: string, ctx: IntentContext): Intent {
  const r = raw as RemoteUnderstanding | null;
  if (!r || typeof r !== 'object') return { kind: 'unknown' };
  const cur = ctx.entry.currency;
  // Montant : seulement s'il a été PRONONCÉ dans la phrase (règle 22).
  const spoken = amountSpans(clean(original)).map((s) => s.value);
  const amount = r.amount !== null && spoken.includes(r.amount) ? toMinor(r.amount, cur) : null;
  const words = r.words ?? { target: null, from: null, to: null, category: null };
  const account = (w: string | null) => {
    const e = w ? bestEntity(w, ctx.vocab, ['account']).one : null;
    return e ? toRef(e) : null;
  };

  switch (r.kind) {
    case 'open':
      return isIn(SECTIONS.map((s) => s.id), r.section) ? { kind: 'open', section: r.section as SectionId } : { kind: 'unknown' };
    case 'forbidden':
      return isIn(FORBIDDEN_REASONS, r.reason) ? { kind: 'forbidden', reason: r.reason as ForbiddenReason, section: forbiddenSection(r.reason as ForbiddenReason) } : { kind: 'unknown' };
    case 'question': {
      if (!isIn(QUESTION_TOPICS, r.topic)) return { kind: 'unknown' };
      const topic = r.topic as Topic;
      const q: QuestionIntent = { kind: 'question', topic, period: (isIn(['week', 'month', 'last_month', 'year'], r.period) ? r.period : 'month') as Period, amount };
      if (topic === 'spent_category') {
        const c = words.category ? categoryIn(words.category, ctx) : null;
        return c ? { ...q, ...c } : { kind: 'unknown' };
      }
      const kinds = TOPIC_KINDS[topic];
      if (!kinds) return q;
      return withRef(q, resolve(words.target ?? '', ctx, kinds, words.target ? words.target.toLowerCase() : null), kinds[0] as never);
    }
    case 'action': {
      if (!isIn(ACTION_KINDS, r.action)) return { kind: 'unknown' };
      const action = r.action as ActionKind;
      const c = words.category ? categoryIn(words.category, ctx) : null;
      const base: ActionIntent = {
        kind: 'action',
        action,
        amount,
        date: ctx.entry.today,
        from: account(words.from),
        to: account(words.to),
        ...(c ?? {}),
        ...(action === 'debt_create' ? { direction: r.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe', label: words.target } : null),
        ...(action === 'goal_create' || action === 'recurring_create' ? { label: words.target } : null),
      };
      const kind = ACTION_KINDS_REF[action];
      if (!kind) return complete(base, ctx);
      const resolved = withRef(base, resolve(words.target ?? '', ctx, [kind], words.target ? words.target.toLowerCase() : null), kind as never);
      return complete(resolved, ctx);
    }
    default:
      return { kind: 'unknown' };
  }
}
