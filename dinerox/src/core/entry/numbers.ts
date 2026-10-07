/**
 * Montants dans une phrase normalisée (minuscules, sans accents) — PUR.
 *
 * Chiffres (« 2 000 », « 2000 », « 5k », « 250 mille », « 1,5 million »,
 * « 2 000 f », « 2000fcfa ») et nombres en lettres (« deux mille cinq cents »,
 * « trois cent mille », « vingt-cinq mille », « un million deux cent mille »).
 * Chaque montant est renvoyé avec sa position (découpage multi-opérations).
 */

export interface AmountSpan {
  value: number;
  start: number;
  end: number;
}

const SMALL: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60,
};
const BIG: Record<string, number> = { mille: 1_000, mil: 1_000, million: 1_000_000, millions: 1_000_000, milliard: 1_000_000_000, milliards: 1_000_000_000 };
const NUMBER_WORD = new RegExp(`^(?:${[...Object.keys(SMALL), 'cent', 'cents', 'et', ...Object.keys(BIG)].join('|')})$`);

/** Valeur d'une suite de mots-nombres (« deux mille cinq cents » → 2500), null si invalide. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let any = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'et') continue;
    if (w in SMALL) {
      // « quatre-vingt(s) » = 80 (et non 4 + 20).
      if ((w === 'vingt' || w === 'vingts') && words[i - 1] === 'quatre') current += 76;
      else current += SMALL[w];
      any = true;
    } else if (w === 'cent' || w === 'cents') {
      current = (current || 1) * 100;
      any = true;
    } else if (w in BIG) {
      total += (current || 1) * BIG[w];
      current = 0;
      any = true;
    } else return null;
  }
  return any ? total + current : null;
}

/** Nombres écrits en lettres. Seuls ceux qui contiennent « cent », « mille », « million »… sont des montants (« un taxi » n'en est pas un). */
function wordAmounts(text: string): AmountSpan[] {
  const out: AmountSpan[] = [];
  const re = /[a-z]+(?:-[a-z]+)*/g;
  let m: RegExpExecArray | null;
  let run: { words: string[]; start: number; end: number } | null = null;
  const flush = () => {
    if (!run) return;
    // « et » en fin de suite n'en fait pas partie (« mille et garba »).
    while (run.words.length && run.words[run.words.length - 1] === 'et') run.words.pop();
    const hasScale = run.words.some((w) => w === 'cent' || w === 'cents' || w in BIG);
    const v = hasScale ? wordsToNumber(run.words) : null;
    if (v !== null && v > 0) out.push({ value: v, start: run.start, end: run.end });
    run = null;
  };
  while ((m = re.exec(text))) {
    const parts = m[0].split('-');
    if (parts.every((p) => NUMBER_WORD.test(p))) {
      // Une suite continue de mots-nombres, séparés seulement par des espaces.
      if (run && text.slice(run.end, m.index).trim() === '') {
        run.words.push(...parts);
        run.end = m.index + m[0].length;
      } else {
        flush();
        run = { words: [...parts], start: m.index, end: m.index + m[0].length };
      }
    } else flush();
  }
  flush();
  // Une suite qui commence par un chiffre (« 250 mille ») est déjà comptée par les chiffres.
  return out.filter((w) => !/\d\s*$/.test(text.slice(0, w.start)));
}

const MULT: Record<string, number> = { k: 1_000, mille: 1_000, mil: 1_000, millier: 1_000, milliers: 1_000, million: 1_000_000, millions: 1_000_000, m: 1_000_000, milliard: 1_000_000_000, milliards: 1_000_000_000, md: 1_000_000_000, mds: 1_000_000_000 };

/** Chiffres, avec position (mêmes formes que l'assistant, sans les unités argotiques non validées). */
function digitAmounts(text: string): AmountSpan[] {
  const out: AmountSpan[] = [];
  const re = /(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mille|mil|milliers?|millions?|m|milliards?|mds?)?(?![a-z0-9])(\s*(?:ans?|annees?|mois|semaines?|jours?|%|pour ?cent|h\b|heures?|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|june|july|august|september|october|november|december))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[3]) continue; // durée, pourcentage, heure, date (« le 5 octobre »)
    // Groupes de milliers (« 1 000 », « 1.000 ») ou nombre décimal (« 12,50 ») : décimales conservées,
    // l'arrondi se fait à la conversion en unités mineures de la devise.
    const raw = m[1];
    const base = /^\d{1,3}(?:[ .]\d{3})+$/.test(raw) ? Number(raw.replace(/[ .]/g, '')) : Number(raw.replace(',', '.'));
    const value = base * (m[2] ? MULT[m[2]] ?? MULT[m[2].replace(/s$/, '')] ?? 1 : 1);
    if (Number.isFinite(value) && value > 0) out.push({ value, start: m.index, end: m.index + m[0].trimEnd().length });
  }
  return out;
}

/** Retire les unités monétaires collées au nombre (« 2000f », « 2 000 fcfa ») qui empêcheraient la lecture. */
export function stripCurrencyWords(text: string): string {
  return text.replace(/(\d)\s*(fcfa|f cfa|cfa|francs?|frs?|xof|f)(?![a-z])/g, '$1 ');
}

/** Tous les montants, dans l'ordre de la phrase. */
export function amountSpans(text: string): AmountSpan[] {
  const clean = stripCurrencyWords(text);
  return [...digitAmounts(clean), ...wordAmounts(clean)].sort((a, b) => a.start - b.start);
}

/** Unités argotiques non validées (« 2 bâtons ») : le montant n'est pas deviné. */
export function hasUnvalidatedUnit(text: string, words: string[]): boolean {
  if (!words.length) return false;
  return new RegExp(`(\\d|\\b(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix))\\s*(?:${words.join('|')})s?\\b`).test(text);
}
