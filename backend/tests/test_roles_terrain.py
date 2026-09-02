"""Corrections métier : rôles terrain, vérification des poids, avances.

Règles couvertes :
  - le pisteur et le magasinier recrutent un planteur, rattaché à eux ;
  - le pisteur accorde une avance sur-le-champ, le magasinier non ;
  - le magasinier vérifie les poids ramenés par un pisteur, jamais les siens ;
  - une vérification est définitive ;
  - le pisteur ne solde que les restes dus qu'il a lui-même générés ;
  - RÉGRESSION : la demande d'avance du planteur ne doit plus être refusée.
"""
import copy

from tests.test_state_authorization import (
    _collection, _get_state, _put, _register, _seed_coop,
)


def _member(mid, nom, created_by, code="VAL-7777-QQ"):
    """Charge utile EXACTE produite par `MemberSheet` + `store.addMember`.

    Volontairement complète : un seul champ non prévu par
    `AGENT_MEMBER_CREATE_FIELDS` ferait refuser tout le PUT (403), et la fiche
    ne serait jamais créée. C'est ce qui arrivait tant que l'écran imposait un
    code secret que seul le patron a le droit de poser.
    """
    return {
        "id": mid, "coopId": None, "code": code, "nom": nom, "village": "Gomon",
        "tel": "0700009999", "momo": None, "photo": None, "createdBy": created_by,
        "idNumber": "CI 003 451 2",
        "loc": {"districtId": "DS-lagunes", "district": "Lagunes", "village": "Gomon", "villageLibre": True},
        "cultures": [{"cropId": "cacao", "superficie": 2}],
        "cropId": "cacao", "superficie": 2,
        "updatedAt": "2026-03-01T09:00:00.000Z",
    }


def _loan(lid, member_id, **kw):
    row = {
        "id": lid, "memberId": member_id, "type": "argent", "amount": 30000,
        "motif": "Scolarité", "date": "2026-03-02T09:00:00.000Z",
        "status": "en_attente", "soldeRestant": 0, "decidedBy": None,
        "updatedAt": "2026-03-02T09:00:00.000Z",
    }
    row.update(kw)
    return row


# --------------------------- Recrutement terrain --------------------------- #

