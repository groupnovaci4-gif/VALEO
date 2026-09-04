"""Avances du patron et du pisteur/délégué : deux créances indépendantes.

Un même planteur peut porter simultanément une avance du patron et une avance
d'un pisteur. Chacun ne recouvre que la sienne, mais l'existence de l'autre ne
doit JAMAIS l'en empêcher.

Le refus global qui régnait ici (« seul le patron approuve ou refuse une
avance ») ne bloquait pas seulement le recouvrement : il rejetait **tout le
PUT** de la pesée (403), donc aussi la collecte et le paiement du planteur. Le
travail entier de l'agent était perdu.

Couvre aussi la vérification GLOBALE d'une livraison : le magasinier pèse le
chargement en une fois, la quote-part est répartie sur les collectes, et le
détail des planteurs reste conservé.
"""
from tests.test_state_authorization import (
    _collection, _get_state, _put, _seed_coop,
)


def _avance(lid, member_id, amount, origine, decided_by, date, solde=None, status="approuve"):
    return {
        "id": lid, "memberId": member_id, "type": "argent", "amount": amount,
        "motif": "Besoin", "date": date, "status": status,
        "soldeRestant": amount if solde is None else solde,
        "origine": origine, "decidedBy": decided_by,
        "updatedAt": date,
    }


def _pose_deux_avances(client, tokens):
    """Le patron accorde 100 000, puis le pisteur 150 000 au MÊME planteur."""
    state = _get_state(client, tokens["patron"])
    state["loans"].append(
        _avance("ln-pat", "mb-1", 100000, "patron", tokens["patron_id"], "2026-01-05T09:00:00.000Z")
    )
    assert _put(client, tokens["patron"], state).status_code == 200

    vue = _get_state(client, tokens["pisteur"])
    vue["loans"].append(
        _avance("ln-pis", "mb-1", 150000, "pisteur", "st-pisteur", "2026-01-10T09:00:00.000Z")
    )
    assert _put(client, tokens["pisteur"], vue).status_code == 200, "le pisteur accorde sur le terrain"


def _solde(client, token, lid):
    return next(l for l in _get_state(client, token)["loans"] if l["id"] == lid)["soldeRestant"]


def _recouvre(vue, lid, nouveau_solde, quand="2026-02-01T09:00:00.000Z"):
    for l in vue["loans"]:
        if l["id"] == lid:
            l["soldeRestant"] = nouveau_solde
            l["status"] = "rembourse" if nouveau_solde == 0 else "approuve"
            l["updatedAt"] = quand
    return vue


class TestDeuxCreancesSurUnPlanteur:
    def test_les_deux_avances_coexistent_et_restent_distinctes(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        loans = {l["id"]: l for l in _get_state(app_client, t["patron"])["loans"]}
        assert loans["ln-pat"]["amount"] == 100000
        assert loans["ln-pat"]["origine"] == "patron"
        assert loans["ln-pis"]["amount"] == 150000
        assert loans["ln-pis"]["origine"] == "pisteur"
        assert loans["ln-pis"]["decidedBy"] == "st-pisteur", "l'avance garde son auteur"

    def test_le_pisteur_recouvre_une_partie_de_SA_propre_avance(self, app_client):
        """Le cœur du scénario : 100 000 recouvrés sur ses 150 000."""
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)

        vue = _recouvre(_get_state(app_client, t["pisteur"]), "ln-pis", 50000)
        vue["collections"].append(_collection("col-1", "mb-1", "st-pisteur"))
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 200, r.text

        assert _solde(app_client, t["pisteur"], "ln-pis") == 50000, "150 000 − 100 000"
        assert _solde(app_client, t["patron"], "ln-pat") == 100000, "l'avance du patron est INTACTE"
        # …et la pesée elle-même est bien passée : c'est tout le PUT qui était rejeté.
        assert "col-1" in {c["id"] for c in _get_state(app_client, t["pisteur"])["collections"]}

    def test_le_pisteur_solde_entierement_son_avance(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["pisteur"]), "ln-pis", 0)
        assert _put(app_client, t["pisteur"], vue).status_code == 200
        loans = {l["id"]: l for l in _get_state(app_client, t["pisteur"])["loans"]}
        assert loans["ln-pis"]["status"] == "rembourse"
        assert loans["ln-pat"]["soldeRestant"] == 100000

    def test_le_patron_recouvre_ensuite_la_sienne_independamment(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        # Le pisteur solde d'abord la sienne…
        assert _put(app_client, t["pisteur"], _recouvre(_get_state(app_client, t["pisteur"]), "ln-pis", 0)).status_code == 200
        # …puis le patron recouvre la sienne, sans que rien ne l'en empêche.
        vue = _recouvre(_get_state(app_client, t["patron"]), "ln-pat", 40000)
        assert _put(app_client, t["patron"], vue).status_code == 200
        loans = {l["id"]: l for l in _get_state(app_client, t["patron"])["loans"]}
        assert loans["ln-pat"]["soldeRestant"] == 40000
        assert loans["ln-pis"]["soldeRestant"] == 0

    def test_une_avance_du_patron_ne_bloque_pas_le_pisteur(self, app_client):
        """Régression : c'est exactement le blocage signalé."""
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["pisteur"]), "ln-pis", 100000)
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 200, f"l'avance du patron ne doit rien bloquer : {r.text}"


