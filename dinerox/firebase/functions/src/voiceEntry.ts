/**
 * Compréhension d'une note vocale par l'IA (1.9) — appelée par l'application
 * SEULEMENT quand le parseur local est peu sûr, avec consentement (`aiConsent`).
 *
 * - Entrée MINIMALE : la transcription écrite (jamais l'audio), la langue, les
 *   catégories actives (identifiants + libellés), les NOMS des comptes (sans
 *   soldes), la date du jour. Ni historique, ni profil, ni soldes.
 * - Sortie STRUCTURÉE (schéma JSON imposé au modèle, puis revérifié ici et dans
 *   l'application : `src/core/entry/aiGuard.ts`).
 * - La transcription n'est JAMAIS journalisée (seulement un statut d'erreur).
 * Logique pure ici (validation, consignes, schéma) ; l'appel est dans `index.ts`.
 */
import Anthropic from '@anthropic-ai/sdk';

export const VOICE_PARSE_MODEL = 'claude-haiku-5-5';
/** Délai maximal de l'appel au modèle (l'application abandonne de son côté à 8 s). */
export const VOICE_PARSE_TIMEOUT_MS = 7000;
const MAX_LINES = 30;

export interface ParseInput {
  transcript: string;
  language: 'fr' | 'en';
  today: string;
  currency: string;
  categories: { id: string; label: string; kind: 'expense' | 'income'; parentId: string | null }[];
  accounts: string[];
}

/** Contrôle de l'entrée (tailles bornées, aucun champ en trop n'est transmis au modèle). */
export function validateParseInput(raw: unknown): ParseInput | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'input/invalid' };
  const x = raw as Record<string, unknown>;
  if (typeof x.transcript !== 'string' || !x.transcript.trim() || x.transcript.length > 2000) return { error: 'transcript/invalid' };
  if (typeof x.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.today)) return { error: 'today/invalid' };
  if (typeof x.currency !== 'string' || !/^[A-Z]{3}$/.test(x.currency)) return { error: 'currency/invalid' };
  if (!Array.isArray(x.categories) || x.categories.length > 400) return { error: 'categories/invalid' };
  const categories: ParseInput['categories'] = [];
  for (const c of x.categories) {
    const o = c as Record<string, unknown>;
    if (!o || typeof o.id !== 'string' || o.id.length > 80 || typeof o.label !== 'string' || o.label.length > 80 || (o.kind !== 'expense' && o.kind !== 'income')) return { error: 'categories/invalid' };
    categories.push({ id: o.id, label: o.label, kind: o.kind, parentId: typeof o.parentId === 'string' ? o.parentId.slice(0, 80) : null });
  }
  if (!Array.isArray(x.accounts) || x.accounts.length > 30 || x.accounts.some((a) => typeof a !== 'string' || a.length > 60)) return { error: 'accounts/invalid' };
  return { transcript: x.transcript.trim(), language: x.language === 'en' ? 'en' : 'fr', today: x.today, currency: x.currency, categories, accounts: x.accounts as string[] };
}

