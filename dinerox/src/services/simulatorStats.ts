/**
 * Compteur LOCAL des simulations « Puis-je contribuer ? » du mois, par compte
 * (uid) : limite de la formule gratuite (`simulationsPerMonth`). Rien n'est
 * envoyé au serveur ; le montant simulé n'est jamais conservé.
 */
import { readJSON, storageKey, writeJSON } from './storage';
import { monthKey, today } from '@/core/dates';

interface SimulatorStats {
  month: string;
  count: number;
}

const key = (uid: string) => storageKey(uid, 'simulatorStats');

/** Simulations déjà faites ce mois-ci. */
export async function simulationsThisMonth(uid: string): Promise<number> {
  const s = await readJSON<SimulatorStats>(key(uid));
  return s && s.month === monthKey(today()) ? s.count : 0;
}

/** Compte une simulation (appelé une fois par simulation affichée). */
export async function recordSimulation(uid: string): Promise<number> {
  const month = monthKey(today());
  const count = (await simulationsThisMonth(uid)) + 1;
  await writeJSON(key(uid), { month, count });
  return count;
}