class TestCreationPlanteur:
    def test_pisteur_cree_un_planteur_visible_par_le_patron(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["members"].append(_member("mb-p1", "Adjoua", "st-pisteur"))
        assert _put(app_client, t["pisteur"], vue).status_code == 200

        # Admis dans la base de la coopérative : le patron le voit…
        chez_patron = {m["id"]: m for m in _get_state(app_client, t["patron"])["members"]}
        assert "mb-p1" in chez_patron
        assert chez_patron["mb-p1"]["createdBy"] == "st-pisteur"
        # …et le magasinier aussi.
        assert "mb-p1" in {m["id"] for m in _get_state(app_client, t["commis"])["members"]}

    def test_magasinier_cree_un_planteur(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["members"].append(_member("mb-c1", "Brou", "st-magasin"))
        assert _put(app_client, t["commis"], vue).status_code == 200
        assert "mb-c1" in {m["id"] for m in _get_state(app_client, t["patron"])["members"]}

    def test_le_planteur_cree_par_un_agent_na_pas_encore_de_code(self, app_client):
        """Il attend celui du patron : la fiche existe, la connexion pas encore."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["members"].append(_member("mb-p3", "Affoué", "st-pisteur"))
        assert _put(app_client, t["pisteur"], vue).status_code == 200
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700009999", "pin": "000000"})
        assert r.status_code == 401, "sans code posé par le patron, aucune connexion"

    def test_un_agent_ne_glisse_pas_de_code_secret_dans_une_creation(self, app_client):
        """La création ne doit pas devenir une porte dérobée vers le `pin`."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        row = _member("mb-p2", "Yao", "st-pisteur")
        row["pin"] = {"salt": "x", "hash": "y", "iterations": 15000}
        vue["members"].append(row)
        assert _put(app_client, t["pisteur"], vue).status_code == 403


# ----------------------- Avance accordée sur le terrain -------------------- #

class TestAvanceTerrain:
    def test_pisteur_accorde_une_avance_immediatement(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["loans"].append(_loan("ln-t1", "mb-1", status="approuve", origine="pisteur",
                                  soldeRestant=30000, decidedBy="st-pisteur",
                                  decidedAt="2026-03-02T09:00:00.000Z"))
        assert _put(app_client, t["pisteur"], vue).status_code == 200
        stored = _get_state(app_client, t["patron"])["loans"][0]
        assert stored["status"] == "approuve"
        assert stored["origine"] == "pisteur"
        assert stored["soldeRestant"] == 30000

    def test_pisteur_ne_signe_pas_au_nom_dun_autre(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["loans"].append(_loan("ln-t2", "mb-1", status="approuve", origine="pisteur",
                                  soldeRestant=30000, decidedBy="st-magasin"))
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_magasinier_ne_peut_pas_accorder_une_avance(self, app_client):
        """Le magasinier transmet, il ne décide pas."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["loans"].append(_loan("ln-t3", "mb-1", status="approuve", origine="pisteur",
                                  soldeRestant=30000, decidedBy="st-magasin"))
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_le_solde_doit_egaler_le_montant_accorde(self, app_client):
        """Une avance accordée dont le solde est déjà entamé serait une dette effacée."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["loans"].append(_loan("ln-t4", "mb-1", status="approuve", origine="pisteur",
                                  soldeRestant=0, decidedBy="st-pisteur"))
        assert _put(app_client, t["pisteur"], vue).status_code == 403


# ------------------- Vérification des poids par le magasin ----------------- #

def _pose_collecte_pisteur(app_client, tokens, cid="col-p1", kg=1000):
    """Le pisteur enregistre une collecte bord-champ."""
    vue = _get_state(app_client, tokens["pisteur"])
    row = _collection(cid, "mb-1", "st-pisteur", kg=kg, paye=kg * 1800, reste=0)
    row["origine"] = "bord_champ"
    vue["collections"].append(row)
    assert _put(app_client, tokens["pisteur"], vue).status_code == 200


class TestVerificationPoids:
    def test_magasinier_verifie_le_poids_dun_pisteur(self, app_client):
        t = _seed_coop(app_client)
        _pose_collecte_pisteur(app_client, t)
        vue = _get_state(app_client, t["commis"])
        col = next(c for c in vue["collections"] if c["id"] == "col-p1")
        col["verif"] = {"kg": 980, "byStaffId": "st-magasin",
                        "date": "2026-02-02T10:00:00.000Z", "note": "humidité"}
        col["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 200

        stored = next(c for c in _get_state(app_client, t["patron"])["collections"] if c["id"] == "col-p1")
        # Traçabilité : le poids déclaré n'est jamais écrasé.
        assert stored["kg"] == 1000
        assert stored["verif"]["kg"] == 980
        assert stored["verif"]["byStaffId"] == "st-magasin"

    def test_le_pisteur_ne_verifie_pas_son_propre_poids(self, app_client):
        t = _seed_coop(app_client)
        _pose_collecte_pisteur(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        col = next(c for c in vue["collections"] if c["id"] == "col-p1")
        col["verif"] = {"kg": 1000, "byStaffId": "st-pisteur", "date": "2026-02-02T10:00:00.000Z"}
        col["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_le_magasinier_ne_verifie_pas_sa_propre_pesee(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        row = _collection("col-m1", "mb-1", "st-magasin", kg=300, paye=540000)
        row["origine"] = "magasin"
        vue["collections"].append(row)
        assert _put(app_client, t["commis"], vue).status_code == 200

        vue = _get_state(app_client, t["commis"])
        col = next(c for c in vue["collections"] if c["id"] == "col-m1")
        col["verif"] = {"kg": 290, "byStaffId": "st-magasin", "date": "2026-02-03T10:00:00.000Z"}
        col["updatedAt"] = "2026-02-03T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_une_verification_est_definitive(self, app_client):
        t = _seed_coop(app_client)
        _pose_collecte_pisteur(app_client, t)
        vue = _get_state(app_client, t["commis"])
        col = next(c for c in vue["collections"] if c["id"] == "col-p1")
        col["verif"] = {"kg": 980, "byStaffId": "st-magasin", "date": "2026-02-02T10:00:00.000Z"}
        col["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 200

        vue = _get_state(app_client, t["commis"])
        col = next(c for c in vue["collections"] if c["id"] == "col-p1")
        col["verif"] = {"kg": 1200, "byStaffId": "st-magasin", "date": "2026-02-04T10:00:00.000Z"}
        col["updatedAt"] = "2026-02-04T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 403
        stored = next(c for c in _get_state(app_client, t["patron"])["collections"] if c["id"] == "col-p1")
        assert stored["verif"]["kg"] == 980

    def test_le_patron_corrige_une_verification(self, app_client):
        """Souverain sur sa coopérative : lui seul rattrape une erreur."""
        t = _seed_coop(app_client)
        _pose_collecte_pisteur(app_client, t)
        vue = _get_state(app_client, t["commis"])
        col = next(c for c in vue["collections"] if c["id"] == "col-p1")
        col["verif"] = {"kg": 980, "byStaffId": "st-magasin", "date": "2026-02-02T10:00:00.000Z"}
        col["updatedAt"] = "2026-02-02T10:00:00.000Z"
        assert _put(app_client, t["commis"], vue).status_code == 200

        st = _get_state(app_client, t["patron"])
        col = next(c for c in st["collections"] if c["id"] == "col-p1")
        col["verif"]["kg"] = 990
        col["updatedAt"] = "2026-02-05T10:00:00.000Z"
        assert _put(app_client, t["patron"], st).status_code == 200


# --------------------- Restes dus : cloisonnement par agent ---------------- #

class TestRestesParAgent:
    def _deux_restes(self, app_client, t):
        """Un reste généré par le magasinier, un autre par le pisteur."""
        st = _get_state(app_client, t["patron"])
        c1 = _collection("col-mag", "mb-1", "st-magasin", kg=100, paye=30000, reste=150000)
        c2 = _collection("col-pis", "mb-1", "st-pisteur", kg=100, paye=80000, reste=100000)
        c2["origine"] = "bord_champ"
        st["collections"] += [c1, c2]
        assert _put(app_client, t["patron"], st).status_code == 200

    def test_pisteur_solde_son_propre_reste(self, app_client):
        t = _seed_coop(app_client)
        self._deux_restes(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        col = next(c for c in vue["collections"] if c["id"] == "col-pis")
        col["resteSolde"] = 100000
        col["updatedAt"] = "2026-02-10T09:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 200

    def test_pisteur_ne_solde_pas_le_reste_du_magasinier(self, app_client):
        t = _seed_coop(app_client)
        self._deux_restes(app_client, t)
        vue = _get_state(app_client, t["pisteur"])
        col = next(c for c in vue["collections"] if c["id"] == "col-mag")
        col["resteSolde"] = 150000
        col["updatedAt"] = "2026-02-10T09:00:00.000Z"
        assert _put(app_client, t["pisteur"], vue).status_code == 403
        stored = next(c for c in _get_state(app_client, t["patron"])["collections"] if c["id"] == "col-mag")
        assert not stored.get("resteSolde")


# ------------------------------- RÉGRESSION -------------------------------- #

class TestDemandeAvancePlanteur:
    def test_le_planteur_peut_demander_une_avance_sur_une_fiche_ancienne(self, app_client):
        """RÉGRESSION : `migrate()` ajoutait `cultures` aux fiches qui n'en
        avaient pas. Comme la synchro renvoie toutes les lignes, le serveur y
        voyait un champ interdit et refusait TOUT le PUT — la demande d'avance
        que le planteur venait de créer partait avec (403 puis rechargement).
        """
        # Coopérative dont la fiche planteur n'a jamais eu `cultures`
        # (`merge_state` fusionne champ par champ : on ne peut pas retirer une
        # clé après coup, il faut donc partir d'une fiche ancienne).
        reg = _register(app_client)
        patron = reg["token"]
        st = _get_state(app_client, patron)
        st["members"].append({
            "id": "mb-old", "code": "VAL-1234-XY", "nom": "Koffi", "village": "Gomon",
            "tel": "0700001234", "momo": None, "photo": None,
            "pin": app_client.server.make_pin_record("121212"),
            "updatedAt": "2026-01-01T08:00:00.000Z",
        })
        assert _put(app_client, patron, st).status_code == 200
        r = app_client.post("/api/auth/planteur/login", json={"phone": "0700001234", "pin": "121212"})
        assert r.status_code == 200
        planteur = r.json()["token"]

        vue = _get_state(app_client, planteur)
        assert "cultures" not in vue["members"][0]
        # Ce que fait le client au chargement (lib.ts `migrate`) : il complétait
        # `cultures`, et cet ajout suffisait à faire refuser toute la synchro.
        for m in vue["members"]:
            m.setdefault("createdBy", None)
        vue["loans"].append(_loan("ln-reg", "mb-old", amount=25000))
        r = _put(app_client, planteur, vue)
        assert r.status_code == 200, r.text

        loans = _get_state(app_client, patron)["loans"]
        assert [l["id"] for l in loans] == ["ln-reg"]
        assert loans[0]["status"] == "en_attente"

    def test_la_demande_du_planteur_reste_en_attente(self, app_client):
        """Le planteur ne s'accorde pas l'avance à lui-même."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["planteur"])
        vue["loans"].append(_loan("ln-x", "mb-1", status="approuve", origine="pisteur",
                                  soldeRestant=25000, decidedBy="mb-1"))
        assert _put(app_client, t["planteur"], vue).status_code == 403


# ------------------- Le serveur arbitre, pas seulement l'UI ---------------- #

class TestGardeFousServeur:
    def test_le_pisteur_ne_peut_pas_declarer_une_pesee_magasin(self, app_client):
        """Sinon son poids entrerait en stock sans passer par la vérification."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        row = _collection("col-x", "mb-1", "st-pisteur", kg=1000, paye=1800000)
        row["origine"] = "magasin"
        vue["collections"].append(row)
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_une_pesee_ne_naît_pas_deja_verifiee(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        row = _collection("col-y", "mb-1", "st-pisteur", kg=1000, paye=1800000)
        row["origine"] = "bord_champ"
        row["verif"] = {"kg": 1000, "byStaffId": "st-magasin", "date": "2026-02-01T10:00:00.000Z"}
        vue["collections"].append(row)
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_le_magasinier_ne_peut_pas_declarer_une_collecte_bord_champ(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        row = _collection("col-z", "mb-1", "st-magasin", kg=300, paye=540000)
        row["origine"] = "bord_champ"
        vue["collections"].append(row)
        assert _put(app_client, t["commis"], vue).status_code == 403

    def test_le_pisteur_ne_peut_pas_expedier_vers_lusine(self, app_client):
        """Sa marchandise part par la vérification du magasin, pas par lui."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["sorties"].append({
            "id": "so-1", "cropId": "cacao", "kg": 500, "type": "expedition",
            "date": "2026-02-06T09:00:00.000Z", "byStaffId": "st-pisteur",
            "destinataire": "SACO", "note": "", "updatedAt": "2026-02-06T09:00:00.000Z",
        })
        assert _put(app_client, t["pisteur"], vue).status_code == 403

    def test_le_pisteur_peut_declarer_une_perte(self, app_client):
        """Les autres motifs de sortie restent ouverts : seul l'usine est fermé."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["pisteur"])
        vue["sorties"].append({
            "id": "so-2", "cropId": "cacao", "kg": 20, "type": "perte",
            "date": "2026-02-06T09:00:00.000Z", "byStaffId": "st-pisteur",
            "note": "sac percé", "updatedAt": "2026-02-06T09:00:00.000Z",
        })
        assert _put(app_client, t["pisteur"], vue).status_code == 200

    def test_le_magasinier_expedie_toujours(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["commis"])
        vue["sorties"].append({
            "id": "so-3", "cropId": "cacao", "kg": 500, "type": "expedition",
            "date": "2026-02-06T09:00:00.000Z", "byStaffId": "st-magasin",
            "destinataire": "SACO", "note": "", "updatedAt": "2026-02-06T09:00:00.000Z",
        })
        assert _put(app_client, t["commis"], vue).status_code == 200
