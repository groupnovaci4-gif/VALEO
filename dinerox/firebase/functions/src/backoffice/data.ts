/**
 * Back-office — opérations d'un utilisateur (données financières).
 *
 * - `data.view` (Super Admin, Administrateur) : chaque ouverture exige un MOTIF
 *   interne, enregistré au journal et jamais envoyé à l'utilisateur ; l'accès
 *   ouvert vaut 30 min, en lecture seule, 25 opérations par page, aucune
 *   exportation. Notes, bénéficiaires et justificatifs ne sont jamais renvoyés (D9).
 * - `data.delete` (Super Admin SEULEMENT) : même mécanisme que l'app — marque
 *   « supprimée » horodatée (`deleted`, `updatedAt` croissant, `syncedAt`
 *   serveur), jamais d'effacement physique, écritures liées comprises
 *   (core/removal.ts, miroir removal.ts), plus `adminDeleted` : les règles
 *   refusent ensuite toute modification par un téléphone (« ne revient jamais »).
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { actorOf, bad, COL, db, deny, mirrorToLogging, openAudit, requireStaff, type StaffCtx } from './context';
import { validateReason } from './auditCore';
import { linkedRemovals, tombstoneUpdatedAt, uniqueTargets, type RemovalData, type RemovalTarget } from './removal';

const ACCESS_MS = 30 * 60 * 1000;
const PAGE = 25;
const idArg = (v: unknown, code: string): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v) ? v : bad(code));

/** Ouvre un accès (motif obligatoire, journalisé). */
export async function openData(req: CallableRequest) {
  const c = await requireStaff(req, 'data.view', 'data.view');
  const uid = idArg(req.data?.uid, 'bo/uid');
  const reason = validateReason(req.data?.reasonCode, req.data?.reasonNote);
  if (!reason.ok) bad('bo/reason');
  const auth = await getAuth().getUser(uid).catch(() => null);
  if (!auth) throw new HttpsError('not-found', 'bo/user-not-found');
  const spaces = await db().collection('spaces').where('memberIds', 'array-contains', uid).limit(20).get();
  const now = Date.now();
  const accessRef = db().collection(COL.access).doc();
  const entry = await db().runTransaction(async (tx) => {
    const audit = await openAudit(tx);
    tx.create(accessRef, { actorUid: c.uid, targetUid: uid, reasonCode: reason.reasonCode, createdAt: now, expiresAt: now + ACCESS_MS });
    return audit.write({ ...actorOf(c), action: 'data.view', result: 'ok', targetUid: uid, targetEmail: auth.email, reasonCode: reason.reasonCode, reasonNote: reason.reasonNote ?? undefined, refs: [accessRef.id] });
  });
  mirrorToLogging([entry]);
  return {
    accessId: accessRef.id,
    expiresAt: now + ACCESS_MS,
    spaces: spaces.docs.map((s) => ({
      id: s.id,
      kind: s.get('kind'),
      name: s.get('name'),
      currency: s.get('currency') ?? null,
      memberCount: ((s.get('memberIds') as string[] | undefined) ?? []).length,
    })),
  };
}

/** Vérifie l'accès : le sien, non expiré, et l'espace demandé est bien un espace de l'utilisateur consulté. */
async function checkAccess(c: StaffCtx, accessId: unknown, spaceId: unknown, action: string): Promise<{ targetUid: string; spaceId: string; space: DocumentSnapshot }> {
  const id = idArg(accessId, 'bo/access');
  const sid = idArg(spaceId, 'bo/space');
  const a = await db().doc(`${COL.access}/${id}`).get();
  const actor = { uid: c.uid, email: c.email, roleId: c.roleId };
  if (!a.exists || a.get('actorUid') !== c.uid || Number(a.get('expiresAt') ?? 0) <= Date.now()) return deny(actor, action, 'bo/access-expired', { spaceId: sid }, 'failed-precondition');
  const targetUid = String(a.get('targetUid'));
  const space = await db().doc(`spaces/${sid}`).get();
  const members = (space.get('memberIds') as string[] | undefined) ?? [];
  if (!space.exists || !members.includes(targetUid)) return deny(actor, action, 'bo/space-mismatch', { targetUid, spaceId: sid });
  return { targetUid, spaceId: sid, space };
}

const pick = (d: FirebaseFirestore.DocumentData) => ({
  id: d.id as string,
  date: d.date as string,
  type: d.type as string,
  direction: (d.direction ?? null) as string | null,
  amount: d.amount as number,
  currency: d.currency as string,
  categoryId: (d.categoryId ?? null) as string | null,
  subcategoryId: (d.subcategoryId ?? null) as string | null,
  accountId: (d.accountId ?? null) as string | null,
  toAccountId: (d.toAccountId ?? null) as string | null,
  createdBy: (d.createdBy ?? null) as string | null,
});

