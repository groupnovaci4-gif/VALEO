/**
 * Compréhension du langage naturel (français) — LOCALE et déterministe.
 *
 * Transforme une phrase en INTENTION structurée. Aucune intention n'est
 * exécutée ici : l'interface présente une proposition que l'utilisateur
 * confirme ou modifie (règle : jamais d'opération financière sans
 * confirmation). Ce moteur fonctionne hors-ligne et gratuitement ; un
 * modèle distant (Cloud Function) peut le compléter pour les questions
 * ouvertes — voir services/ai.
 */
import { addDays, addMonths, endOfMonth, today, type ISODate } from '../dates';
import type { Account } from '../types';

export type QuestionTopic =
  | 'spent_month'
  | 'spent_category'
  | 'remaining_category'
  | 'top_category'
  | 'can_afford'
  | 'goal_feasibility'
  | 'reduce_spending'
  | 'compare_months'
  | 'month_summary'
  | 'why_no_savings'
  | 'balance'
  | 'income_month';

export type AccountHint = 'cash' | 'orange_money' | 'mtn_momo' | 'moov_money' | 'wave' | 'bank' | 'savings' | 'card';

export type ParsedIntent =
  | { kind: 'expense'; amount: number; categoryId: string | null; payee: string | null; date: ISODate; accountHint: AccountHint | null }
  | { kind: 'income'; amount: number | null; categoryId: string | null; payee: string | null; date: ISODate; accountHint: AccountHint | null }
  | { kind: 'transfer'; amount: number; from: AccountHint | null; to: AccountHint | null; date: ISODate }
  | { kind: 'goal'; name: string; amount: number | null; months: number | null; targetDate: ISODate | null; unknownAmount: boolean }
  | { kind: 'question'; topic: QuestionTopic; categoryId: string | null; amount: number | null }
  | { kind: 'unknown' };

/** Minuscules, sans accents, apostrophes et ponctuation simplifiées. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, cent: 100, cents: 100,
};

/** Petit nombre écrit en chiffres ou en lettres (« trois », « 18 », « vingt-quatre »). */
export function parseSmallNumber(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  const parts = word.split('-');
  let total = 0;
  for (const p of parts) {
    if (p === 'et') continue;
    const v = UNITS[p];
    if (v === undefined) return null;
    total += v;
  }
  return total || null;
}

const MULTIPLIERS: Record<string, number> = {
  k: 1_000, mille: 1_000, mil: 1_000, million: 1_000_000, millions: 1_000_000, m: 1_000_000, millier: 1_000,
  milliard: 1_000_000_000, milliards: 1_000_000_000, md: 1_000_000_000, 'mds': 1_000_000_000, barre: 1_000_000, barres: 1_000_000,
  briques: 1_000_000, brique: 1_000_000,
};

/**
 * Extrait les montants d'une phrase normalisée (unités majeures).
 * « 5000 », « 5 000 », « 5k », « 250 mille », « 8 millions », « 1,5 million »,
 * « deux millions », « un million ». Les durées (« 3 ans ») sont ignorées.
 */
export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mille|mil|milliers?|millions?|m|milliards?|mds?|barres?|briques?)?(?![a-z0-9])(\s*(?:ans?|annees?|mois|semaines?|jours?|%|pour ?cent|h\b|heures?))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[3]) continue; // durée, pourcentage, heure
    const raw = m[1];
    let value: number;
    if (/^\d{1,3}(?:[ .]\d{3})+$/.test(raw)) value = Number(raw.replace(/[ .]/g, ''));
    else value = Number(raw.replace(',', '.'));
    const key = m[2];
    const mult = key ? (MULTIPLIERS[key] ?? MULTIPLIERS[key.replace(/s$/, '')] ?? 1) : 1;
    if (Number.isFinite(value)) out.push(Math.round(value * mult));
  }
  // Nombres en lettres suivis d'un multiplicateur : « deux millions », « cent mille ».
  const wordRe = /\b((?:[a-z]+-)*[a-z]+)\s+(mille|millions?|milliards?)\b/g;
  while ((m = wordRe.exec(text))) {
    const n = parseSmallNumber(m[1]);
    if (n !== null) out.push(n * (MULTIPLIERS[m[2]] ?? 1));
  }
  return out;
}

