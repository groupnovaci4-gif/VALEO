# Proposition I1 — l'audio de la dictée reste sur le téléphone par défaut

Statut : 🟧 **acceptée par le fondateur (2026-10-15), textes tels quels ; codée sur la branche `voix-i1`** (`core/entry/voicePrivacy.ts`, `tests/voice-privacy.test.ts`, `e2e/voice-consent.js`). Paragraphe de la politique de confidentialité : en attente de validation.

## Aujourd'hui (constaté dans le code)

- La dictée utilise la reconnaissance vocale du téléphone (`expo-speech-recognition`,
  `src/services/speechInput.ts`). DineroX n'envoie jamais l'audio à ses serveurs.
- Mais le service de reconnaissance du téléphone (Google sur Android, Apple sur
  iPhone) peut, lui, envoyer l'audio à ses propres serveurs : c'est le cas par défaut.
- Un réglage existe déjà : « Reconnaissance uniquement sur le téléphone »
  (`EntryPrefs.onDeviceOnly`, Réglages › Notifications et voix). Il est **désactivé
  par défaut** (`src/core/entry/prefs.ts`) et n'apparaît que si le téléphone le permet
  (`supportsOnDevice()`).

## Proposition

1. **Par défaut, sur l'appareil seulement** quand c'est possible : le téléphone sait
   reconnaître sur l'appareil **et** le français (ou l'anglais choisi) y est installé.
2. **Sinon**, une seule fois, avant la première dictée : une demande d'accord claire.
   - « Oui » : la dictée utilise le service du téléphone (comme aujourd'hui).
   - « Non » : le micro n'est pas proposé ; la saisie au clavier et la phrase écrite
     restent disponibles. Le choix se change dans les réglages.
3. Le réglage existant reste, et la personne garde la main.
4. Les personnes qui ont déjà dicté (avant la mise à jour) voient la demande une fois,
   sauf si leur téléphone passe en « sur l'appareil seulement ».

## Téléphones qui ne le permettront pas

D'après la documentation de la bibliothèque et des systèmes (**à confirmer pendant le
test sur téléphone**, pas encore vérifié sur un appareil) :
- **Android 12 et moins** : pas de reconnaissance « sur l'appareil seulement » exposée
  aux applications.
- **Huawei et autres téléphones sans services Google** : pas de service Google de
  reconnaissance ; souvent aucune dictée du tout.
- **Android 13 et plus sans le pack de langue français téléchargé** : la reconnaissance
  sur l'appareil échoue tant que le pack n'est pas installé (Réglages du téléphone ›
  Saisie vocale Google › Reconnaissance vocale hors connexion).
- **iPhone** : possible pour le français sur les versions récentes d'iOS ; à vérifier.

Pour l'Afrique de l'Ouest, une part importante des téléphones d'entrée de gamme est
sous Android 12 ou moins : beaucoup de personnes verraient donc la demande d'accord.

## Textes proposés (à valider, aucun n'est dans l'application)

Demande d'accord (une fois) :
- Titre : « Dicter avec le service de votre téléphone ? »
- Texte : « Votre téléphone ne sait pas reconnaître la voix sans connexion. Pour dicter,
  il envoie le son à son service de reconnaissance (Google ou Apple). DineroX ne reçoit
  jamais ce son. »
- Boutons : « Oui, dicter » · « Non, je tape »

Si le pack de langue manque (Android 13 et plus) :
- « Pour dicter sans envoyer le son, téléchargez le français dans la saisie vocale de
  votre téléphone. » · bouton « Utiliser le service du téléphone » · « Plus tard »

Réglage (sous-titre modifié) :
- « Reconnaissance uniquement sur le téléphone » — « Aucun son ne quitte le téléphone.
  Activé quand votre téléphone le permet. »

## Ce que demanderait la réalisation (après accord)

- Valeur par défaut calculée (`onDeviceOnly` = possible ?) au lieu de `false`, et un
  accord mémorisé (nouveau champ des préférences de saisie).
- Contrôle du pack de langue installé avant d'ouvrir le micro.
- Textes FR et EN, tests purs de la décision, parcours e2e de la demande d'accord.
- Mise à jour de la politique de confidentialité (paragraphe voix).
- Rien sur le serveur : uniquement dans l'APK.
