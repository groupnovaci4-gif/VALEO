# VALEO — Cahier de test

> Version du 30/09/2026 · à jour du commit `f767157`
> À utiliser sur l'APK `preview` (backend Cloud Run).

Ce cahier couvre **tous les rôles et toutes les fonctionnalités**. Il est fait
pour être suivi dans l'ordre : les sections s'appuient les unes sur les autres
(on ne peut pas tester une vérification de poids sans avoir fait une collecte).

**Chaque scénario porte un identifiant** (`PAT-03`, `PIS-07`…). Notez-le quand
vous signalez une anomalie : c'est ce qui permet de reproduire.

---

## 0. Avant de commencer

### Matériel minimum

| | |
|---|---|
| **2 téléphones Android** au minimum | Un seul appareil ne permet pas de tester la synchronisation entre agents, qui est le cœur du produit. |
| **3 téléphones**, idéalement | Patron + pisteur + magasinier en parallèle. |
| Un **navigateur** (ordinateur) | Pour l'espace d'administration. |

### Comment noter un résultat

Pour chaque ligne : **OK** / **KO** / **N/A**. Pour un KO, notez **trois
choses**, sans quoi l'anomalie est inexploitable :

1. l'identifiant du scénario ;
2. ce que vous attendiez, ce que vous avez vu ;
3. **une capture d'écran**.

### Règle d'or du test

> **Ne testez jamais uniquement le chemin qui marche.**
> La moitié de ce cahier consiste à vérifier que l'application **refuse** ce
> qu'elle doit refuser. Un refus attendu qui n'arrive pas est un défaut plus
> grave qu'un bouton mal placé.

---

## 1. Préparation — jeu de données de test

### PREP-01 · Créer la coopérative

| | |
|---|---|
| **Qui** | Vous, depuis un téléphone neuf |
| **Étapes** | Ouvrir VALEO → « Créer une coopérative » → nom du responsable, **adresse e-mail**, mot de passe (6 caractères minimum) |
| **Attendu** | Arrivée directe sur le tableau de bord. La coopérative s'appelle « Ma coopérative ». |

> ⚠️ Le **patron** se connecte par **e-mail + mot de passe**. Tous les autres
> rôles se connectent par **téléphone + code à 6 chiffres**. Le même écran de
> connexion accepte les deux.

### PREP-02 · Compléter le profil

Coop → **Profil de la coopérative** : nom réel, type, filières, téléphone,
localisation, agrément. Vérifier que le pourcentage de complétude monte.

### PREP-03 · Vérifier les barèmes

Coop → réglages des prix. **Attendu**, sur une coopérative neuve :

| Produit | Prix/kg | Commission/kg |
|---|---|---|
| Cacao | **1 200** | 25 |
| Café | **1 300** | 25 |
| Anacarde | 500 | 20 |
| Hévéa | 400 | 15 |
| Palmier à huile | 100 | 10 |

> Anacarde, hévéa et palmier portent des valeurs **provisoires**. Si vous
> exploitez ces filières, corrigez-les ici avant de tester.

### PREP-04 · Créer l'équipe

Équipe → « + Ajouter ». Créez **quatre** collaborateurs, chacun avec un
téléphone et un code à 6 chiffres distincts :

| Rôle | Nom suggéré | Téléphone | Code |
|---|---|---|---|
| Pisteur / Délégué | Jean | 0700000001 | 111111 |
| Pisteur / Délégué | Paul | 0700000002 | 222222 |
| Magasinier | Bakary | 0700000003 | 333333 |
| Comptable | Aminata | 0700000004 | 444444 |

**Deux pisteurs sont indispensables** : tout le cloisonnement entre agents se
teste avec le second.

### PREP-05 · Créer des planteurs

Planteurs → « + Ajouter ». Créez **3 planteurs** avec code, nom, localité,
culture. Notez leur identifiant `VAL-XXXX-YY` : il sert à la connexion planteur.

---

## 2. Rôle PATRON