class TestCloisonnementDesCreances:
    def test_le_pisteur_ne_touche_pas_a_lavance_du_patron(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["pisteur"]), "ln-pat", 0)
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 403, r.text
        assert "créancier" in r.json()["detail"]
        assert _solde(app_client, t["patron"], "ln-pat") == 100000

    def test_le_magasinier_ne_touche_pas_a_lavance_dun_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["commis"]), "ln-pis", 0)
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_le_magasinier_recouvre_bien_lavance_de_la_cooperative(self, app_client):
        """Il agit pour la coop : rien ne change pour lui."""
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["commis"]), "ln-pat", 30000)
        assert _put(app_client, t["commis"], vue).status_code == 200
        assert _solde(app_client, t["patron"], "ln-pat") == 30000

    def test_un_recouvrement_ne_peut_pas_gonfler_lavance(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _recouvre(_get_state(app_client, t["pisteur"]), "ln-pis", 200000)
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_un_recouvrement_ne_change_que_le_solde(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        for l in vue["loans"]:
            if l["id"] == "ln-pis":
                l["soldeRestant"] = 50000
                l["amount"] = 999999          # tentative de réécriture du montant accordé
                l["updatedAt"] = "2026-02-01T09:00:00.000Z"
        r = _put(app_client, t["pisteur"], vue)
        assert r.status_code == 403, r.text
        assert "amount" in r.json()["detail"]

    def test_le_statut_doit_rester_coherent_avec_le_solde(self, app_client):
        t = _seed_coop(app_client)
        _pose_deux_avances(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        for l in vue["loans"]:
            if l["id"] == "ln-pis":
                l["soldeRestant"] = 50000
                l["status"] = "rembourse"     # soldée alors qu'il reste 50 000
                l["updatedAt"] = "2026-02-01T09:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_un_agent_ne_peut_toujours_pas_approuver_une_demande(self, app_client):
        """La décision reste au patron : seul le recouvrement s'ouvre."""
        t = _seed_coop(app_client)
        state = _get_state(app_client, t["patron"])
        state["loans"].append(
            _avance("ln-dem", "mb-1", 30000, "planteur", None, "2026-01-20T09:00:00.000Z",
                    solde=0, status="en_attente")
        )
        assert _put(app_client, t["patron"], state).status_code == 200

        vue = _get_state(app_client, t["pisteur"])
        for l in vue["loans"]:
            if l["id"] == "ln-dem":
                l["status"] = "approuve"
                l["soldeRestant"] = 30000
                l["decidedBy"] = "st-pisteur"
                l["updatedAt"] = "2026-02-01T09:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403


# ------------------ Vérification GLOBALE d'une livraison ------------------- #

def _bord_champ(cid, member_id, kg):
    row = _collection(cid, member_id, "st-pisteur", kg=kg, paye=kg * 1800)
    row["origine"] = "bord_champ"
    return row


class TestVerificationGlobale:
    def _chargement(self, client, tokens):
        """850 + 1 200 + 1 500 = 3 550 kg, dans le vrai ordre du parcours.

        Le pisteur pèse d'abord chaque planteur au bord-champ, PUIS déclare sa
        livraison : le serveur refuse une collecte qui naîtrait déjà livrée.
        """
        vue = _get_state(client, tokens["pisteur"])
        vue["collections"] += [
            _bord_champ("c-A", "mb-1", 850), _bord_champ("c-B", "mb-2", 1200), _bord_champ("c-C", "mb-1", 1500),
        ]
        assert _put(client, tokens["pisteur"], vue).status_code == 200, "les trois pesées de tournée"

        # Livraison au magasin : un seul identifiant pour tout le chargement.
        vue = _get_state(client, tokens["pisteur"])
        for c in vue["collections"]:
            if c["id"] in ("c-A", "c-B", "c-C"):
                c["livraison"] = {"id": "liv-1", "date": "2026-02-02T08:00:00.000Z", "byStaffId": "st-pisteur"}
                c["updatedAt"] = "2026-02-02T08:00:00.000Z"
        assert _put(client, tokens["pisteur"], vue).status_code == 200, "un seul geste de livraison"
        return vue

    def test_le_chargement_porte_un_identifiant_commun(self, app_client):
        t = _seed_coop(app_client)
        self._chargement(app_client, t)
        cols = _get_state(app_client, t["commis"])["collections"]
        assert {c["livraison"]["id"] for c in cols} == {"liv-1"}
        assert sum(c["kg"] for c in cols) == 3550

    def test_le_magasinier_verifie_tout_le_chargement_en_un_seul_PUT(self, app_client):
        t = _seed_coop(app_client)
        self._chargement(app_client, t)
        vue = _get_state(app_client, t["commis"])
        # Quotes-parts de 3 520 kg réparties : 842 + 1 189 + 1 489 = 3 520.
        parts = {"c-A": 842, "c-B": 1189, "c-C": 1489}
        for c in vue["collections"]:
            if c["id"] in parts:
                c["verif"] = {"kg": parts[c["id"]], "byStaffId": "st-magasin",
                              "date": "2026-02-02T10:00:00.000Z", "note": "Humidité"}
                c["updatedAt"] = "2026-02-02T10:00:00.000Z"
        r = _put(app_client, t["commis"], vue)
        assert r.status_code == 200, r.text
        cols = {c["id"]: c for c in _get_state(app_client, t["patron"])["collections"]}
        assert sum(cols[k]["verif"]["kg"] for k in parts) == 3520
        # Les pesées d'origine ne sont pas rouvertes : traçabilité intacte.
        assert cols["c-A"]["kg"] == 850 and cols["c-C"]["kg"] == 1500

    def test_le_pisteur_ne_verifie_pas_son_propre_chargement(self, app_client):
        t = _seed_coop(app_client)
        self._chargement(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        for c in vue["collections"]:
            if c["id"] == "c-A":
                c["verif"] = {"kg": 842, "byStaffId": "st-pisteur", "date": "2026-02-02T10:00:00.000Z"}
                c["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_la_livraison_reste_visible_apres_verification(self, app_client):
        """Elle ne disparaît ni chez le magasinier ni chez le patron."""
        t = _seed_coop(app_client)
        self._chargement(app_client, t)
        vue = _get_state(app_client, t["commis"])
        for c in vue["collections"]:
            if c["id"] in ("c-A", "c-B", "c-C"):
                c["verif"] = {"kg": 1000, "byStaffId": "st-magasin", "date": "2026-02-02T10:00:00.000Z"}
                c["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 200
        for role in ("commis", "patron"):
            cols = [c for c in _get_state(app_client, t[role])["collections"] if c.get("livraison")]
            assert len(cols) == 3, role
            assert all(c["livraison"]["byStaffId"] == "st-pisteur" for c in cols)
            assert all(c["verif"]["byStaffId"] == "st-magasin" for c in cols)
            assert all(c["verif"]["date"] for c in cols), "horodatage conservé"
