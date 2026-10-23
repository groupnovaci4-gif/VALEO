# Connexion par téléphone — décisions validées par le fondateur

Date de la décision : 22 octobre 2026.
Statut : **décidé**. Rien n'est construit tant que la refonte du design n'est pas
validée et que les maquettes des écrans ci-dessous n'ont pas été approuvées.

## 1. Le principe

1. On s'inscrit avec son **numéro de téléphone**.
2. On crée un **code secret de 6 chiffres**, qui sert ensuite à chaque connexion.
3. Le numéro est **vérifié par un code reçu sur WhatsApp**.
4. Si WhatsApp ne marche pas (pas de WhatsApp, message non reçu), le code arrive
   **par SMS en secours**.

## 2. Quand le code WhatsApp / SMS est demandé

- À l'**inscription** (une fois, pour prouver que le numéro est bien à vous).
- En cas de **code secret oublié**.
- Sur un **nouveau téléphone**.

À toutes les autres connexions : numéro + code secret, sans message.

## 3. Ce qui ne change pas

- Les **comptes existants par e-mail continuent de fonctionner**. Aucune perte de
  compte, aucune perte de donnée, aucune migration destructive.
- Les formules free / plus / family restent inchangées ; aucune nouvelle limite.
- L'application ne détient ni ne transfère jamais d'argent.

## 4. Protections obligatoires

- Le code secret n'est **jamais stocké en clair** (empreinte uniquement).
- Le code WhatsApp / SMS **expire** au bout de quelques minutes et ne sert qu'une fois.
- **Nombre d'essais limité** (code secret et code reçu), avec blocage temporaire.
- Limite d'envois de codes par numéro (pour éviter qu'on fasse payer des SMS en boucle).
- Envoi et vérification faits **côté serveur** (Cloud Function), qui ouvre ensuite la
  session Firebase. Rien de sensible dans l'application.

## 5. Service payant et clés

- L'envoi WhatsApp / SMS est un **service payant** (Meta WhatsApp Business ou un
  fournisseur comme Twilio Verify). **Rien n'est activé sans l'accord du fondateur**,
  après vérification du prix pour la Côte d'Ivoire.
- Les clés sont tapées **uniquement par le fondateur dans le Terminal**. Jamais dans
  l'application, dans Git ou dans la conversation.
- Aucun déploiement sans son accord, commande par commande.

## 5bis. Choix du fondateur sur l'étude (22/10, soir)

1. **Fournisseur** : API WhatsApp Cloud de **Meta** (modèle « authentification ») + un
   **fournisseur SMS local** en secours, qui doit couvrir Orange, MTN et Moov. Le prix Meta sera
   confirmé dans le compte Meta du fondateur avant tout paiement.
2. **Règles** : code reçu valable **10 minutes**, usage unique ; **5 essais** ; **5 envois par jour
   et par numéro** (1 par minute) ; blocage 15 min puis 1 h puis 24 h ; plafond global de dépense
   par jour ; App Check.
3. **Code de verrouillage de l'application : SÉPARÉ** du code secret de connexion. Le verrou local
   (`security.ts`) reste facultatif et inchangé ; l'empreinte digitale peut le remplacer si
   l'appareil l'a. Le code secret de connexion n'est JAMAIS gardé sur le téléphone, même en empreinte.
4. **Slogan de l'écran de bienvenue** : « **Mieux gérer, mieux prévoir, mieux vivre** »
   (anglais proposé : « Manage better, plan better, live better », à valider). Les autres textes
   de `maquettes/TEXTES.md` sont acceptés tels quels.
5. **Protections ajoutées** (assistant, acceptées) :
   - SMS envoyés **uniquement** vers les pays où l'application est proposée (liste blanche
     d'indicatifs) — contre la fraude aux SMS ;
   - **numéro recyclé** : quand un code secret est changé (code oublié), une alerte part vers les
     appareils déjà connectés et vers l'e-mail du compte s'il existe.

## 5ter. Écran de bienvenue (fondateur, 23/10)

1. **L'image et le style d'origine sont rétablis** : photo plein écran avec son fondu vert, logo,
   « DineroX », « Mieux gérer. Mieux prévoir. Mieux vivre. », phrase d'accroche, panneau clair en
   bas. Aucune carte verte flottante sur cet écran.
2. **Libellés clairs** (on doit savoir tout de suite si on s'inscrit ou si on se connecte) :
   - bouton principal : « **S'inscrire avec mon numéro** » ;
   - bouton secondaire : « **Se connecter** » (numéro + code secret ; lien « Se connecter avec mon
     e-mail » sur cet écran) ;
   - petit lien : « **S'inscrire avec mon e-mail** » ;
   - inchangés : « Tester sans données (démonstration) », « Utiliser sur ce téléphone uniquement »,
     la mention « ni une banque ni un service de paiement ».
3. Ailleurs dans le parcours : « J'ai déjà un compte » devient « Se connecter » ; « J'ai un compte
   e-mail » devient « Se connecter avec mon e-mail ».
   Maquette : `maquettes/01-bienvenue-v2-clair.png` (cadres pointillés = ce qui change).

## 6. Ordre des étapes

1. Terminer la refonte du design (étape 10, images côte à côte, puis APK pour le
   téléphone du fondateur).
   EN PARALLÈLE (décision du 22/10) : Claude Code prépare déjà l'étude technique et les maquettes
   ci-dessous, sur une branche à part `connexion-telephone`, SANS code dans l'application, sans
   compte payant, sans clé, sans déploiement.
2. Maquettes des écrans : inscription (numéro), création du code secret, saisie du
   code WhatsApp, connexion, code oublié, nouveau téléphone. Validation du fondateur.
3. En parallèle : démarches Meta / WhatsApp Business (vérification de l'entreprise,
   numéro dédié, modèle de message d'authentification approuvé, prix).
4. Ensuite seulement : instruction à Claude Code (Cloud Function, protections,
   comptes e-mail conservés), avec un test qui échoue d'abord pour chaque règle.