### Connexion et navigation

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-01 | Se connecter avec e-mail + mot de passe | Accès au tableau de bord |
| PAT-02 | Mauvais mot de passe, **5 fois** de suite | Blocage **temporaire** : 1 min, puis 5 min, puis 15 min. Le message ne doit **jamais** révéler si le compte existe |
| PAT-03 | Vérifier les 4 onglets | Tableau de bord · Planteurs · Équipe · Coop |
| PAT-04 | Fermer l'application, rouvrir | Toujours connecté, données présentes |

### Planteurs

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-05 | Créer un planteur | Apparaît immédiatement dans la liste |
| PAT-06 | Ouvrir sa fiche | Livraisons, avances, restes dus, Mobile Money |
| PAT-07 | Modifier son nom | Changement visible partout |
| PAT-08 | Supprimer un planteur de test | Confirmation demandée, avec avertissement sur les collectes |
| PAT-09 | Localité : taper un village inexistant | Elle reste en saisie libre, jamais effacée |

### Pesée au magasin

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-10 | Peser 100 kg cacao, 2 sacs, paiement total | Net = **98 kg** (1 kg de tare par sac). Montant = 98 × 1 200 = **117 600 F** |
| PAT-11 | Regarder le bordereau | Numéro `P-XXX-0000`, non modifiable |
| PAT-12 | Peser en payant partiellement (50 000 F) | Le solde apparaît comme **reste dû au planteur** |
| PAT-13 | Repeser le même planteur | L'ancien reste dû est proposé **avant** le net de la nouvelle livraison |
| PAT-14 | Imprimer / partager le bordereau | PDF lisible, avec « Ancien reste soldé » et « TOTAL REMIS » |

### Équipe

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-15 | Ouvrir « Équipe » | Les **4** collaborateurs apparaissent, comptable compris |
| PAT-16 | Ouvrir la fiche du comptable | Le titre dit **« Comptable »**, pas « Magasinier ». Aucun tableau de pesées |
| PAT-17 | Ouvrir la fiche d'un pisteur | Mandat, caisse, commission, dette en kilos |
| PAT-18 | Réinitialiser le code d'un collaborateur | Nouveau code demandé deux fois, ancien invalidé |
| PAT-19 | Supprimer un collaborateur de test | Confirmation demandée |

### Avances

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-20 | Accorder une avance de 50 000 F à un planteur | Statut **approuvé** immédiatement |
| PAT-21 | Peser ce planteur pour 100 000 F | L'avance est recouvrée automatiquement, le net baisse |
| PAT-22 | Recouvrer plus que le dû | **Impossible** : le recouvrement est plafonné au solde restant |
| PAT-23 | Le net ne doit jamais être négatif | Vérifier sur une pesée plus petite que l'avance |

### Stock et expédition

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-24 | Ouvrir le stock | Entrées − sorties. Une collecte bord-champ **non vérifiée** n'y est **pas** comptée, mais apparaît « en attente » |
| PAT-25 | Enregistrer une sortie « Expédition usine » de 1 000 kg | Le stock baisse de 1 000 kg |
| PAT-26 | Saisir le résultat usine : 980 kg à 1 500 F | Freinte **20 kg**. Bénéfice = (980 × 1 500) − (1 000 × 1 200 + transport + frais) |
| PAT-27 | Saisir un prix usine bas (800 F) | Bénéfice **négatif**, affiché en rouge, **pas masqué** |
| PAT-28 | Saisir un poids usine négatif | **Refusé** |

### Coop

| ID | Action | Résultat attendu |
|---|---|---|
| PAT-29 | Coop → Journal d'audit | Les pesées, avances et soldes y figurent, horodatés |
| PAT-30 | Coop → Livraisons des pisteurs | Historique : pisteur, date, poids déclaré, poids vérifié, écart |
| PAT-31 | Coop → Dépenses | Les dépenses de la coopérative. **Pas** celles des pisteurs |
| PAT-32 | Changer le prix du cacao à 1 300 F | Les pesées **déjà faites** gardent 1 200 F sur leur bordereau |

