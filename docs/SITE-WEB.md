# Site public VALEO — `valeo-scoop.com`

Deux sites Firebase Hosting, dans un seul projet (`valeo-app-595db`) :

| Adresse | Cible | Dossier | Contenu |
|---|---|---|---|
| `valeo-scoop.com` (+ `www`) | `site` | `site/` | Le site public. Pages statiques |
| `app.valeo-scoop.com` | `app` | `frontend/dist` | L'application, avec renvoi `/api/**` vers Cloud Run |

**Pourquoi deux sites et non un seul ?** Le repli SPA d'expo-router (`source: "**"`)
attrape tout ce qui n'a pas déjà été servi. Mettre le site public derrière lui
le ferait disparaître au premier chemin inconnu.

---

## 1. Créer les deux sites (une seule fois)

Dans la console Firebase → **Hosting** → « Ajouter un autre site ».

Les identifiants de site sont **uniques sur tout Firebase** ; `valeo` sera
probablement déjà pris. Prenez ce que la console accepte, par exemple
`valeo-scoop` et `valeo-scoop-app`, et notez-les : c'est ce qui va dans les
commandes ci-dessous.

```
firebase login
firebase use valeo-app-595db

firebase target:apply hosting site valeo-scoop
firebase target:apply hosting app  valeo-scoop-app
```

