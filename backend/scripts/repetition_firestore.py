#!/usr/bin/env python3
"""Répétition générale contre un VRAI Firestore — sans rien déployer.

Toute la suite de sécurité tourne aujourd'hui contre un double en mémoire
(`tests/faux_firestore.py`). C'est rigoureux, mais un double reste un double :
il ne connaît ni la conversion des types au passage du réseau, ni les
identifiants de document que Firestore refuse, ni les index qu'il réclame, ni
la latence. Ce sont exactement les défauts qui n'apparaissent qu'en production
— c'est-à-dire, sans ce script, pendant la bascule, avec des pisteurs en
tournée.

Il fait tourner le VRAI backend, en processus, branché sur VOTRE base
Firestore. Aucune ligne d'application n'est simulée : `authorize_state_write`,
`merge_state` et `scope_state` sont ceux qui tourneront sur Cloud Run.

Ce qu'il contrôle
-----------------
1. **La base est joignable** et le dépôt actif est bien Firestore.
2. **Une coopérative se crée** et son patron se connecte (`/api/auth/register`
   puis `/api/auth/coop/login`) : le code secret est haché et relu.
3. **Une pesée traverse l'aller-retour** : envoyée par `PUT /api/state`,
   relue par `GET /api/state`, avec ses montants intacts. C'est là que se
   voient les conversions de types silencieuses.
4. **L'isolation entre coopératives tient** (invariant 1) : une seconde
   coopérative est créée, et son patron ne doit rien voir de la première.
5. **Les empreintes `pin` ne sortent pas** (invariant 5), sur aucun rôle.
6. **L'écriture est bien différentielle** (invariant 29) : une seconde pesée
   ne doit réécrire qu'une poignée de documents, pas la base entière. C'est ce
   qui décide de la facture.
7. **Le marqueur d'instance répond** (invariant 27), celui que l'application
   et le tableau de bord comparent.

Sécurité
--------
Le script REFUSE de tourner si la base contient déjà des données, sauf
`--forcer`. Il nettoie ensuite tout ce qu'il a créé, pour laisser la base dans
l'état où il l'a trouvée — condition pour que la migration parte d'une base
vierge (invariant 32).

Usage
-----
    cd backend
    set -a; source .env; set +a
    DATA_BACKEND=firestore FIREBASE_SERVICE_ACCOUNT_FILE=secrets/cle-service.json \
        python3 scripts/repetition_firestore.py

Code de sortie 0 = Firestore se comporte comme attendu.
"""
import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from verifier_configuration import Rapport  # noqa: E402

# Collections écrites par `depot.py`, y compris les auxiliaires.
AUXILIAIRES = ("meta", "audit", "login_attempts")


def _sauf_si(ok: bool, detail: str) -> str:
    """Un détail d'échec ne s'affiche QUE sur échec.

    `Rapport` imprime le détail dans les deux cas. Sans ce filtre, la première
    version affichait le corps de la réponse de `/api/auth/register` — donc le
    jeton de session complet — dans un rapport qu'on colle ensuite à un tiers.
    """
    return "" if ok else detail


def _secret(nom: str) -> str:
    """Un mot de passe d'essai, jamais un vrai."""
    return f"essai-{nom}-{uuid.uuid4().hex[:8]}"


async def _compter(client, collections) -> dict:
    """Nombre de documents par collection, sans rien modifier."""
    total = {}
    for c in collections:
        n = 0
        async for _ in client.collection(c).stream():
            n += 1
        if n:
            total[c] = n
    return total


async def _vider(client, collections) -> int:
    """Efface tout ce que les collections contiennent. Appelé après coup."""
    efface = 0
    for c in collections:
        # On repasse par `collection(c).document(id)` plutôt que par
        # `snap.reference` : l'identifiant suffit, et le dépôt n'a jamais
        # besoin de plus. Une dépendance de moins sur l'objet renvoyé.
        ids = [snap.id async for snap in client.collection(c).stream()]
        for i in range(0, len(ids), 400):
            lot = client.batch()
            for doc_id in ids[i:i + 400]:
                lot.delete(client.collection(c).document(doc_id))
            await lot.commit()
            efface += len(ids[i:i + 400])
    return efface