---

## 3. Rôle PISTEUR / DÉLÉGUÉ

Connexion : **téléphone + code à 6 chiffres**.

| ID | Action | Résultat attendu |
|---|---|---|
| PIS-01 | Se connecter (Jean, 0700000001 / 111111) | Onglets : **Ma tournée** · **Planteurs** |
| PIS-02 | Vérifier l'absence d'onglet Équipe et Coop | Il ne doit **pas** y accéder |
| PIS-03 | Créer un planteur | Autorisé, rattaché à lui |
| PIS-04 | Collecter 500 kg cacao, payer 600 000 F | Valeur 600 000 F. Payé intégralement |
| PIS-05 | Collecter 500 kg, ne payer que 400 000 F | **200 000 F** apparaissent en **« Dû aux planteurs (achats à crédit) »** |
| PIS-06 | Accorder une avance à un planteur | Autorisé, naît **approuvée**, signée de son nom |
| PIS-07 | Saisir une dépense de tournée | Visible sur **son** écran uniquement |
| PIS-08 | Regarder « Solde en caisse » | = mandat − achats payés. Les dépenses n'y entrent **pas** |
| PIS-09 | Déclarer la livraison au magasin | Les collectes passent en « en attente de vérification » |
| PIS-10 | Tenter de re-déclarer la même livraison | **Refusé** : une livraison est définitive |
| PIS-11 | Chercher « Vente » ou « Expédition » dans les sorties | **Absentes**. Un pisteur livre au magasin, il ne commercialise pas |
| PIS-12 | Regarder sa commission avant vérification | **0 F acquis**, avec une ligne « Commission en attente de vérification ». **Ce n'est pas un bug** |

### Cloisonnement entre pisteurs — à ne pas sauter

| ID | Action | Résultat attendu |
|---|---|---|
| PIS-13 | Avec Paul, ouvrir un planteur que **Jean** a pesé à crédit | Paul **ne voit pas** ce reste dû et **ne peut pas** le solder |
| PIS-14 | Regarder la cloche de Paul | Aucune notification concernant les pesées de Jean : ni le nom du planteur, ni la somme |
| PIS-15 | Avance accordée par Jean, pesée faite par Paul | Paul **ne recouvre pas** l'avance de Jean. Elle s'affiche pour information seulement |

---

## 4. Rôle MAGASINIER (commis)

| ID | Action | Résultat attendu |
|---|---|---|
| MAG-01 | Se connecter (Bakary, 0700000003 / 333333) | Onglets : **Mes pesées** · **Planteurs** |
| MAG-02 | Peser un planteur au magasin | Autorisé |
| MAG-03 | Voir la file des livraisons à vérifier | La livraison de Jean y figure, avec son poids déclaré |
| MAG-04 | Vérifier la livraison de Jean : constater **1 020 kg** pour 1 000 déclarés | Écart **+20 kg**. Le stock augmente de **1 020 kg**, jamais de 1 000 |
| MAG-05 | Retourner vérifier la même livraison | **Refusé** : une vérification est définitive. Seul le patron corrige |
| MAG-06 | Vérifier une livraison avec un manquant (980 pour 1 000) | Écart **−20 kg**. Le pisteur porte une **dette de 20 kg**, pas une dette en francs |
| MAG-07 | Tenter de vérifier sa **propre** pesée | **Refusé** |
| MAG-08 | Solder un reste dû à un planteur | Autorisé |
| MAG-09 | Chercher « Donner un mandat » | **Absent** : c'est l'affaire du patron et du comptable |

---

## 5. Rôle COMPTABLE

Connexion : **téléphone + code à 6 chiffres** (Aminata, 0700000004 / 444444).
Il n'a **pas** d'e-mail ni de mot de passe.

