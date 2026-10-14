# Étape 5 — origine des installations : nouveaux textes à valider

Statut : PROPOSÉS le 2026-10-14, **non validés**, non intégrés.
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
- `link.app.lead` — FR : « Gérez votre argent avec {app}, même hors connexion. » — EN : « Manage your money with {app}, even offline. »
- Instructions ordinateur et iPhone : textes ACTUELS de la page `/i/` réutilisés (« Scannez ce QR code… », « Bientôt sur iPhone »), sans le code.