/** Durée exprimée : « dans trois ans », « en 18 mois », « d'ici 2 ans ». → mois */
export function extractMonths(text: string): number | null {
  const m = text.match(/(?:dans|en|d ici|sur|pendant|sous)\s+((?:[a-z]+-)*[a-z]+|\d+)\s+(ans?|annees?|mois|semaines?)/);
  if (!m) return null;
  const n = parseSmallNumber(m[1]);
  if (n === null) return null;
  if (m[2].startsWith('an')) return n * 12;
  if (m[2].startsWith('semaine')) return Math.max(1, Math.round(n / 4.345));
  return n;
}

const MONTHS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

/** « en décembre 2028 », « d'ici 2028 », « pour juin » → date cible (fin de mois). */
export function extractTargetDate(text: string, now: ISODate): ISODate | null {
  const m = text.match(new RegExp(`\\b(${MONTHS_FR.join('|')})\\s*(\\d{4})?`));
  if (m) {
    const month = MONTHS_FR.indexOf(m[1]) + 1;
    let year = m[2] ? Number(m[2]) : Number(now.slice(0, 4));
    const candidate = `${year}-${String(month).padStart(2, '0')}-01`;
    if (!m[2] && candidate < now.slice(0, 8) + '01') year += 1;
    return endOfMonth(`${year}-${String(month).padStart(2, '0')}-01`);
  }
  const y = text.match(/\b(?:d ici|en|pour|avant)\s+(20\d{2})\b/);
  if (y) return `${y[1]}-12-31`;
  return null;
}

export function extractDate(text: string, now: ISODate): ISODate {
  if (/\bavant[- ]hier\b/.test(text)) return addDays(now, -2);
  if (/\bhier\b/.test(text)) return addDays(now, -1);
  return now;
}

const ACCOUNT_WORDS: [RegExp, AccountHint][] = [
  [/\borange( money)?\b|\bom\b/, 'orange_money'],
  [/\bmtn\b|\bmomo\b/, 'mtn_momo'],
  [/\bmoov\b|\bflooz\b/, 'moov_money'],
  [/\bwave\b/, 'wave'],
  [/\bepargne\b/, 'savings'],
  [/\bcarte\b|\bvisa\b/, 'card'],
  [/\bbanque\b|\bcompte bancaire\b|\bvirement\b/, 'bank'],
  [/\bcash\b|\bespeces?\b|\bliquide\b|\bpoche\b/, 'cash'],
];

