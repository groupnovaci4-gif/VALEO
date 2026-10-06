/* Configuration commune des tests de bout en bout (web + émulateurs Firebase). */
const { chromium } = require('playwright');
module.exports.BASE = process.env.E2E_BASE_URL || 'http://localhost:8098';
/**
 * Navigateur : PW_CHROMIUM (chemin d'un Chromium installé) ou celui de Playwright.
 * Délai de 30 s par action : un écran bloqué devient un échec visible, jamais une attente infinie.
 */
module.exports.launch = async () => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const ctx = await newContext(...args);
    ctx.setDefaultTimeout(30_000);
    return ctx;
  };
  return browser;
};
