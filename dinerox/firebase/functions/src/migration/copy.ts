/**
 * Déménagement de la base (docs/migration-europe.md) : copie COMPLÈTE d'une base Firestore
 * vers une autre, document par document, sous-collections comprises.
 *
 * Règle « le plus récent gagne » (comme la synchronisation de l'app) : si la base cible a
 * déjà le document avec un `updatedAt` égal ou plus récent, il est GARDÉ (une écriture faite
 * par un téléphone pendant la manœuvre n'est jamais écrasée par une version plus ancienne).
 * Un document sans `updatedAt` déjà présent dans la cible est gardé aussi.
 *
 * `bumpSyncedAt` : les documents synchronisés (champ `syncedAt`) reçoivent un nouvel
 * horodatage serveur ; chaque téléphone les retélécharge donc à sa reconnexion, ce qui
 * répare tout cache local qui aurait perdu un document pendant la coupure.
 *
 * Rien n'est jamais supprimé, ni dans la source ni dans la cible.
 */
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';

export interface CopyReport {
  read: number;
  written: number;
  keptNewerInTarget: number;
  keptExistingWithoutDate: number;
}

export interface CopyOptions {
  bumpSyncedAt?: boolean;
  dryRun?: boolean;
  /** Collections de premier niveau copiées en premier (ex. espaces, avant leurs données). */
  firstCollections?: string[];
  /**
   * Profondeur à laquelle on cherche des sous-collections. Dans DineroX, seuls les documents de
   * premier niveau en ont (users/…/devices, spaces/…/transactions, config/…/items) : 1 suffit
   * et évite une requête par document (copie bien plus rapide). `Infinity` = tout parcourir.
   */
  subcollectionDepth?: number;
}

const CHUNK = 200;

function decide(src: DocumentSnapshot, dst: DocumentSnapshot | undefined): 'write' | 'newer' | 'nodate' {
  if (!dst?.exists) return 'write';
  const a = src.get('updatedAt');
  const b = dst.get('updatedAt');
  if (typeof a !== 'number' || typeof b !== 'number') return 'nodate';
  return b >= a ? 'newer' : 'write';
}

export async function copyDatabase(src: Firestore, dst: Firestore, opts: CopyOptions = {}): Promise<CopyReport> {
  const report: CopyReport = { read: 0, written: 0, keptNewerInTarget: 0, keptExistingWithoutDate: 0 };

  const maxDepth = opts.subcollectionDepth ?? 1;
  async function copyRefs(refs: DocumentReference[], depth: number) {
    for (let i = 0; i < refs.length; i += CHUNK) {
      const part = refs.slice(i, i + CHUNK);
      const srcSnaps = await src.getAll(...part);
      const dstSnaps = await dst.getAll(...part.map((r) => dst.doc(r.path)));
      const batch = dst.batch();
      let n = 0;
      srcSnaps.forEach((s, k) => {
        if (!s.exists) return; // parent « fantôme » : seules ses sous-collections existent
        report.read++;
        const d = decide(s, dstSnaps[k]);
        if (d === 'newer') return void report.keptNewerInTarget++;
        if (d === 'nodate') return void report.keptExistingWithoutDate++;
        const data = s.data()!;
        if (opts.bumpSyncedAt && 'syncedAt' in data) data.syncedAt = FieldValue.serverTimestamp();
        batch.set(dst.doc(s.ref.path), data);
        n++;
      });
      if (n && !opts.dryRun) await batch.commit();
      report.written += n;
    }
    // Sous-collections de chaque document (y compris des parents « fantômes »), en parallèle par paquets.
    if (depth > maxDepth) return;
    for (let i = 0; i < refs.length; i += 20) {
      const subs = await Promise.all(refs.slice(i, i + 20).map((r) => r.listCollections()));
      for (const list of subs) for (const sub of list) await copyRefs(await sub.listDocuments(), depth + 1);
    }
  }

  const top = (await src.listCollections()).map((c) => c.id);
  const ordered = [...(opts.firstCollections ?? []).filter((c) => top.includes(c)), ...top.filter((c) => !(opts.firstCollections ?? []).includes(c))];
  for (const c of ordered) await copyRefs(await src.collection(c).listDocuments(), 1);
  return report;
}
