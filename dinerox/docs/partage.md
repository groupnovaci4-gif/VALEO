# Partage (croissance, étape 2)

Statut : `docs/suivi-croissance.md`.

## Règles (fondateur, 2026-10-14)

- L'application **n'envoie jamais rien d'elle-même** : elle ouvre WhatsApp (ou
  WhatsApp Business, même schéma `whatsapp://`) avec un message PRÉREMPLI que
  la personne peut modifier ; si WhatsApp est absent, la feuille de partage du
  téléphone s'ouvre (jamais un échec muet).
- **Jamais** de montant, de solde, de nom ni de prénom dans un message ou une
  image préremplis (`containsAmount`, tests sur tous les modèles FR/EN).
- Le lien porte la source du canal (`src=whatsapp`, `share`, `copy`) pour l'étape 5.
- Événement `share_clicked` : `{context, channel}` uniquement
  (`invite` | `trophy` | `tontine` ; `whatsapp` | `system` | `copy`).

## Où

| Endroit | Ce qui est partagé |
|---|---|
| Inviter des amis | « Partager sur WhatsApp » : `ref.shareMessage` + lien `src=whatsapp` ; « Partager » et « Copier » restent |
| Célébration d'une récompense, écran Récompenses | « Partager mon trophée » → écran `/share-trophy` : la personne voit la carte (badge, nom du trophée, « Nouveau trophée sur {app} 🏆 », lien court `dinerox.app/i/CODE`, code d'invitation) puis la partage en image PNG (feuille de partage). Seul un trophée obtenu est partageable. |
| Menu Plus | « Suivre {app} sur WhatsApp » : adresse publiée par l'admin dans `config/app/items/links › whatsappChannelUrl` (https://whatsapp.com/channel/… uniquement) ; ligne cachée sinon |
| Tontine partagée | composant prêt, branché à l'étape 3 |

Le « défi 30 jours » n'existe pas dans l'application : rien à brancher.

## Technique

- `src/core/share.ts` (pur) ; `src/features/share/ShareWhatsAppButton.tsx`
  (bouton unique et `shareTextViaWhatsApp`) ; `src/app/share-trophy.tsx` ;
  `src/services/appLinks.ts`.
- Image : `react-native-view-shot` 5.1.0 (version déclarée par Expo SDK 57) ;
  partage du fichier par `expo-sharing`.
- Visibilité de WhatsApp : `plugins/withWhatsAppQueries.js` (Android : paquets
  `com.whatsapp`, `com.whatsapp.w4b` et schéma `whatsapp` — jamais
  QUERY_ALL_PACKAGES) ; iPhone : `LSApplicationQueriesSchemes: ['whatsapp']`.
  Nouveau build natif nécessaire.

## Tests

`tests/share.test.ts` (unitaires, plugin compris) et `e2e/share.js` (web :
WhatsApp et la feuille de partage sont interceptés, rien ne part).
À vérifier sur téléphone : ouverture réelle de WhatsApp / WhatsApp Business,
repli quand WhatsApp est absent, image partagée en statut ou discussion.
