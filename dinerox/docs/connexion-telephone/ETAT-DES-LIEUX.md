# Connexion par téléphone — état des lieux (B1)

Branche `connexion-telephone`, créée depuis `design-pro` le 22/10/2026. Document seulement :
aucune ligne de code de l'application ni des Cloud Functions n'est modifiée.

## En bref

Aujourd'hui, on entre dans DineroX de **trois façons** :

1. **Compte en ligne avec e-mail + mot de passe** (Firebase Authentication), avec la variante
   **« Continuer avec Google »** ;
2. **Mode sans compte** (« Utiliser sur ce téléphone uniquement ») : tout reste sur le téléphone ;
3. **Démonstration** (« Tester sans données (démonstration) », données fictives, locale).

Le **numéro de téléphone** existe déjà, mais seulement comme information **facultative** du
profil : il n'est ni vérifié ni utilisé pour se connecter.

Le **code PIN** (4 à 6 chiffres) n'est **pas** une connexion : c'est un **verrou local** de
l'application, rangé dans le coffre du téléphone (SecureStore), un par compte. Il ne quitte jamais
l'appareil et le serveur ne le connaît pas.

## 1. Inscription

| Étape | Ce qui se passe | Fichier |
|---|---|---|
| Écran d'accueil | « Créer mon compte », « J'ai déjà un compte », puis en petit « Tester sans données (démonstration) » et « Utiliser sur ce téléphone uniquement » | `src/app/(auth)/welcome.tsx` |
| Formulaire | Nom, prénom, e-mail, téléphone (facultatif), mot de passe (≥ 8), confirmation, CGU | `src/app/(auth)/sign-up.tsx` ; contrôles purs `src/core/validation.ts` (`validateSignUp`, `normalizePhone`, `validatePhone`) |
| Création | `createUserWithEmailAndPassword`, nom affiché, e-mail de vérification envoyé sans bloquer | `src/services/auth.ts › signUp` |
| Profil | `saveProfile(uid, { firstName, lastName, phone, termsAcceptedVersion })` | `src/services/profile.ts` |
| Google | jeton obtenu par expo-auth-session puis `signInWithCredential` ; un code de parrainage en attente est mis de côté puis remis si la connexion échoue | `src/components/GoogleButton.tsx`, `src/services/auth.ts › signInWithGoogleIdToken` |
| Après l'inscription | parrainage (`applyReferral`), origine de l'installation comptée une fois (`recordSignupOrigin`), onboarding (pays, devise…) | `src/services/referral.ts`, `src/services/installOrigin.ts`, `src/app/onboarding.tsx` |

## 2. Connexion

