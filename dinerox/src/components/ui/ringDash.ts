/**
 * Trait d'un anneau de progression (module pur, testé) : « longueur pleine, circonférence »,
 * comme la maquette (`stroke-dasharray="180.3 219.9"`). `null` à 0 % : rien n'est dessiné.
 */
export function ringDash(radius: number, percent: number): string | null {
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(100, percent));
  if (p <= 0) return null;
  return `${((circumference * p) / 100).toFixed(1)} ${circumference.toFixed(1)}`;
}
