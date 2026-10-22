/**
 * Connexion par téléphone, étape 9 (écrans) — textes validés (maquettes/TEXTES.md, tels quels ;
 * slogan du fondateur, DECISIONS.md §5bis.4), routes, page de bienvenue, verrou SÉPARÉ
 * (security.ts inchangé, code secret jamais gardé sur le téléphone), App Check en émulation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const read = (p: string) => readFileSync(p, 'utf8');
const F = fr as Record<string, string>;
const E = en as Record<string, string>;

/** maquettes/TEXTES.md, lignes 1 à 60 (hors clés déjà existantes), avec le slogan du fondateur. */
const TEXTES: Record<string, [string, string]> = {
  'phone.welcome.title': ['Mieux gérer, mieux prévoir, mieux vivre', 'Manage better, plan better, live better'],
  'phone.welcome.pitch': ['Suivez ce que vous dépensez, ce que vous mettez de côté et ce qu’il vous reste par jour.', 'Track what you spend, what you set aside and what you have left each day.'],
  'phone.welcome.continue': ['Continuer avec mon numéro', 'Continue with my number'],
  'phone.welcome.email': ['J’ai un compte e-mail', 'I have an email account'],
  'phone.welcome.disclaimer': ['{app} ne détient pas votre argent : l’application vous aide à le suivre.', '{app} never holds your money: the app helps you keep track of it.'],
  'phone.number.title': ['Votre numéro de téléphone', 'Your phone number'],
  'phone.number.body': ['Nous vous envoyons un code sur WhatsApp pour vérifier que ce numéro est bien à vous.', 'We’ll send you a code on WhatsApp to check this number is yours.'],
  'phone.number.label': ['Numéro de téléphone', 'Phone number'],
  'phone.number.hint': ['L’indicatif +225 est proposé ; touchez-le pour en choisir un autre.', '+225 is suggested; tap it to choose another country code.'],
  'phone.number.noWhatsapp': ['Pas de WhatsApp sur ce numéro ? Vous pourrez recevoir le code par SMS.', 'No WhatsApp on this number? You can get the code by SMS.'],
  'phone.number.send': ['Recevoir le code', 'Get the code'],
  'phone.number.terms': ['En continuant, vous acceptez les Conditions d’utilisation et la Politique de confidentialité.', 'By continuing, you accept the Terms of use and the Privacy policy.'],
  'phone.code.sentWhatsapp': ['Code envoyé sur WhatsApp', 'Code sent on WhatsApp'],
  'phone.code.sentSms': ['Code envoyé par SMS', 'Code sent by SMS'],
  'phone.code.title': ['Entrez le code reçu', 'Enter the code you received'],
  'phone.code.sentTo': ['Envoyé au {phone}', 'Sent to {phone}'],
  'phone.code.edit': ['Modifier', 'Edit'],
  'phone.code.expiresIn': ['Le code expire dans {time}', 'The code expires in {time}'],
  'phone.code.resendIn': ['Renvoyer le code dans {time}', 'Resend the code in {time}'],
  'phone.code.resend': ['Renvoyer le code', 'Resend the code'],
  'phone.code.bySms': ['Recevoir par SMS', 'Get it by SMS'],
  'phone.code.verify': ['Vérifier', 'Verify'],
  'phone.code.neutral': ['Si ce numéro peut recevoir un code, il arrive dans un instant.', 'If this number can receive a code, it will arrive in a moment.'],
  'phone.secret.title': ['Créez votre code secret', 'Create your secret code'],
  'phone.secret.body': ['6 chiffres. Il vous servira à chaque connexion. Ne le donnez à personne — {app} ne vous le demandera jamais par message.', '6 digits. You’ll use it every time you sign in. Never share it — {app} will never ask for it in a message.'],
  'phone.secret.avoid': ['Évitez 123456, 000000 ou votre date de naissance.', 'Avoid 123456, 000000 or your date of birth.'],
  'phone.secret.tooSimple': ['Ce code est trop facile à deviner. Choisissez-en un autre.', 'This code is too easy to guess. Choose another one.'],
  'phone.secret.confirmTitle': ['Confirmez votre code secret', 'Confirm your secret code'],
  'phone.secret.confirmBody': ['Tapez les mêmes 6 chiffres une seconde fois.', 'Type the same 6 digits again.'],
  'phone.secret.step': ['Étape {n} sur 2', 'Step {n} of 2'],
  'phone.secret.mismatch': ['Les deux codes ne sont pas identiques. Recommencez.', 'The two codes don’t match. Try again.'],
  'phone.signin.title': ['Bon retour !', 'Welcome back!'],
  'phone.signin.yourNumber': ['Votre numéro', 'Your number'],
  'phone.signin.change': ['Changer', 'Change'],
  'phone.signin.secret': ['Votre code secret', 'Your secret code'],
  'phone.signin.forgot': ['Code secret oublié ?', 'Forgot your secret code?'],
  'phone.forgot.title': ['Code secret oublié ?', 'Forgot your secret code?'],
  'phone.forgot.body': ['Pas de souci. Nous vérifions votre numéro avec un code reçu sur WhatsApp, puis vous choisissez un nouveau code secret.', 'No problem. We’ll check your number with a code sent on WhatsApp, then you’ll choose a new secret code.'],
  'phone.forgot.sentTo': ['Code envoyé au', 'Code sent to'],
  'phone.forgot.safe': ['Vos opérations, vos comptes et votre abonnement ne changent pas.', 'Your transactions, accounts and subscription stay the same.'],
  'phone.device.title': ['Nouveau téléphone', 'New phone'],
  'phone.device.body': ['Pour protéger votre compte, confirmez votre numéro avec un code reçu sur WhatsApp. C’est demandé une seule fois sur ce téléphone.', 'To protect your account, confirm your number with a code sent on WhatsApp. You’ll only be asked once on this phone.'],
  'phone.device.notMine': ['Ce n’est pas mon numéro', 'This isn’t my number'],
  'phone.link.title': ['Ajouter mon numéro', 'Add my number'],
  'phone.link.sameAccount': ['Votre compte reste le même : mêmes données, même abonnement. Ensuite, vous pourrez vous connecter avec votre numéro ou avec votre e-mail.', 'Your account stays the same: same data, same subscription. Then you can sign in with your number or with your email.'],
  'phone.link.how': ['Nous vous envoyons un code sur WhatsApp (ou par SMS), puis vous choisissez un code secret.', 'We’ll send you a code on WhatsApp (or by SMS), then you’ll choose a secret code.'],
  'phone.link.taken': ['Ce numéro est déjà relié à un autre compte. Connectez-vous avec ce numéro, ou utilisez un autre numéro.', 'This number is already linked to another account. Sign in with that number, or use another number.'],
  'phone.link.done': ['Numéro ajouté. Vous pouvez maintenant vous connecter avec votre numéro ou votre e-mail.', 'Number added. You can now sign in with your number or your email.'],
  'phone.err.wrongCode': ['Code incorrect. Il vous reste {count} essais.', 'Wrong code. You have {count} tries left.'],
  'phone.err.wrongCodeOne': ['Code incorrect. Il vous reste 1 essai.', 'Wrong code. You have 1 try left.'],
  'phone.err.wrongSecret': ['Code secret incorrect.', 'Wrong secret code.'],
  'phone.err.tooMany': ['Trop d’essais. Réessayez dans {minutes} minutes, ou touchez « Code secret oublié ? ».', 'Too many tries. Try again in {minutes} minutes, or tap “Forgot your secret code?”.'],
  'phone.err.tooManyCodes': ['Trop de codes demandés aujourd’hui pour ce numéro. Réessayez demain.', 'Too many codes requested today for this number. Try again tomorrow.'],
  'phone.err.expired': ['Ce code a expiré. Pour votre sécurité, un code ne sert que 10 minutes. Demandez-en un nouveau.', 'This code has expired. For your security, a code only lasts 10 minutes. Ask for a new one.'],
  'phone.err.network': ['Pas de connexion Internet. Vérifiez vos données mobiles ou le Wi-Fi, puis réessayez. Aucun code n’a été envoyé.', 'No internet connection. Check your mobile data or Wi-Fi, then try again. No code was sent.'],
  'phone.err.invalidNumber': ['Ce numéro ne semble pas complet. Vérifiez-le.', 'This number doesn’t look complete. Please check it.'],
};

