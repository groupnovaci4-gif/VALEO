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