| ID | Action | Résultat attendu |
|---|---|---|
| CPT-01 | Se connecter | Onglets : **Finances** · **Planteurs** · **Équipe** |
| CPT-02 | Chercher un bouton de pesée | **Absent**. Le bouton central sert à saisir une **dépense** |
| CPT-03 | Ouvrir « Mes fonds » | Alloué / affecté / dépensé / disponible |
| CPT-04 | Avant toute allocation, tenter d'ouvrir une enveloppe | **Refusé** : « Aucun fonds ne vous a été alloué » |
| CPT-05 | Consulter l'équipe | Lecture seule : aucun bouton « + Ajouter » |
| CPT-06 | Consulter un planteur | Lecture seule |
| CPT-07 | Regarder sa cloche | **Aucune** alerte « Reste à payer au planteur » — il ne peut pas solder |

---

## 6. Rôle PLANTEUR

Connexion : **`VAL-XXXX-YY` ou téléphone** + code à 6 chiffres.

| ID | Action | Résultat attendu |
|---|---|---|
| PLA-01 | Se connecter avec le code `VAL-XXXX-YY` | Onglets : **Mes poids** · **Mobile Money** |
| PLA-02 | Se connecter avec son téléphone | Fonctionne aussi |
| PLA-03 | Consulter ses livraisons | **Uniquement les siennes**. Aucun autre planteur visible |
| PLA-04 | Chercher les mandats, dépenses, stock | **Invisibles** : affaires internes de la coopérative |
| PLA-05 | Consulter le personnel | Annuaire **réduit** : un nom sur un reçu, rien de plus. Pas de téléphone |
| PLA-06 | Demander une avance | Créée en **« en attente »**. Il ne peut pas l'approuver lui-même |
| PLA-07 | Voir l'origine de ses avances | « Patron » ou « Pisteur / Délégué — Jean ». **Jamais regroupées** |
| PLA-08 | Lier un numéro Mobile Money | Autorisé |
| PLA-09 | Signer un bordereau | Autorisé |
| PLA-10 | Vérifier qu'il ne peut pas modifier un poids | Aucun accès en écriture sur une pesée |

---

## 7. Espace ADMINISTRATION (propriétaire)

Navigateur : `https://valeo-backend-xpnthz33nq-ew.a.run.app/api/admin`

| ID | Action | Résultat attendu |
|---|---|---|
| ADM-01 | Se connecter avec le mot de passe administrateur | Tableau de bord |
| ADM-02 | Comparer l'**empreinte** affichée avec celle de l'app (Connexion au serveur) | **Identiques**. Si elles diffèrent, téléphone et admin parlent à deux serveurs |
| ADM-03 | Ouvrir la fiche du comptable, changer sa fonction, enregistrer | Son rôle reste **« comptable »**. Il ne doit **pas** devenir patron |
| ADM-04 | Modifier un barème | Le changement arrive sur les téléphones à la synchro suivante |
| ADM-05 | Désactiver un collaborateur | Sa connexion est **refusée**, code correct ou non |
| ADM-06 | Réactiver le même | La connexion refonctionne |
| ADM-07 | Chercher un code secret dans une fiche | **Introuvable** : les empreintes ne quittent jamais le serveur |
| ADM-08 | Poser un nouveau code par « Réinitialiser » | La personne peut se connecter avec |
| ADM-09 | Purger les mouvements d'une coopérative | Double confirmation (recopier le nom). Les **acteurs** restent |
| ADM-10 | Après la purge, rouvrir l'app sur chaque téléphone | Le cache local se met à jour |

---

## 8. Chaîne financière complète

**Le test le plus important du cahier.** Il mobilise trois rôles à la suite.

