// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // admin/ : portail web séparé (Vite), vérifié par son propre `npm --prefix admin run check`.
  { ignores: ['dist/*', 'firebase/functions/lib/*', 'node_modules/*', 'admin/**'] },
]);
