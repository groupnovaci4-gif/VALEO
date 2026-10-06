/* Configuration commune des tests de bout en bout (web + émulateurs Firebase). */
const { chromium } = require('playwright');
module.exports.BASE = process.env.E2E_BASE_URL || 'http://localhost:8098';
/** Navigateur : PW_CHROMIUM (chemin d'un Chromium installé) ou celui de Playwright. */
module.exports.launch = () => chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