| ID | Qui | Action | Résultat attendu |
|---|---|---|---|
| FIN-01 | Patron | Coop → Finances → « Budget d'achat » : **50 000 000** | Enregistré |
| FIN-02 | Patron | « Allouer » → Aminata : **20 000 000** | « Reste à allouer : 30 000 000 » |
| FIN-03 | Patron | Tenter d'allouer **40 000 000** de plus | **Refusé** — dépasse le budget |
| FIN-04 | Comptable | « Enveloppe » → Achat Cacao : **10 000 000** | Enregistré. Disponible : 10 000 000 |
| FIN-05 | Comptable | Tenter une enveloppe de **25 000 000** | **Refusé** — dépasse ses fonds alloués |
| FIN-06 | Comptable | « Mandat » → enveloppe Achat Cacao → Jean : **3 000 000** | « Reste à confier : 7 000 000 » |
| FIN-07 | Comptable | Mandats à Paul (2 000 000) puis à un 3ᵉ (1 500 000) | Total confié 6 500 000, solde enveloppe **3 500 000** |
| FIN-08 | Comptable | Tenter un mandat de **15 000 000** | **Refusé** — dépasse l'enveloppe |
| FIN-09 | Comptable | Dépense « Transport » : 100 000 F | Ses fonds disponibles baissent d'autant |
| FIN-10 | Patron | Ouvrir Coop → Finances | **Exactement les mêmes chiffres** que le comptable |
| FIN-11 | Comptable | Onglet « Sommes dues » | Jean apparaît avec commission + gain excédent, statut « À payer » |
| FIN-12 | Comptable | Payer **une partie** de ce qui est dû à Jean | Statut passe à « Partiellement payé » |
| FIN-13 | Comptable | Payer le solde | Statut « Payé », reste à 0 |
| FIN-14 | Comptable | Payer **plus** que le dû | Le trop-versé s'affiche en **négatif**, il n'est pas masqué |
| FIN-15 | Comptable | Onglet « Journal » | Budget, allocation, enveloppe, mandat, achat, dépense, règlement — du plus récent au plus ancien |

### Le calcul à vérifier à la main

Avec Jean : mandat 2 000 000, achats 2 200 000, 1 920 kg vérifiés, 20 kg
d'excédent à 1 200 F.

| Ligne | Valeur attendue |
|---|---|
| Commission (1 920 kg × 25) | **48 000 F** |
| Gain sur excédent (20 × 1 200) | **24 000 F** |
| Décaissé au-delà du mandat | **200 000 F** |
| **Total dû** | **272 000 F** |

> La commission porte sur les **1 920 kg vérifiés**, jamais sur les kilos
> déclarés au bord-champ.

---

## 9. Hors-ligne et synchronisation

C'est ici que se cachent les défauts les plus coûteux : ils sont **silencieux**.

| ID | Action | Résultat attendu |
|---|---|---|
| SYN-01 | Couper les données mobiles, peser 3 planteurs | Les pesées s'enregistrent normalement |
| SYN-02 | Regarder le bandeau en haut | Il **dit** que l'application n'est pas synchronisée |
| SYN-03 | Rétablir le réseau | Les 3 pesées remontent. Le bandeau redevient vert |
| SYN-04 | Patron et pisteur pèsent **en même temps**, hors ligne, puis se synchronisent | **Aucune pesée n'est perdue**. Les deux sont présentes |
| SYN-05 | Modifier une même fiche planteur depuis deux téléphones hors ligne | La modification la plus **récente** gagne. L'autre n'efface rien d'autre |
| SYN-06 | Régler l'horloge du téléphone **3 heures en retard**, peser, synchroniser | Un avertissement d'horloge apparaît |
| SYN-07 | Même chose avec l'horloge **en avance** | L'horodatage est ramené par le serveur, la pesée passe |
| SYN-08 | Ouvrir « Connexion au serveur » quand tout va bien | L'écran reste **accessible**. C'est le seul moyen de comparer les empreintes |
| SYN-09 | Désinstaller puis réinstaller l'APK, se reconnecter | Toutes les données reviennent du serveur |

---

## 10. Sécurité — ce qui doit être REFUSÉ

Un « refus attendu » qui n'arrive pas est un **défaut grave**. Ces contrôles
sont côté serveur : masquer un bouton ne suffit pas.