/** Schéma imposé au modèle (sortie structurée). Le même contrôle est refait après réception. */
export const LINES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'currencyFromSpace', 'categoryId', 'subcategoryId', 'accountName', 'date', 'sourceText', 'confidence', 'question'],
        properties: {
          type: { type: 'string', enum: ['expense', 'income', 'savings_deposit'] },
          amount: { type: ['number', 'null'] },
          currencyFromSpace: { type: 'boolean' },
          categoryId: { type: ['string', 'null'] },
          subcategoryId: { type: ['string', 'null'] },
          accountName: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          sourceText: { type: 'string' },
          confidence: { type: 'number' },
          question: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

const SYSTEM = `Tu extrais des opérations financières d'une phrase dictée à une application de budget familial (Afrique de l'Ouest).
Règles impératives :
- Une ligne par opération réellement dite. « ainsi de suite », « etc. », « euh », « voilà » ne créent AUCUNE ligne.
- amount : le montant EXACTEMENT tel que prononcé, en unités de la devise (« trente mille » = 30000). N'invente jamais de montant ; si aucun montant n'est dit pour une opération, amount = null.
- Auto-correction (« 30 000, non pardon 35 000 ») : seul le montant corrigé compte.
- currencyFromSpace : false seulement si l'utilisateur cite une autre devise que celle indiquée.
- categoryId / subcategoryId : UNIQUEMENT des identifiants de la liste fournie (subcategoryId = un enfant de categoryId). Si rien ne convient ou si c'est ambigu, categoryId = null et pose une question courte dans « question ».
- type : expense (dépense), income (revenu reçu), savings_deposit (argent mis de côté / épargné : jamais une dépense).
- accountName : seulement si un compte est cité, parmi les noms fournis ; sinon null.
- date : AAAA-MM-JJ si une date est dite (« hier » = la veille de la date du jour), sinon null.
- sourceText : l'extrait exact de la phrase à l'origine de la ligne.
- confidence : de 0 à 1.
- Tu ne réponds qu'avec le JSON demandé, sans autre texte.`;

export function buildUserMessage(input: ParseInput): string {
  const cats = input.categories.map((c) => `${c.id}|${c.kind}|${c.parentId ?? '-'}|${c.label}`).join('\n');
  return `Date du jour : ${input.today}\nDevise de l'espace : ${input.currency}\nLangue : ${input.language}\nComptes : ${input.accounts.join(', ') || '(aucun)'}\nCatégories (id|sens|parent|libellé) :\n${cats}\n\nPhrase dictée :\n${input.transcript}`;
}

/** Contrôle STRUCTUREL de la sortie, et identifiants de catégorie limités à la liste envoyée. */
export function sanitizeLines(raw: unknown, input: ParseInput): unknown[] | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { lines?: unknown }).lines)) return null;
  const lines = (raw as { lines: unknown[] }).lines;
  if (lines.length > MAX_LINES) return null;
  const ids = new Set(input.categories.map((c) => c.id));
  const out: unknown[] = [];
  for (const l of lines) {
    if (!l || typeof l !== 'object') return null;
    const x = l as Record<string, unknown>;
    if (!['expense', 'income', 'savings_deposit'].includes(x.type as string)) return null;
    if (!(x.amount === null || (typeof x.amount === 'number' && Number.isFinite(x.amount) && x.amount > 0))) return null;
    if (typeof x.sourceText !== 'string' || typeof x.currencyFromSpace !== 'boolean' || typeof x.confidence !== 'number') return null;
    const cat = typeof x.categoryId === 'string' && ids.has(x.categoryId) ? x.categoryId : null;
    const sub = typeof x.subcategoryId === 'string' && ids.has(x.subcategoryId) ? x.subcategoryId : null;
    out.push({
      type: x.type,
      amount: x.amount,
      currencyFromSpace: x.currencyFromSpace,
      categoryId: cat,
      subcategoryId: sub,
      accountName: typeof x.accountName === 'string' ? x.accountName.slice(0, 80) : null,
      date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null,
      sourceText: x.sourceText.slice(0, 500),
      confidence: Math.min(1, Math.max(0, x.confidence)),
      question: typeof x.question === 'string' ? x.question.slice(0, 300) : null,
    });
  }
  return out;
}

/** Appel au modèle (sortie structurée). null = refus ou réponse illisible : l'application garde le parseur local. */
export async function parseWithClaude(apiKey: string, input: ParseInput): Promise<unknown[] | null> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: VOICE_PARSE_TIMEOUT_MS });
  const response = await client.beta.messages.create({
    model: VOICE_PARSE_MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: LINES_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  try {
    return sanitizeLines(JSON.parse(text), input);
  } catch {
    return null;
  }
}