export function accountHints(text: string): AccountHint[] {
  const found: { hint: AccountHint; at: number }[] = [];
  for (const [re, hint] of ACCOUNT_WORDS) {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) found.push({ hint, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.hint);
}

/** Compte de l'utilisateur correspondant à un indice (« par Wave »), ou null. */
export function resolveAccountHint(hint: AccountHint | null, accounts: Account[]): Account | null {
  const active = accounts.filter((a) => a.active);
  if (!hint) return null;
  const byProvider: Partial<Record<AccountHint, (a: Account) => boolean>> = {
    orange_money: (a) => a.provider === 'orange_money',
    mtn_momo: (a) => a.provider === 'mtn_momo',
    moov_money: (a) => a.provider === 'moov_money',
    wave: (a) => a.provider === 'wave',
    bank: (a) => a.type === 'bank',
    savings: (a) => a.isSavings,
    card: (a) => a.type === 'card',
    cash: (a) => a.type === 'cash',
  };
  return active.find(byProvider[hint] ?? (() => false)) ?? null;
}

/** Mots-clés → catégories système (identifiants de defaults.ts). */
const EXPENSE_KEYWORDS: [string, string[]][] = [
  ['cat_food', ['restaurant', 'resto', 'maquis', 'manger', 'nourriture', 'repas', 'riz', 'marche', 'courses', 'alloco', 'garba', 'attieke', 'pain', 'dejeuner', 'diner', 'petit dejeuner', 'supermarche', 'viande', 'poisson', 'boulangerie', 'cantine']],
  ['cat_transport', ['taxi', 'transport', 'carburant', 'essence', 'gasoil', 'gbaka', 'woro', 'bus', 'yango', 'uber', 'heetch', 'moto taxi', 'billet', 'peage', 'parking', 'car ']],
  ['cat_housing', ['loyer', 'maison', 'electricite', 'cie', 'sodeci', 'eau', 'courant', 'gaz', 'menage', 'reparation', 'bonne']],
  ['cat_health', ['sante', 'pharmacie', 'medicament', 'hopital', 'clinique', 'docteur', 'medecin', 'analyse', 'consultation', 'mutuelle']],
  ['cat_education', ['ecole', 'scolarite', 'livre', 'fournitures', 'formation', 'cours', 'universite', 'inscription']],
  ['cat_family', ['maman', 'papa', 'mere', 'pere', 'famille', 'parents', 'frere', 'soeur', 'tante', 'oncle', 'cousin', 'enfant', 'enfants', 'grand-mere', 'village', 'bebe', 'femme', 'mari']],
  ['cat_communication', ['credit', 'recharge', 'unites', 'appel', 'telephone']],
  ['cat_internet', ['internet', 'data', 'forfait', 'wifi', 'fibre', 'canal', 'abonnement', 'netflix']],
  ['cat_leisure', ['cinema', 'sortie', 'loisir', 'biere', 'boite', 'fete', 'concert', 'match', 'jeu', 'vacances']],
  ['cat_clothing', ['habit', 'habits', 'vetement', 'vetements', 'chaussure', 'chaussures', 'pagne', 'couture', 'tailleur', 'robe']],
  ['cat_debts', ['dette', 'remboursement', 'rembourse', 'pret', 'echeance']],
  ['cat_savings', ['epargne', 'tontine']],
  ['cat_investment', ['investissement', 'investi', 'action', 'bourse']],
];

const INCOME_KEYWORDS: [string, string[]][] = [
  ['inc_salary', ['salaire', 'paie', 'paye du mois']],
  ['inc_business', ['vente', 'ventes', 'commerce', 'boutique', 'recette', 'clients']],
  ['inc_freelance', ['freelance', 'mission', 'prestation', 'contrat']],
  ['inc_commission', ['commission', 'prime', 'bonus']],
  ['inc_pension', ['pension', 'retraite']],
  ['inc_family', ['maman', 'papa', 'famille', 'cadeau', 'aide']],
  ['inc_rent', ['loyer', 'locataire', 'location']],
];

export function guessCategory(text: string, kind: 'expense' | 'income'): string | null {
  const table = kind === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;
  for (const [id, words] of table) {
    if (words.some((w) => new RegExp(`\\b${w.trim()}s?\\b`).test(text))) return id;
  }
  return null;
}

/** Bénéficiaire après « à / au / chez / pour » (« envoyé 30000 à maman » → « maman »). */
export function extractPayee(original: string): string | null {
  const m = original.match(/(?:^|\s)(?:à|a|au|aux|chez|pour)\s+(?:la |le |l'|l’|ma |mon |mes )?([A-Za-zÀ-ÿ][\wÀ-ÿ'’ -]{1,30}?)(?:\s+(?:hier|aujourd|avant|ce|cette|avec|par|via|sur|de|du|en)\b|[.,!?]|$)/i);
  if (!m) return null;
  const v = m[1].trim();
  if (/^\d/.test(v) || v.length < 2) return null;
  return v;
}

const QUESTION_START = /^(combien|est ce que|est-ce que|pourquoi|comment|ou |quel|quelle|quels|quelles|compare|fais|fait moi|donne|resume|puis je|peux je|je peux|ai je|qu est ce|montre|dis moi|analyse)/;

function detectQuestion(text: string, original: string): ParsedIntent | null {
  const isQuestion = original.trim().endsWith('?') || QUESTION_START.test(text);
  if (!isQuestion) return null;
  const amounts = extractAmounts(text);
  const amount = amounts.length ? amounts[0] : null;
  const categoryId = guessCategory(text, 'expense');
  let topic: QuestionTopic | null = null;
  if (/pourquoi.*(epargn|economis)|jamais.*(epargn|economis)|n arrive pas.*(epargn|economis)/.test(text)) topic = 'why_no_savings';
  else if (/compar|mois dernier|par rapport/.test(text)) topic = 'compare_months';
  else if (/resume|bilan|synthese|recap/.test(text)) topic = 'month_summary';
  else if (/reduire|diminuer|economiser plus|depenser moins|moins depenser|faire des economies/.test(text)) topic = 'reduce_spending';
  else if (/objectif|atteindre/.test(text)) topic = 'goal_feasibility';
  else if (/(puis|peux|pourrais|est ce que).*(acheter|payer|m offrir|me permettre)|ai je les moyens|acheter ce/.test(text)) topic = 'can_afford';
  else if (/(ou|quoi).*(part|va|passe).*(argent)|plus depense|depense le plus|plus gros poste/.test(text)) topic = 'top_category';
  else if (/(reste|restant|encore)/.test(text) && categoryId) topic = 'remaining_category';
  else if (/(reste|solde|disponible|combien j ai|ai je encore)/.test(text)) topic = 'balance';
  else if (/(gagne|recu|revenu|entre)/.test(text)) topic = 'income_month';
  else if (/depense/.test(text)) topic = categoryId ? 'spent_category' : 'spent_month';
  if (!topic) return null;
  return { kind: 'question', topic, categoryId, amount };
}

