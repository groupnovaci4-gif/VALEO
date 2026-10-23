# Audit de sécurité et de régression — 23 octobre 2026

Périmètre : branche `design-pro` (refonte du design, celle de la future APK de test) et branche
`connexion-telephone` (design-pro + connexion par numéro, fournisseurs simulés).
Référence : `dinerox-main` (production 1.6.0, photo du 20/10).
Méthode : trois revues indépendantes en lecture seule (sécurité de la connexion ; comptes,
session et confidentialité ; régressions du design), puis vérification par l'assistant du
fondateur des constats principaux directement dans le code.

**Rien de tout cela n'est en production** : la refonte et la nouvelle connexion ne sont ni
déployées ni dans une APK. Aucune donnée réelle n'a été exposée.

## Contrôles rapides (tous bons)

- Aucun correctif de production perdu : les branches `correction-defilement`,
  `correction-disponible`, `correctif-ecrans`, `correctif-epargne`, `corrections-audit`,
  `audit-avant-apk` sont toutes incluses dans `design-pro`.
- Aucune clé de texte supprimée (1 741 → 1 862) ; aucun fichier de test supprimé.
- `src/core` : seulement `demo.ts` (Canal+ = sous-catégorie streaming, données de démonstration)
  et `ai/summary.ts` (correctif « Argent disponible » du 21/10), tous deux antérieurs à la refonte.
- Secrets : aucun secret commité ; `.secret.local` ignoré ; jeton App Check de test limité aux
  émulateurs ; fournisseur simulé inaccessible en production.
- Règles Firestore : les 6 nouvelles collections sont fermées au client ; aucun accès ouvert.
- Règle 16 (session), règle 13 (champs qui clignotent), règle 17 (« Écouter » hors zone
  cliquable), textes via `t()` : respectés.

## A. Régressions de la refonte (branche design-pro → concernent l'APK de test)

| N° | Gravité | Constat (vérifié) | Correctif |
|---|---|---|---|
| R1 | Moyenne | Impossible de créer une 2ᵉ réserve : l'onglet Objectifs ne propose la création que s'il n'y en a aucune (`goals.tsx:252`) ; avant, « Ajouter » existait | Lien « Ajouter » quand une réserve existe et que la formule le permet |
| R2 | Moyenne | Un message lu ne revient plus quand sa situation change (identifiants stables : analyse, rythme d'objectif, paiement régulier…) — contraire à E2 | Mémoriser « lu » par identifiant + empreinte du texte affiché |
| R3 | Moyenne | Mémoire « lu » par compte mais pas par espace (Privé / Famille) | Préfixer par l'espace actif |
| R4 | Moyenne | « M'expliquer ce conseil (IA) » (formules payantes) disparaît dès que le conseil est lu | Le remettre sur le conseil dans l'écran Notifications |
| R5 | Basse | Provenance (« Vos données / Estimation », règle 11) perdue sur « Votre analyse » | Afficher l'étiquette de provenance |
| R6 | Moyenne | Lenteur : les calculs du coach sont refaits plusieurs fois par écran (cloche + liste) | Un seul calcul partagé |
| R7 | Basse | Informations disparues : objectif en retard plus signalé sur sa vignette ; date du moment fort ; phrase « Demandez à un parent… » chez l'enfant | Les rétablir |
| R8 | Basse | Plus de bouton visible pour saisir au clavier sur l'Accueil (seulement l'appui long caché) | Petit lien « Saisir une opération » sous les tuiles (décision D1) |
| R9 | Basse | Ajustement de solde positif affiché sans « + » | Rétablir le signe |
| R10 | Basse | Zones de toucher sous 48 dp (onglets du Budget, « Nouveau », « Mis de côté ») | 48 dp |
| R11 | Basse | Mode sombre : chiffre blanc sur pastille rose de la cloche peu lisible | Contraste ≥ 4,5:1 |
| R12 | Plausible | Course au chargement de la mémoire « lu » : un message fermé peut réapparaître | Un seul chargement par compte |
| R13 | Plausible | « Écouter » interrompu (appel, voix lente) compte quand même comme lu | Lu seulement à la vraie fin de la lecture |
| T1 | — | Tests affaiblis pendant la refonte (`coach-open`, `coach-advice`, `lot-a-home`) et aucun test de 2ᵉ réserve | Rétablir des vérifications strictes |

