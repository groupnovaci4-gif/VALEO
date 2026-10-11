/* Configuration commune des tests de bout en bout (web + émulateurs Firebase). */
const { chromium } = require('playwright');
module.exports.BASE = process.env.E2E_BASE_URL || 'http://localhost:8098';

/**
 * Date de référence d'un parcours : le jour `day` du mois en cours, à 10 h.
 * Les données de démonstration sont générées à partir d'aujourd'hui : selon le jour,
 * la démo est en déficit, ou une saisie déclenche une alerte de budget. Un parcours
 * qui vérifie le « reste par jour » fixe donc son jour pour ne plus dépendre de la
 * date à laquelle il est lancé.
 */
module.exports.dayOfMonth = (day) => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), day, 10, 0, 0);
};

/**
 * Navigateur : PW_CHROMIUM (chemin d'un Chromium installé) ou celui de Playwright.
 * Délai de 30 s par action : un écran bloqué devient un échec visible, jamais une attente infinie.
 * `date` (facultatif) : l'horloge de chaque page démarre à cette date, puis le temps
 * s'écoule normalement (minuteries réelles, seule la date est décalée).
 */
module.exports.launch = async ({ date } = {}) => {
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const ctx = await newContext(...args);
    ctx.setDefaultTimeout(30_000);
    if (date) {
      await ctx.addInitScript((offset) => {
        const RealDate = Date;
        class ShiftedDate extends RealDate {
          constructor(...a) {
            if (a.length) super(...a);
            else super(RealDate.now() + offset);
          }
          static now() {
            return RealDate.now() + offset;
          }
        }
        globalThis.Date = ShiftedDate;
      }, date.getTime() - Date.now());
    }
    return ctx;
  };
  return browser;
};

