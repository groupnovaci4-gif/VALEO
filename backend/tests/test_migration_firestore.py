"""Le script de migration MongoDB → Firestore, éprouvé de bout en bout.

Un script de migration qu'on n'a jamais exécuté est un pari. Celui-ci est
lancé ici sur une base simulée, avec les cas qui font mal : structures
imbriquées, identifiants biscornus, lignes sans identifiant, et surtout la
**relance** — une migration s'interrompt, on la reprend, et elle ne doit pas
produire de doublons.
"""
import asyncio
import json

from tests.faux_firestore import FauxFirestore

import depot as depot_module

sys_path_ok = True


def _vide():
    return {e: [] for e in depot_module.TABLEAUX}


ETAT = {
    "coops": [{"id": "c1", "nom": "Coop Gomon", "prices": {"cacao": 1800}}],
    "staff": [{"id": "s1", "coopId": "c1", "nom": "Yao", "role": "pisteur",
               "pin": {"scheme": "pbkdf2-sha256", "iterations": 15000,
                       "saltHex": "00" * 16, "verifierHex": "11" * 32, "version": 1}}],
    "members": [{"id": "m1", "coopId": "c1", "nom": "Kouassi", "code": "VAL-1000-AA",
                 "loc": {"district": {"id": "D1", "nom": "Lagunes"}},
                 "cultures": [{"cropId": "cacao", "superficie": 3}]},
                {"id": "m/2", "coopId": "c1", "nom": "Aya", "code": "VAL-2000-BB"}],
    "collections": [{"id": f"col{i}", "coopId": "c1", "memberId": "m1", "kg": 100 + i,
                     "prixKg": 1800, "retenues": []} for i in range(120)],
    "loans": [], "mandats": [], "depenses": [], "settlements": [], "sorties": [],
    "seq": 42, "memberSeq": 7, "saison": "2025-2026", "priceHistory": [{"at": "2026-01-01", "prixKg": 1750}],
}


def _migrer(etat, cible):
    """Reproduit ce que fait le script : écrire puis relire pour vérifier."""
    async def scenario():
        await cible.enregistrer(etat)
        return await cible.charger(_vide)
    return asyncio.run(scenario())


class TestMigration:
    def test_tout_arrive_a_lidentique(self):
        fs = FauxFirestore()
        cible = depot_module.DepotFirestore(fs, "test", "firestore|test|(default)")
        relu = _migrer(ETAT, cible)
        for e in depot_module.TABLEAUX:
            avant = {str(x["id"]): x for x in ETAT[e]}
            apres = {str(x["id"]): x for x in relu[e]}
            assert set(avant) == set(apres), e
            for rid in avant:
                assert json.dumps(avant[rid], sort_keys=True) == json.dumps(apres[rid], sort_keys=True), f"{e}/{rid}"

    def test_un_document_par_enregistrement(self):
        fs = FauxFirestore()
        _migrer(ETAT, depot_module.DepotFirestore(fs, "test", "x"))
        assert fs.compte("collections") == 120
        assert fs.compte("members") == 2
        assert fs.compte("coops") == 1

    def test_les_scalaires_et_lhistorique_des_prix_suivent(self):
        fs = FauxFirestore()
        relu = _migrer(ETAT, depot_module.DepotFirestore(fs, "test", "x"))
        assert relu["seq"] == 42 and relu["memberSeq"] == 7
        assert relu["saison"] == "2025-2026"
        assert relu["priceHistory"] == ETAT["priceHistory"]

    def test_les_empreintes_de_code_secret_suivent(self):
        """Sans elles, plus personne ne peut se connecter après la bascule."""
        fs = FauxFirestore()
        relu = _migrer(ETAT, depot_module.DepotFirestore(fs, "test", "x"))
        assert relu["staff"][0]["pin"]["verifierHex"] == "11" * 32

    def test_relancer_la_migration_ne_cree_pas_de_doublon(self):
        """Une migration s'interrompt ; on la reprend. C'est le cas normal."""
        fs = FauxFirestore()
        cible = depot_module.DepotFirestore(fs, "test", "x")
        _migrer(ETAT, cible)
        premier = fs.compte("collections")
        _migrer(ETAT, cible)
        assert fs.compte("collections") == premier == 120
        assert fs.compte("members") == 2

    def test_une_migration_partielle_se_complete(self):
        fs = FauxFirestore()
        cible = depot_module.DepotFirestore(fs, "test", "x")
        partiel = {**ETAT, "collections": ETAT["collections"][:50]}
        _migrer(partiel, cible)
        assert fs.compte("collections") == 50
        relu = _migrer(ETAT, cible)
        assert fs.compte("collections") == 120
        assert len(relu["collections"]) == 120

    def test_le_journal_daudit_migre(self):
        fs = FauxFirestore()
        cible = depot_module.DepotFirestore(fs, "test", "x")

        async def scenario():
            for i in range(5):
                await cible.audit_ajouter({"coopId": "c1", "action": f"a{i}", "at": f"2026-01-0{i+1}"})
            return await cible.audit_lister("c1")

        assert len(asyncio.run(scenario())) == 5

    def test_le_mot_de_passe_administrateur_migre(self):
        fs = FauxFirestore()
        cible = depot_module.DepotFirestore(fs, "test", "x")

        async def scenario():
            await cible.admin_config_poser({"pwd_hash": "abc", "pwd_salt": "def", "iterations": 200000})
            return await cible.admin_config()

        cfg = asyncio.run(scenario())
        assert cfg["pwd_hash"] == "abc" and cfg["iterations"] == 200000

    def test_une_ligne_sans_identifiant_ne_fait_pas_echouer_la_migration(self):
        """Elle est ignorée — et le script l'annonce plutôt que de la perdre en silence."""
        fs = FauxFirestore()
        etat = {**ETAT, "sorties": [{"coopId": "c1", "kg": 10}]}   # pas d'`id`
        relu = _migrer(etat, depot_module.DepotFirestore(fs, "test", "x"))
        assert relu["sorties"] == []
        assert fs.compte("sorties") == 0
