# Connexion par téléphone — proposition technique (B2)

Document d'étude. **Rien n'est construit, rien n'est activé, aucun compte n'est ouvert, aucune clé
n'est demandée.** Référence : `docs/connexion-telephone/DECISIONS.md` (fondateur, 22/10/2026).

---

## Partie 1 — En français simple

**Ce que vit la personne**

1. Elle tape son **numéro** (+225 déjà proposé).
2. Elle reçoit un **code à 6 chiffres sur WhatsApp**. Si WhatsApp n'arrive pas, elle touche
   « Recevoir par SMS ».
3. Elle choisit son **code secret** (6 chiffres), deux fois.
4. Ensuite, pour se connecter : **numéro + code secret**, sans message.
5. Le code WhatsApp/SMS revient seulement si elle a **oublié son code secret** ou change de
   **téléphone**.
6. Les comptes **e-mail** continuent comme avant ; on peut y **ajouter son numéro** sans rien perdre.

**Ce que fait DineroX derrière**

- Tout le sensible se passe **sur le serveur** (une Cloud Function) : envoi du code, vérification,
  code secret, ouverture de la session. L'application ne contient **aucune clé**.
- Le code secret n'est **jamais gardé en clair** : seulement une empreinte, dans une partie de la
  base que l'application ne peut pas lire.
- Le code reçu **expire en 10 minutes** et ne sert **qu'une fois**.
- **5 erreurs** → blocage temporaire (15 min, puis plus long).
- **Envois limités** par numéro et par jour, plus un **plafond de dépense global** : personne ne
  peut faire envoyer des SMS payants en boucle.

**Ce que je recommande (à vous de décider)**

- **Fournisseur :** l'**API WhatsApp Cloud de Meta** en direct (le moins cher, environ
  **0,004 $ par code** pour l'« Afrique, reste du continent » — *à vérifier sur la grille officielle*),
  avec un **fournisseur SMS local** en secours (ordre de grandeur **7 à 15 FCFA par SMS** ; Orange
  publie 7 260 FCFA les 1 000 SMS). Twilio est simple mais **environ 40 fois plus cher** par SMS en
  Côte d'Ivoire. Firebase Phone Auth ne fait pas WhatsApp.
- **Code PIN local :** **combiner** — le même code secret à 6 chiffres sert à se connecter ET à
  déverrouiller l'application (une seule chose à retenir), le verrou restant facultatif.

**Coût estimé par mois** (hypothèses au §8) : 1 000 utilisateurs ≈ **1 à 2 $** ;
10 000 ≈ **13 $** ; 100 000 ≈ **130 $** (option recommandée).

---

## Partie 2 — En détail

### 1. Les trois options comparées

Prix par message en dollars US (1 $ ≈ 600 FCFA, indicatif). « À vérifier » : prix non lu sur la
page officielle elle-même, ou page officielle illisible.

