/**
 * Liens DineroX — page de redirection (logique PURE, testée).
 *
 *  `https://{domaine}/i/{code}` : invitation de parrainage.
 *  `https://{domaine}/a` : lien de campagne, sans code (étape 5).
 *  `https://{domaine}/t/{code}` : invitation à une tontine partagée (étape 3) ;
 *  le code de tontine n'est JAMAIS mis dans le referrer (ce n'est pas un code
 *  de parrainage) : page et redirection identiques à `/a`.
 *  Paramètres facultatifs `src`, `cmp`, `cnt` (source, campagne, contenu) :
 *  transmis tels quels au referrer Google Play (préparés pour l'étape 5).
 *
 *  - Android  → fiche Play Store avec `referrer=ref%3D{code}%26src%3D…` ;
 *  - iPhone   → fiche App Store si publiée, sinon page « Bientôt sur iPhone » ;
 *  - ordinateur → page simple avec QR code et lien Play Store.
 * Aucune donnée personnelle n'est lue ni enregistrée ici.
 * Miroir des constantes de marque : src/config/brand.ts (test de parité).
 */
import { isValidCode, normalizeCode, readLinkParams, referrerValue, type LinkParams } from './referral';

export const LINK_BRAND = {
  name: 'DineroX',
  androidPackage: 'com.dinerox.app',
  /** null tant que l'application n'est pas publiée sur l'App Store. */
  appStoreUrl: null as string | null,
  colors: { night: '#020617', green: '#14B8A6' },
};

export type Platform = 'android' | 'ios' | 'desktop';

