# Socle commun des propositions A / B / C (direction B, clair). Données = démonstration du 21 octobre.
S = '/tmp/claude-0/-home-user-VALEO/af71d198-0678-55f7-8b4f-1b972a15d4fd/scratchpad/'
SVG = S + 'icons/io/package/dist/svg/'
FONTS = 'file://' + S + 'dm/dinerox/docs/design-pro/directions/fonts/'
ICO3D = 'file://' + S + 'ecr/icones/'
LOGOS = 'file://' + S + 'ecr/logos/'

def ico(name, size=20, color='currentColor', style=''):
    s = open(SVG + name + '.svg').read()
    return s.replace('<svg ', f'<svg width="{size}" height="{size}" fill="{color}" style="color:{color};flex:none;{style}" ', 1)

def i3d(slug, px=32):
    path = slug if '/' in slug else 'fluent/' + slug
    return f'<img src="{ICO3D}{path}.webp" width="{px}" height="{px}" style="flex:none" alt="">'

def logo(n, px=40):
    return f'<span class="logo" style="width:{px}px;height:{px}px"><img src="{LOGOS}{n}.png" alt=""></span>'

def ring(pct, size=56, stroke=6, color='#0F4A3A', track='#EAE3D7', inner=''):
    r = (size - stroke) / 2; c = 2 * 3.14159 * r; p = max(0, min(100, pct))
    return (f'<span class="ring" style="width:{size}px;height:{size}px"><svg width="{size}" height="{size}">'
            f'<circle cx="{size/2}" cy="{size/2}" r="{r}" stroke="{track}" stroke-width="{stroke}" fill="none"/>'
            f'<circle cx="{size/2}" cy="{size/2}" r="{r}" stroke="{color}" stroke-width="{stroke}" fill="none" stroke-linecap="round" '
            f'stroke-dasharray="{c*p/100:.1f} {c:.1f}" transform="rotate(-90 {size/2} {size/2})"/></svg><span class="ri">{inner}</span></span>')

PATTERN = '<svg class="pattern" viewBox="0 0 150 150" fill="none" stroke="#fff" stroke-width="1.2">' + ''.join(
    f'<path d="M{x*32+16} {y*32} l16 16 -16 16 -16 -16z"/>' for y in range(5) for x in range(5)) + '</svg>'

GREEN, OR, ROUGE, TERRE, BLEU, VIOLET, GRIS = '#1E6B52', '#9A6400', '#B3261E', '#B0502A', '#2D5F8F', '#7B3F70', '#55606A'
PASTEL = {GREEN: '#DCEBE3', OR: '#F5E6C4', ROUGE: '#F6DAD7', TERRE: '#F5DDD1', BLEU: '#DBE6F2', VIOLET: '#EEDDEA', GRIS: '#E6E8EA'}

