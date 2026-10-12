/**
 * Page d'action des e-mails Firebase (D18) — textes FR / EN (à valider).
 * Elle sert à TOUS les comptes : utilisateurs de l'app (« mot de passe oublié »,
 * confirmation d'adresse…) et collaborateurs invités. `{app}` = brand.name.
 */
export type ActionLang = 'fr' | 'en';

export const ACTION_TEXTS = {
  fr: {
    loading: 'Vérification du lien…',
    invalidTitle: 'Lien non valable',
    invalid: 'Ce lien n’est plus valable : il a peut-être déjà été utilisé ou il a expiré. Recommencez depuis l’application {app}.',
    resetTitle: 'Choisissez un nouveau mot de passe',
    resetFor: 'Pour le compte {email}',
    newPassword: 'Nouveau mot de passe',
    newPasswordHelp: '8 caractères au moins.',
    confirm: 'Confirmez le mot de passe',
    save: 'Enregistrer le mot de passe',
    weak: 'Le mot de passe doit contenir au moins 8 caractères.',
    tooLong: '128 caractères maximum.',
    mismatch: 'Les deux mots de passe ne sont pas identiques.',
    resetDone: 'Mot de passe enregistré. Vous pouvez vous connecter à {app} avec votre nouveau mot de passe.',
    verifyTitle: 'Adresse e-mail confirmée',
    verifyDone: 'Merci : votre adresse e-mail est confirmée. Vous pouvez retourner dans l’application {app}.',
    changeTitle: 'Nouvelle adresse confirmée',
    changeDone: 'Votre nouvelle adresse e-mail est confirmée. Utilisez-la désormais pour vous connecter à {app}.',
    recoverTitle: 'Adresse e-mail rétablie',
    recoverDone: 'Votre adresse e-mail a été rétablie : {email}. Si vous n’êtes pas à l’origine du changement, choisissez un nouveau mot de passe.',
    recoverReset: 'Recevoir un lien pour changer de mot de passe',
    recoverSent: 'Un lien pour choisir un nouveau mot de passe a été envoyé à {email}.',
    error: 'Une erreur est survenue. Réessayez dans un instant.',
  },
  en: {
    loading: 'Checking the link…',
    invalidTitle: 'Invalid link',
    invalid: 'This link is no longer valid: it may have already been used or it has expired. Start again from the {app} app.',
    resetTitle: 'Choose a new password',
    resetFor: 'For the account {email}',
    newPassword: 'New password',
    newPasswordHelp: 'At least 8 characters.',
    confirm: 'Confirm the password',
    save: 'Save password',
    weak: 'Your password must be at least 8 characters long.',
    tooLong: '128 characters maximum.',
    mismatch: "The two passwords don't match.",
    resetDone: 'Password saved. You can now sign in to {app} with your new password.',
    verifyTitle: 'Email address confirmed',
    verifyDone: 'Thank you: your email address is confirmed. You can go back to the {app} app.',
    changeTitle: 'New address confirmed',
    changeDone: 'Your new email address is confirmed. Use it from now on to sign in to {app}.',
    recoverTitle: 'Email address restored',
    recoverDone: "Your email address has been restored: {email}. If you didn't make the change, choose a new password.",
    recoverReset: 'Get a link to change your password',
    recoverSent: 'A link to choose a new password has been sent to {email}.',
    error: 'Something went wrong. Please try again in a moment.',
  },
} as const;

export type ActionKey = keyof (typeof ACTION_TEXTS)['fr'];

export function actionLang(params: URLSearchParams, navigatorLang = typeof navigator !== 'undefined' ? navigator.language : 'fr'): ActionLang {
  const l = (params.get('lang') ?? navigatorLang ?? 'fr').toLowerCase();
  return l.startsWith('en') ? 'en' : 'fr';
}

export function at(lang: ActionLang, key: ActionKey, vars: Record<string, string> = {}): string {
  return ACTION_TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
