#!/usr/bin/env python3
"""Migration des données : MongoDB → Firestore (phase 3).

Ce script ne devine rien et n'efface rien côté MongoDB. Il lit l'état, le
réécrit dans Firestore **un document par enregistrement**, puis **relit** ce
qu'il vient d'écrire pour le comparer à la source. Sans cette relecture, on ne
saurait pas si la migration a réussi — on saurait seulement qu'elle n'a pas
levé d'exception, ce qui n'est pas la même chose.

Il est **idempotent** : chaque ligne est écrite sous son propre identifiant.
Le relancer après une interruption reprend là où on en était, sans doublon.

Usage
-----
    # Voir ce qui serait fait, sans rien écrire :
    python scripts/migrer_vers_firestore.py

    # Écrire pour de bon :
    python scripts/migrer_vers_firestore.py --ecrire

Variables attendues : `MONGO_URL`, `DB_NAME` (la source) et de quoi joindre
Firebase (`FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_SERVICE_ACCOUNT_FILE` ou
`GOOGLE_APPLICATION_CREDENTIALS`). `FIRESTORE_DATABASE` si la base n'est pas
`(default)`.

Ce qui est migré : l'état (coopératives, collaborateurs, planteurs, collectes,
avances, mandats, dépenses, soldes, sorties), le mot de passe administrateur et
le journal d'audit.
Ce qui ne l'est pas : les compteurs de tentatives de connexion — ils sont
éphémères et se reconstruisent seuls (invariant 17).
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RACINE / ".env")

import depot as depot_module  # noqa: E402


def _vide():
    return {e: [] for e in depot_module.TABLEAUX}


async def _source():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = await db.appstate.find_one({"_id": "main"}) or {}
    etat = doc.get("data") if isinstance(doc.get("data"), dict) else {}
    cfg = await db.admin_config.find_one({"_id": "admin"}) or {}
    cfg.pop("_id", None)
    audit = await db.audit.find({}, {"_id": 0}).to_list(length=None)
    client.close()
    return etat, cfg, audit


def _cible():
    os.environ["DATA_BACKEND"] = "firestore"
    d = depot_module.choisir(lambda: None, "")
    if not isinstance(d, depot_module.DepotFirestore):
        raise SystemExit("Firestore n'est pas joignable : vérifiez le compte de service.")
    return d


def _compter(etat: dict) -> dict:
    return {e: len([x for x in (etat.get(e) or []) if isinstance(x, dict) and x.get("id")])
            for e in depot_module.TABLEAUX}


def _sans_id(etat: dict) -> dict:
    """Lignes ignorées : sans identifiant, elles n'ont pas de document possible."""
    return {e: len([x for x in (etat.get(e) or []) if not (isinstance(x, dict) and x.get("id"))])
            for e in depot_module.TABLEAUX}


async def migrer(ecrire: bool) -> int:
    etat, cfg, audit = await _source()
    compte = _compter(etat)
    orphelines = {e: n for e, n in _sans_id(etat).items() if n}
    total = sum(compte.values())

    print("Source MongoDB")
    for e, n in compte.items():
        print(f"  {e:<12} {n:>6}")
    print(f"  {'audit':<12} {len(audit):>6}")
    print(f"  mot de passe administrateur : {'présent' if cfg.get('pwd_hash') else 'absent (celui de .env)'}")
    if orphelines:
        print("\n  ATTENTION — lignes SANS identifiant, non migrables :")
        for e, n in orphelines.items():
            print(f"    {e} : {n}")
    if not total and not audit:
        print("\nRien à migrer.")
        return 0

    if not ecrire:
        print(f"\n[simulation] {total} enregistrements + {len(audit)} lignes d'audit seraient écrits.")
        print("Relancez avec --ecrire pour effectuer la migration.")
        return 0

    cible = _cible()
    print(f"\nÉcriture vers Firestore (base « {cible.nom} »)…")
    # La référence du diff est vide : tout est écrit, rien n'est supprimé.
    await cible.enregistrer(etat)
    if cfg:
        await cible.admin_config_poser(cfg)
    for ligne in audit:
        await cible.audit_ajouter(ligne)

    print("Relecture pour vérification…")
    relu = await cible.charger(_vide)
    verif = _compter(relu)
    ecarts = {e: (compte[e], verif[e]) for e in compte if compte[e] != verif[e]}

    # Comparaison ligne par ligne, pas seulement les comptages : un document
    # tronqué compterait pour un.
    perdues = []
    for e in depot_module.TABLEAUX:
        avant = {str(x["id"]): x for x in (etat.get(e) or []) if isinstance(x, dict) and x.get("id")}
        apres = {str(x["id"]): x for x in (relu.get(e) or []) if isinstance(x, dict) and x.get("id")}
        for rid, ligne in avant.items():
            if rid not in apres:
                perdues.append(f"{e}/{rid} : absente")
            elif json.dumps(ligne, sort_keys=True, default=str) != json.dumps(apres[rid], sort_keys=True, default=str):
                perdues.append(f"{e}/{rid} : contenu différent")

    print("\nVérification")
    for e, n in verif.items():
        print(f"  {e:<12} {n:>6}")
    if ecarts or perdues:
        print("\nÉCHEC — la cible ne correspond pas à la source :")
        for e, (a, b) in ecarts.items():
            print(f"  {e} : {a} attendues, {b} trouvées")
        for ligne in perdues[:20]:
            print(f"  {ligne}")
        if len(perdues) > 20:
            print(f"  … et {len(perdues) - 20} autres")
        print("\nMongoDB n'a PAS été modifié : rien n'est perdu, corrigez et relancez.")
        return 1

    print(f"\nOK — {total} enregistrements et {len(audit)} lignes d'audit migrés à l'identique.")
    print("MongoDB reste intact : gardez-le tant que Firebase n'a pas tourné en parallèle (phase 6).")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Migre l'état VALEO de MongoDB vers Firestore.")
    ap.add_argument("--ecrire", action="store_true",
                    help="écrit réellement ; sans ce drapeau, simulation seule")
    raise SystemExit(asyncio.run(migrer(ap.parse_args().ecrire)))