CSS = f"""
@font-face{{font-family:Inter;font-weight:400;src:url({FONTS}Inter_400Regular.ttf)}}
@font-face{{font-family:Inter;font-weight:500;src:url({FONTS}Inter_500Medium.ttf)}}
@font-face{{font-family:Inter;font-weight:600;src:url({FONTS}Inter_600SemiBold.ttf)}}
@font-face{{font-family:Inter;font-weight:700;src:url({FONTS}Inter_700Bold.ttf)}}
@font-face{{font-family:Jakarta;font-weight:700;src:url({FONTS}PlusJakartaSans_700Bold.ttf)}}
@font-face{{font-family:Jakarta;font-weight:800;src:url({FONTS}PlusJakartaSans_800ExtraBold.ttf)}}
:root{{--bg:#F4F1EA;--surface:#FFFCF7;--surface2:#EDE7DC;--divider:#EAE3D7;--text:#1F1C17;--text2:#564E43;--text3:#6E6558;--brand:#0F4A3A;--alert:#B3261E;--warning:#8A5A00;--pos:#1E7A45;--shadow:0 1px 2px rgba(60,45,20,.08)}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:360px;background:var(--bg);color:var(--text);font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}}
.page{{padding:0 16px 24px}}
.num{{font-variant-numeric:tabular-nums}}
.topbar{{height:56px;display:flex;align-items:center;justify-content:space-between}}
.space{{display:flex;align-items:center;gap:4px;font:600 15px/20px Inter}}
.tr{{display:flex;align-items:center;gap:4px}}
.av{{width:32px;height:32px;border-radius:16px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font:600 14px Inter}}
.bellb{{width:44px;height:44px;display:flex;align-items:center;justify-content:center;position:relative}}
.dot{{position:absolute;top:9px;right:10px;min-width:16px;height:16px;border-radius:8px;background:var(--alert);color:#fff;font:700 10px/16px Inter;text-align:center;padding:0 4px}}
.hello{{font:700 22px/28px Jakarta;margin:4px 0 8px}}
.demo{{display:flex;align-items:center;justify-content:space-between;min-height:40px;margin-bottom:8px}}
.dchip{{display:inline-flex;align-items:center;gap:6px;font:600 13px Inter;color:var(--text2);background:var(--surface2);border-radius:999px;padding:5px 12px}}
.dlink{{font:600 14px Inter;color:var(--brand);display:flex;align-items:center;gap:2px}}
.h2{{font:700 18px/24px Jakarta}}
.sh{{display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 10px}}
.link{{font:600 14px Inter;color:var(--brand)}}
.card{{background:var(--surface);border-radius:20px;box-shadow:var(--shadow)}}
.muted{{color:var(--text3)}}
.small{{font:400 13px/18px Inter;color:var(--text3)}}
.strong{{font:600 15px/20px Inter}}
.amt{{font:600 15px/20px Inter;font-variant-numeric:tabular-nums;white-space:nowrap}}
.neg{{color:var(--text)}} .pos{{color:var(--pos)}}
.logo{{border-radius:10px;background:#fff;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.08);flex:none}}
.logo img{{width:100%;height:100%;object-fit:contain}}
.ring{{position:relative;display:inline-flex;flex:none}} .ring .ri{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;font:600 14px Inter}}
.btn.pri{{background:var(--brand);color:#fff}} .btn.sec{{background:var(--surface2);color:var(--text)}} .btn.ghost{{color:var(--brand);padding:0 8px}}
.tab{{position:sticky;bottom:0;margin:0 -16px -24px;height:64px;background:var(--surface);border-top:1px solid var(--divider);display:grid;grid-template-columns:repeat(5,1fr);align-items:center}}
.tab div{{display:flex;flex-direction:column;align-items:center;gap:2px;font:500 11px Inter;color:var(--text3)}}
.tab .on{{color:var(--brand);font-weight:600}}
.tab .mic span{{width:48px;height:36px;border-radius:18px;background:var(--brand);display:flex;align-items:center;justify-content:center}}
/* Carte d'accueil — IDENTIQUE à la maquette validée (c4 + f4) */
.hero{{position:relative;overflow:hidden;background:#0F4A3A;color:#fff;border-radius:22px;margin:6px 8px 22px;box-shadow:0 26px 44px -14px rgba(15,74,58,.62),0 12px 22px -8px rgba(15,74,58,.34),0 2px 5px rgba(15,74,58,.18)}}
.hero .pattern{{position:absolute;right:-6px;top:-6px;width:118px;height:118px;opacity:.10}}
.hero .body{{position:relative;padding:14px 16px 10px}}
.hero .cap{{font:500 13px/18px Inter;color:#C9DED6}}
.hero .eye{{position:absolute;top:2px;right:4px;width:48px;height:48px;display:flex;align-items:center;justify-content:center}}
.hero .numrow{{display:flex;align-items:center;justify-content:space-between;margin-top:2px}}
.hero .big{{font:800 36px/42px Jakarta;letter-spacing:-.8px}} .hero .big small{{font:600 18px Inter;margin-left:4px;letter-spacing:0}}
.hero .mp{{font:600 12px Inter;background:rgba(255,255,255,.16);border-radius:999px;padding:3px 10px;white-space:nowrap}}
.hero .sep{{height:1px;background:rgba(255,255,255,.14);margin:8px 0}}
.hero .ln{{display:flex;justify-content:space-between;align-items:baseline;min-height:27px}}
.hero .ln span:first-child{{font:400 14px Inter;color:#C9DED6}} .hero .ln .v{{font:600 15px Inter;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:2px}}
.hero .ln.main .v{{font:700 19px Jakarta}}
.how{{display:flex;align-items:center;gap:8px;min-height:40px;font:600 14px Inter;color:var(--brand);margin-top:-8px}}
"""