export async function listTransactions(req: CallableRequest) {
  const c = await requireStaff(req, 'data.view', 'data.list');
  const { spaceId, space } = await checkAccess(c, req.data?.accessId, req.data?.spaceId, 'data.list');
  const col = db().collection(`spaces/${spaceId}/transactions`);
  let q = col.orderBy('date', 'desc');
  if (typeof req.data?.cursor === 'string') {
    const cur = await col.doc(idArg(req.data.cursor, 'bo/cursor')).get();
    if (cur.exists) q = q.startAfter(cur);
  }
  // Les suppressions logiques sont sautées (au plus 4 lots, jamais toute la collection).
  const items: ReturnType<typeof pick>[] = [];
  let last: DocumentSnapshot | null = null;
  let exhausted = false;
  for (let round = 0; round < 4 && items.length < PAGE; round++) {
    const snap = await (last ? q.startAfter(last) : q).limit(50).get();
    let consumed = 0;
    for (const d of snap.docs) {
      if (items.length >= PAGE) break;
      last = d;
      consumed++;
      if (d.get('deleted') !== true) items.push(pick(d.data()));
    }
    if (snap.docs.length < 50 && consumed === snap.docs.length) {
      exhausted = true;
      break;
    }
  }
  const ids = items.map((t) => t.id);
  // Écritures liées (pour l'affichage « 1 écriture liée ») : requêtes ciblées sur la page.
  const linked = new Map<string, number>();
  if (ids.length) {
    const base = `spaces/${spaceId}`;
    const lookups: [string, string][] = [['debtPayments', 'transactionId'], ['goalContributions', 'transferId'], ['goalContributions', 'linkedTransactionId'], ['tontineEntries', 'transactionId']];
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const res = await Promise.all(lookups.map(([cn, f]) => db().collection(`${base}/${cn}`).where(f, 'in', chunk).get()));
      res.forEach((snap, k) => snap.docs.forEach((d) => d.get('deleted') !== true && linked.set(d.get(lookups[k][1]), (linked.get(d.get(lookups[k][1])) ?? 0) + 1)));
    }
  }
  // Noms des comptes et des catégories PERSONNALISÉES (les catégories système sont traduites par le portail).
  const accIds = [...new Set(items.flatMap((t) => [t.accountId, t.toAccountId]).filter((x): x is string => !!x))];
  const catIds = [...new Set(items.map((t) => t.categoryId).filter((x): x is string => !!x && x.startsWith('cat_u_')))];
  const refs: DocumentReference[] = [...accIds.map((a) => db().doc(`spaces/${spaceId}/accounts/${a}`)), ...catIds.map((k) => db().doc(`spaces/${spaceId}/categories/${k}`))];
  const docs = refs.length ? await db().getAll(...refs) : [];
  const names = new Map(docs.filter((d) => d.exists).map((d) => [`${d.ref.parent.id}/${d.id}`, String(d.get('name') ?? '')]));
  const memberNames = (space.get('memberNames') ?? {}) as Record<string, string>;
  return {
    items: items.map((t) => ({
      ...t,
      accountName: t.accountId ? names.get(`accounts/${t.accountId}`) ?? null : null,
      toAccountName: t.toAccountId ? names.get(`accounts/${t.toAccountId}`) ?? null : null,
      categoryName: t.categoryId ? names.get(`categories/${t.categoryId}`) ?? null : null,
      createdByName: t.createdBy ? memberNames[t.createdBy] ?? null : null,
      linked: linked.get(t.id) ?? 0,
    })),
    next: !exhausted && last ? last.id : null,
  };
}

// ─── Suppression ──────────────────────────────────────────────────────

interface Plan {
  tx: DocumentSnapshot;
  targets: { target: RemovalTarget; snap: DocumentSnapshot }[];
}

/**
 * Charge l'opération et ses écritures liées par requêtes CIBLÉES (dans la
 * transaction si fournie), puis applique la même cascade que l'app.
 */
