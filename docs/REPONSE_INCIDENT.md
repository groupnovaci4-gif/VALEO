# VALEO — Procédure de réponse à incident de sécurité

_Modèle à adapter et à valider par la direction de la coopérative / l'éditeur._

## 1. Objectif
Détecter, contenir, corriger et notifier tout incident de sécurité (fuite, accès non autorisé, perte/altération de données, compromission de compte) affectant les données personnelles ou financières de VALEO.

## 2. Rôles
- **Responsable incident** (par défaut : Patron / éditeur) : coordonne la réponse.
- **Contact technique** : applique les mesures techniques (rotation de secrets, redéploiement).
- **Contact juridique / conformité** : gère les notifications réglementaires.

## 3. Classification de gravité
| Niveau | Exemple | Délai de prise en charge |
|---|---|---|
| Critique | Fuite de données personnelles/financières, base exposée | Immédiat (< 1 h) |
| Élevé | Compromission d'un compte Patron, accès inter-coopératives | < 4 h |
| Moyen | Tentatives répétées de force brute, anomalie d'accès | < 24 h |
| Faible | Vulnérabilité sans exploitation connue | < 72 h |

## 4. Étapes de réponse
1. **Détection & enregistrement** : consigner date/heure, périmètre, données concernées (s'appuyer sur le **journal d'audit** et les logs backend).
2. **Confinement** :
   - Révoquer/rotationner le `JWT_SECRET` (invalide tous les jetons → reconnexion requise).
   - Réinitialiser les mots de passe/comptes compromis.
   - Si nécessaire, couper temporairement l'accès à l'API.
3. **Éradication** : corriger la faille (correctif code), redéployer backend + application.
4. **Récupération** : restaurer depuis une sauvegarde saine si intégrité compromise ; vérifier le bon fonctionnement.
5. **Notification** (voir §5).
6. **Post-mortem** : cause racine, mesures correctives durables, mise à jour de ce document.

## 5. Notification en cas de fuite de données
- **Délai cible de notification** : dans les **72 heures** suivant la prise de connaissance de la violation, aux personnes/autorités concernées (aligné sur les bonnes pratiques type RGPD ; à adapter à la réglementation ivoirienne applicable — ARTCI / loi n°2013-450 sur la protection des données à caractère personnel).
- **Contenu de la notification** : nature de la violation, catégories et volume approximatif de données/personnes concernées, conséquences probables, mesures prises et recommandations.
- **Destinataires** : autorité de protection des données compétente + coopératives / planteurs affectés.

## 6. Coordonnées (à compléter)
- Responsable incident : __________ (tél / e-mail)
- Contact technique : __________
- Autorité de protection des données : __________

## 7. Journalisation
Tout incident et toutes les actions entreprises doivent être consignés (registre des incidents), avec horodatage et responsable.
