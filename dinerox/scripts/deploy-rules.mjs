/**
 * Règles de déploiement sur la PRODUCTION (fondateur, 2026-10-14) — module PUR,
 * testé par tests/deploy-guard.test.ts. Utilisé par scripts/deploy.mjs (seule
 * porte d'entrée) et scripts/deploy-guard.mjs (contrôle lancé par Firebase).
 *
 *  - tout déploiement part de `dinerox-main`, à jour avec GitHub, sans modification ;
 *  - les fonctions se déploient PAR NOM (`functions:monNom`), jamais
 *    `functions` seul, jamais `--force` ;
 *  - aucune fonction en production ne peut manquer dans le code (sinon
 *    Firebase proposerait de la supprimer).
 */

export const PRODUCTION_PROJECT = 'dinerox-app';
export const DEPLOY_BRANCH = 'dinerox-main';
/** Variable posée par scripts/deploy.mjs : un `firebase deploy` direct ne l'a pas. */
export const DEPLOY_TOKEN_ENV = 'DINEROX_SAFE_DEPLOY';

/** Cibles autorisées : nommées explicitement, jamais un ensemble implicite. */
const ALLOWED = [/^functions:[A-Za-z][A-Za-z0-9_-]*$/, /^firestore:rules$/, /^firestore:indexes$/, /^storage$/, /^hosting:(admin|links)$/];

/**
 * Vérifie la liste `--only` et les options. Renvoie la liste des erreurs
 * (vide = autorisé).
 */
export function checkDeployRequest({ only, force = false, project }) {
  const errors = [];
  if (project !== PRODUCTION_PROJECT) errors.push(`projet attendu : --project ${PRODUCTION_PROJECT}`);
  if (force) errors.push('--force est interdit');
  const targets = String(only ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!targets.length) errors.push('--only obligatoire (cibles nommées : functions:nom, firestore:rules, firestore:indexes…)');
  for (const t of targets) {
    if (t === 'functions') errors.push('« functions » seul est interdit : nommer chaque fonction (functions:monNom)');
    else if (t === 'firestore') errors.push('« firestore » seul est interdit : firestore:rules et/ou firestore:indexes');
    else if (t === 'hosting') errors.push('« hosting » seul est interdit : hosting:admin ou hosting:links');
    else if (!ALLOWED.some((r) => r.test(t))) errors.push(`cible inconnue ou interdite : ${t}`);
  }
  return errors;
}

/** Fonctions en production absentes du code : Firebase proposerait de les supprimer. */
export function missingInCode(productionFunctions, codeFunctions) {
  const code = new Set(codeFunctions);
  return productionFunctions.filter((f) => !code.has(f)).sort();
}

/** État git exigé pour déployer en production. */
export function checkGitState({ branch, dirty, head, remoteHead }) {
  const errors = [];
  if (branch !== DEPLOY_BRANCH) errors.push(`branche « ${branch} » : les déploiements partent de ${DEPLOY_BRANCH}`);
  if (dirty) errors.push('des fichiers suivis sont modifiés et non commités');
  if (!remoteHead || head !== remoteHead) errors.push(`${DEPLOY_BRANCH} n'est pas identique à GitHub (origin/${DEPLOY_BRANCH}) : pousser ou mettre à jour d'abord`);
  return errors;
}
