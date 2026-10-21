# Logos des opérateurs : fichiers trouvés, À VALIDER (2026-10-21)

Rien n'est intégré : la planche montre la pastille de repli (`icones/operateurs.json`, `logo: null`)
tant que le fondateur n'a pas validé un fichier. Fichiers copiés **tels quels** (ni recoloration ni
recadrage). Aperçu : `index.html` dans ce dossier (fond clair et fond sombre).

**Aucun des opérateurs ne publie de kit de presse ou de page de marque** trouvable (recherches
web + pages « presse », « media », « brand » des sites) : les fichiers ci-dessous sont ceux que
les sites officiels affichent eux-mêmes.

| Fichier | Opérateur | Source officielle (page → fichier) | Format | Conforme ? |
|---|---|---|---|---|
| `orange-money_developer-orange-com.jpg` | Orange Money | https://developer.orange.com/resources/orange-apis-for-the-middle-east-africa/ → https://developer.orange.com/od-uploads/orange-money-logo-300x255.jpg | JPG 300 × 255, fond gris foncé (pas transparent) | ⚠️ 255 px de haut (< 256), fond opaque, compression JPG |
| `orange_orange-ci.svg` | Orange (marque mère) | https://www.orange.ci/ → https://www.orange.ci/particuliers/resources/img/master-logo.svg | SVG vectoriel | ⚠️ logo **Orange**, pas **Orange Money** |
| `mtn_mtn-ci.svg` | MTN | https://www.mtn.ci/ → https://www.mtn.ci/wp-content/uploads/2023/01/mtn-logo.svg | SVG vectoriel, ovale noir sans fond | ⚠️ logo **MTN**, pas **MoMo** ; prévu pour être posé sur le jaune MTN |
| `mtn-momo-icone_mtn-ci.png` | MTN MoMo | https://www.mtn.ci/momo/ → https://www.mtn.ci/wp-content/uploads/2023/02/icone-momo.png | PNG 50 × 50 | ❌ trop petit (50 px) |
| `wave-icone_wave-com.png` | Wave | https://www.wave.com/fr/ → https://www.wave.com/img/favicon.png | PNG 192 × 192, transparent | ⚠️ 192 px (< 256) ; c'est l'icône de l'application (le pingouin) |
| `wave-logo_wave-com.png` | Wave | https://www.wave.com/fr/ → https://www.wave.com/img/nav-logo.png | PNG 230 × 101 | ❌ trop petit, et horizontal (icône + « wave ») |
| `moov-africa_moov-africa-ci.png` | Moov Africa | https://www.moov-africa.ci/moov-money/ → https://www.moov-africa.ci/wp-content/uploads/2025/08/LOGO-MOOV-AFRICA_Plan-de-travail-1.png | PNG 2560 × 1468, transparent | ⚠️ logo **Moov Africa**, pas **Moov Money** ; texte BLANC (prévu pour fond foncé), horizontal |
| `airtel_airtel-africa.png` | Airtel | https://www.airtel.africa/airtel-money → https://www.airtel.africa/sites/default/files/airtel-logo_0.png | PNG 272 × 70 | ⚠️ logo **Airtel**, pas **Airtel Money** ; horizontal, 70 px de haut |
| — | Free Money | https://www.free.sn/ injoignable le 2026-10-21 (aucune réponse en HTTPS, erreur 502 en HTTP) | — | ❌ rien trouvé |

Empreintes SHA-256 (16 premiers caractères) : airtel `20eb1e3478b28c9e`, moov `0e8cac3decddb122`,
mtn-momo `1c99f400849a0b21`, mtn `1a00dfd52f105389`, orange-money `a80099ddca620be9`,
orange `d5a5bf13bc8f3588`, wave-icone `4dd4a6945b2e8b00`, wave-logo `911648cd4698fd04`.

## Conséquence

Aucun fichier ne remplit TOUTES tes conditions (site officiel + page de marque ou de presse +
≥ 256 px + logo du service Mobile Money lui-même). Solutions, à ton choix :

1. **Demander les fichiers aux opérateurs** (service presse / marque), en même temps que
   l'autorisation écrite qu'il faut obtenir de toute façon (`docs/design-pro/licences.md`). C'est
   la seule voie qui donne à coup sûr le bon logo, au bon format.
2. **Accepter certains fichiers ci-dessus** malgré leurs défauts (par exemple Wave 192 px :
   suffisant pour 48 dp en 3x = 144 px).
3. Autre source (par exemple l'icône publiée par l'opérateur sur sa fiche Google Play, 512 px) :
   ce n'est PAS le site officiel, donc seulement avec ton accord explicite.

En attendant : pastille aux couleurs de l'opérateur (initiales + couleur), réglable par opérateur
dans `icones/operateurs.json`.