function cleanGoalName(original: string): string {
  let s = original
    .replace(/^\s*(je (veux|voudrais|souhaite|compte|vais|dois)|j['’]aimerais|on veut|nous voulons)\s+/i, '')
    .replace(/^(économiser|epargner|épargner|mettre de côté)\s+(pour\s+)?/i, '')
    .replace(/\s+(à|a|de|pour|d['’]environ|environ)\s+[\d.,\s]+\s*(k|mille|millions?|m|milliards?|fcfa|f|francs?)?\b.*$/i, '')
    .replace(/\s+(dans|d['’]ici|en)\s+.+$/i, '')
    .replace(/\s+mais\s+.+$/i, '')
    .trim();
  s = s.replace(/[.!?]+$/, '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * Analyse une phrase. `now` permet des tests déterministes.
 */
export function parseIntent(original: string, now: ISODate = today()): ParsedIntent {
  const text = normalizeText(original);
  if (!text) return { kind: 'unknown' };

  const q = detectQuestion(text, original);
  if (q) return q;

  const amounts = extractAmounts(text);
  const amount = amounts.length ? amounts[0] : null;
  const date = extractDate(text, now);
  const hints = accountHints(text);

  // Objectif / projet
  if (/\b(je veux|je voudrais|j aimerais|je souhaite|objectif|projet|economiser pour|epargner pour|mettre de cote pour)\b/.test(text) &&
      /\b(acheter|construire|economiser|epargner|payer|financer|creer|ouvrir|preparer|objectif|projet|renover|voyager|mettre de cote)\b/.test(text)) {
    const months = extractMonths(text);
    const targetDate = months ? addMonths(now, months) : extractTargetDate(text, now);
    return {
      kind: 'goal',
      name: cleanGoalName(original) || original.trim(),
      amount,
      months: months ?? null,
      targetDate,
      unknownAmount: /sais pas|aucune idee|combien/.test(text),
    };
  }

  // Transfert : « transfère/mis/déposé/retiré X de A vers/sur B »
  if (/\b(transf[ea]r\w*|vire\w*|depose\w*|retir\w*|mis|mets|mettre|envoye\w*)\b/.test(text) && hints.length >= 1 && amount) {
    const isWithdrawal = /\bretir\w*\b/.test(text);
    const isDeposit = /\b(mis|mets|mettre|depose\w*)\b/.test(text);
    const isTransferVerb = /\btransf[ea]r\w*|vire\w*\b/.test(text);
    if (isWithdrawal && hints.length === 1) return { kind: 'transfer', amount, from: hints[0], to: 'cash', date };
    if ((isDeposit || isTransferVerb) && hints.length === 1 && !/\b(a|pour)\s+(maman|papa|ma|mon|mes)\b/.test(text)) {
      return { kind: 'transfer', amount, from: isDeposit ? 'cash' : null, to: hints[0], date };
    }
    if (hints.length >= 2) return { kind: 'transfer', amount, from: hints[0], to: hints[1], date };
  }

  // Revenu
  if (/\b(recu|gagne|encaisse|touche|salaire|paye|on m a (donne|paye|envoye)|rentre|vendu)\b/.test(text) && !/\b(j ai paye|paye (le|la|les|un|une|mon|ma|des))\b/.test(text)) {
    return {
      kind: 'income',
      amount,
      categoryId: guessCategory(text, 'income'),
      payee: null,
      date,
      accountHint: hints[0] ?? null,
    };
  }

  // Dépense (y compris « envoyé à maman »)
  if (amount && /\b(depense|paye|achete|achat|envoye|donne|regle|offert|cotise|claque|mis)\b|\b(taxi|resto|restaurant|loyer|courses|marche)\b/.test(text)) {
    const categoryId = guessCategory(text, 'expense') ?? (/\benvoye|donne\b/.test(text) ? 'cat_family' : null);
    return { kind: 'expense', amount, categoryId, payee: extractPayee(original), date, accountHint: hints[0] ?? null };
  }

  // Montant seul + mot-clé de catégorie : « 5000 taxi »
  if (amount) {
    const categoryId = guessCategory(text, 'expense');
    if (categoryId) return { kind: 'expense', amount, categoryId, payee: null, date, accountHint: hints[0] ?? null };
  }

  return { kind: 'unknown' };
}