export function detectPlatform(userAgent: string | undefined): Platform {
  const ua = (userAgent ?? '').toLowerCase();
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

export function playStoreUrl(p: LinkParams): string {
  const ref = referrerValue(p);
  return `https://play.google.com/store/apps/details?id=${LINK_BRAND.androidPackage}${ref ? `&referrer=${encodeURIComponent(ref)}` : ''}`;
}

export type LinkRoute =
  | { kind: 'redirect'; url: string }
  | { kind: 'page'; page: 'desktop' | 'ios_soon'; params: LinkParams; playUrl: string; shareUrl: string; variant?: 'invite' | 'app' }
  | { kind: 'not_found' };

/**
 * Décide quoi faire d'une requête. `path` = chemin demandé (`/i/ABC123`),
 * `get` lit un paramètre de requête, `origin` = `https://{domaine}` demandé.
 */
export function routeLink(input: { path: string; get: (k: string) => string | null | undefined; userAgent?: string; origin: string }): LinkRoute {
  const app = appLink(input);
  if (app) return app;
  const m = /^\/i\/([^/?#]+)\/?$/.exec(input.path);
  if (!m) return { kind: 'not_found' };
  const code = normalizeCode(decodeSafe(m[1]));
  if (!isValidCode(code)) return { kind: 'not_found' };
  const tags = readLinkParams(input.get);
  const params: LinkParams = { ...tags, code };
  const playUrl = playStoreUrl(params);
  const platform = detectPlatform(input.userAgent);
  if (platform === 'android') return { kind: 'redirect', url: playUrl };
  if (platform === 'ios' && LINK_BRAND.appStoreUrl) return { kind: 'redirect', url: LINK_BRAND.appStoreUrl };
  const q = (['src', 'cmp', 'cnt'] as const).filter((k) => params[k]).map((k) => `${k}=${params[k]}`).join('&');
  const shareUrl = `${input.origin}/i/${code}${q ? `?${q}` : ''}`;
  return { kind: 'page', page: platform === 'ios' ? 'ios_soon' : 'desktop', params, playUrl, shareUrl };
}

/**
 * `/a` (campagne) et `/t/{code}` (tontine) : Play Store avec `src`/`cmp`/`cnt`
 * seulement (jamais `ref`), page sans code sur ordinateur et iPhone.
 * null : ce n'est pas l'un de ces chemins.
 */
function appLink(input: { path: string; get: (k: string) => string | null | undefined; userAgent?: string; origin: string }): LinkRoute | null {
  const t = /^\/t\/([^/?#]+)\/?$/.exec(input.path);
  if (!t && !/^\/a\/?$/.test(input.path)) return null;
  // Code de tontine : même forme que les codes d'invitation (`generateCode`).
  if (t && !isValidCode(normalizeCode(decodeSafe(t[1])))) return { kind: 'not_found' };
  const { src, cmp, cnt } = readLinkParams(input.get);
  const params: LinkParams = { ...(src ? { src } : {}), ...(cmp ? { cmp } : {}), ...(cnt ? { cnt } : {}) };
  const playUrl = playStoreUrl(params);
  const platform = detectPlatform(input.userAgent);
  if (platform === 'android') return { kind: 'redirect', url: playUrl };
  if (platform === 'ios' && LINK_BRAND.appStoreUrl) return { kind: 'redirect', url: LINK_BRAND.appStoreUrl };
  const q = (['src', 'cmp', 'cnt'] as const).filter((k) => params[k]).map((k) => `${k}=${params[k]}`).join('&');
  return { kind: 'page', page: platform === 'ios' ? 'ios_soon' : 'desktop', params, playUrl, shareUrl: `${input.origin}/a${q ? `?${q}` : ''}`, variant: 'app' };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const TEXT = {
  fr: {
    title: 'Invitation DineroX',
    lead: 'Vous êtes invité à gérer votre argent avec {app}.',
    code: 'Votre code d’invitation',
    desktop: 'Scannez ce QR code avec votre téléphone Android, ou ouvrez le lien sur votre téléphone.',
    play: 'Télécharger sur Google Play',
    iosSoon: 'Bientôt sur iPhone',
    iosLead: '{app} n’est pas encore disponible sur l’App Store. Gardez votre code : vous pourrez le saisir à l’inscription.',
    notFound: 'Ce lien n’est pas valide.',
    // Étape 5 : page `/a` et `/t/{code}`, sans code (docs/textes-etape5.md).
    appTitle: 'Télécharger {app}',
    appLead: 'Gérez votre argent avec {app}. Vos dépenses s’enregistrent même sans internet.',
  },
  en: {
    title: 'DineroX invitation',
    lead: 'You are invited to manage your money with {app}.',
    code: 'Your invitation code',
    desktop: 'Scan this QR code with your Android phone, or open the link on your phone.',
    play: 'Get it on Google Play',
    iosSoon: 'Coming soon on iPhone',
    iosLead: '{app} is not on the App Store yet. Keep your code: you can enter it when you sign up.',
    notFound: 'This link is not valid.',
    appTitle: 'Download {app}',
    appLead: 'Manage your money with {app}. Your expenses are saved even without internet.',
  },
};

export function pageLanguage(acceptLanguage: string | undefined): 'fr' | 'en' {
  return /^\s*en\b/i.test(acceptLanguage ?? '') ? 'en' : 'fr';
}

/** Page HTML autonome (aucun script, aucune ressource externe). `qrSvg` : QR code déjà rendu en SVG. */
export function renderPage(route: Extract<LinkRoute, { kind: 'page' }> | { kind: 'not_found' }, lang: 'fr' | 'en', qrSvg = ''): string {
  const t = TEXT[lang];
  const app = LINK_BRAND.name;
  const f = (s: string) => esc(s.replace('{app}', app));
  let body: string;
  if (route.kind === 'not_found') {
    body = `<h1>${f(app)}</h1><p>${f(t.notFound)}</p>`;
  } else if (route.variant === 'app') {
    // Lien sans code : ni « Votre code d'invitation », ni phrase sur le code (iPhone).
    const head = route.page === 'ios_soon' ? `<h1>${f(t.iosSoon)}</h1><p>${f(t.appLead)}</p>` : `<h1>${f(t.appTitle)}</h1><p>${f(t.appLead)}</p>`;
    const qr = route.page === 'desktop' && qrSvg ? `<div class="qr">${qrSvg}</div><p class="small">${f(t.desktop)}</p>` : '';
    body = `${head}${qr}<p><a class="btn" href="${esc(route.playUrl)}">${f(t.play)}</a></p>`;
  } else {
    const code = esc(route.params.code ?? '');
    const head = route.page === 'ios_soon' ? `<h1>${f(t.iosSoon)}</h1><p>${f(t.iosLead)}</p>` : `<h1>${f(t.title)}</h1><p>${f(t.lead)}</p>`;
    const qr = route.page === 'desktop' && qrSvg ? `<div class="qr">${qrSvg}</div><p class="small">${f(t.desktop)}</p>` : '';
    body = `${head}<p class="small">${f(t.code)}</p><p class="code">${code}</p>${qr}<p><a class="btn" href="${esc(route.playUrl)}">${f(t.play)}</a></p>`;
  }
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${f(route.kind === 'page' && route.variant === 'app' ? t.appTitle : t.title)}</title><style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:${LINK_BRAND.colors.night};color:#F8FAFC;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{max-width:420px;width:100%;text-align:center}h1{font-size:24px;margin:0 0 12px}p{line-height:1.5;margin:0 0 12px}
.small{font-size:14px;color:#CBD5E1}.code{font-size:32px;font-weight:700;letter-spacing:6px;color:${LINK_BRAND.colors.green}}
.qr{background:#fff;border-radius:12px;padding:12px;width:220px;margin:8px auto 12px}.qr svg{width:100%;height:auto;display:block}
.btn{display:inline-block;min-height:48px;line-height:48px;padding:0 24px;border-radius:12px;background:${LINK_BRAND.colors.green};color:${LINK_BRAND.colors.night};font-weight:700;text-decoration:none}
</style></head><body><main>${body}</main></body></html>`;
}