def _pesee(coop_id, staff_id, member_id, suffixe):
    """Une collecte complète, telle que l'application l'enverrait."""
    return {
        "id": f"col-{suffixe}", "seq": 1, "coopId": coop_id, "memberId": member_id,
        "byStaffId": staff_id, "date": "2026-01-15T09:00:00Z",
        "kg": 125, "sacs": 2, "prixKg": 1800, "commissionRate": 30,
        "cropId": "cacao", "origine": "magasin",
        "brut": 221400, "net": 221400, "paye": 200000, "reste": 21400,
        "retenues": [], "method": "espece", "note": "",
        "clientOpId": f"op-{suffixe}",
    }


async def _derouler(r: Rapport, forcer: bool, garder: bool, server) -> int:
    """Toute la répétition, sur UNE SEULE boucle d'événements.

    Ce point n'est pas cosmétique. Le vrai client Firestore repose sur gRPC,
    qui rattache ses appels à la boucle qui l'a utilisé en premier et rejette
    ensuite les autres (« attached to a different loop »). Une première version
    ouvrait sa propre boucle pour compter les documents pendant que
    `TestClient` en gérait une autre pour l'application : la répétition
    s'arrêtait à la troisième étape. Le double en mémoire n'a ni gRPC ni
    boucle, donc ne pouvait pas le montrer.

    D'où `httpx` + `ASGITransport` plutôt que `TestClient` : tout est `await`
    dans la même boucle, ce qui est aussi la situation réelle sous uvicorn.
    """
    import httpx

    collections = list(server.depot_module.TABLEAUX) + list(AUXILIAIRES)
    depot = server.depot
    client_fs = getattr(depot, "_client", None)

    r.titre("1. Le dépôt actif")
    # `isinstance`, pas le nom de la classe : une sous-classe est un dépôt
    # Firestore valide, et un contrôle sur le nom la rejetterait.
    est_fs = isinstance(depot, server.depot_module.DepotFirestore)
    if not r.exige("le dépôt actif est Firestore", est_fs,
                   _sauf_si(est_fs, f"trouvé « {type(depot).__name__} » — "
                                    "poser DATA_BACKEND=firestore")):
        return 0
    r.exige("un client Firestore est branché", client_fs is not None)
    r.exige("l'origine identifie projet et base", "firestore|" in depot.origine,
            depot.origine)

    r.titre("2. La base de départ")
    avant = await _compter(client_fs, collections)
    vide = not avant
    if not r.exige("la base est vide", vide or forcer,
                   _sauf_si(vide or forcer,
                            f"{avant} — la répétition écrit et nettoie : relancer avec "
                            "--forcer si vous acceptez d'y toucher")):
        return 0
    if not vide:
        r.surveille("base non vide, mais --forcer donné", False, f"{avant}")

    marque = uuid.uuid4().hex[:8]
    transport = httpx.ASGITransport(app=server.app)
    async with server.app.router.lifespan_context(server.app):
        async with httpx.AsyncClient(transport=transport,
                                     base_url="http://valeo", timeout=60) as api:
            await _scenario(r, api, marque, client_fs, collections)

    r.titre("9. Nettoyage")
    if garder:
        r.surveille("la base est laissée en l'état", False,
                    "--garder demandé : pensez à vider avant la migration")
        return -1
    efface = await _vider(client_fs, collections)
    reste = await _compter(client_fs, collections)
    r.exige("tout ce qui a été créé est effacé", not reste,
            f"{efface} documents retirés" if not reste else f"il reste {reste}")
    return efface


