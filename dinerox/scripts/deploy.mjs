/**
 * SEULE porte d'entrée pour déployer sur la production (fondateur, 2026-10-14).
 *
 *   npm run deploy -- --only functions:myReferral,firestore:rules --project dinerox-app [--dry-run]
 *
 * Refuse : `functions` ou `firestore` seuls, `--force`, une cible non nommée,
 * une autre branche que dinerox-main, des modifications non commitées, une
 * branche non poussée. Firebase lance ensuite scripts/deploy-guard.mjs avant
 * chaque cible (fonctions : aucune fonction de production ne doit manquer au code).
 * Si Firebase propose malgré tout de supprimer une fonction : répondre NON.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { DEPLOY_TOKEN_ENV, checkDeployRequest, checkGitState } from './deploy-rules.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = value('--only');
const project = value('--project');
const dryRun = args.includes('--dry-run');
const known = new Set(['--only', '--project', '--dry-run', only, project]);
const unknown = args.filter((a) => !known.has(a));

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
let remoteHead = '';
try {
  git('fetch', '-q', 'origin');
  remoteHead = git('rev-parse', `origin/${git('rev-parse', '--abbrev-ref', 'HEAD')}`);
} catch {
  remoteHead = '';
}
const errors = [
  ...checkDeployRequest({ only, force: args.includes('--force'), project }),
  ...(unknown.length ? [`options non autorisées : ${unknown.join(' ')}`] : []),
  ...checkGitState({
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    head: git('rev-parse', 'HEAD'),
    remoteHead,
  }),
];
if (errors.length) {
  console.error('DÉPLOIEMENT REFUSÉ :\n - ' + errors.join('\n - '));
  process.exit(1);
}
const cmd = ['firebase', 'deploy', '--only', only, '--project', project, ...(dryRun ? ['--dry-run'] : [])];
console.log(`> npx ${cmd.join(' ')}`);
const r = spawnSync('npx', cmd, { stdio: 'inherit', env: { ...process.env, [DEPLOY_TOKEN_ENV]: only } });
process.exit(r.status ?? 1);
