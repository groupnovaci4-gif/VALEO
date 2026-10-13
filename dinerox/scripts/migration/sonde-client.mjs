/*
 * Sonde « téléphone » pour la RÉPÉTITION du déménagement sur un PROJET DE TEST
 * (jamais dinerox-app). Elle se comporte comme l'app : connexion par e-mail, écriture
 * d'une opération dans son espace personnel toutes les 3 s, écoute « syncedAt > curseur ».
 * Elle note, seconde par seconde, ce que renvoie Firebase pendant que la base est
 * supprimée, recréée puis remplie : c'est ce code qui décide si l'app garde ou perd une
 * écriture (« rejected » = permission-denied / invalid-argument / failed-precondition ;
 * tout le reste = nouvel essai, sans perte).
 *
 *   node scripts/migration/sonde-client.mjs <projet-de-test> <cle-api-web> <email> <mot-de-passe>
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';

const [projectId, apiKey, email, password] = process.argv.slice(2);
if (!projectId || !apiKey || !email || !password) throw new Error('usage : sonde-client.mjs <projet> <cle-api> <email> <mot-de-passe>');
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
  (s) => console.log(`${t()} écoute    : ${s.size} document(s)`),
  (e) => console.log(`${t()} écoute    : ERREUR ${e.code} — ${e.message.slice(0, 120)}`),
);

setInterval(async () => {
  n++;
  const id = `sonde_${n}`;
  const now = Date.now();
  try {
    await Promise.race([
      setDoc(doc(db, `spaces/${uid}/transactions/${id}`), { id, type: 'expense', amount: 100, currency: 'XOF', date: new Date().toISOString().slice(0, 10), accountId: 'acc', createdAt: now, updatedAt: now, createdBy: uid, syncedAt: serverTimestamp() }),
      new Promise((_, rej) => setTimeout(() => rej({ code: 'deadline-exceeded', message: 'pas de réponse en 10 s' }), 10_000)),
    ]);
    console.log(`${t()} écriture ${id} : ok`);
  } catch (e) {
    const code = e.code ?? 'inconnu';
    console.log(`${t()} écriture ${id} : ${code} → l'app ferait « ${REJECTED.has(code) ? 'REFUSÉE (risque de perte locale)' : 'nouvel essai (sans perte)'} » — ${String(e.message).slice(0, 120)}`);
  }
}, 3000);
