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

## 6. Ordre des étapes

1. Terminer la refonte du design (étape 10, images côte à côte, puis APK pour le
   téléphone du fondateur).
2. Maquettes des écrans : inscription (numéro), création du code secret, saisie du
   code WhatsApp, connexion, code oublié, nouveau téléphone. Validation du fondateur.
3. En parallèle : démarches Meta / WhatsApp Business (vérification de l'entreprise,
   numéro dédié, modèle de message d'authentification approuvé, prix).
4. Ensuite seulement : instruction à Claude Code (Cloud Function, protections,
   comptes e-mail conservés), avec un test qui échoue d'abord pour chaque règle.
