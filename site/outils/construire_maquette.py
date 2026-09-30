#!/usr/bin/env python3
"""Construit `site/maquette.html` : le site entier dans UN fichier autonome.

Pourquoi ce script plutôt qu'une copie tenue à la main : la maquette a déjà
divergé une fois du site réel, et une maquette qui ment est pire qu'une absence
de maquette — on valide une mise en page qui n'est pas celle qui sera déployée.
Ici tout est DÉRIVÉ de `index.html`, `styles.css`, `valeo.js` et `site/img/`.

Le fichier produit :
  - s'ouvre par double-clic, sans serveur, sans réseau (les images sont
    encodées en base64, le style et le script sont en ligne) ;
  - porte une barre d'outils permettant de basculer Accueil / Confidentialité
    et Ordinateur / Téléphone.

Il est EXCLU du déploiement (voir « ignore » de la cible « site » dans
firebase.json) : sa barre d'outils n'a rien à faire sur valeo-scoop.com.

Usage :  python3 site/outils/construire_maquette.py
"""
import base64
import mimetypes
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent


def en_donnees(chemin: Path) -> str:
    """Encode un fichier en URL `data:` — c'est ce qui rend la maquette
    autonome. Un chemin relatif vers site/img/ ne survit pas au déplacement du
    fichier, et c'est précisément ce qui avait cassé la version précédente :
    envoyée seule, elle s'ouvrait sans logo ni photo."""
    mime = mimetypes.guess_type(chemin.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(chemin.read_bytes()).decode()


def alleger(html: str) -> str:
    """Retire ce qu'un fichier local n'utilise pas, AVANT l'encodage.

    Chaque image encodée pèse un tiers de plus qu'à l'origine, et les pages
    partagent les mêmes : sans ce tri la maquette faisait 744 Ko, dont une
    favicon et une icône iOS qu'aucun double-clic n'affiche jamais, et six
    variantes de la même photo là où l'écran n'en charge qu'une.
    """
    html = re.sub(r'\s*<link rel="(?:apple-touch-)?icon"[^>]*>', "", html)
    # On ne garde que la plus grande variante : le jeu responsive n'a pas de
    # sens dans un fichier ouvert en local, et le navigateur n'en prend qu'une.
    html = re.sub(r'\s*srcset="[^"]*"', "", html)
    html = re.sub(r'\s*sizes="[^"]*"', "", html)
    html = re.sub(r'<source[^>]*>', "", html)
    html = html.replace('src="/img/cacao-640.jpg"', 'src="/img/cacao-976.jpg"')
    return html


def inliner(html: str) -> str:
    """Remplace toute référence à /styles.css, /valeo.js et /img/* par son
    contenu."""
    html = alleger(html)
    html = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        "<style>\n" + (SITE / "styles.css").read_text(encoding="utf-8") + "\n</style>")
    html = html.replace(
        '<script src="/valeo.js" defer></script>',
        "<script>\n" + (SITE / "valeo.js").read_text(encoding="utf-8") + "\n</script>")

    # Images : <img src>, srcset (plusieurs URL par attribut) et <link rel=icon>
    def une_url(m):
        f = SITE / "img" / m.group(1)
        # `is_file` et pas `exists` : la première version a buté sur la phrase
        # « … et dans site/img/. » d'un commentaire de la feuille de style, dont
        # le point final faisait un chemin valide vers le DOSSIER.
        return en_donnees(f) if f.is_file() else m.group(0)

    # L'extension est exigée : sans elle, la moindre mention de « /img/ » dans
    # une phrase est prise pour une référence de fichier.
    html = re.sub(r"/img/([A-Za-z0-9_-]+\.[a-z0-9]{2,5})", une_url, html)
    return html


def corps(html: str) -> str:
    """Extrait ce qui est entre <body> et </body>."""
    return html[html.index("<body>") + len("<body>"): html.rindex("</body>")]