- `src/app/(auth)/sign-in.tsx` : e-mail + mot de passe (`signIn`), ou Google.
- Les erreurs Firebase deviennent des messages lisibles : `authErrorKey` (`auth.err.*`), dont
  « identifiants incorrects » (sans dire si l'e-mail existe) et « pas de réseau ».
- La session est suivie dans `src/store/app.tsx` (`onAuthStateChanged`, règle 16) : lectures
  d'abord, puis l'état posé en une fois ; un compte suspendu par le back-office est détecté au
  renouvellement du jeton (au démarrage, au retour au premier plan et du réseau :
  `src/core/accountStatus.ts › isSuspendedAuthError`).

## 3. Mot de passe oublié

- `src/app/(auth)/forgot-password.tsx` → `resetPassword(email)` → `sendPasswordResetEmail` :
  Firebase envoie un lien par e-mail. Rien d'autre (pas de SMS).
- Changement du mot de passe connecté : `changePassword` (réauthentification, puis
  `updatePassword`).

## 4. Code PIN local (`src/services/security.ts`, `src/components/LockGate.tsx`)

- **Facultatif**, activé dans Réglages › Sécurité (`src/app/settings/security.tsx`).
- 4 à 6 chiffres ; **jamais en clair** : empreinte SHA-256 salée, 2 000 tours, dans SecureStore
  (Keychain iOS / Keystore Android).
- **Un code par compte** (clé suffixée par l'uid) : sur un téléphone partagé, le code de A ne
  verrouille ni ne déverrouille la session de B. L'ancien code commun (v1) est supprimé.
- 5 erreurs → blocage 30 s, puis 60 s, 120 s… ; biométrie possible (Face ID / empreinte).
- Verrouille à l'ouverture et après un passage en arrière-plan plus long que le délai choisi ;
  l'application reste montée dessous (aucune saisie perdue).
- « Code oublié ? » : en ligne → déconnexion (on se reconnecte avec l'e-mail et le mot de passe),
  puis le code est effacé ; sans compte → les données locales sont effacées (avertissement).

## 5. Plusieurs comptes sur un appareil (règle 14)

- Tout ce qui est local est rangé par uid : `storageKey(uid, …)` (`src/services/storage.ts`),
  code PIN par uid, mémoire « lu » de « À lire » par uid.
- `resetSession()` efface l'état en mémoire à chaque changement de compte (`src/store/app.tsx`).
- Une modification de profil en attente porte son propriétaire (`pendingOf`,
  `src/core/profilePending.ts`).
- Testé de bout en bout : `e2e/multi-users.js` (A puis B sur le même appareil, aucune donnée de A
  visible par B, écritures simultanées cloisonnées).

## 6. Déconnexion

- Compte en ligne : `signOut()` (`src/services/auth.ts`) retire d'abord le jeton push de
  l'appareil (`forgetDeviceNotifications`), puis `signOut` de Firebase ; les rappels locaux sont
  annulés (règle 14).
- Sans compte : `signOutLocal()` (`src/store/app.tsx`) efface les données locales
  (`removeKeys('dinerox:v1:local:')`).
- Suppression du compte : Cloud Function `deleteAccount` (`firebase/functions/src/accountDeletion.ts`),
  qui efface toutes les données côté serveur.

## 7. Ce qui existe déjà côté serveur et resservira

| Besoin de la connexion par téléphone | Ce qui existe déjà | Fichier |
|---|---|---|
| Empreinte d'une donnée avec un secret serveur | HMAC-SHA256 de l'identifiant d'appareil avec le secret `REFERRAL_DEVICE_PEPPER` (`defineSecret`) — **à ne jamais réutiliser ni changer** : un nouveau secret dédié sera créé | `firebase/functions/src/referralApi.ts` |
| Essais limités + blocage temporaire | Back-office : 5 échecs → blocage 15 min, par identifiant tenté, dans une collection illisible (`boLoginGuard`) | `firebase/functions/src/backoffice/login.ts` |
| Code à usage unique | Codes de secours du back-office : empreinte, retirée après usage | `firebase/functions/src/backoffice/login.ts`, `totp.ts` |
| Quotas par jour | Saisie vocale et IA : quotas par jour, plafond anti-abus de 50 essais/jour | `firebase/functions/src/usage.ts` |
| Collections fermées au client | `match /referralDevices/{hash} { allow read, write: if false; }`, `/boLoginGuard`, `/accountStatus` | `firebase/firestore.rules` |
| Région des fonctions | `import './options'` en premier (europe-west1, règle 23) | `firebase/functions/src/options.ts` |
| Tests des fonctions sur émulateurs | `npm run test:functions` (vraies fonctions, vitest) | `tests/functions/`, `vitest.functions.config.mts` |

## 8. Fichiers concernés par un futur changement (aucun n'est modifié ici)

**Application**
- `src/app/(auth)/welcome.tsx`, `sign-up.tsx`, `sign-in.tsx`, `forgot-password.tsx`, `_layout.tsx`
- `src/services/auth.ts` (nouvelles fonctions : demander / vérifier le code, se connecter avec le
  numéro et le code secret, puis `signInWithCustomToken`)
- `src/services/security.ts`, `src/components/LockGate.tsx`, `src/components/PinPad.tsx`
  (pavé déjà existant, réutilisable pour les 6 chiffres)
- `src/app/settings/security.tsx`, `src/app/settings/profile.tsx` (« Ajouter mon numéro »)
- `src/store/app.tsx` (session, règle 16)
- `src/core/validation.ts` (numéro au format international, +225 proposé)
- `src/i18n/fr.ts`, `src/i18n/en.ts`
- `e2e/forms-audit.js` (chaque nouvel écran de saisie, règle 15), nouveau `e2e/phone-auth.js`

**Serveur**
- `firebase/functions/src/` : nouveau `phoneAuth.ts` + `phoneAuthApi.ts` (envoi, vérification,
  code secret, jeton personnalisé), exportés par nom dans `index.ts`
- `firebase/firestore.rules` : nouvelles collections fermées (`phoneAuth`, `phoneSecrets`,
  `phoneGuard`, `phoneDevices`, `phoneIndex`) + tests de règles (règle 3)
- `tests/functions/` : tests sur émulateurs (`npm run test:functions`)

**Documents**
- `docs/connexion-telephone/` (ce dossier) ; CGU / confidentialité (traitement du numéro).
