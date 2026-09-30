/* VALEO — comportements du site public.
   Sorti du HTML pour que la Content-Security-Policy puisse valoir
   `script-src 'self'` : aucun script en ligne a autoriser, donc aucune
   empreinte a maintenir quand ce fichier evolue. */
(function () {
  "use strict";

  /* -- En-tete : opaque des que la page defile ----------------------------- */
  var tete = document.getElementById("tete");
  var auSol = function () { tete.classList.toggle("colle", window.scrollY > 24); };
  auSol();
  addEventListener("scroll", auSol, { passive: true });

  /* -- Menu du telephone --------------------------------------------------- */
  var burger = document.getElementById("burger");
  var menu = document.getElementById("menu");
  burger.addEventListener("click", function () {
    var ouvert = menu.classList.toggle("ouvert");
    burger.setAttribute("aria-expanded", String(ouvert));
  });
  menu.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      menu.classList.remove("ouvert");
      burger.setAttribute("aria-expanded", "false");
    }
  });

  /* -- Apparition au defilement -------------------------------------------- */
  var aReveler = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    /* Navigateur ancien : on montre tout plutot que de cacher le site. */
    aReveler.forEach(function (n) { n.classList.add("vu"); });
  } else {
    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("vu"); obs.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    aReveler.forEach(function (n) { obs.observe(n); });
  }

  /* -- Explorateur de roles ------------------------------------------------ */
  var onglets = [].slice.call(document.querySelectorAll('[role="tab"]'));

  function montrer(onglet) {
    onglets.forEach(function (o) {
      var actif = o === onglet;
      o.setAttribute("aria-selected", String(actif));
      document.getElementById(o.getAttribute("aria-controls")).hidden = !actif;
    });
  }

  onglets.forEach(function (o, i) {
    o.addEventListener("click", function () { montrer(o); });
    /* Navigation au clavier : les fleches parcourent les onglets, comme le
       veut le motif ARIA. Sans cela l'explorateur est inutilisable sans souris. */
    o.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var suivant = onglets[(i + d + onglets.length) % onglets.length];
      montrer(suivant);
      suivant.focus();
    });
  });

  /* -- Compteurs ------------------------------------------------------------
     Les chiffres du bandeau sont deja dans le HTML : l'animation ne fait que
     les faire monter. Si le script tombe, ils restent justes et lisibles. */
  var reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduit && "IntersectionObserver" in window) {
    var oc = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting) return;
        oc.unobserve(e.target);
        var cible = parseInt(e.target.textContent, 10);
        if (isNaN(cible) || cible === 0) return;
        var t0 = performance.now(), duree = 750;
        (function pas(t) {
          var p = Math.min(1, (t - t0) / duree);
          e.target.textContent = String(Math.round(cible * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(pas);
        })(t0);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll(".chiffre b").forEach(function (n) { oc.observe(n); });
  }
})();
