/**
 * Copie une base Firestore vers une autre DU MÊME PROJET (docs/migration-europe.md).
 *
 *   GOOGLE_CLOUD_PROJECT=<projet> node lib/scripts/copyDatabase.js --from "(default)" --to eu-staging [--bump-synced-at] [--dry-run] [--deep]
 *
 * « Le plus récent gagne », rien n'est supprimé (voir src/migration/copy.ts).
 * Refuse de viser dinerox-app sans --i-know-this-is-production (à n'utiliser que le jour
 * du déménagement, après la répétition sur le projet de test).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { copyDatabase } from '../migration/copy';

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = opt('--from');
  const to = opt('--to');
  if (!from || !to || from === to) throw new Error('usage : copyDatabase --from <base> --to <base> [--bump-synced-at] [--dry-run]');
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!process.env.FIRESTORE_EMULATOR_HOST && !project) throw new Error('Indiquez le projet : GOOGLE_CLOUD_PROJECT=…');
  if (project === 'dinerox-app' && !args.includes('--i-know-this-is-production')) throw new Error('Production : ajoutez --i-know-this-is-production (jour du déménagement seulement).');
  initializeApp(project ? { projectId: project } : undefined);
  const db = (id: string) => (id === '(default)' ? getFirestore() : getFirestore(id));
  const started = Date.now();
  const report = await copyDatabase(db(from), db(to), { bumpSyncedAt: args.includes('--bump-synced-at'), dryRun: args.includes('--dry-run'), firstCollections: ['spaces', 'users'], subcollectionDepth: args.includes('--deep') ? Infinity : 1 });
  console.log(JSON.stringify({ de: from, vers: to, essaiSansEcriture: args.includes('--dry-run'), ...report, dureeSecondes: Math.round((Date.now() - started) / 1000) }, null, 2));
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
