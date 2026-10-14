/**
 * Visibilité de WhatsApp et WhatsApp Business (Android 11+), pour savoir si on
 * peut ouvrir WhatsApp directement ou s'il faut la feuille de partage.
 * Déclarations PRÉCISES uniquement (fondateur, 2026-10-14) : les deux paquets
 * et le schéma `whatsapp://` — jamais QUERY_ALL_PACKAGES (« toutes les applis »).
 */
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = ['com.whatsapp', 'com.whatsapp.w4b'];

/** Transformation pure du manifeste (testée) : ajoute sans doublon. */
function applyWhatsAppQueries(manifest) {
  const m = manifest.manifest ?? manifest;
  const queries = (m.queries && m.queries[0]) || {};
  const pkgs = queries.package || [];
  for (const p of PACKAGES) if (!pkgs.some((x) => x.$ && x.$['android:name'] === p)) pkgs.push({ $: { 'android:name': p } });
  queries.package = pkgs;
  const intents = queries.intent || [];
  const hasScheme = intents.some((i) => (i.data || []).some((d) => d.$ && d.$['android:scheme'] === 'whatsapp'));
  if (!hasScheme) intents.push({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': 'whatsapp' } }] });
  queries.intent = intents;
  m.queries = [queries];
  return manifest;
}

const withWhatsAppQueries = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = applyWhatsAppQueries(c.modResults);
    return c;
  });

module.exports = withWhatsAppQueries;
module.exports.applyWhatsAppQueries = applyWhatsAppQueries;
module.exports.PACKAGES = PACKAGES;
