/**
 * Connexion Google (É1) : `expo-auth-session` demande à Google de revenir vers
 * `<paquet>:/oauthredirect` (providers/Google.js). Le manifeste Android doit donc déclarer
 * le paquet du profil comme schéma — Android seulement ; le schéma `dinerox` et les liens
 * https (/i/, /t/, /a) ne changent pas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpoConfig } from 'expo/config';

const configFor = async (env: string): Promise<ExpoConfig> => {
  vi.resetModules();
  process.env.APP_ENV = env;
  const mod = (await import('../app.config')) as { default: (c: { config: Partial<ExpoConfig> }) => ExpoConfig };
  return mod.default({ config: {} });
};
const saved = process.env.APP_ENV;
afterEach(() => {
  process.env.APP_ENV = saved;
});

describe('É1 — schéma de retour de la connexion Google', () => {
  it.each([
    ['staging', 'com.dinerox.app.staging'],
    ['production', 'com.dinerox.app'],
  ])('%s : le paquet (%s) est un schéma Android, et seulement Android', async (env, pkg) => {
    const cfg = await configFor(env);
    expect(cfg.android?.package).toBe(pkg);
    expect(cfg.android?.scheme).toBe(pkg);
    expect(cfg.scheme).toBe('dinerox');
    expect(cfg.ios?.scheme).toBeUndefined();
  });
  it('liens https inchangés : /i/, /t/ et /a sur chaque domaine', async () => {
    const cfg = await configFor('staging');
    const data = cfg.android?.intentFilters?.[0]?.data;
    const paths = (Array.isArray(data) ? data : []).map((d) => `${d.scheme}://${d.host}${d.pathPrefix ?? d.path}`);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => /^https:\/\/[^/]+\/(i\/|t\/|a)$/.test(p))).toBe(true);
    expect(new Set(paths.map((p) => p.replace(/^https:\/\/[^/]+/, '')))).toEqual(new Set(['/i/', '/t/', '/a']));
  });
});
