/** Garde-fou de déploiement (fondateur, 2026-10-14) : règles PURES de scripts/deploy-rules.mjs. */
import { describe, expect, it } from 'vitest';
import { checkDeployRequest, checkGitState, missingInCode } from '../scripts/deploy-rules.mjs';

const ok = { project: 'dinerox-app' };

describe('cibles de déploiement', () => {
  it('fonctions nommées, règles, index : autorisés', () => {
    expect(checkDeployRequest({ ...ok, only: 'functions:myReferral,functions:applyReferral' })).toEqual([]);
    expect(checkDeployRequest({ ...ok, only: 'firestore:indexes' })).toEqual([]);
    expect(checkDeployRequest({ ...ok, only: 'firestore:rules' })).toEqual([]);
  });
  it('« functions » seul, « firestore » seul, « hosting » seul : refusés', () => {
    expect(checkDeployRequest({ ...ok, only: 'functions' })[0]).toMatch(/functions.*seul est interdit/);
    expect(checkDeployRequest({ ...ok, only: 'functions:myReferral,functions' }).join()).toMatch(/seul est interdit/);
    expect(checkDeployRequest({ ...ok, only: 'firestore' })[0]).toMatch(/seul est interdit/);
    expect(checkDeployRequest({ ...ok, only: 'hosting' })[0]).toMatch(/seul est interdit/);
  });
  it('--force, sans --only, autre projet, cible inconnue : refusés', () => {
    expect(checkDeployRequest({ ...ok, only: 'firestore:rules', force: true })).toContain('--force est interdit');
    expect(checkDeployRequest({ ...ok, only: '' })[0]).toMatch(/--only obligatoire/);
    expect(checkDeployRequest({ only: 'firestore:rules', project: 'demo-dinerox' })[0]).toMatch(/--project dinerox-app/);
    expect(checkDeployRequest({ ...ok, only: 'extensions' })[0]).toMatch(/cible inconnue/);
  });
});

describe('aucune fonction de production ne peut être supprimée', () => {
  it('toutes présentes → rien ; une absente → nommée', () => {
    expect(missingInCode(['boMe', 'deleteAccount'], ['boMe', 'deleteAccount', 'myReferral'])).toEqual([]);
    expect(missingInCode(['boMe', 'deleteAccount', 'speak'], ['deleteAccount', 'boMe'])).toEqual(['speak']);
  });
});

describe('état git', () => {
  const good = { branch: 'dinerox-main', dirty: false, head: 'abc', remoteHead: 'abc' };
  it('dinerox-main propre et poussée : autorisé', () => expect(checkGitState(good)).toEqual([]));
  it('autre branche, modifications, non poussée : refusés', () => {
    expect(checkGitState({ ...good, branch: 'croissance' })[0]).toMatch(/dinerox-main/);
    expect(checkGitState({ ...good, dirty: true })[0]).toMatch(/non commités/);
    expect(checkGitState({ ...good, remoteHead: 'def' })[0]).toMatch(/GitHub/);
  });
});
