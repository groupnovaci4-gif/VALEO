// VALEO — préparation de la charge utile de synchronisation.
//
// Module volontairement PUR (aucune dépendance d'exécution, seulement un import
// de type) afin d'être testable directement par Node : `yarn test`.
import type { Data } from "./lib";

// Tableaux d'enregistrements fusionnés un par un par le backend.
export const ENTITIES = ["staff", "members", "collections", "loans", "mandats", "depenses", "settlements", "sorties"] as const;
export type Entity = (typeof ENTITIES)[number];
export type Deletions = Partial<Record<Entity, string[]>>;

const byId = (rows: any[]): Record<string, any> => {
  const out: Record<string, any> = {};
  (rows || []).forEach((r) => {
    if (r && r.id) out[r.id] = r;
  });
  return out;
};

// Comparaison hors `updatedAt` : cet horodatage est justement ce qu'on calcule.
export const sameRecord = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== "updatedAt"));
  for (const k of Array.from(keys)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  return true;
};

/**
 * Prépare la charge utile envoyée à `PUT /api/state`, à partir de l'état local
 * et de la dernière version reçue du serveur (`baseline`).
 *
 * - estampille `updatedAt` sur CHAQUE enregistrement créé ou réellement modifié.
 *   Le serveur arbitre ensuite les conflits : sur un même enregistrement, la
 *   version la plus récente gagne ;
 * - liste les suppressions **explicites** : depuis la fusion par
 *   enregistrement, un enregistrement simplement absent de la charge utile
 *   n'est plus supprimé côté serveur (c'est ce qui faisait disparaître le
 *   travail des autres appareils).
 *
 * Le calcul se fait par différence plutôt que dans chaque mutation du store :
 * aucune écriture ne peut être oubliée et rester bloquée sur le téléphone.
 */
export function prepareSync(local: Data, baseline: Data | null): { data: Data; deletions: Deletions } {
  const now = new Date().toISOString();
  const out: any = { ...local };
  const deletions: Deletions = {};
  ENTITIES.forEach((e) => {
    const base = byId((baseline as any)?.[e] || []);
    const rows = (((local as any)[e] || []) as any[]);
    out[e] = rows.map((row) => {
      if (!row || !row.id) return row;
      const prev = base[row.id];
      if (prev && sameRecord(prev, row)) return { ...row, updatedAt: prev.updatedAt || row.updatedAt };
      return { ...row, updatedAt: now };
    });
    const present = new Set(rows.map((r) => r && r.id).filter(Boolean));
    const gone = Object.keys(base).filter((id) => !present.has(id));
    if (gone.length) deletions[e] = gone;
  });
  return { data: out as Data, deletions };
}
