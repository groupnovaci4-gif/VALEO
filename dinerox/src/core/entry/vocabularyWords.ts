/** Mots du vocabulaire local, transmis à la reconnaissance vocale comme « mots attendus » (si le service le permet). */
import VOCAB from './vocabulary.json';

let cache: string[] | null = null;
export function entryVocabularyWords(): string[] {
  if (cache) return cache;
  const v = VOCAB as unknown as { expense: { words: string[] }[]; income: { words: string[] }[] };
  cache = [...new Set([...v.expense, ...v.income].flatMap((e) => e.words))];
  return cache;
}