async def _scenario(r: Rapport, api, marque: str, client_fs, collections) -> None:
    """Le parcours métier, du compte créé à l'écriture différentielle."""
    r.titre("3. Créer une coopérative et s'y connecter")
    emailA, motA = f"patron-{marque}@essai.ci", _secret("a")
    rep = await api.post("/api/auth/register",
                         json={"email": emailA, "password": motA, "nom": "Patron A"})
    if not r.exige("POST /api/auth/register aboutit", rep.status_code == 200,
                   _sauf_si(rep.status_code == 200,
                            f"HTTP {rep.status_code} — {rep.text[:200]}")):
        return
    a = rep.json()
    jetonA, idA, staffA = a["token"], a["identity"]["coopId"], a["identity"]["sub"]

    # `CoopLoginBody` attend `identifier` + `secret`, pas `email` + `password` :
    # la première version renvoyait 422 et le contrôle du mauvais secret passait
    # alors pour la mauvaise raison (422 != 200).
    rep = await api.post("/api/auth/coop/login",
                         json={"identifier": emailA, "secret": motA})
    r.exige("le patron se reconnecte avec son secret", rep.status_code == 200,
            _sauf_si(rep.status_code == 200, f"HTTP {rep.status_code} — {rep.text[:200]}"))
    # 401 précisément : n'importe quel code non-200 passerait, y compris une
    # charge utile malformée, ce qui ne prouverait rien.
    faux = await api.post("/api/auth/coop/login",
                          json={"identifier": emailA, "secret": "mauvais-code"})
    r.exige("un mauvais secret est refusé par un 401", faux.status_code == 401,
            _sauf_si(faux.status_code == 401, f"HTTP {faux.status_code}"))

    r.titre("4. Une pesée fait l'aller-retour")
    entete = {"Authorization": f"Bearer {jetonA}"}
    etat = (await api.get("/api/state", headers=entete)).json()
    etat.setdefault("members", []).append({
        "id": f"mem-{marque}", "coopId": idA, "code": "PL-2026-0001",
        "nom": "Planteur d'essai", "village": "Essai", "tel": "0700000001",
        "cropId": "cacao", "superficie": 3,
    })
    etat.setdefault("collections", []).append(_pesee(idA, staffA, f"mem-{marque}", marque))
    rep = await api.put("/api/state", headers=entete, json={"data": etat})
    r.exige("PUT /api/state est accepté", rep.status_code == 200,
            _sauf_si(rep.status_code == 200, f"HTTP {rep.status_code} — {rep.text[:200]}"))

    relu = (await api.get("/api/state", headers=entete)).json()
    col = {c["id"]: c for c in (relu.get("collections") or [])}.get(f"col-{marque}")
    r.exige("la pesée est relue depuis Firestore", col is not None)
    if col:
        r.exige("le poids traverse intact", col.get("kg") == 125, f"kg = {col.get('kg')!r}")
        r.exige("le prix figé traverse intact", col.get("prixKg") == 1800,
                f"prixKg = {col.get('prixKg')!r} (invariant 6)")
        r.exige("le reste dû traverse intact", col.get("reste") == 21400,
                f"reste = {col.get('reste')!r}")
        r.exige("les types restent numériques",
                all(isinstance(col.get(k), int) for k in ("kg", "prixKg", "reste")),
                "un nombre revenu en texte fausserait tous les calculs")
    r.exige("le planteur créé est relu",
            any(m["id"] == f"mem-{marque}" for m in (relu.get("members") or [])))

    r.titre("5. Les empreintes ne sortent pas (invariant 5)")
    r.exige("aucun `pin` dans l'état renvoyé au patron",
            all("pin" not in s for s in (relu.get("staff") or [])),
            "une empreinte qui sort est une empreinte qu'on attaque hors ligne")

    r.titre("6. Isolation entre coopératives (invariant 1)")
    emailB, motB = f"patron-{marque}-b@essai.ci", _secret("b")
    rep = await api.post("/api/auth/register",
                         json={"email": emailB, "password": motB, "nom": "Patron B"})
    r.exige("une seconde coopérative se crée", rep.status_code == 200,
            _sauf_si(rep.status_code == 200, f"HTTP {rep.status_code}"))
    if rep.status_code == 200:
        b = rep.json()
        vueB = (await api.get("/api/state",
                              headers={"Authorization": f"Bearer {b['token']}"})).json()
        r.exige("B ne voit AUCUNE collecte de A",
                f"col-{marque}" not in {c["id"] for c in (vueB.get("collections") or [])},
                "c'est la garantie la plus importante du produit")
        r.exige("B ne voit AUCUN planteur de A",
                f"mem-{marque}" not in {m["id"] for m in (vueB.get("members") or [])})
        r.exige("B ne voit que sa propre coopérative",
                {c["id"] for c in (vueB.get("coops") or [])} == {b["identity"]["coopId"]})

    r.titre("6bis. Une coopérative ne peut pas ÉCRASER l'autre")
    # La section 6 prouve que B ne VOIT pas les données de A. Elle ne prouve
    # PAS que B ne peut pas les DÉTRUIRE — et c'était précisément la faille :
    # la clé de document Firestore était l'identifiant métier seul, dans des
    # collections globales, donc B écrasait la ligne de A en réutilisant son
    # `id`. Jusqu'à la fiche du patron de A, empreinte `pin` comprise, qui ne
    # pouvait alors plus se connecter — le `PUT` répondant 200.
    #
    # Ce contrôle-ci est le SEUL du script à éprouver le correctif contre un
    # vrai Firestore : partout ailleurs la preuve vient du double en mémoire,
    # qui ne connaît pas la façon dont Firestore adresse ses documents.
    if rep.status_code == 200:
        vueB = (await api.get("/api/state",
                              headers={"Authorization": f"Bearer {b['token']}"})).json()
        vueB.setdefault("members", []).append({
            "id": f"mem-{marque}", "coopId": b["identity"]["coopId"],
            "code": "PL-B-0001", "nom": "PLANTEUR DE B", "village": "Ailleurs",
            "tel": "0700000002", "cropId": "cacao"})
        r_ecr = await api.put("/api/state",
                              headers={"Authorization": f"Bearer {b['token']}"},
                              json={"data": vueB})
        chezA = [m for m in (await api.get("/api/state", headers=entete)).json().get("members") or []
                 if m["id"] == f"mem-{marque}"]
        r.exige("le planteur de A survit à un identifiant identique chez B",
                len(chezA) == 1 and chezA[0].get("nom") == "Planteur d'essai",
                _sauf_si(len(chezA) == 1 and chezA[0].get("nom") == "Planteur d'essai",
                         f"PUT de B = {r_ecr.status_code} ; chez A : "
                         f"{[m.get('nom') for m in chezA] or 'FICHE DÉTRUITE'}"))

        # Le cas le plus grave : écraser un `staff` efface son empreinte, donc
        # sa connexion. On le vérifie en se reconnectant réellement.
        vueB = (await api.get("/api/state",
                              headers={"Authorization": f"Bearer {b['token']}"})).json()
        vueB.setdefault("staff", []).append({
            "id": staffA, "coopId": b["identity"]["coopId"], "role": "pisteur",
            "nom": "ECRASEUR", "tel": "0700000009"})
        await api.put("/api/state",
                      headers={"Authorization": f"Bearer {b['token']}"},
                      json={"data": vueB})
        rc = await api.post("/api/auth/coop/login",
                            json={"identifier": emailA, "secret": motA})
        r.exige("le patron de A peut toujours se connecter", rc.status_code == 200,
                _sauf_si(rc.status_code == 200,
                         f"HTTP {rc.status_code} — son empreinte a été écrasée "
                         "depuis une autre coopérative"))

    r.titre("7. L'écriture est différentielle (invariant 29)")
    # On compte les DOCUMENTS Firestore, pas les lignes de l'état renvoyé :
    # c'est la seule mesure qui dise quelque chose sur la facture. Un dépôt
    # qui réécrirait tout à chaque enregistrement renverrait le même état.
    avant_docs = await _compter(client_fs, collections)
    etat2 = (await api.get("/api/state", headers=entete)).json()
    etat2["collections"].append(_pesee(idA, staffA, f"mem-{marque}", marque + "b"))
    await api.put("/api/state", headers=entete, json={"data": etat2})
    apres_docs = await _compter(client_fs, collections)
    ajout = apres_docs.get("collections", 0) - avant_docs.get("collections", 0)
    r.exige("une seconde pesée n'ajoute qu'un document", ajout == 1,
            _sauf_si(ajout == 1, f"{ajout} documents ajoutés — Firestore se "
                                 "facture à l'opération"))
    inchanges = {c: n for c, n in avant_docs.items()
                 if c not in ("collections", "meta") and apres_docs.get(c) != n}
    r.exige("aucune autre collection n'a bougé", not inchanges,
            _sauf_si(not inchanges, f"{inchanges}"))

    r.titre("8. Le marqueur d'instance (invariant 27)")
    sante = await api.get("/health")
    r.exige("/health répond", sante.status_code == 200,
            _sauf_si(sante.status_code == 200, f"HTTP {sante.status_code}"))
    if sante.status_code == 200:
        r.exige("un marqueur d'instance est publié", bool((sante.json() or {}).get("instance")),
                "c'est le seul contrôle possible avant d'être connecté")


