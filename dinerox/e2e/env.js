/* Configuration commune des tests de bout en bout (web + émulateurs Firebase). */
const { chromium } = require('playwright');
module.exports.BASE = process.env.E2E_BASE_URL || 'http://localhost:8098';
// Étape 4 (maquette validée) : le reste par jour se lit sur la carte compacte de l'accueil,
// « Votre plafond de dépenses par jour » suivi du montant (la phrase « Il vous reste … » n'y est plus).
module.exports.PER_DAY = /Votre plafond de dépenses par jour\s+([\d  ]+) FCFA/;

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


/**
 * Champ « Écrivez comme vous parlez » de la feuille de saisie. En mode clavier (design v2),
 * il est replié sous « Autres façons de saisir » : on ouvre le repli s'il est fermé.
 * En mode voix, le champ est toujours visible (rien à ouvrir).
 */
module.exports.phraseField = async (page) => {
  const more = page.getByRole('button', { name: 'Autres façons de saisir', exact: true });
  if ((await more.count()) && (await more.first().getAttribute('aria-expanded')) !== 'true') {
    await more.first().click();
    await page.waitForTimeout(300);
  }
  return page.getByLabel('Écrivez comme vous parlez');
};

/**
 * Argent disponible v2 (§2) : un compte neuf n'a pas d'argent déclaré, et une dépense ouvre
 * alors la feuille de complément au lieu d'être enregistrée. Déclare l'argent présent sur le
 * compte par défaut depuis la carte de l'accueil (comme le ferait l'utilisateur).
 */
module.exports.declareMoney = async (page, amount = 1000000, account = 'Cash') => {
  await page.goto(module.exports.BASE + '/', { waitUntil: 'load' });
  const field = page.getByLabel(account, { exact: true }).first();
  await field.waitFor({ timeout: 15000 });
  await field.fill(String(amount));
  await page.getByRole('button', { name: 'Enregistrer mon argent disponible', exact: true }).click();
  await page.waitForTimeout(2000);
};

/**
 * Feuille de complément (v2 §6.3) : s'il manque de l'argent sur le compte choisi, prend la
 * première source proposée (« Prendre sur … »). Renvoie le titre de la feuille, ou null si
 * elle ne s'est pas ouverte.
 */
module.exports.takeComplement = async (page) => {
  const title = page.getByText(/^Il manque .+ D'où voulez-vous les prendre \?$/).first();
  if (!(await title.count())) return null;
  const label = await title.innerText();
  await page.getByRole('button', { name: /^Prendre sur / }).first().click();
  await page.waitForTimeout(1500);
  return label;
};
