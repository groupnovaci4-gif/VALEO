# Guide — activer « Continuer avec Google » dans l'APK de test

Pour le fondateur. Tout se fait dans les consoles, avec votre compte propriétaire.
Claude ne crée rien dans les consoles. Rien de secret ici : les identifiants OAuth
et les empreintes de certificat sont publics.

**Pourquoi** : aujourd'hui le bouton Google est caché dans l'APK, car aucun
identifiant Google n'est fourni à la construction (audit 2026-10, point É1).

Ce qu'il vous faut :
- projet **dinerox-app** ;
- paquet de l'application de test : **`com.dinerox.app.staging`** ;
- empreinte **SHA-1** du certificat de l'APK de test :
  `7D:7C:C4:82:77:3A:E1:80:1A:20:D4:BE:D1:A7:62:E2:24:AF:B2:53`.

## 1. Vérifier que Google est activé dans Firebase

1. Ouvrir <https://console.firebase.google.com/>, projet **dinerox-app**.
2. **Authentication** › **Sign-in method**.
3. La ligne **Google** doit être « Activé » (c'est déjà le cas d'après l'audit).
4. Cliquer sur **Google** › **Configuration du SDK Web** : noter l'**ID client Web**
   (il se termine par `.apps.googleusercontent.com`). C'est l'**identifiant Web**.
   S'il n'y en a pas, passer à l'étape 3 pour le créer.

## 2. Écran de consentement OAuth (une seule fois)

1. Ouvrir <https://console.cloud.google.com/>, choisir le projet **dinerox-app** en haut.
2. Menu › **API et services** › **Écran de consentement OAuth**.
3. S'il n'est pas configuré : type **Externe**, nom « DineroX », e-mail d'assistance,
   domaine autorisé `dinerox-app.firebaseapp.com`. Enregistrer.
4. Tant que l'application est « En test », ajouter les adresses Gmail des testeurs
   dans **Utilisateurs test** (sinon Google refuse leur connexion).

## 3. Client OAuth « Application Web » (si l'étape 1 n'en montre pas)

1. **API et services** › **Identifiants** › **Créer des identifiants** › **ID client OAuth**.
2. Type : **Application Web**. Nom : « DineroX Web ».
3. Ne rien remplir d'autre. **Créer**. Noter l'**ID client** : c'est l'**identifiant Web**.
4. Retour dans Firebase › Authentication › Google : vérifier que cet ID client Web
   y apparaît (sinon le coller dans « ID client Web » et enregistrer).

## 4. Client OAuth « Android » pour l'APK de test

1. **API et services** › **Identifiants** › **Créer des identifiants** › **ID client OAuth**.
2. Type : **Android**. Nom : « DineroX Android (test) ».
3. **Nom du paquet** : `com.dinerox.app.staging`
4. **Empreinte du certificat SHA-1** : `7D:7C:C4:82:77:3A:E1:80:1A:20:D4:BE:D1:A7:62:E2:24:AF:B2:53`
5. **Créer**. Noter l'**ID client** : c'est l'**identifiant Android**.

## 5. Me transmettre les deux identifiants

Envoyez-moi l'**identifiant Web** et l'**identifiant Android** (publics). Je les
ajouterai, avec votre accord, dans `eas.json` › profil `staging` › `env` :

```
"EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<identifiant Web>",
"EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "<identifiant Android>"
```

Ils seront pris en compte au **prochain APK** (aucun déploiement serveur).

## Plus tard : l'application publiée

L'application publiée (`com.dinerox.app`) sera signée par Google Play avec une
autre clé. Il faudra un **second client Android** avec le paquet `com.dinerox.app`
et le SHA-1 affiché dans la Play Console › **Intégrité de l'application** ›
**Certificat de la clé de signature de l'application**.

## Si ça ne marche pas au test sur téléphone

- « Accès bloqué » / « application non vérifiée » : l'adresse du testeur n'est pas
  dans **Utilisateurs test** (étape 2.4).
- Erreur 10 / `DEVELOPER_ERROR` : le paquet ou le SHA-1 du client Android ne
  correspond pas à l'APK installé.
