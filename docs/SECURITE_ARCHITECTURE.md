# VALEO — Document d'architecture de sécurité

_Dernière mise à jour : juin 2026_

## 1. Vue d'ensemble
VALEO est une application mobile (Expo/React Native) adossée à un backend FastAPI + MongoDB, destinée à la gestion de coopératives agricoles (Côte d'Ivoire). Elle traite :
- des **données personnelles** : identité des planteurs, téléphone, pièce d'identité, coordonnées Mobile Money ;
- des **données financières** : pesées/achats, paiements, avances sur récolte, soldes.

## 2. Composants
| Couche | Techno | Rôle |
|---|---|---|
| Client mobile | Expo / React Native | Saisie terrain, mode hors-ligne, reçus PDF |
| API | FastAPI (Python) | Authentification, synchronisation, journal d'audit, admin web |
| Base de données | MongoDB | Persistance de l'état par coopérative |
| Transport | HTTPS/TLS (plateforme) | Chiffrement en transit |

## 3. Authentification (côté serveur)
- **Jetons JWT** signés (HS256) avec secret en variable d'environnement (`JWT_SECRET`), jamais dans le code.
- Claims : `sub` (id compte), `coopId`, `role`, `side` (`coop`/`planteur`), `exp`.
- **Flux de connexion** :
  - Patron : e-mail + mot de passe → `POST /api/auth/coop/login`
  - Membre (Magasinier / Pisteur-Délégué) : téléphone + code 6 chiffres → même endpoint (détection e-mail vs téléphone)
  - Planteur : téléphone + code 6 chiffres → `POST /api/auth/planteur/login`
  - Création de coopérative : `POST /api/auth/register` (nom responsable + e-mail + mot de passe)
- **Hachage des secrets** : PBKDF2-HMAC-SHA256 (sel aléatoire 16 octets, vérification à temps constant). Les identifiants existants sont vérifiés côté serveur sans réinitialisation ; les nouveaux sont hachés côté serveur.
- **Stockage du jeton sur l'appareil** : Keychain (iOS) / Keystore (Android) via SecureStore. Reconnexion automatique au démarrage. Expiration 30 jours (choix adapté au terrain hors-ligne).

## 4. Autorisation & isolation multi-tenant
- Toutes les routes de données (`GET/PUT /api/state`, `GET/POST /api/audit`) exigent un jeton valide (dépendance `require_user`, réponse 401 sinon).
- **Isolation stricte par coopérative** : le serveur ne renvoie que la tranche correspondant au `coopId` du jeton (`scope_state`) et n'accepte en écriture que cette même coopérative (`merge_state` force le `coopId` sur chaque enregistrement). ⇒ Protection **anti-IDOR** : impossible de lire/écrire les données d'une autre coopérative en modifiant un identifiant.
- Contrôle de rôle : le rôle est porté par le jeton (émis par le serveur) ; l'UI adapte l'espace affiché selon le rôle.

## 5. Protection des données
- **En transit** : HTTPS/TLS (fourni par la plateforme d'hébergement).
- **Au repos (appareil)** : le cache hors-ligne est chiffré en **AES** (crypto-js) ; la clé est générée aléatoirement (`expo-crypto`) et conservée dans le Keychain/Keystore, séparée des données chiffrées.
- **Au repos (base MongoDB)** : dépend de l'hébergement managé — **à confirmer/activer auprès du support Emergent** (chiffrement disque + sauvegardes).
- **Durcissement mobile** (build natif) : `allowBackup=false`, trafic en clair interdit (`usesCleartextTraffic=false`), permissions minimales (caméra uniquement).

## 6. Journal d'audit
- Collection `audit` (append-only). Chaque opération financière (pesée/paiement, solde du reste dû, avance accordée/refusée) est journalisée avec **acteur, rôle et horodatage posés par le serveur** (non falsifiables par le client).
- Consultation par le Patron dans l'espace « Coop → Journal d'audit ».

## 7. Administration web
- Tableau de bord `/api/admin` protégé par mot de passe (env `ADMIN_PASSWORD`) + JWT admin ; navigation cloisonnée par coopérative.

## 8. Limites connues / feuille de route
- ⏳ **Rate limiting** et **verrouillage anti-force-brute** côté serveur : à implémenter.
- ⏳ **Jetons courts + refresh + révocation / déconnexion à distance** : à implémenter (actuellement jeton long 30 j).
- ⏳ **OTP SMS** sur nouvel appareil : nécessite une intégration SMS.
- ⏳ **Chiffrement au repos MongoDB** : à confirmer côté infra managée.
- ⏳ **Test d'intrusion tiers** : à commander auprès d'un prestataire indépendant.
- ⏳ **Certificate pinning** : réalisable en build natif.

## 9. Gestion des secrets
- Secrets (JWT, mot de passe admin, URL Mongo) exclusivement en variables d'environnement, jamais dans le dépôt ni dans le code client.
