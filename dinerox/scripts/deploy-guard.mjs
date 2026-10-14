/**
 * Contrôle lancé par Firebase AVANT chaque cible (firebase.json › predeploy).
 * Sans effet hors production (émulateurs, projets de démonstration).
 * En production : le déploiement doit passer par `npm run deploy` (scripts/
 * deploy.mjs), partir de dinerox-main à jour, et — pour les fonctions — le code
 * doit contenir TOUTES les fonctions en ligne (aucune suppression possible).
 *
 *   node scripts/deploy-guard.mjs <functions|firestore|storage|hosting>
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DEPLOY_TOKEN_ENV, PRODUCTION_PROJECT, checkGitState, missingInCode } from './deploy-rules.mjs';

const kind = process.argv[2] ?? '?';
const project = process.env.GCLOUD_PROJECT;
if (project !== PRODUCTION_PROJECT) process.exit(0);

const dir = process.env.PROJECT_DIR ?? process.cwd();
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
const fail = (lines) => {
  console.error(`GARDE-FOU (${kind}) : déploiement arrêté.\n - ${lines.join('\n - ')}`);
  process.exit(1);
};

if (!process.env[DEPLOY_TOKEN_ENV]) fail(['passer par « npm run deploy -- --only … --project dinerox-app » (jamais firebase deploy directement)']);

let remoteHead = '';
try {
  remoteHead = git('rev-parse', `origin/${git('rev-parse', '--abbrev-ref', 'HEAD')}`);
} catch {
  remoteHead = '';
}
const gitErrors = checkGitState({
  branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
  dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  head: git('rev-parse', 'HEAD'),
  remoteHead,
});
if (gitErrors.length) fail(gitErrors);

if (kind === 'functions') {
  // Code compilé juste avant par le predeploy « build » : fonctions exportées.
  const require = createRequire(import.meta.url);
  const lib = require(path.join(dir, 'firebase/functions/lib/index.js'));
  const code = Object.keys(lib).filter((k) => lib[k] && lib[k].__endpoint);
  const listed = JSON.parse(execFileSync('npx', ['firebase', 'functions:list', '--project', PRODUCTION_PROJECT, '--json'], { cwd: dir, encoding: 'utf8' }));
  const production = (listed.result ?? []).map((f) => f.id);
  if (!production.length) fail(['liste des fonctions de production illisible : déploiement arrêté par prudence']);
  const missing = missingInCode(production, code);
  if (missing.length) fail([`fonctions en production absentes du code (elles seraient supprimées) : ${missing.join(', ')}`]);
  console.log(`GARDE-FOU (functions) : ${production.length} fonctions en production, toutes présentes dans le code.`);
} else {
  console.log(`GARDE-FOU (${kind}) : branche et état git conformes.`);
}