Ces deux commandes écrivent dans `.firebaserc`, qui **reste sur votre machine**
(il n'est pas versionné). À refaire sur tout nouvel ordinateur.

---

## 2. Déployer

**Le site public seul** — c'est le cas courant, il n'y a rien à construire :

```
firebase deploy --only hosting:site
```

**L'application** — il faut d'abord la construire :

```
cd frontend && yarn build:web && cd ..
firebase deploy --only hosting:app
```

> ⚠️ Laissez `EXPO_PUBLIC_BACKEND_URL` **vide** pour la construction web.
> Sur le web l'API est à la même origine (invariant 31) ; y figer une URL
> absolue enverrait l'application vers un autre serveur.

---

## 3. Rattacher le domaine

### 3.1 Côté Firebase

Console Firebase → Hosting → site `valeo-scoop` → **Ajouter un domaine
personnalisé** → `valeo-scoop.com`, puis recommencer pour `www.valeo-scoop.com`
et, sur l'autre site, pour `app.valeo-scoop.com`.

Firebase donne alors, selon l'étape, **un enregistrement TXT** de vérification
puis **deux enregistrements A**.

### 3.2 Côté Cloudflare

DNS → Records. Créez ce que Firebase vous a donné :

| Type | Nom | Valeur | Proxy |
|---|---|---|---|
| TXT | `@` | la chaîne fournie par Firebase | — |
| A | `@` | 1ʳᵉ adresse fournie par Firebase | **DNS only** |
| A | `@` | 2ᵉ adresse fournie par Firebase | **DNS only** |
| A | `www` | les mêmes adresses | **DNS only** |
| A | `app` | celles du site application | **DNS only** |

> ### Le point qui fait perdre une journée
>
> **Le nuage doit être GRIS, pas orange.** Tant que le proxy Cloudflare est
> actif, Firebase ne peut pas valider le domaine ni émettre son certificat :
> la validation reste « en attente » sans expliquer pourquoi.
>
> Si vous activez le proxy plus tard pour profiter du cache Cloudflare, passez
> impérativement le mode SSL/TLS sur **Full (strict)**. En mode « Flexible »,
> Cloudflare parle en HTTP à Firebase qui redirige vers HTTPS : le navigateur
> boucle jusqu'à l'erreur. Sachez aussi que le renouvellement automatique du
> certificat Firebase peut échouer derrière le proxy.
>
> **Recommandation : laissez en DNS only.** Firebase Hosting a déjà son propre
> CDN mondial ; Cloudflare n'apporterait ici presque rien.

### 3.3 Attendre

La vérification prend quelques minutes, l'émission du certificat jusqu'à
24 heures. Tant qu'il n'est pas émis, le domaine répond en erreur de
certificat — c'est normal, ne changez rien pendant ce temps.

---

## 4. L'adresse e-mail

Le site et la politique de confidentialité renvoient à
**`contact@valeo-scoop.com`**. Cette adresse doit exister avant la mise en
ligne : une politique de confidentialité qui donne une adresse morte est un
motif de refus au Play Store.

Le plus simple, sur Cloudflare : **Email → Email Routing**, qui transfère
gratuitement `contact@valeo-scoop.com` vers votre boîte personnelle. Cela
ajoute des enregistrements MX automatiquement.

---

## 5. Mettre à jour le site

Les pages sont écrites à la main, sans build ni dépendance :

```
site/
  index.html            page d'accueil
  confidentialite.html  politique de confidentialité
  404.html
  styles.css            toute la mise en forme
  img/                  logos, 60 Ko en tout
```

Modifiez, puis `firebase deploy --only hosting:site`.

**Règle de conception à ne pas perdre de vue :** aucune ressource externe. Ni
police Google, ni framework, ni script de mesure d'audience. La page doit
s'ouvrir vite sur un téléphone d'entrée de gamme, en 3G. Chaque fichier ajouté
se paie chez le visiteur.

---

## 6. Ce qui reste à faire avant de communiquer dessus

- [ ] Créer `contact@valeo-scoop.com` (§4)
- [ ] Compléter la politique de confidentialité avec la **raison sociale
      exacte** et l'adresse postale de l'entité qui édite VALEO — aujourd'hui
      elle ne porte que « VALEO »
- [ ] Faire relire la politique par quelqu'un qui connaît le droit ivoirien des
      données personnelles. Elle est honnête et complète sur le plan technique,
      mais je ne suis pas juriste
- [ ] Décider si `app.valeo-scoop.com` doit être public ou rester interne le
      temps des essais

---

## 7. Conception du site (refonte du 30 septembre 2026)

### Ce qui a changé, et pourquoi

La première version portait toute l'information mais ressemblait à une page de
documentation : une seule image (le logo), aucune hiérarchie visuelle, et une
palette **turquoise qui ne figure nulle part dans la marque**. Les couleurs sont
désormais *relevées* sur `valeo-logo.png` par échantillonnage des pixels
opaques — vert forêt `#005010` et or `#E5A014` — et non plus choisies.

### Les images

| Fichier | Origine | Rôle |
|---|---|---|
| `img/cacao-{420,640,976}.{webp,jpg}` | `frontend/assets/images/cacao.png` | Photo du héros |
| `img/embleme.png` | Haut du logo, rogné à 50 % | Marque de l'en-tête |
| `img/logo-192.png` | Logo complet, quantifié | Pied de page |

Deux décisions à ne pas défaire :

- **La photo n'est jamais agrandie.** Le fichier source fait 976 px de large ;
  produire une variante 1600 px ajoutait 100 Ko sans ajouter un seul détail.
  Elle est donc utilisée dans un cadre où 976 px reste net, pas en pleine
  largeur.
- **L'en-tête ne porte que l'emblème, pas le logo entier.** Le logo est un
  écusson presque carré (2142 × 1822) : réduit à la hauteur d'une barre de
  navigation, le mot VALEO qu'il contient devient illisible et fait doublon avec
  le nom écrit à côté. On n'en garde que l'arc, le planteur et la cabosse, posés
  sur une tuile ivoire — un seul fichier qui tient sur le héros sombre **et** sur
  l'en-tête clair.

Les maquettes de téléphone sont **dessinées en CSS**, pas capturées. Une capture
d'écran est périmée à la version suivante ; le CSS reste net à tout zoom et se
corrige en même temps que le reste.

### Sécurité du site

`firebase.json` pose sur la cible `site` une Content-Security-Policy réellement
stricte — `default-src 'none'` — ce que permet le fait qu'aucune page ne charge
la moindre ressource externe.

> ⚠️ **Le piège.** Un seul script reste en ligne : l'amorce d'une ligne qui pose
> la classe `js` avant le rendu (l'externaliser ferait clignoter la page). Elle
> est autorisée par son **empreinte SHA-256**, inscrite dans `firebase.json`.
> Modifier cette ligne — ne serait-ce qu'une espace — invalide l'empreinte : le
> navigateur bloque alors le script **sans rien afficher**, la page paraît
> normale et plus rien ne fonctionne.
>
> `backend/tests/test_deploiement.py::TestSecuriteDuSitePublic` recalcule
> l'empreinte depuis `site/index.html` et fait échouer la suite. Tout le reste du
> JavaScript vit dans `site/valeo.js`, servi par `'self'` : il peut évoluer
> librement.

Également posés : `Strict-Transport-Security`, `X-Frame-Options: DENY`,
`Permissions-Policy` (caméra, micro, position refusés), `Cross-Origin-Opener-Policy`.
`Cross-Origin-Resource-Policy` vaut `same-origin` partout **sauf sur `/img/**`**,
sans quoi WhatsApp et Facebook n'afficheraient pas la vignette d'un lien partagé.

### La maquette

`site/maquette.html` est le site entier dans **un fichier autonome** : images
encodées en base64, style et script en ligne. Il s'ouvre par double-clic, sans
serveur et sans réseau, avec une barre d'outils pour basculer
Accueil / Confidentialité et Ordinateur / Téléphone.

Il est **dérivé**, jamais écrit à la main :

```
python3 site/outils/construire_maquette.py
```

À relancer après toute modification du site. `maquette.html` et `outils/` sont
exclus du déploiement (voir `ignore` de la cible `site`) : la barre d'outils
« MAQUETTE VALEO » n'a rien à faire sur `valeo-scoop.com`.

### Relire le rendu, pas le code

Trois défauts de cette refonte n'étaient **pas visibles à la lecture du code**.
Ils ont été trouvés en regardant des captures d'écran, et chacun est désormais
tenu par un test dans `TestDefautsDAffichageDuSite` :

1. **Les cinq panneaux de rôles s'affichaient tous à la fois.** `[hidden]` du
   navigateur vaut (0,1,0) ; `.roles-grille` pose `display:grid` et le battait.
2. **Le libellé des boutons or était illisible.** `nav a` et `.bande-sombre a`
   valent (0,1,1) et battent `.btn` (0,1,0) : le texte prenait la couleur des
   liens, or sur or.
3. **Le bordereau était totalement invisible.** Sa dentelure était dessinée avec
   `mask-image` + `mask-repeat: repeat-x` — le masque ne couvrait qu'une bande de
   12 px en bas, donc tout le reste de la carte était masqué.


---

## 8. Structure du site (1<sup>er</sup> octobre 2026)

Le plan demandé : **Accueil · Tarifs · Blog · FAQ · Tutoriels · Contact**.

| URL | Fichier | Contenu |
|---|---|---|
| `/` | `site/index.html` | Accueil, avec les sections `#tarifs` et `#faq` |
| `/tutoriels` | `site/tutoriels.html` | 10 marches à suivre, chacune disant aussi ce que le logiciel **refuse** |
| `/blog` | `site/blog/index.html` | Journal |
| `/blog/commission-poids-verifie` | `site/blog/commission-poids-verifie.html` | Première note |
| `/contact` | `site/contact.html` | Démonstration, ce qu'il faut préparer |
| `/confidentialite` | `site/confidentialite.html` | Politique de confidentialité |

**Tarifs et FAQ sont des sections de l'accueil, pas des pages.** Une page de
tarifs isolée oblige à répéter l'argumentaire pour que le prix ait un sens ;
placée après la section Sécurité, elle répond « combien ? » juste après avoir
répondu « est-ce sérieux ? ».

**Pas de sélecteur de langue.** Un drapeau qui mène vers une page à moitié
traduite décrédibilise plus qu'il n'aide. À rouvrir le jour où une version
anglaise complète est décidée.

### Direction visuelle retenue

Le choix est tranché : **héros clair**, vert et or en accents. Le mécanisme
`body[data-dir]` qui permettait de comparer les deux ouvertures a été
**retiré** — garder le code mort d'une option écartée revient à laisser croire
qu'elle est encore supportée, et il faudrait l'entretenir à chaque correctif.
Un seul fond reste sombre : le bloc Démonstration (`.bloc-demo`), plus le
pied de page. L'alternance blanc / `bande-claire` fait la respiration.

### Le menu est recopié dans chaque page

Il n'y a pas de moteur de gabarit — c'est tenable pour six pages, et ça évite
une chaîne de construction pour un site statique. Ce qui le rend sûr, c'est
`test_toutes_les_pages_portent_la_meme_navigation` : sans lui, une rubrique
ajoutée à l'accueil manque sur les cinq autres pages et le site se met à dépendre
de la page par laquelle on y entre. Défaut déjà rencontré : la politique de
confidentialité avait gardé un menu « Retour au site » à une rubrique.

`test_tous_les_liens_internes_aboutissent` résout chaque lien comme le fera
Firebase Hosting (`cleanUrls: true` : `/contact` → `contact.html`, `/blog` →
`blog/index.html`). C'est le garde-fou de la rubrique qu'on met au menu avant
d'écrire la page.

### Tarifs

30 000 F CFA/mois (Essentiel) et 50 000 F CFA/mois (Complet), par coopérative,
sans limite de planteurs ni de collaborateurs. La ligne de partage est
**le terrain d'un côté, la comptabilité de l'autre** : l'Essentiel couvre
collecte, pesée, stock, avances et bilan ; le Complet y ajoute le rôle
Comptable, la chaîne budgétaire à quatre crans, la trésorerie, les règlements et
le résultat par expédition. Les deux montants sont verrouillés par
`test_les_deux_formules_tarifaires_sont_affichees` — ce sont des décisions
commerciales, pas des détails de style.


---

## 9. Refonte du 1<sup>er</sup> octobre — structure retenue

La structure vient d'une proposition externe, adoptée telle quelle pour le
plan des sections :

**Solution · Parcours d'un sac · Circuit financier · Acteurs · Filières ·
Application mobile · Hors-ligne · Sécurité · Tarifs · FAQ · Démonstration**

Sept points de cette proposition **n'ont pas été recopiés**, et il faut savoir
pourquoi avant de les réintroduire :

| Dans la proposition | Pourquoi écarté |
|---|---|
| `assets/hero-flow.svg`, `finance-flow.svg`, `filieres.svg`, `mobile-mockup.svg` | Les quatre fichiers n'existent pas : la page affichait quatre cadres vides. Remplacés par la photo du dépôt, une frise en CSS, des icônes SVG dessinées et la maquette de téléphone en CSS |
| `contact@valeo-app.com` | Mauvais domaine. Le bon est `valeo-scoop.com` |
| « coton » dans les filières | VALEO ne gère pas le coton. Les filières réelles sont celles de `DEFAULT_PRICES` : cacao, café, anacarde, hévéa, palmier |
| Quatre acteurs | Le **planteur** manquait — c'est un rôle réel, avec son propre espace et son propre périmètre de données |
| Accent violet `#7b61ff` | La marque est vert forêt + or, relevés sur le logo. Un violet à côté de l'emblème tire la page vers une autre identité |
| Aucune section Tarifs | Les deux formules sont une décision commerciale déjà prise |
| `font-family: Inter` | Jamais chargée, donc sans effet. Et la charger coûterait une requête bloquante avant le premier mot lisible — ce que le site s'interdit |

### Ce que la proposition a apporté

- **La frise du circuit financier à cinq crans** (`.frise`) : budget → allocation
  → enveloppe → mandat → suivi. C'est la meilleure représentation de
  l'invariant 13ter produite jusqu'ici — elle rend visible le fait que chaque
  cran borne le suivant.
- **Une échelle neutre plus froide et plus claire**, des rayons plus généreux
  (20 px) et des pastilles d'icône. L'encre reste toutefois un **vert très
  sombre** (`#13261A`) et non un bleu marine : à côté d'un logo vert et or, un
  bleu tire la page vers une autre marque.
- **Le bloc Démonstration** en carte sombre arrondie, qui ancre le bas de page.

### Piège hérité de la bascule clair/foncé

Les composants écrits pour la bande vert foncé gardent des couleurs réglées
pour du blanc sur sombre. Repris tels quels sur fond clair, ils deviennent
illisibles **sans qu'aucune règle CSS soit fautive** — chacune est correcte,
pour un fond qui n'existe plus. Trois l'étaient, trouvées en regardant les
captures : le bandeau de confiance (gris très pâle sur blanc), les onglets de
l'explorateur de rôles, et les coches des listes (or clair sur blanc). À
vérifier systématiquement en déplaçant un composant d'un fond à l'autre.


---

## 10. Plan du 1<sup>er</sup> octobre (seconde passe) — onze pages

Structure demandée, et appliquée :

| URL | Fichier | Contenu |
|---|---|---|
| `/` | `index.html` | Héros · Le problème · Le cycle · L'argent sous contrôle · Fonctionnalités · Acteurs · Traçabilité · Filières · Application · Pourquoi VALEO · Téléchargement · Démonstration |
| `/acteurs` | `acteurs.html` | Les 5 rôles en détail : ce qu'il peut faire, **et ce qui lui est refusé** |
| `/securite` | `securite.html` | 9 mécanismes + ce que la sécurité ne doit pas empêcher |
| `/tarifs` | `tarifs.html` | Essentiel 30 000 F · Complet 50 000 F · 4 questions de facturation |
| `/faq` | `faq.html` | 15 questions, en 3 blocs (produit, terrain, technique) |
| `/a-propos` | `a-propos.html` | Vision, problème résolu, trois convictions |
| `/contact` · `/tutoriels` · `/blog` · `/confidentialite` | — | Inchangés, menu et pied alignés |

**Menu** : Accueil · Solution · Fonctionnalités · Acteurs · Filières · Sécurité ·
Tarifs · FAQ, plus le bouton « Demander une démo ». Blog, Tutoriels, À propos et
Confidentialité vivent dans le pied de page : les mettre au menu l'aurait porté à
douze entrées, illisible dès 1200 px.

### Ce qui a été écarté du plan, et pourquoi

| Demandé | Décision |
|---|---|
| **Coton** dans les filières | Refusé. `DEFAULT_PRICES` (lib.ts) ne contient que cacao, café, anacarde, hévéa, palmier. Le plan ajoutait le coton **et oubliait le café**, qui lui est réellement pris en charge à 1 300 F/kg |
| **« Magasinier délégué »** dans les équipes | Ce rôle n'existe pas. `ROLES` définit patron, commis (Magasinier), pisteur (Pisteur / **Délégué**), comptable. Le « délégué » est un pisteur, pas un magasinier |
| **Bouton « Télécharger sur Android » + QR code** | L'application n'est pas publiée : aucune URL d'installation publique n'existe. Un bouton qui ne mène nulle part fait perdre le visiteur. La section existe, le bouton demande l'accès, et un encadré dit franchement que l'application est en test interne |
| **« VALEO en chiffres »** (X coopératives, X tonnes…) | Non publiée. Le plan le demandait lui-même : « uniquement avec des chiffres réellement vérifiés ». Nous n'en avons aucun |
| **Captures d'écran réelles** (6 à 8) | Les écrans du site sont **dessinés en CSS**, pas capturés. Ils reprennent les libellés et les formules réels. De vraies captures supposent qu'on nous les envoie depuis l'APK |
| **Conditions d'utilisation**, réseaux sociaux | Pas de texte juridique ni de comptes à lier. Ajoutés au pied de page le jour où ils existent |

### Le formulaire de démonstration n'est pas un `<form>`

Et c'est délibéré. La CSP du site pose `form-action 'none'`, et le site n'a aucun
backend pour recevoir une soumission. Un vrai formulaire exigerait soit un service
tiers — une requête vers un autre domaine, que la CSP interdit et que la page
promet de ne pas faire — soit un endpoint à écrire et à protéger du spam.

Le bouton compose donc un `mailto:` avec les champs saisis. L'expéditeur relit
avant d'envoyer, rien ne part de la page, et sans JavaScript l'adresse reste
visible juste en dessous. Encodage vérifié dans un navigateur sur des accents, une
apostrophe, un tiret cadratin et une esperluette.

### La photo revient en bande pleine largeur

Le héros porte désormais le schéma (producteur, pisteur, magasin, comptabilité,
patron autour de VALEO), donc la photographie en a été chassée. Sans la replacer,
le site n'aurait plus eu **aucune image** — précisément le reproche d'origine. Elle
occupe une bande pleine largeur entre « Le problème » et « Le cycle ».
`test_aucune_image_orpheline_n_est_publiee` l'a signalé avant qu'on s'en aperçoive.
