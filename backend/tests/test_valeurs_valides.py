"""Valeurs impossibles refusées côté SERVEUR (invariants 8, 15 et 16).

Toute la logique d'argent vit dans `lib.ts`, côté client. C'est un choix
assumé — mais un calcul côté client ne protège que des erreurs de saisie :
face à un appareil modifié, il ne protège de rien. Un audit a montré qu'un
agent muni d'un jeton parfaitement légitime pouvait enregistrer un poids de
-500 kg, un paiement négatif, ou une avance au statut inventé, et que le
serveur répondait 200.

La règle posée ici est **étroite à dessein**. Elle refuse ce qui est
IMPOSSIBLE — une somme ou un poids négatif, un statut hors énumération —
jamais ce qui est seulement invraisemblable :

* contrôler `brut == kg × prixKg` casserait les retenues et la tare par sac ;
* exiger qu'un `memberId` existe déjà rejetterait une pesée arrivée avant la
  fiche du planteur qu'elle accompagne, cas normal en hors-ligne d'abord ;
* borner les dates rejetterait un téléphone à l'horloge déréglée, alors que la
  pesée, elle, est bien réelle.

Ces trois-là restent donc côté client, sciemment, et c'est consigné.

Le contrôle vaut pour TOUS les rôles, **patron compris** : sa souveraineté
porte sur ce qu'il a le droit de décider, pas sur la possibilité d'écrire un
poids négatif. C'est une règle de validité, pas d'autorisation.
"""
import pytest

from tests.test_state_authorization import (_collection, _get_state, _put,
                                            _seed_coop)


def _pousser(client, jeton, **modifs):
    """Ajoute une collecte modifiée et renvoie le code HTTP."""
    vue = _get_state(client, jeton)
    col = _collection("col-essai", "mb-1", modifs.pop("byStaffId", None) or "x")
    col.update(modifs)
    vue["collections"].append(col)
    return _put(client, jeton, vue).status_code


class TestValeursNegatives:
    @pytest.mark.parametrize("champ,valeur", [
        ("kg", -500), ("prixKg", -1800), ("brut", -1), ("net", -1),
        ("paye", -1), ("reste", -1), ("sacs", -3), ("resteSolde", -10),
        ("commissionRate", -30),
    ])
    def test_un_champ_negatif_est_refuse(self, app_client, champ, valeur):
        t = _seed_coop(app_client)
        code = _pousser(app_client, t["patron"], byStaffId=t["patron_id"],
                        **{champ: valeur})
        assert code == 403, f"« {champ} » = {valeur} accepté (HTTP {code})"

    def test_le_patron_non_plus_ne_peut_pas_ecrire_un_poids_negatif(self, app_client):
        """La souveraineté du patron ne s'étend pas aux valeurs impossibles."""
        t = _seed_coop(app_client)
        assert _pousser(app_client, t["patron"], byStaffId=t["patron_id"],
                        kg=-1) == 403

    def test_une_valeur_valide_passe_toujours(self, app_client):
        """Le garde-fou ne doit pas gêner une pesée normale."""
        t = _seed_coop(app_client)
        assert _pousser(app_client, t["patron"], byStaffId=t["patron_id"],
                        kg=120, prixKg=1800) == 200

    def test_zero_reste_une_valeur_legitime(self, app_client):
        """Une pesée entièrement payée porte reste = 0, pas une anomalie."""
        t = _seed_coop(app_client)
        assert _pousser(app_client, t["patron"], byStaffId=t["patron_id"],
                        reste=0, paye=0, kg=0) == 200

    def test_un_champ_absent_ne_declenche_rien(self, app_client):
        """`sacs` et `commissionRate` sont facultatifs : None n'est pas < 0."""
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        col = _collection("col-sans-sacs", "mb-1", t["patron_id"])
        col.pop("sacs", None)
        col["commissionRate"] = None
        vue["collections"].append(col)
        assert _put(app_client, t["patron"], vue).status_code == 200

    def test_une_valeur_non_numerique_est_refusee(self, app_client):
        t = _seed_coop(app_client)
        assert _pousser(app_client, t["patron"], byStaffId=t["patron_id"],
                        kg="beaucoup") == 403


class TestStatutsDAvance:
    @pytest.mark.parametrize("statut", ["valide", "APPROUVE", "approuvé", "pending", ""])
    def test_un_statut_hors_enumeration_est_refuse(self, app_client, statut):
        """Invariant 15 : quatre orthographes, pas une de plus.

        Un statut inventé traverserait tous les filtres métier sans lever
        d'erreur : l'avance deviendrait invisible au recouvrement comme au
        tableau de bord, sans que rien ne le signale.
        """
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["loans"].append({
            "id": "ln-statut", "memberId": "mb-1", "type": "argent",
            "amount": 1000, "motif": "", "date": "2026-02-01T10:00:00Z",
            "status": statut, "soldeRestant": 1000, "decidedBy": t["patron_id"],
            "updatedAt": "2026-02-01T10:00:00.000Z"})
        assert _put(app_client, t["patron"], vue).status_code == 403

    @pytest.mark.parametrize("statut", ["en_attente", "approuve", "refuse", "rembourse"])
    def test_les_quatre_statuts_legitimes_passent(self, app_client, statut):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["loans"].append({
            "id": f"ln-{statut}", "memberId": "mb-1", "type": "argent",
            "amount": 1000, "motif": "", "date": "2026-02-01T10:00:00Z",
            "status": statut, "soldeRestant": 1000, "decidedBy": t["patron_id"],
            "updatedAt": "2026-02-01T10:00:00.000Z"})
        assert _put(app_client, t["patron"], vue).status_code == 200

    def test_un_montant_d_avance_negatif_est_refuse(self, app_client):
        t = _seed_coop(app_client)
        vue = _get_state(app_client, t["patron"])
        vue["loans"].append({
            "id": "ln-neg", "memberId": "mb-1", "type": "argent",
            "amount": -750000, "motif": "", "date": "2026-02-01T10:00:00Z",
            "status": "approuve", "soldeRestant": -750000,
            "decidedBy": t["patron_id"], "updatedAt": "2026-02-01T10:00:00.000Z"})
        assert _put(app_client, t["patron"], vue).status_code == 403
