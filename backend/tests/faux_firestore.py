"""Double en mémoire de l'API Firestore asynchrone.

Firestore n'est pas joignable depuis le harnais de test, et il n'existe pas
d'équivalent de `mongomock_motor` pour lui. On implémente donc la petite
partie de son interface que `DepotFirestore` utilise réellement — c'est
justement l'intérêt d'être passé par un port étroit.

Deux points sont reproduits **volontairement**, parce que les oublier
masquerait de vrais défauts :

* les données sont **copiées** à l'entrée comme à la sortie — Firestore ne
  rend jamais l'objet qu'on lui a confié. Sans cette copie, le test partagerait
  les dictionnaires et l'écriture différentielle paraîtrait juste alors qu'elle
  ne le serait pas ;
* un lot (`batch`) est **atomique** : rien n'est appliqué avant `commit()`.
"""
import copy
import uuid


class Snapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data) if self._data is not None else None


class DocumentRef:
    def __init__(self, base, collection, doc_id, compteur=None):
        self._base = base
        self._compteur = compteur
        self._collection = collection
        self.id = doc_id

    async def get(self):
        if self._compteur is not None:
            self._compteur["lectures"] += 1
        return Snapshot(self.id, self._base.setdefault(self._collection, {}).get(self.id))

    async def set(self, data, merge=False):
        self._base.setdefault(self._collection, {})
        if merge and self.id in self._base[self._collection]:
            self._base[self._collection][self.id] = {
                **self._base[self._collection][self.id], **copy.deepcopy(data)}
        else:
            self._base[self._collection][self.id] = copy.deepcopy(data)

    async def delete(self):
        self._base.setdefault(self._collection, {}).pop(self.id, None)


class CollectionRef:
    def __init__(self, base, nom, compteur=None):
        self._base = base
        self._nom = nom
        self._compteur = compteur

    def document(self, doc_id=None):
        return DocumentRef(self._base, self._nom, doc_id or uuid.uuid4().hex, self._compteur)

    def where(self, filter=None):
        assert filter.op_string == "==", "seule l'égalité est utilisée"
        return Query(self._base, self._nom, filter.field_path, filter.value, self._compteur)

    async def stream(self):
        for doc_id, data in list(self._base.get(self._nom, {}).items()):
            if self._compteur is not None:
                self._compteur["lectures"] += 1
            yield Snapshot(doc_id, data)


class Query:
    """Le sous-ensemble de requête utilisé : une égalité sur un champ."""

    def __init__(self, base, nom, champ, valeur, compteur=None):
        self._base = base
        self._compteur = compteur
        self._nom = nom
        self._champ = champ
        self._valeur = valeur

    async def stream(self):
        for doc_id, data in list(self._base.get(self._nom, {}).items()):
            if (data or {}).get(self._champ) == self._valeur:
                if self._compteur is not None:
                    self._compteur["lectures"] += 1
                yield Snapshot(doc_id, data)


class Batch:
    def __init__(self, client):
        self._client = client
        self._operations = []

    def set(self, ref, data, merge=False):
        self._operations.append(("set", ref, copy.deepcopy(data), merge))

    def delete(self, ref):
        self._operations.append(("delete", ref, None, False))

    async def commit(self):
        for genre, ref, data, merge in self._operations:
            if genre == "delete":
                await ref.delete()
            else:
                await ref.set(data, merge=merge)
        self._operations = []


class FauxFirestore:
    def __init__(self):
        self.base = {}
        # Firestore facture à l'opération : on compte ce qu'il facturerait.
        self.compteur = {"lectures": 0}

    def collection(self, nom):
        return CollectionRef(self.base, nom, self.compteur)

    @property
    def lectures(self):
        return self.compteur["lectures"]

    def remettre_a_zero(self):
        self.compteur["lectures"] = 0

    def batch(self):
        return Batch(self)

    # ------------------------------ inspection ----------------------------- #
    def compte(self, nom):
        return len(self.base.get(nom, {}))

    def documents(self, nom):
        return copy.deepcopy(self.base.get(nom, {}))
