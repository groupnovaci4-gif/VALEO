# Étape 5 — origine des installations : nouveaux textes à valider

Statut : textes de l'écran admin VALIDÉS par le fondateur le 2026-10-14 et
intégrés (`src/i18n/fr.ts`, `src/i18n/en.ts`). **Encore à valider** :
`link.app.lead` (nouvelle phrase ci-dessous) et les deux phrases de la politique
de confidentialité (fin du document), à valider ensemble.
Format : `clé` — FR — EN. `{app}` = nom de marque (DineroX).

Aucun texte n'est montré aux utilisateurs dans l'application : l'origine est
enregistrée sans rien afficher ni demander. Les textes ci-dessous sont ceux de
l'écran admin (réservé aux administrateurs) et de la page web des liens.

## Écran admin › « Origine des inscriptions »

- `admin.origin.title` — FR : « Origine des inscriptions » — EN : « Sign-up origins »
- `admin.origin.notice` — FR : « Chiffres regroupés uniquement : aucune personne n'est identifiable. Les groupes de moins de 5 inscriptions sont réunis. » — EN : « Grouped figures only: no person can be identified. Groups of fewer than 5 sign-ups are combined. »
- `admin.origin.since` — FR : « Comptées depuis le {date}. Les comptes créés avant n'ont pas d'origine. » — EN : « Counted since {date}. Accounts created earlier have no origin. »
- `admin.origin.period.month` — FR : « Ce mois-ci » — EN : « This month »
- `admin.origin.period.previous` — FR : « Mois dernier » — EN : « Last month »
- `admin.origin.period.90d` — FR : « 90 derniers jours » — EN : « Last 90 days »
- `admin.origin.period.all` — FR : « Depuis le début » — EN : « Since the start »
- `admin.origin.total` — FR : « Inscriptions » — EN : « Sign-ups »
- `admin.origin.invited` — FR : « Dont venues d'un lien d'invitation » — EN : « Of which came from an invitation link »
- `admin.origin.bySource` — FR : « Par source » — EN : « By source »
- `admin.origin.byCampaign` — FR : « Par campagne » — EN : « By campaign »
- `admin.origin.byContent` — FR : « Par contenu » — EN : « By content »
- `admin.origin.unknown` — FR : « Origine inconnue » — EN : « Unknown origin »
- `admin.origin.unknownHint` — FR : « Installation sans lien suivi : APK installé directement, iPhone, lien sans paramètre. » — EN : « Install without a tracked link: APK installed directly, iPhone, link without parameters. »
- `admin.origin.small` — FR : « Moins de 5 » — EN : « Fewer than 5 »
- `admin.origin.others` — FR : « Autres (groupes de moins de 5) » — EN : « Others (groups of fewer than 5) »
- `admin.origin.empty` — FR : « Aucune inscription sur cette période. » — EN : « No sign-ups in this period. »
- `admin.origin.share` — FR : « {percent} % » — EN : « {percent}% »

### Noms des sources (`src`)

- `admin.origin.src.whatsapp` — FR : « WhatsApp » — EN : « WhatsApp »
- `admin.origin.src.facebook` — FR : « Facebook » — EN : « Facebook »
- `admin.origin.src.instagram` — FR : « Instagram » — EN : « Instagram »
- `admin.origin.src.tiktok` — FR : « TikTok » — EN : « TikTok »
- `admin.origin.src.youtube` — FR : « YouTube » — EN : « YouTube »
- `admin.origin.src.sms` — FR : « SMS » — EN : « SMS »
- `admin.origin.src.email` — FR : « E-mail » — EN : « Email »
- `admin.origin.src.qr` — FR : « QR code » — EN : « QR code »
- `admin.origin.src.poster` — FR : « Affiche ou flyer » — EN : « Poster or flyer »
- `admin.origin.src.radio` — FR : « Radio » — EN : « Radio »
- `admin.origin.src.tv` — FR : « Télévision » — EN : « Television »
- `admin.origin.src.site` — FR : « Site web » — EN : « Website »
- `admin.origin.src.ambassador` — FR : « Ambassadeur » — EN : « Ambassador »
- `admin.origin.src.share` — FR : « Partage depuis l'application » — EN : « Shared from the app »
- `admin.origin.src.copy` — FR : « Lien copié depuis l'application » — EN : « Link copied from the app »
- `admin.origin.src.play_store` — FR : « Recherche sur Google Play » — EN : « Google Play search »
- `admin.origin.src.other` — FR : « Autre source » — EN : « Other source »

## Écran admin › « Créer un lien de campagne »