def head(title=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>'

def topbar(bell_count=0):
    dot = f'<span class="dot">{bell_count}</span>' if bell_count else ''
    return f'<div class="topbar"><div class="space">Démo {ico("chevron-down",16)}</div><div class="tr"><div class="bellb">{ico("notifications-outline",24)}{dot}</div><div class="av">D</div></div></div>'

def hello():
    return (f'<div class="hello">Bonjour 👋</div><div class="demo"><span class="dchip">{ico("flask-outline",15)} Démo</span>'
            f'<span class="dlink">Créer mon profil {ico("chevron-forward",15,"#0F4A3A")}</span></div>')

def hero():
    return (f'<div class="hero">{PATTERN}<div class="body"><div class="eye">{ico("eye-outline",22,"#fff")}</div>'
            f'<div class="cap">Votre plafond de dépenses par jour</div>'
            f'<div class="numrow"><div class="big num">38 681<small>FCFA</small></div><span class="mp">Octobre 2026</span></div><div class="sep"></div>'
            f'<div class="ln main"><span>Argent disponible</span><span class="v">655 500 FCFA</span></div>'
            f'<div class="ln"><span>Mis de côté</span><span class="v">880 000 FCFA {ico("chevron-forward",15,"#fff")}</span></div>'
            f'<div class="ln"><span>Total de vos comptes</span><span class="v">1 155 500 FCFA</span></div></div></div>'
            f'<div class="how">{ico("chevron-down",18,"#0F4A3A")} Comment c\'est calculé ?</div>')

def tabbar(on):
    items = [('home', 'Accueil', 'home-outline', 'home'), ('budget', 'Budget', 'pie-chart-outline', 'pie-chart'), ('mic', 'Saisir', 'mic', 'mic'), ('goals', 'Objectifs', 'flag-outline', 'flag'), ('more', 'Plus', 'grid-outline', 'grid')]
    h = ''
    for k, l, i, ia in items:
        if k == 'mic': h += f'<div class="mic"><span>{ico("mic",22,"#fff")}</span>{l}</div>'
        else: h += f'<div class="{"on" if k == on else ""}">{ico(ia if k == on else i, 22)}{l}</div>'
    return f'<div class="tab">{h}</div>'

# Données de la démonstration
TX = [('20 oct.', [('Moto', 'Virement · Compte bancaire → Compte épargne', '50 000 FCFA', None, 'swap')]),
      ('18 oct.', [('Canal+', 'Loisirs · Orange Money', '−10 000 FCFA', 'television', 'orange')]),
      ('15 oct.', [('Restaurant', 'Alimentation · Cash', '−51 000 FCFA', 'composees/plat_poisson_3d', None)]),
      ('12 oct.', [('Taxi', 'Transport · Cash', '−33 000 FCFA', 'taxi', None)]),
      ('10 oct.', [('Maman', 'Famille · Orange Money', '−50 000 FCFA', 'older-person-medium-dark', 'orange')])]
ALERTS = [('alert-circle', ROUGE, 'Budget Maison dépassé de 40 000 FCFA.'),
          ('alert-circle', ROUGE, 'Budget Alimentation & boissons dépassé de 13 000 FCFA.'),
          ('warning', OR, 'Budget Famille entièrement utilisé.'),
          ('bulb', VIOLET, 'Conseil du jour : vous avez dépensé 29 % de plus en Alimentation & boissons que d’habitude (+21 000 FCFA).'),
          ('calendar', BLEU, 'Échéance Tonton Yao : 50 000 FCFA le 28 octobre.')]
ENV = [('house', 'Maison', 140000, 100000, 'over'), ('curry-rice', 'Alimentation & boissons', 93000, 80000, 'over'), ('taxi', 'Transport', 33000, 40000, 'ok'),
       ('composees/famille_3d_medium-dark', 'Famille', 50000, 50000, 'full'), ('pig-face', 'Épargne', 50000, 50000, 'full'), ('shopping-bags', 'Libre', 10000, 100000, 'ok')]
def fm(n): return f'{n:,}'.replace(',', ' ') + ' FCFA'
def envstate(sp, bud, st):
    if st == 'over': return f'Dépassé de {fm(sp-bud)}', ROUGE
    if st == 'full': return 'Épuisée', OR
    return f'Reste {fm(bud-sp)}', GREEN
GOALS = [('composees/moto_rouge_3d', 'Ma moto', 'Véhicule · août 2027', 450000, 1200000, 'Priorité 1', '75 000 FCFA / mois'),
         ('shield', 'Mon fonds d’urgence', 'Finance', 0, 1000000, 'Priorité 2', 'Atteint vers février 2030')]