BARRE = """
<div id="barre-maquette">
  <strong>MAQUETTE VALEO</strong>
  <span class="sep"></span>
  <span class="grp" role="group" aria-label="Page">
    <button data-page="accueil" class="on">Accueil</button>
    <button data-page="conf">Confidentialité</button>
  </span>
  <span class="grp" role="group" aria-label="Appareil">
    <button data-vue="pc" class="on">Ordinateur</button>
    <button data-vue="tel">Téléphone</button>
  </span>
  <span class="note">Fichier autonome — aucune connexion requise</span>
</div>

<style>
  #barre-maquette{
    position:fixed;inset:0 0 auto 0;z-index:9999;display:flex;align-items:center;
    gap:14px;flex-wrap:wrap;padding:10px 18px;
    background:#101413;color:#EAF0E9;
    font:600 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    box-shadow:0 2px 14px rgba(0,0,0,.35);
  }
  #barre-maquette strong{letter-spacing:.14em;font-size:11px;color:#F5B424}
  #barre-maquette .sep{flex:none;width:1px;height:18px;background:rgba(255,255,255,.2)}
  #barre-maquette .grp{display:flex;gap:4px;background:rgba(255,255,255,.07);
    padding:3px;border-radius:999px}
  #barre-maquette button{
    border:0;border-radius:999px;padding:6px 14px;cursor:pointer;
    background:transparent;color:#C3CFC2;font:inherit}
  #barre-maquette button.on{background:#F5B424;color:#0C2A12}
  #barre-maquette .note{margin-left:auto;font-weight:500;color:#8A978A;font-size:12px}

  /* La barre est fixe : on pousse le contenu, sinon elle mange l'en-tête. */
  body{padding-top:46px}
  #cadre{transition:max-width .28s ease;margin-inline:auto}
  body[data-vue="tel"]{background:#20241F}
  body[data-vue="tel"] #cadre{
    max-width:400px;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 30px 70px rgba(0,0,0,.45);
    background:var(--ivoire);overflow:hidden}
  @media (max-width:760px){ #barre-maquette .note{display:none} }
</style>
"""

SCRIPT = """
<script>
(function () {
  var b = document.body;
  b.dataset.vue = "pc";
  document.querySelectorAll("#barre-maquette button").forEach(function (bt) {
    bt.addEventListener("click", function () {
      var grp = bt.parentNode;
      grp.querySelectorAll("button").forEach(function (o) { o.classList.remove("on"); });
      bt.classList.add("on");
      if (bt.dataset.vue) {
        b.dataset.vue = bt.dataset.vue;
        /* Le rendu « téléphone » passe par la largeur du cadre : les media
           queries du site, elles, suivent la fenêtre et ne se déclencheront
           pas. On le dit plutôt que de laisser croire à un rendu fidèle. */
      }
      if (bt.dataset.page) {
        document.getElementById("pg-accueil").hidden = bt.dataset.page !== "accueil";
        document.getElementById("pg-conf").hidden = bt.dataset.page !== "conf";
        scrollTo(0, 0);
      }
    });
  });
})();
</script>
"""


def main() -> None:
    accueil = inliner((SITE / "index.html").read_text(encoding="utf-8"))
    conf = inliner((SITE / "confidentialite.html").read_text(encoding="utf-8"))

    tete = accueil[accueil.index("<head>"): accueil.index("</head>")]
    tete = tete.replace("<head>", "").strip()
    tete = re.sub(r"<title>.*?</title>", "<title>Maquette VALEO</title>", tete, flags=re.S)
    # La maquette n'est pas indexable et n'a pas d'URL canonique.
    tete = re.sub(r'<link rel="canonical"[^>]*>', "", tete)

    sortie = f"""<!doctype html>
<html lang="fr" class="js">
<head>
{tete}
<meta name="robots" content="noindex">
</head>
<body>
{BARRE}
<div id="cadre">
  <div id="pg-accueil">{corps(accueil)}</div>
  <div id="pg-conf" hidden>{corps(conf)}</div>
</div>
{SCRIPT}
</body>
</html>
"""
    cible = SITE / "maquette.html"
    cible.write_text(sortie, encoding="utf-8")
    ko = len(sortie.encode()) / 1024
    print(f"{cible} — {ko:.0f} Ko")
    if re.search(r"/img/[A-Za-z0-9_-]+\.[a-z0-9]{2,5}", sortie):
        raise SystemExit("ERREUR : une image n'a pas été encodée, la maquette "
                         "ne serait pas autonome")


if __name__ == "__main__":
    main()