| | (a) Meta WhatsApp Cloud API + SMS local | (b) Twilio Verify (WhatsApp + SMS) | (c) Firebase Phone Auth |
|---|---|---|---|
| Canaux | WhatsApp (modèle « authentification »), SMS par un 2e fournisseur | WhatsApp et SMS, bascule gérée par Twilio | **SMS seulement** (pas de WhatsApp : ne respecte pas la décision « WhatsApp d'abord ») |
| Prix WhatsApp | **≈ 0,004 $** par code délivré (région « Rest of Africa », grille du 1/10/2026) — **à vérifier** sur [la grille officielle Meta](https://developers.facebook.com/docs/whatsapp/pricing) (chiffre lu sur des sites tiers : [Sleekflow](https://sleekflow.io/blog/whatsapp-business-price), [Whautomate](https://whautomate.com/whatsapp-business-api-pricing)) | 0,05 $ par vérification réussie ([Twilio Verify, officiel](https://www.twilio.com/en-us/verify/pricing)) + frais Twilio WhatsApp 0,005 $ ([officiel](https://www.twilio.com/en-us/whatsapp/pricing)) + tarif Meta ≈ 0,004 $ → **≈ 0,059 $** | — |
| Prix SMS | Orange SMS API Côte d'Ivoire : 7 260 FCFA les 1 000 SMS, soit **≈ 7,3 FCFA (≈ 0,012 $)** ([page officielle Orange Developer](https://developer.orange.com/apis/sms-ci/pricing)) — **à vérifier** : envoi vers MTN et Moov, nom d'expéditeur, usage « code de connexion ». Autres agrégateurs : 5 à 50 XOF selon un comparatif tiers ([sent.dm](https://www.sent.dm/resources/ivory-coast-sms-pricing)) | 0,05 $ + **0,4925 $** par SMS ([Twilio SMS Côte d'Ivoire, officiel](https://www.twilio.com/en-us/sms/pricing/ci)) → **≈ 0,54 $** | **0,18 $** par SMS envoyé pour la Côte d'Ivoire ([Identity Platform, officiel](https://cloud.google.com/identity-platform/pricing)) — page mal mise en forme : **à confirmer** ; les 10 premiers SMS par jour gratuits ; offre Blaze obligatoire |
| Fiabilité en Côte d'Ivoire | WhatsApp très répandu ; livraison directe par Meta. SMS local : bonne livraison sur le réseau Orange ; MTN / Moov **à vérifier** | Bonne (réseau mondial), mais SMS international vers la CI cher ; WhatsApp passe par Meta de toute façon | SMS international : délais et filtrage possibles, pas de WhatsApp ; vérification reCAPTCHA / Play Integrity côté app |
| Démarches | Meta Business : **vérification de l'entreprise**, numéro dédié à WhatsApp, **modèle d'authentification** approuvé, moyen de paiement. Contrat SMS local (Orange : achat de forfaits via Orange Money) | Compte Twilio + carte bancaire ; pour WhatsApp, Twilio doit tout de même rattacher un compte WhatsApp Business **vérifié par Meta** | Activer le fournisseur « Téléphone » dans Firebase Auth (offre Blaze, déjà nécessaire aux Cloud Functions) |
| Délai estimé | 1 à 3 semaines (vérification Meta, approbation du modèle) | quelques jours pour le SMS ; 1 à 3 semaines pour WhatsApp (même vérification Meta) | 1 jour |
| Code côté serveur | à écrire (Cloud Function), envoi des deux canaux | Twilio génère et vérifie le code (moins de code) | Firebase gère tout côté client ; **mais** pas de code secret à 6 chiffres côté serveur ni de limite par numéro maîtrisée par nous |
| Coût pour 100 000 utilisateurs/mois (§8) | **≈ 130 $** | **≈ 4 100 $** | **≈ 3 550 $** (et pas de WhatsApp) |

**Recommandation : (a).** Moins cher (30 fois moins que (b) à grande échelle), conforme à la
décision (WhatsApp d'abord, SMS en secours), et toutes les règles de protection restent dans **notre**
Cloud Function. (b) reste un bon **plan de secours** si les démarches Meta traînent (Verify en SMS
seul pour démarrer), au prix fort.

### 2. Schéma retenu (option a)

```
Application                      Cloud Functions (europe-west1)                 Fournisseurs
───────────                      ─────────────────────────────                  ────────────
numéro ───────────────► phoneStart(phone, purpose) ───── code 6 chiffres ──► WhatsApp (Meta)
                         │ limites, empreinte du code                       └─► SMS (secours)
code reçu ────────────► phoneVerify(requestId, code)
                         │ usage unique, 5 essais → ticket (10 min)
code secret ──────────► phoneSetSecret(ticket, secret)   (inscription, oubli)
                         │ empreinte du secret → createUser / updateUser
                         └─► jeton personnalisé (createCustomToken) ──► signInWithCustomToken
numéro + secret ──────► phoneSignIn(phone, secret, device)  (connexions suivantes)
                         └─► jeton personnalisé, ou « nouveau téléphone : code requis »
```

**Collections Firestore, toutes `allow read, write: if false`** (lues et écrites seulement par les
fonctions, avec un test de règles chacune — règle 3) :

| Collection | Contenu | Jamais |
|---|---|---|
| `phoneAuth/{requestId}` | empreinte HMAC du code, canal, but, expiration, essais, utilisé | le code en clair |
| `phoneSecrets/{uid}` | empreinte du code secret (scrypt, sel propre + « poivre » serveur), date | le secret en clair |
| `phoneGuard/{hmacNuméro}` | envois du jour, échecs, blocage jusqu'à | le numéro en clair dans l'identifiant |
| `phoneDevices/{uid}` | empreintes HMAC des téléphones déjà vérifiés | l'identifiant d'appareil en clair |
| `phoneIndex/{hmacNuméro}` | uid du compte (unicité du numéro) | — |

**Règles de protection, une par une**

1. **Code reçu** : 6 chiffres tirés par `crypto.randomInt` ; seule son **empreinte HMAC-SHA256**
   (secret serveur dédié `PHONE_CODE_PEPPER`, **nouveau**, jamais `REFERRAL_DEVICE_PEPPER`) est
   gardée ; **10 minutes** ; **usage unique** (marqué « utilisé » dans une transaction) ;
   **5 essais**, puis la demande est annulée.
2. **Code secret** : 6 chiffres ; refus des suites évidentes (000000, 123456, 6 fois le même
   chiffre, date d'année…) ; empreinte **scrypt** (coût élevé côté serveur) + sel aléatoire +
   poivre serveur ; jamais renvoyé, jamais journalisé.
3. **Essais limités** sur le code secret : 5 erreurs → 15 min ; puis 1 h ; puis 24 h, **par numéro
   tenté** (comme le back-office, `boLoginGuard`). Un numéro inconnu prend **le même temps de
   calcul** qu'un mauvais code (pas de devinette « ce numéro a-t-il un compte ? »).
4. **Envois limités** : 1 envoi par minute et **5 par jour** par numéro ; **20 par jour par
   appareil** ; **plafond global** de dépense par jour (ex. 2 000 codes) au-delà duquel les envois
   s'arrêtent et une alerte part au back-office ; **App Check** obligatoire sur ces fonctions.
   Les « Renvoyer » comptent dans la limite ; le SMS n'est proposé qu'après 30 s sans WhatsApp.
5. **Nouveau téléphone** : chaque téléphone vérifié laisse une empreinte (`phoneDevices`) ; sur un
   téléphone inconnu, le code secret seul ne suffit pas : code WhatsApp/SMS demandé (décision §2).
6. **Aucune clé dans l'application ni dans Git** : jetons Meta / SMS en `defineSecret`, tapés par le
   fondateur dans le Terminal (`firebase functions:secrets:set …`), jamais affichés.
7. **Messages neutres** : « Si ce numéro peut recevoir un code, il arrive dans un instant » ;
   aucune réponse ne révèle si un numéro a déjà un compte.
8. **Journal** : événements d'usage sans numéro ni code (`phone_code_sent {channel}`,
   `phone_signin {result}`), comme `core/analyticsProps.ts`.
9. **Rien de Firebase Phone Auth** n'est activé : le numéro est posé par la fonction
   (`admin.auth().updateUser(uid, { phoneNumber })`) une fois vérifié par **nous**.

### 3. Comptes e-mail existants

- **Rien ne change** pour eux : l'écran de bienvenue garde « J'ai un compte e-mail », la connexion
  e-mail + mot de passe et Google restent, « mot de passe oublié » aussi.
- **Ajouter mon numéro** (Réglages › Profil, et une carte discrète proposée une fois) : la personne
  est **déjà connectée** ; `phoneStart(purpose: 'link')` + `phoneVerify` + `phoneSetSecret` ; la
  fonction ajoute le numéro **au même compte** (`updateUser(uid, { phoneNumber })`, même uid,
  mêmes données, mêmes espaces, même abonnement). Ensuite elle peut se connecter **au choix** avec
  l'e-mail ou avec le numéro.
- **Numéro déjà pris** par un autre compte : refus clair, rien n'est fusionné automatiquement
  (une fusion de comptes serait une décision à part).
- Le champ « Téléphone (facultatif) » du profil actuel n'est **pas** considéré comme vérifié : il
  sert seulement à préremplir « Ajouter mon numéro ».

### 4. Code PIN local : garder, remplacer ou combiner ?

| Choix | Pour | Contre |
|---|---|---|
| **Garder séparé** | aucun changement | deux codes à retenir (code secret + PIN), confusion |
| **Remplacer** le PIN par le code secret vérifié en ligne | un seul code | déverrouiller demanderait le réseau : impossible hors connexion (règle « hors-ligne d'abord ») |
| **Combiner** (recommandé) | **un seul code à retenir** ; le déverrouillage reste hors connexion | à la connexion réussie, l'empreinte locale (déjà prévue par `security.ts`, 4 à 6 chiffres) est mise à jour ; le verrou reste **facultatif** |

**Ma recommandation : combiner**, sans décider à votre place. Quand on change son code secret, le
PIN local suit. « Code oublié ? » sur l'écran de verrouillage mène au parcours « code secret
oublié » (code WhatsApp/SMS) au lieu de la seule déconnexion.

### 5. Écrans (maquettes dans `maquettes/`)

Bienvenue · Saisie du numéro · Code WhatsApp · Création du code secret + confirmation · Connexion ·
Code secret oublié · Nouveau téléphone · « Ajouter mon numéro » (compte e-mail) — avec les
messages d'erreur : mauvais code, trop d'essais, code expiré, pas de réseau.

### 6. Points à faire valider avant de construire

- Fournisseur (a) et fournisseur SMS précis (Orange seul, ou agrégateur couvrant MTN / Moov).
- Durée de validité du code reçu (proposée : 10 min) et limites (5 envois/jour/numéro).
- Code PIN : combiner ou non.
- Textes des écrans (`maquettes/TEXTES.md`, FR + EN).
- Mention dans les CGU et la politique de confidentialité (numéro de téléphone, sous-traitants
  Meta et opérateur SMS).

### 7. Étapes futures (chaque règle : un test qui échoue d'abord)

| # | Étape | Test qui doit échouer d'abord |
|---|---|---|
| 1 | Module pur `core/phone.ts` : numéro au format international (+225 proposé, modifiable), refus des codes secrets évidents | `tests/phone.test.ts` : « 07 08 09 10 11 » → +2250708091011 ; « 123456 » refusé |
| 2 | Règles Firestore des 5 collections fermées | `npm run test:rules` : lecture/écriture client refusées |
| 3 | `phoneStart` : limites d'envoi (1/min, 5/jour/numéro, 20/jour/appareil, plafond global) | `tests/functions/` (`npm run test:functions`) : 6e envoi du jour refusé ; plafond global atteint → refus + alerte |
| 4 | `phoneVerify` : expiration 10 min, usage unique, 5 essais | code correct après 10 min refusé ; 2e usage refusé ; 6e essai refusé |
| 5 | `phoneSetSecret` : empreinte scrypt, jamais en clair | le document ne contient pas le secret ; 2 comptes, 2 sels différents |
| 6 | `phoneSignIn` : 5 erreurs → blocage, numéro inconnu = même temps | 6e essai bloqué ; durée « inconnu » ≈ « mauvais code » |
| 7 | Nouveau téléphone : code reçu exigé | secret correct sur appareil inconnu → « code requis » |
| 8 | Compte e-mail + « Ajouter mon numéro » : même uid | après liaison, `uid` et données inchangés ; connexion e-mail toujours possible |
| 9 | Écrans + `e2e/phone-auth.js` (fournisseurs simulés sur émulateurs) + `forms-audit` | parcours complets sans aucun envoi réel |
| 10 | Activation réelle (fondateur) : secrets tapés dans le Terminal, déploiement par nom, commande par commande | — |

### 8. Coût mensuel estimé

**Hypothèses (à ajuster)** : chaque mois, des codes sont envoyés à **20 % des utilisateurs**
(nouvelles inscriptions + codes oubliés + nouveaux téléphones), dont **30 % finissent en SMS**
(pas de WhatsApp ou non reçu) ; « Renvoyer » non compté (la limite d'envois le borne).
1 $ ≈ 600 FCFA.

| Utilisateurs | Codes / mois | (a) Meta WhatsApp + SMS local | (b) Twilio Verify | (c) Firebase (SMS seul) |
|---|---|---|---|---|
| 1 000 | 200 (140 WhatsApp + 60 SMS) | 140 × 0,004 + 60 × 0,012 ≈ **1,3 $** (≈ 800 FCFA) | 140 × 0,059 + 60 × 0,54 ≈ **41 $** | 200 SMS, dont ≈ 300 gratuits/mois (10/jour) → **≈ 0 $** |
| 10 000 | 2 000 (1 400 + 600) | 5,6 + 7,2 ≈ **13 $** (≈ 7 700 FCFA) | 82,6 + 325,5 ≈ **408 $** | (2 000 − 300) × 0,18 ≈ **306 $** |
| 100 000 | 20 000 (14 000 + 6 000) | 56 + 72 ≈ **128 $** (≈ 77 000 FCFA) | 826 + 3 255 ≈ **4 081 $** | (20 000 − 300) × 0,18 ≈ **3 546 $** |

Les connexions ordinaires (numéro + code secret) ne coûtent **rien** : aucun message n'est envoyé.
Le plafond global de dépense (§2, règle 4) borne le pire cas.

### Sources

- Meta, grille officielle WhatsApp Business : https://developers.facebook.com/docs/whatsapp/pricing
  (montant « Rest of Africa » lu sur des sites tiers : https://sleekflow.io/blog/whatsapp-business-price ,
  https://whautomate.com/whatsapp-business-api-pricing — **à vérifier**)
- Twilio Verify : https://www.twilio.com/en-us/verify/pricing
- Twilio SMS Côte d'Ivoire : https://www.twilio.com/en-us/sms/pricing/ci
- Twilio WhatsApp : https://www.twilio.com/en-us/whatsapp/pricing
- Google Identity Platform (SMS de Firebase Phone Auth) : https://cloud.google.com/identity-platform/pricing
- Orange Developer, SMS Côte d'Ivoire : https://developer.orange.com/apis/sms-ci/pricing
- Comparatif tiers des SMS en Côte d'Ivoire : https://www.sent.dm/resources/ivory-coast-sms-pricing