| ID | Qui | Tentative | Attendu |
|---|---|---|---|
| SEC-01 | Comptable | Créer ou modifier une pesée | **Refusé** |
| SEC-02 | Comptable | Créer un collaborateur | **Refusé** |
| SEC-03 | Comptable | Créer un budget d'achat ou s'allouer des fonds | **Refusé** — c'est au patron |
| SEC-04 | Comptable | Supprimer un mandat, une dépense ou un règlement | **Refusé** — définitif |
| SEC-05 | Pisteur | Vérifier un poids | **Refusé** |
| SEC-06 | Pisteur | Se donner un mandat | **Refusé** |
| SEC-07 | Pisteur | Ouvrir une enveloppe ou s'allouer des fonds | **Refusé** |
| SEC-08 | Magasinier | Approuver une demande d'avance | **Refusé** |
| SEC-09 | Magasinier | Changer un barème | **Refusé** |
| SEC-10 | Planteur | Voir un autre planteur | **Refusé** |
| SEC-11 | Tout rôle sauf patron | Poser ou effacer un code secret | **Refusé** |
| SEC-12 | Deux coopératives | Créer une 2ᵉ coopérative, chercher les planteurs de la 1ʳᵉ | **Totalement invisibles** — le test le plus important |
| SEC-13 | Patron | Enregistrer un poids ou un montant **négatif** | **Refusé**, même pour lui |

---

## 11. Pièges connus — à NE PAS signaler comme bug

Ces comportements sont **voulus**. Les signaler ferait perdre du temps.

| Ce que vous verrez | Pourquoi c'est normal |
|---|---|
| La commission d'un pisteur vaut **0 F** pendant sa tournée | Elle se gagne sur le poids **vérifié au magasin**. La ligne « en attente » annonce ce qui viendra |
| Un manquant **ne retire pas d'argent** au pisteur | Il crée une **dette en kilos**, remboursée en marchandise |
| Un excédent **ne va pas dans sa caisse** | Il est versé **avec sa commission** |
| Un achat à crédit **ne rend pas le solde négatif** | Rien n'est sorti de sa caisse. C'est une **dette envers le planteur** |
| Le stock peut être **négatif** | C'est un signal d'erreur de saisie. Le masquer serait pire |
| Un bénéfice d'expédition peut être **négatif** | Une expédition à perte doit se voir |
| Le prix d'une **ancienne** pesée ne change pas quand on change le barème | Le prix est **figé** à la pesée. Sinon on réécrirait des reçus déjà remis |
| Le comptable ne voit **aucune** dépense des pisteurs | Elles lui sont personnelles : les compter les paierait deux fois |
| `verif.kg` d'un planteur isolé n'est **pas** son poids vérifié | Le magasinier pèse **un chargement**, pas un planteur. C'est une quote-part |

---

## 12. Fiche de relevé

À recopier pour chaque anomalie.

```
ID du scénario ......... 
Rôle ................... 
Téléphone / version .... 
Réseau ................. en ligne / hors ligne
Ce que j'attendais ..... 
Ce que j'ai vu ......... 
Reproductible .......... oui / non / une seule fois
Capture d'écran ........ jointe / non
```

---

## 13. Feu vert pour le terrain

Le passage au terrain n'est raisonnable que si **tout** ce qui suit est vert :

- [ ] Section 8 (chaîne financière) : **aucun KO**
- [ ] Section 10 (sécurité) : **aucun refus manquant**
- [ ] SEC-12 (isolation entre coopératives) : vérifié
- [ ] SYN-04 (deux agents hors ligne) : aucune pesée perdue
- [ ] Les calculs de la section 8 recoupés **à la main**
- [ ] Un bordereau papier relu par quelqu'un qui n'a pas fait la pesée

### Avant la première vraie coopérative

- [ ] **Purger les données de test** (espace admin → purge des mouvements)
- [ ] Activer sur Firestore la **protection contre la suppression** et la
      **récupération à un instant donné** — aujourd'hui désactivées
- [ ] Poser `BACKEND_DEPRECIE` sur l'instance de test Render, sinon un vieil
      APK continuera d'écrire dans une base que plus personne ne lit