describe('textes validés (maquettes/TEXTES.md tels quels) et slogan du fondateur', () => {
  it.each(Object.entries(TEXTES))('%s (FR et EN)', (k, [f, e]) => {
    expect(F[k]).toBe(f);
    expect(E[k]).toBe(e);
  });
  it('textes existants réutilisés, inchangés', () => {
    expect(F['fp.demo']).toBe('Tester sans données (démonstration)');
    expect(F['fp.localOnly']).toBe('Utiliser sur ce téléphone uniquement');
    expect(F['common.retry']).toBe('Réessayer');
  });
  it('aucun « DineroX » en dur dans les nouveaux textes (marque via {app})', () => {
    for (const k of Object.keys(F).filter((x) => x.startsWith('phone.'))) {
      expect(F[k], k).not.toMatch(/DineroX/);
      expect(E[k], k).not.toMatch(/DineroX/);
    }
  });
});

describe('écrans et parcours', () => {
  it('routes : numéro (inscription, connexion, oubli) et « Ajouter mon numéro » (réglages)', () => {
    for (const f of ['src/app/(auth)/phone.tsx', 'src/app/settings/add-phone.tsx', 'src/features/phoneAuth/PhoneFlow.tsx', 'src/services/phoneAuth.ts']) expect(existsSync(f), f).toBe(true);
    expect(read('src/app/(auth)/phone.tsx')).toMatch(/<PhoneFlow /);
    expect(read('src/app/settings/add-phone.tsx')).toMatch(/<PhoneFlow start="link"/);
  });
  it('bienvenue (maquette 1) : « Continuer avec mon numéro », « J’ai un compte e-mail », démonstration, sans compte', () => {
    const w = read('src/app/(auth)/welcome.tsx');
    for (const k of ['phone.welcome.title', 'phone.welcome.pitch', 'phone.welcome.continue', 'phone.welcome.email', 'phone.welcome.disclaimer', 'fp.demo', 'fp.localOnly']) expect(w, k).toContain(`'${k}'`);
    expect(w).toMatch(/router\.push\('\/sign-in'\)/);
    expect(w).not.toMatch(/LinearGradient/);
  });
  it('les écrans de saisie sont dans le contrôle des formulaires (règle 15)', () => {
    const audit = read('e2e/forms-audit.js');
    expect(audit).toMatch(/\/phone/);
    expect(audit).toMatch(/\/settings\/add-phone/);
  });
});

describe('verrou de l’application SÉPARÉ ; code secret jamais gardé sur le téléphone (§5bis.3)', () => {
  it('security.ts strictement inchangé', () => {
    const base = execFileSync('git', ['show', 'origin/design-pro:./src/services/security.ts'], { encoding: 'utf8' });
    expect(read('src/services/security.ts')).toBe(base);
  });
  it('le service n’écrit jamais le code secret (ni en clair ni en empreinte) dans un stockage du téléphone', () => {
    const s = read('src/services/phoneAuth.ts');
    expect(s).not.toMatch(/SecureStore|setPin|hashPin|digestStringAsync/);
    const writes = [...s.matchAll(/writeJSON\(([^)]*)\)/g)].map((m) => m[1]);
    for (const w of writes) expect(w, w).not.toMatch(/secret/i);
  });
  it('App Check : jeton de TEST seulement avec les émulateurs (aucun jeton inventé en production)', () => {
    const f = read('src/services/firebase.ts');
    expect(f).toMatch(/initializeAppCheck/);
    const block = f.slice(f.indexOf('if (__DEV__ && env.emulatorHost)'));
    expect(block.indexOf('initializeAppCheck')).toBeGreaterThan(-1);
  });
});