## B. Sécurité de la connexion par téléphone (branche connexion-telephone)

| N° | Gravité | Constat (vérifié) | Correctif |
|---|---|---|---|
| S1 | Haute | « Ajouter mon numéro » : quelqu'un qui tient quelques minutes un téléphone déverrouillé relie SON numéro et garde un accès permanent au compte ; aucune alerte au premier ajout | Connexion récente exigée (< 5 min) ; refus si un numéro existe déjà, sauf code secret actuel ; alerte toujours envoyée |
| S2 | Haute | Supprimer son compte n'efface pas les données de connexion par téléphone : l'ancien code secret recrée un compte « fantôme » avec le même identifiant ; un numéro recyclé en hérite | Effacer ces données à la suppression ; refuser si le compte n'existe plus |
| S3 | Moyenne | Un inconnu peut bloquer durablement un utilisateur précis (5 mauvais codes + 5 envois par jour) et lui faire envoyer des WhatsApp | Compteur séparé pour un appareil déjà connu |
| S4 | Moyenne | Abus de coûts : la limite par appareil se contourne ; WhatsApp n'a pas de liste de pays ; le plafond global, une fois atteint, bloque tout le monde | Liste de pays aussi pour WhatsApp ; jeton App Check à usage unique ; quotas par préfixe et par canal |
| S5 | Moyenne | Numéro en clair conservé sans limite dans les demandes de code | L'effacer après usage + suppression automatique |
| S6 | Moyenne | Un numéro déjà posé dans Firebase Auth autrement (console, ajout interrompu) ouvre ce compte sans alerte | Refuser (« numéro déjà relié ») |
| S7 | Moyenne | Téléphone partagé : le numéro du compte précédent reste affiché à la personne suivante | L'oublier à la déconnexion et à la suppression |
| S8 | Moyenne | Compte suspendu : message générique au lieu de « Ce compte est suspendu… » ; « code oublié » change quand même le code | Refus côté serveur + bon message |
| S9 | Moyenne | « S'inscrire » sur un numéro déjà inscrit remplace le code secret sans prévenir | « Ce numéro a déjà un compte » : Se connecter / Code secret oublié |
| S10 | Basse | Un compte administrateur peut être relié à un numéro (exposé au vol de carte SIM) | Refuser pour les administrateurs |
| S11 | Basse | Ordre risqué dans « Ajouter mon numéro » ; temps de réponse légèrement différent si le numéro existe | Corriger l'ordre ; même lecture dans tous les cas |

## C. Comptes créés par numéro (sans e-mail) — à régler avant l'activation

| N° | Constat | Correctif |
|---|---|---|
| C1 | Back-office : recherche et suppression impossibles pour un compte sans e-mail | Recherche par numéro ; suppression confirmée par identifiant |
| C2 | Réglages › Sécurité propose « Changer le mot de passe » (inutile) et rien pour changer son code secret ; l'alerte y renvoie | Masquer le mot de passe sans e-mail ; « Changer mon code secret » via le parcours « code oublié » (décision D2) |
| C3 | Espace famille : les invitations se font par e-mail, un compte par numéro ne peut pas rejoindre une famille | Décision D3 (plus tard, avant activation) |
| C4 | Inscription par numéro : pas de liens vers les CGU / confidentialité, pas de champ code d'invitation, pas d'événement d'inscription | Ajouter les liens, le champ et l'événement (mêmes textes que l'inscription e-mail) |
| C5 | APK faite depuis connexion-telephone avant l'activation : les boutons de l'accueil échoueraient | Interrupteur à distance : boutons « numéro » affichés seulement si activés |

## Décisions demandées au fondateur

- **D1** : remettre un petit lien « Saisir une opération » (clavier) sous les tuiles de l'Accueil — *recommandé*.
- **D2** : « Changer mon code secret » dans Réglages › Sécurité, en réutilisant le parcours « code oublié » — *recommandé*.
- **D3** : invitations familiales pour les comptes par numéro — *à trancher avant l'activation*.
