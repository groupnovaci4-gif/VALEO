/*
 * Sonde « téléphone » pour la RÉPÉTITION du déménagement sur un PROJET DE TEST
 * (jamais dinerox-app). Elle se comporte comme l'app : connexion par e-mail, écriture
 * d'une opération dans son espace personnel toutes les 3 s, écoute « syncedAt > curseur ».
 * Elle note, seconde par seconde, ce que renvoie Firebase pendant que la base est
 * supprimée, recréée puis remplie : c'est ce code qui décide si l'app garde ou perd une
 * écriture (« rejected » = permission-denied / invalid-argument / failed-precondition ;
 * tout le reste = nouvel essai, sans perte).
 *
 * Identifiants : ~/dinerox-mesures/sonde.json (créé par seed-test.mjs, hors du dépôt) ;
 * clé API web publique : variable SONDE_API_KEY. Rien de secret ne s'affiche.
 * Écrit alternativement dans son espace PERSONNEL et dans l'espace FAMILIAL de test.
 *
 *   SONDE_API_KEY=… node scripts/migration/sonde-client.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Erreur imprévue : le message seulement (jamais l'objet complet, qui peut contenir des jetons).
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { console.error(`Échec : ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 300)}`); process.exit(1); });

const cfg = JSON.parse(readFileSync(join(homedir(), 'dinerox-mesures', 'sonde.json'), 'utf8'));
const { project: projectId, email, password, familyId } = cfg;
const apiKey = process.env.SONDE_API_KEY;
if (!apiKey) throw new Error('Variable SONDE_API_KEY manquante (clé API web publique du projet de test).');
if (projectId === 'dinerox-app') throw new Error('Sonde réservée au projet de TEST.');
const app = initializeApp({ apiKey, projectId, authDomain: `${projectId}.firebaseapp.com` });
const auth = getAuth(app);
const cred = await signInWithEmailAndPassword(auth, email, password).catch(() => createUserWithEmailAndPassword(auth, email, password));
const uid = cred.user.uid;
const db = getFirestore(app);
const REJECTED = new Set(['permission-denied', 'invalid-argument', 'failed-precondition']);
const t = () => new Date().toISOString().slice(11, 19);
let n = 0;

onSnapshot(
  query(collection(db, `spaces/${uid}/transactions`), where('syncedAt', '>', Timestamp.fromMillis(0))),
  (s) => console.log(`${t()} écoute    : ${s.size} document(s) dans l'espace personnel`),
  (e) => console.log(`${t()} écoute    : ERREUR ${e.code} — ${e.message.slice(0, 120)}`),
);

setInterval(async () => {
  n++;
  const id = `sonde_${n}`;
  const now = Date.now();
  const space = n % 2 ? uid : familyId;
  const where_ = n % 2 ? 'perso' : 'famille';
  try {
    await Promise.race([
      setDoc(doc(db, `spaces/${space}/transactions/${id}`), { id, type: 'expense', amount: 100, currency: 'XOF', date: new Date().toISOString().slice(0, 10), accountId: 'acc', createdAt: now, updatedAt: now, createdBy: uid, syncedAt: serverTimestamp() }),
      new Promise((_, rej) => setTimeout(() => rej({ code: 'deadline-exceeded', message: 'pas de réponse en 10 s' }), 10_000)),
    ]);
    console.log(`${t()} écriture ${where_} ${id} : ok`);
  } catch (e) {
    const code = e.code ?? 'inconnu';
    console.log(`${t()} écriture ${where_} ${id} : ${code} → l'app ferait « ${REJECTED.has(code) ? 'REFUSÉE (risque de perte locale)' : 'nouvel essai (sans perte)'} » — ${String(e.message).slice(0, 120)}`);
  }
}, 3000);
