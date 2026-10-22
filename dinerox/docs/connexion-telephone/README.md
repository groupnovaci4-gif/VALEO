# Connexion par téléphone — étude et maquettes (en attente de validation)

Branche `connexion-telephone`, créée depuis `design-pro` le 22/10/2026. **Documents seulement** :
aucune ligne de code de l'application ni des Cloud Functions, aucun compte Meta / Twilio / autre,
aucune clé, aucun déploiement, aucune APK.

| Fichier | Contenu |
|---|---|
| `DECISIONS.md` | Décision du fondateur (recopiée à l'identique de `claude/admiring-ritchie-h611hm`) |
| `ETAT-DES-LIEUX.md` | B1 — inscription, connexion, mot de passe oublié, code PIN local, comptes multiples, déconnexion ; fichiers concernés |
| `PROPOSITION.md` | B2 — comparaison Meta WhatsApp / Twilio Verify / Firebase Phone Auth (prix sourcés), schéma retenu, protections, comptes e-mail, code PIN, coûts à 1 000 / 10 000 / 100 000 utilisateurs, étapes futures |
| `maquettes/connexion.html` | B3 — les 8 écrans + 4 erreurs, direction B (`?t=light` ou `?t=dark`) |
| `maquettes/png/` | chaque écran en clair et en sombre (360 × 800 dp, 2 px par dp) + `planche-clair.png`, `planche-sombre.png` |
| `maquettes/TEXTES.md` | tous les textes PROPOSÉS, FR + EN, à valider |

Maquettes dessinées en HTML (polices Inter et Plus Jakarta Sans, icônes au trait dessinées dans le
fichier), sans aucune image générée par IA ni logo de marque.

Prochaine étape : **validation du fondateur** (maquettes, textes, fournisseur, code PIN).
