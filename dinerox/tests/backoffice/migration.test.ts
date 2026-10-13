/**
 * Répétition du déménagement de la base sur l'émulateur (docs/migration-europe.md).
 * L'émulateur ne sait ni changer d'emplacement ni faire un export Google Cloud : la copie
 * vers « eu-staging » tient lieu d'export + import, et vider « (default) » tient lieu de
 * suppression puis recréation. Ce qui est vérifié ici, c'est la LOGIQUE : rien ne se perd,
 * une écriture faite pendant la manœuvre n'est jamais écrasée par une version plus ancienne,
 * et tous les téléphones retéléchargent les données après coup.
 */
import { describe, expect, it } from 'vitest';
import { copyDatabase } from '../../firebase/functions/src/migration/copy';
import { admin } from './helpers';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-dinerox';
const live = () => admin.firestore.getFirestore();
const staging = () => admin.firestore.getFirestore('eu-staging');
type Db = ReturnType<typeof live>;

/** Nombre de documents, toutes sous-collections comprises (parents « fantômes » exclus). */
async function countAll(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const walk = async (refs: FirebaseFirestore.DocumentReference[]) => {
    for (const r of refs) {
      const s = await r.get();
      if (s.exists) out[r.parent.id] = (out[r.parent.id] ?? 0) + 1;
      for (const c of await r.listCollections()) await walk(await c.listDocuments());
    }
  };
  for (const c of await db.listCollections()) await walk(await c.listDocuments());
  return out;
}

async function clearDefault() {
  const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`vider (default) : ${r.status}`);
}

const ts = (ms: number) => admin.firestore.Timestamp.fromMillis(ms);

describe('déménagement de la base (répétition sur émulateur)', () => {
  it('copie, écritures pendant la manœuvre, recréation : rien ne se perd et les téléphones retéléchargent tout', async () => {
    await clearDefault();
    const db = live();
    const T = 1_760_000_000_000;
    // Données comme celles de l'app : profils, espaces, données synchronisées, sous-collections,
    // parent « fantôme » (config/x/items/y), données serveur sans updatedAt.
    for (const uid of ['mig_u1', 'mig_u2']) {
      await db.doc(`users/${uid}`).set({ uid, firstName: 'Awa', updatedAt: T, createdAt: T });
      await db.doc(`users/${uid}/coachEvents/e1`).set({ kind: 'k', severity: 'info', period: '2026-10', spaceId: uid, deliveredAt: T });
      await db.doc(`spaces/${uid}`).set({ id: uid, kind: 'personal', memberIds: [uid], updatedAt: T });
      for (let i = 0; i < 30; i++) await db.doc(`spaces/${uid}/categories/c${i}`).set({ id: `c${i}`, name: `Catégorie ${i}`, updatedAt: T, createdAt: T, createdBy: uid, syncedAt: ts(T) });
      await db.doc(`spaces/${uid}/transactions/t1`).set({ id: 't1', amount: 5000, updatedAt: T, createdAt: T, createdBy: uid, syncedAt: ts(T) });
    }
    await db.doc('config/seasons/items/s1').set({ label: 'Tabaski' });
    await db.doc('usage/mig_u1').set({ day: '2026-10-12', ai: 2 });
    const before = await countAll(db);

    // 1. « Export + import » vers la base européenne provisoire : copie complète.
    const r1 = await copyDatabase(db, staging(), { firstCollections: ['spaces', 'users'] });
    expect(r1.written).toBe(Object.values(before).reduce((a, n) => a + n, 0));
    expect(await countAll(staging())).toEqual(before);

    // 2. L'app continue d'écrire dans l'ancienne base : une modification et un ajout.
    await db.doc('spaces/mig_u1/transactions/t1').set({ id: 't1', amount: 7000, updatedAt: T + 10, createdAt: T, createdBy: 'mig_u1', syncedAt: ts(T + 10) });
    await db.doc('spaces/mig_u1/transactions/t2').set({ id: 't2', amount: 300, updatedAt: T + 11, createdAt: T + 11, createdBy: 'mig_u1', syncedAt: ts(T + 11) });
    // 3. Rattrapage juste avant la suppression : seuls les 2 changements sont réécrits.
    const r2 = await copyDatabase(db, staging());
    expect(r2.written).toBe(2);
    expect((await staging().doc('spaces/mig_u1/transactions/t1').get()).get('amount')).toBe(7000);

    // 4. Suppression puis recréation de « (default) » : base vide…
    await clearDefault();
    expect(Object.keys(await countAll(db))).toHaveLength(0);
    // …dans laquelle un téléphone écrit pendant la manœuvre : une version PLUS RÉCENTE de t1,
    // et une version PLUS ANCIENNE de t2 (cache en retard).
    await db.doc('spaces/mig_u1/transactions/t1').set({ id: 't1', amount: 9000, updatedAt: T + 20, createdAt: T, createdBy: 'mig_u1', syncedAt: ts(T + 20) });
    await db.doc('spaces/mig_u2/transactions/t1').set({ id: 't1', amount: 1, updatedAt: T - 5, createdAt: T, createdBy: 'mig_u2', syncedAt: ts(T - 5) });

    // 5. Remplissage de la nouvelle base depuis la base provisoire, nouvel horodatage serveur.
    const oldestCursor = T + 11; // le curseur d'un téléphone à jour avant la manœuvre
    const r3 = await copyDatabase(staging(), db, { bumpSyncedAt: true, firstCollections: ['spaces', 'users'] });
    expect(r3.keptNewerInTarget).toBe(1); // t1 de mig_u1 : la version du téléphone (plus récente) est gardée
    const after = await countAll(db);
    expect(after).toEqual({ ...before, transactions: before.transactions + 1 }); // + t2 ajoutée à l'étape 2
    expect((await db.doc('spaces/mig_u1/transactions/t1').get()).get('amount')).toBe(9000);
    expect((await db.doc('spaces/mig_u2/transactions/t1').get()).get('amount')).toBe(5000); // version ancienne remplacée
    expect((await db.doc('config/seasons/items/s1').get()).get('label')).toBe('Tabaski');
    expect((await db.doc('usage/mig_u1').get()).get('ai')).toBe(2);

    // 6. Les téléphones écoutent « syncedAt > curseur » : avec le nouvel horodatage, ils
    //    retéléchargent TOUTES leurs données (ce qui répare un cache abîmé pendant la coupure).
    for (const uid of ['mig_u1', 'mig_u2']) {
      const cats = await db.collection(`spaces/${uid}/categories`).where('syncedAt', '>', ts(oldestCursor)).count().get();
      expect(cats.data().count).toBe(30);
    }
    // La base provisoire est intacte (elle sert de retour arrière).
    expect((await countAll(staging())).transactions).toBe(before.transactions + 1);
  });
});
