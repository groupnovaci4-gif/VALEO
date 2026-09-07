#!/usr/bin/env python3
"""Vérifie qu'on PEUT basculer — avant de couper quoi que ce soit (phase 6).

« Ne coupe pas l'ancien tant que le nouveau ne tourne pas parfaitement en
parallèle » est un bon conseil, mais ce n'est pas vérifiable à l'œil. Ce script
en fait un contrôle exécutable : il interroge les DEUX déploiements et refuse
la bascule tant qu'ils ne concordent pas.

Ce qu'il contrôle
-----------------
1. **Deux instances distinctes.** Le marqueur de `/health` doit DIFFÉRER : s'il
   est identique, les deux URL désignent le même déploiement et il n'y a rien à
   basculer (invariant 27).
2. **Les données sont arrivées.** Comptages par entité identiques des deux
   côtés, vus par l'API d'administration — donc à travers la même lecture que
   celle de l'application, pas en fouillant les bases.
3. **On peut se connecter au nouveau.** Un compte réel s'y authentifie ; sinon
   les codes secrets n'ont pas suivi, et personne ne pourra travailler demain.
4. **On peut y écrire.** Une écriture d'essai est envoyée, relue, puis
   **retirée**. Sans cela on ne saurait que lire — et une bascule vers un
   serveur en lecture seule ne se voit qu'au premier pisteur qui pèse.
5. **L'ancien annonce sa dépréciation.** L'en-tête `X-Valeo-Deprecie` doit être
   posé sur l'ancien déploiement : c'est lui qui préviendra les APK déjà
   installés, dont l'adresse est figée au build.

Usage
-----
    python scripts/verifier_bascule.py \\
        --ancien https://ancienne-instance \\
        --nouveau https://valeo-backend.run.app \\
        --admin 'MOT-DE-PASSE-ADMIN' \\
        [--compte patron@coop.ci --secret 'SECRET']

Le mot de passe n'est jamais journalisé. Code de sortie 0 = bascule possible.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

TEMPS_MORT = 20


def _appel(base, chemin, corps=None, jeton=None, methode=None):
    req = urllib.request.Request(
        base.rstrip("/") + chemin,
        data=json.dumps(corps).encode() if corps is not None else None,
        method=methode or ("POST" if corps is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    if jeton:
        req.add_header("Authorization", "Bearer " + jeton)
    try:
        with urllib.request.urlopen(req, timeout=TEMPS_MORT) as r:
            return r.status, json.loads(r.read() or b"{}"), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            charge = json.loads(e.read() or b"{}")
        except Exception:
            charge = {}
        return e.code, charge, dict(e.headers)
    except Exception as e:
        return 0, {"erreur": str(e)}, {}


class Controle:
    def __init__(self):
        self.ko = 0
        self.ok = 0

    def __call__(self, nom, condition, detail=""):
        if condition:
            self.ok += 1
            print(f"  ok   {nom}" + (f" — {detail}" if detail else ""))
        else:
            self.ko += 1
            print(f"  KO   {nom}" + (f" — {detail}" if detail else ""))
        return bool(condition)


def verifier(ancien, nouveau, admin, compte, secret) -> int:
    c = Controle()

    print("\n1. Deux déploiements distincts")
    _, sa, _ = _appel(ancien, "/health")
    _, sn, _ = _appel(nouveau, "/health")
    c("l'ancien répond", sa.get("status") == "ok", sa.get("instance", sa.get("erreur", "")))
    c("le nouveau répond", sn.get("status") == "ok", sn.get("instance", sn.get("erreur", "")))
    c("ce ne sont PAS deux fois la même instance",
      bool(sa.get("instance")) and sa.get("instance") != sn.get("instance"),
      f"{sa.get('instance')} vs {sn.get('instance')}")

    print("\n2. Les données sont arrivées")
    code_a, jeton_a, _ = _appel(ancien, "/api/admin/login", {"password": admin})
    code_n, jeton_n, _ = _appel(nouveau, "/api/admin/login", {"password": admin})
    if not c("connexion administrateur des deux côtés",
             code_a == 200 and code_n == 200, f"ancien {code_a} / nouveau {code_n}"):
        print("\nImpossible de comparer sans les deux jetons.")
        return 1
    ta, tn = jeton_a["access_token"], jeton_n["access_token"]
    _, da, _ = _appel(ancien, "/api/admin/diag", jeton=ta)
    _, dn, _ = _appel(nouveau, "/api/admin/diag", jeton=tn)
    ca, cn = da.get("compte") or {}, dn.get("compte") or {}
    # Deux bases vides « concordent » parfaitement : la comparaison ne veut
    # alors rien dire. Si l'ancien est vide, il n'y a rien à basculer — ou bien
    # on interroge la mauvaise instance, ce qui est pire.
    c("l'ancien contient bien des données à basculer",
      (da.get("coops") or 0) > 0 and sum(ca.values()) > 0,
      f"{da.get('coops')} coopérative(s), {sum(ca.values())} enregistrements")
    c("le nombre de coopératives concorde", da.get("coops") == dn.get("coops"),
      f"{da.get('coops')} vs {dn.get('coops')}")
    for entite in sorted(set(ca) | set(cn)):
        c(f"« {entite} » concorde", ca.get(entite) == cn.get(entite),
          f"{ca.get(entite)} vs {cn.get(entite)}")

    print("\n3. On peut se connecter au NOUVEAU")
    if compte and secret:
        code, rep, _ = _appel(nouveau, "/api/auth/coop/login", {"identifier": compte, "secret": secret})
        if code != 200:
            code, rep, _ = _appel(nouveau, "/api/auth/planteur/login", {"phone": compte, "pin": secret})
        c("le compte d'essai se connecte", code == 200,
          "les codes secrets ont suivi" if code == 200 else f"code {code}")
    else:
        print("  --   aucun compte d'essai fourni (--compte / --secret) : contrôle sauté")
        print("       ATTENTION : sans lui, rien ne prouve que les codes secrets ont suivi.")

    print("\n4. On peut ÉCRIRE sur le nouveau")
    etat = _appel(nouveau, "/api/admin/state", jeton=tn)[1]
    coops = etat.get("coops") or []
    if not coops:
        c("une coopérative existe pour l'essai", False, "aucune coopérative")
    else:
        coop_id = coops[0]["id"]
        marqueur = "verif-bascule-a-supprimer"
        essai = {**etat, "sorties": (etat.get("sorties") or []) + [
            {"id": marqueur, "coopId": coop_id, "motif": "perte", "kg": 0,
             "date": "2000-01-01T00:00:00.000Z", "note": "contrôle de bascule"}]}
        code, _, _ = _appel(nouveau, "/api/admin/state", {"data": essai}, jeton=tn, methode="PUT")
        relu = _appel(nouveau, "/api/admin/state", jeton=tn)[1]
        ecrit = any(x.get("id") == marqueur for x in (relu.get("sorties") or []))
        c("l'écriture d'essai est acceptée et relue", code == 200 and ecrit, f"code {code}")
        # On ne laisse jamais traîner une ligne d'essai dans les données réelles.
        propre = {**relu, "sorties": [x for x in (relu.get("sorties") or []) if x.get("id") != marqueur]}
        _appel(nouveau, "/api/admin/state", {"data": propre, "deletions": {"sorties": [marqueur]}},
               jeton=tn, methode="PUT")
        reste = _appel(nouveau, "/api/admin/state", jeton=tn)[1]
        c("la ligne d'essai a bien été retirée",
          not any(x.get("id") == marqueur for x in (reste.get("sorties") or [])))

    print("\n5. L'ancien prévient les téléphones")
    _, _, entetes = _appel(ancien, "/health")
    avis = {k.lower(): v for k, v in entetes.items()}.get("x-valeo-deprecie")
    c("l'ancien déploiement se déclare hors service", bool(avis),
      avis or "posez BACKEND_DEPRECIE sur l'ancienne instance")

    print(f"\n>>> {'BASCULE POSSIBLE' if c.ko == 0 else str(c.ko) + ' BLOCAGE(S)'} — {c.ok} contrôles")
    if c.ko:
        print("Ne coupez rien : corrigez d'abord ce qui précède.")
    return 0 if c.ko == 0 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Contrôle de pré-bascule VALEO (phase 6).")
    ap.add_argument("--ancien", required=True, help="URL du déploiement actuel")
    ap.add_argument("--nouveau", required=True, help="URL du déploiement Cloud Run")
    ap.add_argument("--admin", required=True, help="mot de passe administrateur (identique aux deux)")
    ap.add_argument("--compte", help="identifiant d'un compte réel, pour éprouver la connexion")
    ap.add_argument("--secret", help="son code secret")
    a = ap.parse_args()
    sys.exit(verifier(a.ancien, a.nouveau, a.admin, a.compte, a.secret))