- `admin.origin.builder.title` — FR : « Créer un lien de campagne » — EN : « Create a campaign link »
- `admin.origin.builder.source` — FR : « Source » — EN : « Source »
- `admin.origin.builder.campaign` — FR : « Campagne (facultatif) » — EN : « Campaign (optional) »
- `admin.origin.builder.content` — FR : « Contenu (facultatif) » — EN : « Content (optional) »
- `admin.origin.builder.hint` — FR : « Lettres minuscules, chiffres, - et _ ; 40 caractères au plus. Jamais le nom d'une personne. » — EN : « Lowercase letters, digits, - and _; 40 characters at most. Never a person's name. »
- `admin.origin.builder.invalid` — FR : « Utilisez seulement des lettres minuscules, des chiffres, - et _. » — EN : « Use only lowercase letters, digits, - and _. »
- `admin.origin.builder.play` — FR : « Lien Google Play (fonctionne dès que l'application est publiée) » — EN : « Google Play link (works once the app is published) »
- `admin.origin.builder.domain` — FR : « Lien {host} (fonctionne quand le domaine sera branché) » — EN : « {host} link (works once the domain is connected) »
- `admin.origin.builder.copy` — FR : « Copier » — EN : « Copy »
- `admin.origin.builder.copied` — FR : « Lien copié » — EN : « Link copied »

## Page web des liens (`https://dinerox.app/a?...`, ordinateur et iPhone)

Textes de la fonction `link` (`firebase/functions/src/links.ts`), sans code
d'invitation (le lien `/i/{code}` garde ses textes actuels).

- `link.app.title` — FR : « Télécharger {app} » — EN : « Download {app} »
- `link.app.lead` — **NOUVELLE PROPOSITION, à valider** — FR : « Gérez votre argent avec {app}. Vos dépenses s'enregistrent même sans internet. » — EN : « Manage your money with {app}. Your expenses are saved even without internet. »
  - Pourquoi : « même hors connexion » n'est pas entièrement vrai. Vérifié dans
    le code (`services/sync/engine.ts`) : une opération saisie sans réseau est
    gardée sur le téléphone (outbox persistante) et envoyée au retour du réseau.
    Mais la création du compte et la connexion exigent internet, la saisie
    vocale comprise par l'IA aussi, et deux cas rares peuvent effacer une saisie
    hors ligne : la même opération modifiée plus récemment sur un autre
    téléphone (la plus récente gagne), ou une écriture refusée par le serveur
    au retour du réseau (droits retirés dans une famille). La nouvelle phrase ne
    promet que ce qui est vrai : une nouvelle dépense s'enregistre sans internet.
  - Intégrée dans `firebase/functions/src/links.ts` en attendant votre accord ;
    la fonction `link` n'est de toute façon pas déployée avant le domaine.
- Instructions ordinateur et iPhone : textes ACTUELS de la page `/i/` réutilisés (« Scannez ce QR code… », « Bientôt sur iPhone »), sans le code.

## Politique de confidentialité — deux phrases à valider ensemble

À ajouter dans `src/content/legal.ts` (politique de confidentialité), après la
section « Statistiques ». La section « Statistiques » actuelle dit « Avec votre
accord seulement » : elle est complétée pour ne pas contredire le compteur
d'inscriptions, qui fonctionne sans accord (décision du fondateur : rien n'est
rattaché à une personne).

1. **Identifiant d'appareil haché (étape 1, parrainage — en attente depuis l'étape 1)**
   - Titre — FR : « Parrainage et lutte contre la fraude » — EN : « Referrals and fraud prevention »
   - FR : « Quand vous invitez quelqu'un, utilisez un code d'invitation ou demandez à rejoindre une tontine partagée, un identifiant technique de votre téléphone (jamais un identifiant publicitaire) est transformé de façon irréversible en empreinte chiffrée avant d'être enregistré. Cette empreinte sert uniquement à vérifier qu'un même téléphone n'est pas parrainé plusieurs fois. Si vous supprimez votre compte, elle est conservée sans aucun lien avec vous, pour cette seule raison. »
   - EN : « When you invite someone, use an invitation code or ask to join a shared tontine, a technical identifier of your phone (never an advertising identifier) is irreversibly turned into an encrypted fingerprint before being stored. This fingerprint is only used to check that the same phone is not referred more than once. If you delete your account, it is kept with no link to you, for that reason only. »

2. **Origine des inscriptions (étape 5)**
   - Titre — FR : « Origine des inscriptions » — EN : « Sign-up origins »
   - FR : « À votre inscription, la provenance du lien qui vous a amené à {app} (par exemple « WhatsApp » ou le nom d'une campagne), si elle est connue, est ajoutée une seule fois à un compteur global anonyme. Elle n'est jamais enregistrée dans votre compte, qui garde seulement l'information « déjà comptée » (oui ou non), et aucun identifiant publicitaire ni outil de suivi externe n'est utilisé. »
   - EN : « When you sign up, the source of the link that brought you to {app} (for example "WhatsApp" or a campaign name), if known, is added once to an anonymous global counter. It is never stored in your account, which only keeps the information "already counted" (yes or no), and no advertising identifier or external tracking tool is used. »

3. **Section « Statistiques » complétée** (pour rester exacte)
   - FR actuel : « Avec votre accord seulement, des événements d'usage anonymes (ex. « objectif créé ») sont collectés, sans montant ni donnée personnelle. »
   - FR proposé : « Avec votre accord seulement, des événements d'usage anonymes (ex. « objectif créé ») sont collectés, sans montant ni donnée personnelle. Seule exception, sans lien avec vous : le compteur anonyme de l'origine des inscriptions (voir ci-dessous). »
   - EN : aujourd'hui la politique anglaise n'a PAS de section « Statistiques ».
     Proposé — titre « Statistics » : « Only with your consent, anonymous usage events (e.g. "goal created") are collected, with no amount or personal data. The only exception, with no link to you: the anonymous sign-up origin counter (see below). »
