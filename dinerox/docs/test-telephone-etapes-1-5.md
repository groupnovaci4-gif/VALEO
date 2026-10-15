# Test sur téléphone — étapes 1 à 5 et correctif « argent mis de côté »

Un seul test, avec le nouvel APK (version `staging`, construit depuis `dinerox-main`).
Pour chaque point : cocher **OK** ou **Pas OK**, et noter ce que vous avez vu.

## Ce qu'il faut

- **3 téléphones Android** : A (Awa), B (Kofi), C (Fatou).
  Le parrainage refuse deux comptes du même téléphone ; la tontine partagée demande 3 personnes.
- **Le téléphone d'un testeur qui a déjà l'appli** (pour la mise à jour, point 0).
- **Votre compte admin** (pour l'écran « Origine des inscriptions »).
- Avant de commencer : passer le compte de A en formule **Plus** depuis le back-office
  (il faut Plus pour créer une tontine partagée ; la rejoindre reste gratuit).

**Comptes créés pendant le test** (ils comptent dans l'écran admin, point 5) :
A, B, C, puis D (« seulement Épargne », point E2) et E (« jamais renseigné », point E3) = **5 inscriptions**.

**Pas encore testable** (ne pas le compter comme un échec) :
- les liens `dinerox.app/i/…`, `/t/…`, `/a?…` : le domaine `dinerox.app` n'est pas encore branché ;
- l'arrivée depuis Google Play (referrer), la vraie fenêtre d'avis de Google, la ligne
  « Donner mon avis » : l'application n'est pas encore sur le Play Store ;
- la chaîne WhatsApp : pas encore d'adresse.

---

## 0. Mise à jour et connexion

**0.1 Mise à jour par-dessus l'ancienne version.** Sur le téléphone d'un testeur qui a déjà
l'appli : installer le nouvel APK **sans désinstaller**. L'appli s'ouvre, toutes ses données
sont là (opérations, comptes, objectifs, tontines, réglages, code PIN).
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**0.2 Connexion avec Google.** Sur un téléphone, se déconnecter, puis « Continuer avec Google ».
La connexion aboutit et ouvre le bon compte.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## 1. Parrainage

**1.1** A ouvre « Inviter des amis » : son code s'affiche.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**1.2** B s'inscrit en **tapant** le code de A (« Vous avez un code d'invitation ? »).
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**1.3** B voit « Votre semaine DineroX » ; A voit B dans ses filleuls (en cours).
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## 2. Partage WhatsApp

**2.1** A : « Partager sur WhatsApp » ouvre WhatsApp avec le message prérempli et le lien.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**2.2** A partage un trophée obtenu : l'image ne montre ni nom ni montant.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## 3. Tontine partagée (A organise ; B et C rejoignent)

**3.1** A crée la tontine partagée ; la mention « l'application ne collecte ni ne transfère d'argent » s'affiche ; A envoie le code à B et C.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**3.2** B et C demandent à rejoindre en **tapant** le code ; A valide chaque demande.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**3.3** A fait le tirage (une seule fois) et désigne un trésorier.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**3.4** B : « J'ai payé » → « Payer depuis » propose ses comptes ; le trésorier confirme ; tous voient « Payé ».
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**3.5** Statuts : chacun voit payé / pas encore ; « en retard » seulement chez l'organisateur, le trésorier et la personne concernée.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**3.6** C quitte la tontine.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## 4. Demande d'avis

**4.1** B atteint un objectif, ferme « Félicitations », revient à l'Accueil : rien ne s'affiche
(normal hors Play Store), rien ne plante, rien ne gêne la saisie.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**4.2** Menu Plus : la ligne « Donner mon avis sur DineroX » n'apparaît pas.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## 5. Origine des inscriptions (votre compte admin, à la fin, après D et E)

**5.1** Plus › Administration › « Origine des inscriptions », période « Ce mois-ci ». Vous devez voir
**exactement** (selon le code) :
- « Comptées depuis le … » : le jour de la première inscription comptée (le jour du test) ;
- **Inscriptions : 5** (A, B, C, D, E) — **+1 pour chaque compte DÉJÀ existant mais créé il y a
  moins de 7 jours** qui s'ouvre avec le nouvel APK (le testeur du point 0.1, votre propre compte…) :
  il est compté une fois, à sa première ouverture, en « Origine inconnue » ;
- **Dont venues d'un lien d'invitation : Moins de 5** (un code TAPÉ n'est pas un lien) ;
- **Origine inconnue : le même nombre** (5 ou plus) — APK installé directement, sans lien suivi ;
- **aucune** section « Par source », « Par campagne », « Par contenu » ;
- **aucun nom, aucune adresse, aucune liste de personnes**.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**5.2** « Créer un lien de campagne » : choisir une source, taper `test` en campagne ; les deux liens
s'affichent ; « Copier » copie le lien.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## E. Correctif « argent mis de côté »

**E1 — Le scénario de la testeuse** (sur C, à l'inscription complète) : revenu **100 000**,
compte Épargne avec **60 000**.
- Sous les soldes des comptes, la phrase : « Indiquez seulement l'argent que vous pouvez dépenser.
  Votre épargne se note à part, sur le compte Épargne. »
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Accueil : le reste par jour est calculé sur **40 000** (« Comment c'est calculé ? »).
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Dépenses par montant rapide, phrase, voix et formulaire : toutes partent d'**Espèces**,
  jamais de l'épargne ; l'épargne reste à 60 000.
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Phrase « loyer 10 000 avec l'épargne » : dépense sur Espèces et message « L'épargne ne paie pas
  directement une dépense… » ; en fermant la feuille, le bouton « Retirer de mon épargne ou d'un objectif ».
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Carnet de tontine : « J'ai cotisé » → « Payer depuis » : une cotisation depuis **Espèces**
  (le disponible baisse), une depuis l'**épargne** (le disponible ne bouge pas, l'épargne baisse),
  une depuis un **objectif** (le disponible ne bouge pas, l'objectif baisse).
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Réserve famille : une dépense « Cérémonies » prise sur la réserve, comme avant.
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
- Une grosse dépense qui fait passer le disponible sous zéro : « Votre argent disponible est passé
  sous zéro : il manque … » ; sur l'Accueil, la carte « Plus d'argent disponible » ; le bouton mène à
  « D'où voulez-vous retirer … ? », puis au retrait prérempli. La carte reste tant que le disponible
  est à zéro ou moins.
  - [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**E2 — Seulement « Épargne » cochée** (compte D, nouvelle inscription complète) : un compte
« Espèces » est créé en plus ; une dépense part d'Espèces.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**E3 — Jamais renseigné son argent** (compte E, inscription avec « Plus tard », aucun solde ni revenu) :
une dépense → **aucun** message « il manque », **aucune** carte sur l'Accueil.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

## V. Voix : le son reste sur le téléphone (I1)

**V1 — Téléphone récent avec le français téléchargé** (Android 13 ou plus ; Réglages du téléphone ›
Saisie vocale Google › Reconnaissance vocale hors connexion › Français installé). Première dictée :
**aucune** demande d'accord, l'enregistrement démarre ; sous le micro : « Reconnaissance sur le
téléphone. L'audio n'est jamais enregistré. » Activer le mode avion : la dictée marche encore.
- [ ] OK  [ ] Pas OK — Modèle et version d'Android : ____________ Ce que j'ai vu : ____________

**V2 — La demande d'accord** (téléphone sans reconnaissance hors connexion : Android 12 ou moins,
ou français non téléchargé). Première dictée : « Dicter avec le service de votre téléphone ? »
avec « Oui, dicter » et « Non, je tape » (ou, sur Android 13+ sans le français : « Pour dicter sans
envoyer le son, téléchargez le français… » avec « Utiliser le service du téléphone » et « Plus tard »).
« Oui, dicter » : l'enregistrement démarre ; la dictée suivante ne redemande pas.
- [ ] OK  [ ] Pas OK — Modèle et version d'Android : ____________ Ce que j'ai vu : ____________

**V3 — Le refus « Non, je tape »** (sur un autre compte ou après réinstallation, téléphone de V2) :
le clavier s'ouvre ; le micro n'est plus proposé (bulle de l'accueil, onglet « Parler », assistant,
« Tester le micro ») ; le bouton central devient « Saisir une opération ». Réglages › Notifications ›
Méthode « Parler » : la question revient à la dictée suivante.
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________

**V4 — Aucun fichier temporaire de la dictée ne reste** (Android 13 ou plus). Faire 3 ou 4 dictées,
puis vérifier qu'aucun fichier `temp_….pcm` ne reste dans le cache de l'application.
L'APK `staging` n'est pas « débogable » : son cache ne se lit ni depuis le téléphone ni par câble.
Ce contrôle demande un APK de contrôle débogable, branché au Mac, vérifié par Claude avec
`adb shell run-as <paquet> ls cache` (avant les dictées, après, puis après un redémarrage de l'appli).
- [ ] OK  [ ] Pas OK — Ce que j'ai vu : ____________________