async function planDelete(spaceId: string, txId: string, t?: Transaction): Promise<Plan> {
  const base = `spaces/${spaceId}`;
  const get = (ref: DocumentReference) => (t ? t.get(ref) : ref.get());
  const query = (cn: string, field: string) => {
    const q = db().collection(`${base}/${cn}`).where(field, '==', txId);
    return t ? t.get(q) : q.get();
  };
  const tx = await get(db().doc(`${base}/transactions/${txId}`));
  if (!tx.exists || tx.get('deleted') === true) throw new HttpsError('not-found', 'bo/tx-not-found');
  const [dp, gcTransfer, te, gcLinked] = await Promise.all([query('debtPayments', 'transactionId'), query('goalContributions', 'transferId'), query('tontineEntries', 'transactionId'), query('goalContributions', 'linkedTransactionId')]);
  const visibleDocs = (s: FirebaseFirestore.QuerySnapshot) => s.docs.filter((d) => d.get('deleted') !== true);
  const gcDocs = [...new Map([...visibleDocs(gcTransfer), ...visibleDocs(gcLinked)].map((d) => [d.id, d])).values()];
  const data: RemovalData = {
    transactions: [],
    debtPayments: visibleDocs(dp).map((d) => ({ id: d.id, transactionId: d.get('transactionId') ?? null })),
    goalContributions: gcDocs.map((d) => ({ id: d.id, transferId: d.get('transferId') ?? null, linkedTransactionId: d.get('linkedTransactionId') ?? null })),
    tontineEntries: visibleDocs(te).map((d) => ({ id: d.id, transactionId: d.get('transactionId') ?? null })),
  };
  const targets = uniqueTargets(linkedRemovals(data, 'transactions', { id: txId }, txId));
  const byKey = new Map<string, DocumentSnapshot>([...visibleDocs(dp), ...gcDocs, ...visibleDocs(te)].map((d) => [`${d.ref.parent.id}/${d.id}`, d]));
  const out: Plan['targets'] = [];
  for (const target of targets) {
    // Transfert d'une utilisation de réserve : chargé à part (une opération).
    const snap = byKey.get(`${target.col}/${target.id}`) ?? (await get(db().doc(`${base}/${target.col}/${target.id}`)));
    if (snap.exists && snap.get('deleted') !== true && !(target.col === 'transactions' && target.id === txId)) out.push({ target, snap });
  }
  return { tx, targets: out };
}

/** Comptages par type d'effet : jamais de montant. */
function effectsOf(p: Plan): Record<string, number> {
  const e: Record<string, number> = {};
  for (const { target, snap } of p.targets) {
    const k = target.col === 'goalContributions' ? (snap.get('linkedTransactionId') ? 'reserveUse' : 'goalContribution') : target.col === 'transactions' ? 'reserveTransfer' : target.col === 'debtPayments' ? 'debtPayment' : 'tontineEntry';
    e[k] = (e[k] ?? 0) + 1;
  }
  return e;
}

export async function previewDelete(req: CallableRequest) {
  const c = await requireStaff(req, 'data.delete', 'data.delete-preview');
  const { spaceId, space } = await checkAccess(c, req.data?.accessId, req.data?.spaceId, 'data.delete-preview');
  const txId = idArg(req.data?.txId, 'bo/tx');
  const p = await planDelete(spaceId, txId);
  return {
    tx: pick(p.tx.data()!),
    effects: effectsOf(p),
    space: { id: spaceId, kind: space.get('kind'), name: space.get('name'), memberCount: ((space.get('memberIds') as string[] | undefined) ?? []).length },
  };
}

export async function deleteTransaction(req: CallableRequest) {
  const c = await requireStaff(req, 'data.delete', 'data.delete');
  const { spaceId, targetUid } = await checkAccess(c, req.data?.accessId, req.data?.spaceId, 'data.delete');
  const txId = idArg(req.data?.txId, 'bo/tx');
  const reason = validateReason(req.data?.reasonCode, req.data?.reasonNote);
  if (!reason.ok) bad('bo/reason');
  // Deuxième confirmation, vérifiée ici aussi.
  if (req.data?.confirm !== 'SUPPRIMER') bad('bo/confirm');
  const targetEmail = (await getAuth().getUser(targetUid).catch(() => null))?.email ?? null;
  const res = await db().runTransaction(async (t) => {
    const p = await planDelete(spaceId, txId, t);
    const audit = await openAudit(t);
    const now = Date.now();
    // Exactement ce que l'app écrit pour une suppression (SyncEngine.remove + stamp), plus `adminDeleted`.
    for (const snap of [p.tx, ...p.targets.map((x) => x.snap)]) {
      t.update(snap.ref, { deleted: true, adminDeleted: true, updatedAt: tombstoneUpdatedAt(snap.get('updatedAt'), now), syncedAt: FieldValue.serverTimestamp() });
    }
    const effects = effectsOf(p);
    const entry = audit.write({
      ...actorOf(c),
      action: 'data.delete',
      result: 'ok',
      targetUid,
      targetEmail,
      spaceId,
      reasonCode: reason.reasonCode,
      reasonNote: reason.reasonNote ?? undefined,
      refs: [`transactions/${txId}`, ...p.targets.map((x) => `${x.target.col}/${x.target.id}`)],
      effects,
    });
    return { entry, effects, removed: 1 + p.targets.length };
  });
  mirrorToLogging([res.entry]);
  return { removed: res.removed, effects: res.effects };
}
