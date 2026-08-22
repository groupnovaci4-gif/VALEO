# VALEO — Politique de protection des données (conservation, minimisation, consentement)

_Modèle à adapter et à valider juridiquement._

## 1. Principes
- **Minimisation** : ne collecter que les données nécessaires à la gestion de la coopérative.
- **Finalité** : usage limité à l'achat/pesée, aux paiements, aux avances et au suivi des planteurs.
- **Sécurité** : voir le document d'architecture de sécurité (chiffrement en transit et au repos sur l'appareil, isolation par coopérative, journal d'audit).

## 2. Données collectées et finalités
| Donnée | Finalité | Base |
|---|---|---|
| Nom, téléphone, pièce d'identité (planteur) | Identification, paiements, reçus | Exécution de la relation coopérative |
| Cultures, superficies, village | Suivi de production | Intérêt légitime / relation |
| Coordonnées Mobile Money | Versement des paiements | Consentement / exécution |
| Pesées, montants, avances, soldes | Gestion financière | Exécution / obligation comptable |
| Compte (e-mail, code haché) | Authentification | Sécurité |

## 3. Minimisation
- Le formulaire de création de coopérative ne demande que le strict minimum (responsable + e-mail + mot de passe) ; les informations complémentaires sont facultatives et complétées ultérieurement.
- Éviter toute collecte de données sensibles non nécessaires (santé, biométrie serveur, etc.). La biométrie éventuelle reste **locale à l'appareil** (déverrouillage), non transmise au serveur.

## 4. Consentement
- Informer le planteur, lors de son enregistrement par la coopérative, de :
  - l'identité du responsable de traitement (la coopérative) ;
  - les données collectées et leurs finalités ;
  - ses droits (accès, rectification, effacement, opposition) ;
  - la durée de conservation.
- Recueillir un **consentement** (ou une autre base légale documentée) pour l'usage des coordonnées Mobile Money et l'envoi de reçus (ex. via WhatsApp).
- Prévoir un support d'information (mention affichée / formulaire papier signé) adapté au public.

## 5. Durée de conservation
| Catégorie | Durée recommandée |
|---|---|
| Données de campagne (pesées, paiements) | Durée de la relation + durée légale comptable applicable |
| Avances / soldes | Jusqu'au remboursement complet + durée légale |
| Comptes inactifs (planteur/membre) | Anonymisation ou suppression après période d'inactivité définie (ex. 24 mois) |
| Journal d'audit | Conservation prolongée (traçabilité), puis purge définie |

## 6. Droits des personnes et suppression sécurisée
- **Accès / rectification** : via la coopérative (Patron) qui peut modifier la fiche planteur.
- **Effacement** : la suppression d'un planteur retire sa fiche, ses collectes et ses avances. Prévoir une suppression **définitive** côté base (et non un simple masquage) lorsque requis.
- **Sauvegardes** : la suppression doit être propagée aux sauvegardes selon le cycle de rétention.

## 7. Sous-traitants / hébergement
- Hébergement managé (backend + base). Vérifier les engagements du prestataire sur : localisation des données, chiffrement au repos, sauvegardes, et clauses de protection des données.

## 8. Points à finaliser (organisationnel)
- Désigner un responsable de traitement et, le cas échéant, un délégué à la protection des données.
- Formaliser les mentions d'information et le recueil de consentement.
- Confirmer la conformité à la réglementation locale (Côte d'Ivoire — ARTCI / loi n°2013-450).
