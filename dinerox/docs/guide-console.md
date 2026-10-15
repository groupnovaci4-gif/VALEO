# Guide console — alerte de budget et clé API

Pour le fondateur, à faire soi-même. Aucune de ces étapes ne coupe l'application
si elle est suivie telle quelle. Rien de secret ici : ne collez jamais une clé
dans un message, même partiellement.

## 1. Alerte de budget (50 %, 90 %, 100 %)

Une alerte **prévient** par e-mail ; elle **n'arrête pas** les services.

1. Ouvrir <https://console.cloud.google.com/billing>.
2. Choisir le compte de facturation lié au projet **dinerox-app**.
3. Menu de gauche › **Budgets et alertes** › **Créer un budget**.
4. **Nom** : « DineroX — mensuel ».
   **Projets** : cocher seulement **dinerox-app**. **Services** : tous.
   **Période** : mensuelle.
5. **Montant** : « Montant spécifié » — choisir un montant mensuel raisonnable
   (par exemple ce que vous acceptez de dépenser au maximum en un mois).
6. **Actions** › seuils : **50 %**, **90 %** et **100 %**, de type « Réel ».
   (Facultatif : un seuil « Prévisionnel » à 100 %.)
7. **Notifications** : cocher « Envoyer des alertes par e-mail aux administrateurs
   de la facturation et aux utilisateurs ». **Terminer**.

## 2. Vérifier les restrictions de la clé API (sans rien casser)

La clé Firebase de l'application (« Browser key » / « Android key (auto created
by Firebase) » ou « API key ») est **publique par nature** : elle est dans l'APK.
Ce qui protège les données, ce sont les règles Firestore et les fonctions. Une
restriction de clé limite seulement ce que la clé peut appeler.

### Regarder, sans modifier

1. Ouvrir <https://console.cloud.google.com/apis/credentials>, projet **dinerox-app**.
2. Section **Clés API** : cliquer sur chaque clé, noter :
   - **Restrictions relatives aux applications** (Aucune / Sites web / Applis Android…) ;
   - **Restrictions relatives aux API** (Aucune / liste d'API).
3. Ne rien enregistrer à ce stade. Envoyez-moi ce que vous voyez (sans la valeur des clés).

### Ce qu'il ne faut PAS faire

- **Ne pas** mettre la clé de l'application en « Applis Android » : l'application
  utilise le SDK JavaScript de Firebase, qui n'envoie pas l'empreinte de l'APK ;
  une restriction « Applis Android » **bloquerait** connexion et synchronisation.
- **Ne pas** supprimer une clé ni en régénérer une : l'APK des testeurs cesserait
  de fonctionner.

### Ce qui est possible plus tard, ensemble

Une restriction **par API** (la clé ne peut appeler que les API Firebase utiles :
Identity Toolkit, Token Service, Cloud Firestore, Firebase Installations, Cloud
Storage for Firebase…). Je préparerai la liste exacte et un test avant que vous
l'appliquiez, puis on vérifie l'APK juste après.
