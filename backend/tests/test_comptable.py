"""Le rôle COMPTABLE : il finance, il ne pèse pas.

C'est toute la raison d'être de ce rôle, et la seule règle qui compte vraiment
ici. Un comptable qui pourrait modifier une pesée, une livraison ou un solde
corrigerait ses chiffres financiers **en changeant le terrain** — la fraude la
plus difficile à détecter, parce qu'elle laisse des comptes parfaitement
équilibrés en face d'un stock faux.

D'où la séparation, appliquée **sur la donnée** et pas seulement à l'écran :
les opérations de terrain alimentent la comptabilité, jamais l'inverse.

Le refus est la valeur par défaut du serveur (`Rôle inconnu : écriture
refusée`) : ces tests vérifient donc les deux sens — ce que le comptable peut
faire, et ce qu'il ne peut pas.
"""
import pytest

from tests.test_state_authorization import (
    _collection, _get_state, _pin_record, _put, _seed_coop,
)


def _seed_comptable(client, tokens):
    """Ajoute un comptable à la coopérative et le connecte.

    Créé par le PATRON, comme tout collaborateur, avec le circuit de connexion
    existant : téléphone + code à 6 chiffres. VALEO n'a pas de connexion par
    e-mail et mot de passe — l'en inventer une pour ce seul rôle l'aurait privé
    du verrou anti-force-brute (invariant 17) et de la révocation.
    """
    vue = _get_state(client, tokens["patron"])
    vue["staff"] = list(vue["staff"]) + [{
        "id": "st-compta", "nom": "Aminata", "role": "comptable",
        "tel": "0700000004", "pin": _pin_record(client, "444444"),
        "updatedAt": "2026-01-01T08:00:00.000Z",
    }]
    assert _put(client, tokens["patron"], vue).status_code == 200
    r = client.post("/api/auth/coop/login",
                    json={"identifier": "0700000004", "secret": "444444"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _coop_id(client, token):
    return _get_state(client, token)["coops"][0]["id"]


def _budget(coop_id, staff_id, montant=10_000_000):
    return {
        "id": "bud-1", "coopId": coop_id, "libelle": "Campagne cacao",
        "montant": montant, "debut": "2026-10-01", "fin": "2026-12-31",
        "note": "", "byStaffId": staff_id, "date": "2026-10-01T08:00:00.000Z",
    }


def _avec_enveloppe(vue, coop_id, montant=10_000_000):
    """Ouvre une enveloppe dans la vue : un mandat en exige une (plafond).

    C'est une règle métier, pas une commodité de test : confier des fonds que
    la campagne n'a pas budgétés est précisément ce que le plafond refuse.
    """
    vue["budgets"] = list(vue.get("budgets") or []) + [_budget(coop_id, "st-compta", montant)]
    return vue


def _reglement(coop_id, staff_id, beneficiaire, amount=100_000):
    return {
        "id": "reg-1", "coopId": coop_id, "staffId": beneficiaire,
        "amount": amount, "date": "2026-11-01T08:00:00.000Z",
        "byStaffId": staff_id, "method": "espece", "note": "",
    }


class TestCeQueLeComptablePeutFaire:
    def test_il_cree_une_enveloppe_de_campagne(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(_coop_id(app_client, jeton), "st-compta")]
        assert _put(app_client, jeton, vue).status_code == 200
        relu = _get_state(app_client, jeton)["budgets"]
        assert len(relu) == 1 and relu[0]["montant"] == 10_000_000

    def test_il_confie_un_mandat_a_un_pisteur(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _avec_enveloppe(_get_state(app_client, jeton), cid)
        vue["mandats"] = [{
            "id": "man-1", "coopId": cid,
            "pisteurId": "st-pisteur", "amount": 2_000_000,
            "date": "2026-10-02T08:00:00.000Z", "note": "",
        }]
        assert _put(app_client, jeton, vue).status_code == 200

    def test_il_enregistre_une_depense_de_la_cooperative(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["depenses"] = list(vue.get("depenses") or []) + [{
            "id": "dep-1", "coopId": _coop_id(app_client, jeton),
            "pisteurId": "st-compta", "category": "Transport", "amount": 75_000,
            "date": "2026-11-01T08:00:00.000Z", "note": "Camion Abidjan",
            "beneficiaire": "Transporteur Koné", "mode": "espece",
            "reference": "BL-2210",
        }]
        assert _put(app_client, jeton, vue).status_code == 200

    def test_il_regle_ce_que_la_cooperative_doit_a_un_agent(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["reglements"] = [_reglement(_coop_id(app_client, jeton),
                                        "st-compta", "st-pisteur")]
        assert _put(app_client, jeton, vue).status_code == 200


class TestCeQueLeComptableNePeutPasFaire:
    """La séparation opérations / comptabilité, appliquée sur la donnée."""

    def test_il_ne_pese_pas(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["collections"] = list(vue["collections"]) + [
            _collection("col-compta", "mb-1", "st-compta")]
        assert _put(app_client, jeton, vue).status_code == 403

    def test_il_ne_modifie_pas_une_pesee_existante(self, app_client):
        """LE test qui compte : corriger un solde en changeant le terrain."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"] = list(vue["collections"]) + [
            _collection("col-1", "mb-1", t["patron_id"])]
        assert _put(app_client, t["patron"], vue).status_code == 200

        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        for c in vue["collections"]:
            if c["id"] == "col-1":
                c["paye"] = 1
                c["updatedAt"] = "2026-12-31T08:00:00.000Z"
        assert _put(app_client, jeton, vue).status_code == 403

    def test_il_ne_verifie_pas_une_livraison(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"] = list(vue["collections"]) + [
            _collection("col-2", "mb-1", "st-pisteur")]
        assert _put(app_client, t["patron"], vue).status_code == 200

        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        for c in vue["collections"]:
            if c["id"] == "col-2":
                c["verif"] = {"kg": 90, "byStaffId": "st-compta",
                              "date": "2026-12-01T08:00:00.000Z"}
                c["updatedAt"] = "2026-12-31T08:00:00.000Z"
        assert _put(app_client, jeton, vue).status_code == 403

    def test_il_ne_cree_pas_de_collaborateur(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["staff"] = list(vue["staff"]) + [{
            "id": "st-faux", "nom": "Inventé", "role": "pisteur",
            "tel": "0700000099", "updatedAt": "2026-12-01T08:00:00.000Z"}]
        assert _put(app_client, jeton, vue).status_code == 403

    def test_il_ne_touche_pas_aux_baremes(self, app_client):
        """Modifier le prix au kilo changerait toutes les commissions dues."""
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["coops"][0]["prices"] = {"cacao": 9999}
        vue["coops"][0]["updatedAt"] = "2026-12-01T08:00:00.000Z"
        assert _put(app_client, jeton, vue).status_code == 403

    @pytest.mark.parametrize("entite", ["budgets", "mandats", "depenses", "reglements"])
    def test_il_ne_supprime_aucune_ecriture_financiere(self, app_client, entite):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        lignes = {
            "budgets": _budget(cid, "st-compta"),
            "mandats": {"id": "man-1", "coopId": cid, "pisteurId": "st-pisteur",
                        "amount": 500_000, "date": "2026-10-02T08:00:00.000Z", "note": ""},
            "depenses": {"id": "dep-1", "coopId": cid, "pisteurId": "st-compta",
                         "category": "Loyer", "amount": 50_000,
                         "date": "2026-10-03T08:00:00.000Z", "note": ""},
            "reglements": _reglement(cid, "st-compta", "st-pisteur"),
        }
        vue = _get_state(app_client, jeton)
        if entite != "budgets":
            _avec_enveloppe(vue, cid)      # un mandat exige une enveloppe
        vue[entite] = list(vue.get(entite) or []) + [lignes[entite]]
        assert _put(app_client, jeton, vue).status_code == 200

        vue = _get_state(app_client, jeton)
        vue[entite] = [x for x in vue[entite] if x["id"] != lignes[entite]["id"]]
        r = _put(app_client, jeton, vue, deletions={entite: [lignes[entite]["id"]]})
        assert r.status_code == 403, f"« {entite} » supprimable : {r.text}"

    @pytest.mark.parametrize("entite,champ", [
        ("mandats", "amount"), ("depenses", "amount"), ("reglements", "amount"),
    ])
    def test_un_mouvement_d_argent_enregistre_est_definitif(self, app_client, entite, champ):
        """Corriger, c'est écrire une opération de correction — jamais récrire."""
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        lignes = {
            "mandats": {"id": "m9", "coopId": cid, "pisteurId": "st-pisteur",
                        "amount": 500_000, "date": "2026-10-02T08:00:00.000Z", "note": ""},
            "depenses": {"id": "d9", "coopId": cid, "pisteurId": "st-compta",
                         "category": "Loyer", "amount": 50_000,
                         "date": "2026-10-03T08:00:00.000Z", "note": ""},
            "reglements": _reglement(cid, "st-compta", "st-pisteur"),
        }
        vue = _get_state(app_client, jeton)
        if entite != "budgets":
            _avec_enveloppe(vue, cid)      # un mandat exige une enveloppe
        vue[entite] = list(vue.get(entite) or []) + [lignes[entite]]
        assert _put(app_client, jeton, vue).status_code == 200

        vue = _get_state(app_client, jeton)
        for x in vue[entite]:
            if x["id"] == lignes[entite]["id"]:
                x[champ] = 1
                x["updatedAt"] = "2026-12-31T08:00:00.000Z"
        assert _put(app_client, jeton, vue).status_code == 403

    def test_un_reglement_doit_etre_a_son_nom_et_designer_un_beneficiaire(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)

        vue = _get_state(app_client, jeton)
        faux = _reglement(cid, "st-pisteur", "st-pisteur")  # signé d'un autre
        vue["reglements"] = [faux]
        assert _put(app_client, jeton, vue).status_code == 403

        vue = _get_state(app_client, jeton)
        sans = _reglement(cid, "st-compta", "")
        vue["reglements"] = [sans]
        assert _put(app_client, jeton, vue).status_code == 403


class TestLesAutresRolesNeTouchentPasAuxFinances:
    @pytest.mark.parametrize("qui", ["pisteur", "commis"])
    @pytest.mark.parametrize("entite", ["budgets", "reglements"])
    def test_un_agent_de_terrain_ne_cree_ni_enveloppe_ni_reglement(
            self, app_client, qui, entite):
        """Sans quoi un agent se paierait lui-même."""
        t = _seed_coop(app_client)
        cid = _coop_id(app_client, t["patron"])
        ligne = (_budget(cid, "st-pisteur") if entite == "budgets"
                 else _reglement(cid, "st-pisteur", "st-pisteur"))
        vue = _get_state(app_client, t[qui])
        vue[entite] = list(vue.get(entite) or []) + [ligne]
        assert _put(app_client, t[qui], vue).status_code == 403

    def test_le_planteur_non_plus(self, app_client):
        t = _seed_coop(app_client)
        cid = _coop_id(app_client, t["patron"])
        vue = _get_state(app_client, t["planteur"])
        vue["budgets"] = [_budget(cid, "mb-1")]
        assert _put(app_client, t["planteur"], vue).status_code == 403


class TestPerimetreDuComptable:
    def test_il_ne_voit_PAS_les_depenses_privees_d_un_pisteur(self, app_client):
        """Invariant 24 : le pisteur est un prestataire, ses frais sont à lui.

        Le comptable tient les comptes de la COOPÉRATIVE. Lui montrer les frais
        personnels d'un prestataire serait une fuite, et les additionner à ceux
        de la coopérative les ferait payer deux fois.
        """
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["depenses"] = list(vue.get("depenses") or []) + [{
            "id": "dep-prive", "coopId": _coop_id(app_client, t["patron"]),
            "pisteurId": "st-pisteur", "category": "Carburant", "amount": 12_000,
            "date": "2026-11-02T08:00:00.000Z", "note": "moto",
        }]
        assert _put(app_client, t["pisteur"], vue).status_code == 200

        jeton = _seed_comptable(app_client, t)
        vues = _get_state(app_client, jeton).get("depenses") or []
        assert all(d["id"] != "dep-prive" for d in vues), \
            "les frais personnels du pisteur sont visibles du comptable"

    def test_il_lit_bien_les_donnees_de_terrain(self, app_client):
        """Il ne les écrit pas, mais il doit les VOIR : sans les achats, aucune
        comptabilité n'est possible."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["collections"] = list(vue["collections"]) + [
            _collection("col-lu", "mb-1", t["patron_id"])]
        assert _put(app_client, t["patron"], vue).status_code == 200

        jeton = _seed_comptable(app_client, t)
        lues = _get_state(app_client, jeton)["collections"]
        assert any(c["id"] == "col-lu" for c in lues)


class TestPersistanceDuComptable:
    """Le cycle complet : création, relecture, reconnexion, liste du patron.

    Le défaut signalé sur le terrain — « le comptable ne reste pas enregistré »
    — ne venait PAS d'ici : ces contrôles passent, et c'est ce qui permet de
    dire où il venait vraiment (l'écran « Mes collaborateurs » filtrait le rôle
    à l'affichage). Les garder est ce qui distingue « invisible » de « perdu »
    la prochaine fois : sans eux, les deux hypothèses se ressemblent.
    """

    def test_le_patron_le_retrouve_apres_rechargement(self, app_client):
        t = _seed_coop(app_client)
        _seed_comptable(app_client, t)
        # Relecture complète, comme au redémarrage de l'application.
        vue = _get_state(app_client, t["patron"])
        compta = [s for s in vue["staff"] if s.get("role") == "comptable"]
        assert len(compta) == 1, "le comptable doit figurer dans l'équipe du patron"
        assert compta[0]["nom"] == "Aminata"
        assert compta[0]["coopId"] == vue["coops"][0]["id"], "rattaché à SA coopérative"
        assert "pin" not in compta[0], "l'empreinte ne quitte jamais le serveur"

    def test_il_se_reconnecte_et_garde_son_role(self, app_client):
        t = _seed_coop(app_client)
        _seed_comptable(app_client, t)
        for _ in range(2):  # déconnexion / reconnexion
            r = app_client.post("/api/auth/coop/login",
                                json={"identifier": "0700000004", "secret": "444444"})
            assert r.status_code == 200, r.text
            ident = r.json()["identity"]
            assert ident["role"] == "comptable"
            assert ident["side"] == "coop"
            assert ident["coopId"], "la coopérative voyage dans le jeton"

    def test_une_ecriture_du_comptable_survit_a_une_synchro_du_patron(self, app_client):
        # Perte de mise à jour : le patron renvoie sa vue, plus ancienne. Le
        # comptable ne doit pas en disparaître (invariant 3).
        t = _seed_coop(app_client)
        avant = _get_state(app_client, t["patron"])
        jeton = _seed_comptable(app_client, t)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(_coop_id(app_client, jeton), "st-compta")]
        assert _put(app_client, jeton, vue).status_code == 200
        assert _put(app_client, t["patron"], avant).status_code == 200
        apres = _get_state(app_client, t["patron"])
        assert any(s.get("role") == "comptable" for s in apres["staff"])
        assert len(apres["budgets"]) == 1, "l'enveloppe survit à la synchro du patron"


class TestRolesConnusDuTableauDeBord:
    """Le menu « Rôle » de l'espace admin doit connaître TOUS les rôles.

    Défaut trouvé à l'audit, et le plus dangereux des deux : le menu
    n'énumérait que `patron / commis / pisteur`. Le rendu ne coche l'option que
    si elle figure dans la liste (`o===val`) — un comptable ouvert dans
    l'éditeur s'affichait donc sur la PREMIÈRE option, `patron`, et
    l'enregistrer le **promouvait patron** en silence. Élévation de privilège
    par l'interface d'administration, sans le moindre message.

    Ce test lie le menu à la matrice d'autorisation elle-même, plutôt qu'à une
    liste recopiée : ajouter un rôle au serveur sans l'ajouter au menu échoue
    désormais ici.
    """

    @staticmethod
    def _roles_du_serveur():
        import inspect
        import re

        import server
        src = inspect.getsource(server.authorize_state_write)
        roles = set(re.findall(r'role == "([a-z]+)"', src))
        for groupe in re.findall(r'role in \(([^)]*)\)', src):
            roles |= set(re.findall(r'"([a-z]+)"', groupe))
        return roles

    @staticmethod
    def _roles_du_menu():
        import pathlib
        import re

        src = pathlib.Path(__file__).resolve().parent.parent / "server.py"
        m = re.search(r'\{k:"role",l:"Rôle",opt:\[([^\]]*)\]\}', src.read_text(encoding="utf-8"))
        assert m, "le champ « Rôle » du tableau de bord est introuvable"
        return set(re.findall(r'"([a-z]+)"', m.group(1)))

    def test_le_menu_couvre_toute_la_matrice_dautorisation(self):
        serveur = self._roles_du_serveur()
        assert "comptable" in serveur, "garde-fou : la matrice doit connaître le comptable"
        manquants = serveur - self._roles_du_menu()
        assert not manquants, (
            f"rôles absents du menu de l'admin : {sorted(manquants)}. "
            "L'éditeur retomberait sur la première option et changerait le rôle "
            "à l'enregistrement."
        )

    def test_le_menu_ninvente_aucun_role(self):
        # L'inverse est tout aussi grave : un rôle proposé par l'admin mais
        # inconnu de `authorize_state_write` produirait un compte capable de se
        # connecter et incapable d'écrire quoi que ce soit (« Rôle inconnu »).
        inventes = self._roles_du_menu() - self._roles_du_serveur()
        assert not inventes, f"rôles proposés mais non autorisés : {sorted(inventes)}"

    def test_un_comptable_edite_depuis_ladmin_garde_son_role(self, app_client):
        # Le scénario complet du défaut : l'admin ouvre la fiche et enregistre.
        from tests.test_admin_sync import _admin, _admin_get, _admin_put
        t = _seed_coop(app_client)
        _seed_comptable(app_client, t)
        jeton = _admin(app_client)
        etat = _admin_get(app_client, jeton)
        cible = next(s for s in etat["staff"] if s.get("role") == "comptable")
        cible["fonction"] = "Chef comptable"          # une modification réelle
        assert _admin_put(app_client, jeton, etat, {}).status_code == 200
        garde = next(s for s in _admin_get(app_client, jeton)["staff"] if s["id"] == cible["id"])
        assert garde["role"] == "comptable", "l'édition admin ne doit pas changer le rôle"
        assert garde["fonction"] == "Chef comptable"


class TestPlafondDeLEnveloppe:
    """Un mandat ne peut pas dépasser l'enveloppe de la campagne.

    On bloque là où l'argent n'est PAS encore sorti. Confier un mandat est une
    décision prise au bureau : la refuser ne perd rien. Acheter au-delà de son
    mandat est un fait accompli sur le terrain : le refuser supprimerait la
    trace de l'achat, pas l'achat — d'où l'asymétrie, délibérée.
    """

    @staticmethod
    def _mandat(coop_id, montant, ident="man-x"):
        return {
            "id": ident, "coopId": coop_id, "pisteurId": "st-pist",
            "amount": montant, "date": "2026-10-02T08:00:00.000Z", "note": "",
        }

    def test_un_mandat_dans_lenveloppe_passe(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 10_000_000)]
        vue["mandats"] = list(vue.get("mandats") or []) + [self._mandat(cid, 2_000_000)]
        assert _put(app_client, jeton, vue).status_code == 200

    def test_un_mandat_au_dela_de_lenveloppe_est_refuse(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 1_000_000)]
        vue["mandats"] = list(vue.get("mandats") or []) + [self._mandat(cid, 1_500_000)]
        r = _put(app_client, jeton, vue)
        assert r.status_code == 403, r.text
        assert "enveloppe" in r.text.lower()
        # Et rien n'est passé : le refus porte sur tout le PUT.
        assert not _get_state(app_client, jeton).get("mandats")

    def test_sans_enveloppe_aucun_mandat(self, app_client):
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["mandats"] = list(vue.get("mandats") or []) + [self._mandat(cid, 500_000)]
        r = _put(app_client, jeton, vue)
        assert r.status_code == 403
        assert "aucune enveloppe" in r.text.lower()

    def test_le_cumul_compte_pas_seulement_le_dernier(self, app_client):
        # Trois mandats de 400 000 sur une enveloppe de 1 000 000 : le
        # troisième doit tomber, même s'il est petit.
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 1_000_000)]
        vue["mandats"] = [self._mandat(cid, 400_000, "m1"), self._mandat(cid, 400_000, "m2")]
        assert _put(app_client, jeton, vue).status_code == 200
        vue2 = _get_state(app_client, jeton)
        vue2["mandats"] = list(vue2["mandats"]) + [self._mandat(cid, 400_000, "m3")]
        assert _put(app_client, jeton, vue2).status_code == 403

    def test_le_comptable_hors_ligne_envoie_enveloppe_et_mandat_ensemble(self, app_client):
        # Le contrôle lit l'état ENTRANT : une enveloppe créée dans la même
        # synchronisation doit compter, sinon un comptable revenu du terrain
        # verrait tout son lot refusé.
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 5_000_000)]
        vue["mandats"] = [self._mandat(cid, 4_000_000)]
        assert _put(app_client, jeton, vue).status_code == 200

    def test_ajuster_lenveloppe_debloque_le_mandat(self, app_client):
        # C'est le but du plafond : rendre le dépassement DÉLIBÉRÉ et tracé,
        # pas l'interdire absolument. Le comptable relève l'enveloppe, à son
        # nom — un acte visible dans le journal.
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 1_000_000)]
        assert _put(app_client, jeton, vue).status_code == 200
        vue2 = _get_state(app_client, jeton)
        vue2["budgets"][0]["montant"] = 3_000_000
        vue2["mandats"] = [self._mandat(cid, 2_000_000)]
        assert _put(app_client, jeton, vue2).status_code == 200

    def test_le_patron_reste_souverain(self, app_client):
        # Invariant 2 : le plafond est une discipline comptable, pas une
        # limite au pouvoir du patron — qui relèverait l'enveloppe aussitôt.
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        vue["budgets"] = [_budget(cid, "st-compta", 1_000_000)]
        assert _put(app_client, jeton, vue).status_code == 200
        vp = _get_state(app_client, t["patron"])
        vp["mandats"] = [self._mandat(cid, 9_000_000)]
        assert _put(app_client, t["patron"], vp).status_code == 200

    def test_une_enveloppe_de_campagne_close_ne_finance_pas_la_suivante(self, app_client):
        # Même cloisonnement que côté client : l'enveloppe suit la campagne.
        t = _seed_coop(app_client)
        jeton = _seed_comptable(app_client, t)
        cid = _coop_id(app_client, jeton)
        vue = _get_state(app_client, jeton)
        ancienne = _budget(cid, "st-compta", 10_000_000)
        ancienne["saison"] = "Campagne 2020-2021"
        vue["budgets"] = [ancienne]
        vue["mandats"] = [self._mandat(cid, 2_000_000)]
        r = _put(app_client, jeton, vue)
        assert r.status_code == 403, "une enveloppe close ne doit rien financer"
