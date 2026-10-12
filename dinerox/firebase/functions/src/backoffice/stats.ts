/**
 * Back-office — statistiques agrégées (jamais de lecture d'une collection
 * entière : requêtes de COMPTAGE) et lecture du journal.
 */
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, type Query } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { bad, COL, db, requireStaff } from './context';
import { verifyChain, type AuditEntry } from './auditCore';

const DAY_MS = 24 * 3600 * 1000;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (key: string) => Date.parse(`${key}T00:00:00.000Z`);

/** Instantané du jour (même définition des « actifs 7 j » que adminStats). */
export async function computeSnapshot(now = Date.now()) {
  const users = db().collection('users');
  const today = dayKey(now);
  const [all, active, families, plus, family, suspended, signups] = await Promise.all([
    users.count().get(),
    users.where('updatedAt', '>=', now - 7 * DAY_MS).count().get(),
    db().collection('spaces').where('kind', '==', 'family').count().get(),
    users.where('subscription.plan', '==', 'plus').count().get(),
    users.where('subscription.plan', '==', 'family').count().get(),
    db().collection(COL.accountStatus).where('status', '==', 'suspended').count().get(),
    users.where('createdAt', '>=', dayStart(today)).where('createdAt', '<', dayStart(today) + DAY_MS).count().get(),
  ]);
  const total = all.data().count;
  const snap = {
    day: today,
    users: total,
    active7: active.data().count,
    families: families.data().count,
    plans: { free: total - plus.data().count - family.data().count, plus: plus.data().count, family: family.data().count },
    suspended: suspended.data().count,
    signups: signups.data().count,
    partial: false,
    generatedAt: now,
  };
  await db().doc(`${COL.stats}/${today}`).set(snap);
  return snap;
}

/** Jours sans instantané : seules les inscriptions sont reconstituables (comptage sur createdAt). */
async function backfill(days: string[]) {
  for (const d of days) {
    const c = await db().collection('users').where('createdAt', '>=', dayStart(d)).where('createdAt', '<', dayStart(d) + DAY_MS).count().get();
    await db().doc(`${COL.stats}/${d}`).set({ day: d, signups: c.data().count, partial: true, generatedAt: Date.now() }, { merge: true });
  }
}

export async function stats(req: CallableRequest) {
  await requireStaff(req, 'stats.view', 'stats.view');
  const days = [7, 30, 90].includes(req.data?.days) ? (req.data.days as number) : 30;
  const now = Date.now();
  const latest = await db().doc(`${COL.stats}/${dayKey(now)}`).get();
  // Calcul à la demande si le dernier instantané a plus d'une heure.
  const current = latest.exists && Number(latest.get('generatedAt') ?? 0) > now - 3600 * 1000 && latest.get('partial') !== true ? latest.data() : await computeSnapshot(now);
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * DAY_MS));
  const snap = await db().collection(COL.stats).where(FieldPath.documentId(), '>=', keys[0]).where(FieldPath.documentId(), '<=', keys[keys.length - 1]).get();
  const byDay = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const missing = keys.filter((k) => !byDay.has(k));
  if (missing.length) {
    await backfill(missing);
    for (const k of missing) byDay.set(k, (await db().doc(`${COL.stats}/${k}`).get()).data() ?? {});
  }
  return {
    current,
    series: keys.map((k) => {
      const d = byDay.get(k) ?? {};
      return { day: k, signups: d.signups ?? null, users: d.users ?? null, active7: d.active7 ?? null, suspended: d.suspended ?? null };
    }),
  };
}

// ─── Journal ──────────────────────────────────────────────────────────

const PAGE = 25;

export async function listAudit(req: CallableRequest) {
  await requireStaff(req, 'audit.view', 'audit.list');
  const { cursor, action, result, actorUid, targetUid } = req.data ?? {};
  let q: Query = db().collection(COL.audit);
  if (typeof action === 'string' && /^[a-z.-]{1,60}$/.test(action)) q = q.where('action', '==', action);
  if (result === 'ok' || result === 'denied' || result === 'error') q = q.where('result', '==', result);
  if (typeof actorUid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(actorUid)) q = q.where('actorUid', '==', actorUid);
  if (typeof targetUid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) q = q.where('targetUid', '==', targetUid);
  q = q.orderBy('seq', 'desc');
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== 'number' || !Number.isInteger(cursor)) bad('bo/cursor');
    q = q.startAfter(cursor);
  }
  const snap = await q.limit(PAGE + 1).get();
  const entries = snap.docs.slice(0, PAGE).map((d) => d.data() as AuditEntry);
  // Adresse affichée retrouvée À LA LECTURE (le journal n'en garde que l'empreinte) ;
  // compte supprimé : « Compte supprimé » + domaine.
  const uids = [...new Set(entries.map((e) => e.targetUid).filter((u): u is string => !!u))];
  const found = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 100) {
    const r = await getAuth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of r.users) if (u.email) found.set(u.uid, u.email);
  }
  // Intégrité de la page sans filtre : chaque ligne recalculée et reliée à la précédente.
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const contiguous = sorted.every((e, i) => i === 0 || e.seq === sorted[i - 1].seq + 1);
  const chainOk = !contiguous || !sorted.length ? null : verifyChain(sorted, sorted[0].prevHash) === null;
  return {
    entries: entries.map((e) => {
      const current = e.targetUid ? found.get(e.targetUid) : undefined;
      // Adresse actuelle du compte (même si elle a changé depuis) ; sinon compte supprimé.
      const label = e.targetEmailHash ? (current ?? `Compte supprimé (@${e.targetDomain ?? '?'})`) : e.targetLabel;
      return { ...e, targetDisplay: label ?? null };
    }),
    next: snap.docs.length > PAGE ? entries[entries.length - 1].seq : null,
    chainOk,
  };
}