def verifier(r: Rapport, forcer: bool, garder: bool) -> int:
    import server
    return asyncio.run(_derouler(r, forcer, garder, server))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Répétition générale du backend VALEO contre un vrai Firestore.")
    ap.add_argument("--forcer", action="store_true",
                    help="tourner même si la base contient déjà des données")
    ap.add_argument("--garder", action="store_true",
                    help="ne pas nettoyer à la fin (pour inspecter dans la console)")
    a = ap.parse_args(argv)

    if os.environ.get("DATA_BACKEND", "").lower() != "firestore":
        print("DATA_BACKEND=firestore est requis pour cette répétition.", file=sys.stderr)
        print("Le but est justement de ne PAS passer par un double.", file=sys.stderr)
        return 2

    # Une machine porte souvent plusieurs Python (celui du système, celui de
    # python.org, celui qu'installe Homebrew en dépendance de gcloud...). Les
    # dépendances sont dans UN seul d'entre eux, et « No module named fastapi »
    # ne dit pas lequel manque — d'où ce message, qui nomme le coupable.
    manquants = []
    for module in ("fastapi", "firebase_admin", "google.cloud.firestore"):
        try:
            __import__(module)
        except ImportError:
            manquants.append(module)
    if manquants:
        print(f"Modules absents pour CET interpréteur : {', '.join(manquants)}",
              file=sys.stderr)
        print(f"  interpréteur : {sys.executable}", file=sys.stderr)
        print("Les dépendances ont probablement été installées pour un autre Python.",
              file=sys.stderr)
        print("  `which -a python3` liste ceux que vous avez ;", file=sys.stderr)
        print("  relancez avec le chemin complet de celui qui a servi à "
              "`pip3 install -r requirements-dev.txt`.", file=sys.stderr)
        return 2

    r = Rapport()
    try:
        verifier(r, a.forcer, a.garder)
    except Exception as exc:  # la panne est un résultat, pas un plantage
        r.titre("Interruption")
        r.exige("la répétition va au bout", False, f"{type(exc).__name__} : {exc}")

    print("\n".join(r.lignes))
    total = r.ok + r.avis + r.ko
    if r.ko:
        print(f"\n>>> {r.ko} PROBLÈME(S) — {total} contrôles ({r.avis} à surveiller)")
        print("Ne déployez pas avant d'avoir compris ce qui précède.")
        return 1
    print(f"\n>>> FIRESTORE SE COMPORTE COMME ATTENDU — {total} contrôles "
          f"({r.avis} à surveiller)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
