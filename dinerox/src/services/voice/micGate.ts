/**
 * Micro ouvert ? — module sans dépendance (testé). La reconnaissance vocale
 * l'ouvre pendant l'écoute ; la voix du coach et les sons se taisent alors :
 * la reconnaissance et la synthèse ne se chevauchent jamais.
 */
let open = false;
const listeners = new Set<(open: boolean) => void>();

export function isMicOpen(): boolean {
  return open;
}

export function setMicOpen(v: boolean): void {
  if (open === v) return;
  open = v;
  listeners.forEach((l) => l(v));
}

export function onMicChange(l: (open: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
