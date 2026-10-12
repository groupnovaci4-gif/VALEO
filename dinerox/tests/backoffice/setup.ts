// Charge les Functions avant chaque fichier : leur index.ts appelle initializeApp()
// (projet et émulateurs fournis par `firebase emulators:exec`).
import { fns } from './helpers';

await fns();
