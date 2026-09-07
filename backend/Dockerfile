# Backend VALEO pour Cloud Run — FastAPI conteneurisé tel quel.
#
# Rien de l'application ne change : c'est le même `server.py`, la même matrice
# d'autorisation, les mêmes invariants. Seul l'emballage est nouveau.
#
# Deux contraintes Cloud Run dictent ce fichier :
#   * le port d'écoute est imposé par la variable $PORT (8080 par défaut) —
#     un port codé en dur et le service ne répond jamais ;
#   * le démarrage à froid arrive à chaque montée en charge, donc devant un
#     pisteur qui attend. D'où une image mince, sans dépendances inutiles.

FROM python:3.11-slim

# Sorties non tamponnées : sans cela, les journaux d'un plantage au démarrage
# restent dans le tampon et Cloud Run n'affiche rien d'exploitable.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Les dépendances d'abord, séparément du code : la couche est mise en cache et
# une simple correction dans `server.py` ne réinstalle pas tout.
COPY requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY server.py depot.py firebase_auth.py ./

# Utilisateur sans privilèges : un backend qui manipule des empreintes de codes
# secrets n'a aucune raison de tourner en root.
RUN useradd --create-home --uid 10001 valeo && chown -R valeo:valeo /app
USER valeo

EXPOSE 8080

# `--workers 1` est volontaire : Cloud Run met déjà à l'échelle par instances,
# et plusieurs workers dans un même conteneur se disputeraient sa mémoire sans
# rien apporter. La concurrence utile est asynchrone, pas processus.
CMD exec uvicorn server:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-server-header
