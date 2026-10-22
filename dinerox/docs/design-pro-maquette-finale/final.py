# Maquette finale (choix du fondateur, 2026-10-22) : Accueil B (+ enveloppes / octobre / objectifs du C),
# Budget C (carte principale verte flottante), Objectifs B (progression circulaire), Plus B.
from opts import *
import opts

def home_final():
    h = home_B()
    # Remplace « Enveloppes (bocaux) + Octobre + Objectifs (vignettes) » par la partie du C (capture du fondateur)
    i = h.index('<div class="sh"><span class="h2">Enveloppes</span>')
    j = h.index('<div class="sh"><span class="h2">Analyse</span>')
    bubs = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st); pct = min(100, round(sp * 100 / bud))
        bubs += f'<div class="bub">{ring(pct, 76, 6, col, "#EAE3D7", i3d(f, 34))}<div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div></div>'
    part = (f'<div class="sh"><span class="h2">Enveloppes</span><span class="link">Gérer (6)</span></div><div class="card" style="padding:16px 8px"><div class="g3" style="row-gap:16px">{bubs}</div></div>'
            f'<div class="sh"><span class="h2">Octobre</span><span class="small">Mois en cours</span></div>' + month_stats() +
            f'<div class="sh"><span class="h2">Objectifs</span><span class="link">Tout voir</span></div>' + goals_compact())
    return h[:i] + part + h[j:]


TAGS = ['Alerte budget', 'Alerte budget', 'Alerte budget', 'Conseil du jour', 'Votre coach', 'Votre analyse']
ALERTS6 = ALERTS + [('analytics', BLEU, 'Vos objectifs demandent 195 000 FCFA par mois ; il vous reste 55 750 FCFA par mois. Il manque 139 250 FCFA : allongez une échéance ou priorisez un objectif.')]
def notif_list(items):
    h = ''
    for (i, c, t), tag in items:
        h += (f'<div class="ban"><span class="sq" style="background:{PASTEL[c]}">{ico(i,18,c)}</span><div style="flex:1;font:500 14px/20px Inter">'
              f'<div style="font:600 11px Inter;letter-spacing:.4px;text-transform:uppercase;color:{c};margin-bottom:2px">{tag}</div>{t}'
              f'<div style="margin-top:4px"><span class="link" style="font-size:13px;display:inline-flex;gap:4px;align-items:center">{ico("volume-medium-outline",15,"#0F4A3A")} Écouter</span></div></div>'
              f'<span class="x">{ico("close",18)}</span></div>')
    return h
def home_final2():
    h = home_final()
    i = h.index('<div class="sh"><span class="h2">À lire</span>')
    j = h.index('<div class="sh"><span class="h2">Dernières opérations</span>')
    part = (f'<div class="sh"><span class="h2">À lire · 6</span><span class="small">Disparaît une fois lu ou écouté</span></div>'
            + notif_list(list(zip(ALERTS6, TAGS))))
    h = h[:i] + part + h[j:]
    # « Votre analyse » n'est plus une carte à part : elle est dans « À lire »
    a = h.index('<div class="sh"><span class="h2">Analyse</span>')
    b = h.index('<div class="g2" style="margin-top:22px">', a)
    h = h[:a] + h[b:]
    return h.replace('<span class="dot">5</span>', '<span class="dot">6</span>')

def budget_final():
    h = budget_C()
    inner = '<div style="text-align:center;color:#fff"><div style="font:800 22px Jakarta">90 %</div><div style="font:500 11px Inter;color:#C9DED6">consommé</div></div>'
    card = (f'<div class="hero" style="margin:6px 8px 22px">{PATTERN}<div class="body" style="padding:18px;display:flex;gap:16px;align-items:center">'
            f'{ring(90, 112, 11, "#E8B85A", "rgba(255,255,255,.22)", inner)}'
            f'<div style="flex:1"><div class="cap">Reste dans les enveloppes</div><div class="big num" style="font-size:28px;line-height:34px;margin:2px 0 8px">44 000<small style="font-size:14px">FCFA</small></div>'
            f'<div class="ln" style="min-height:22px"><span style="font-size:13px">Prévu</span><span class="v" style="font-size:14px">420 000</span></div>'
            f'<div class="ln" style="min-height:22px"><span style="font-size:13px">Dépensé</span><span class="v" style="font-size:14px">376 000</span></div>'
            f'<div class="ln" style="min-height:22px"><span style="font-size:13px">À répartir</span><span class="v" style="font-size:14px">328 500</span></div></div></div></div>')
    i = h.index('<div class="card" style="padding:18px;display:flex;gap:16px;align-items:center">')
    j = h.index('<div class="seg"')
    return h[:i] + card + h[j:]

def goals_final():
    tiles = ''
    items = GOALS + [('backpack', 'Rentrée scolaire', '16 déc. · moment fort', 0, 120000, 'Moment fort', '15 000 FCFA / sem.'),
                     ('composees/famille_coeur_3d_medium-dark', 'Réserve famille', 'Réserve', 80000, 300000, 'Réserve', '25 000 FCFA / mois')]
    for f, n, sub, sv, tg, pr, rate in items:
        pct = round(sv * 100 / tg); col = OR if pr == 'Réserve' else BLEU if pr == 'Moment fort' else GREEN
        tiles += (f'<div class="card" style="overflow:hidden"><div style="height:118px;background:{PASTEL[col]};display:flex;align-items:center;justify-content:center;position:relative">'
                  f'{ring(max(pct,1) if pct else 0, 92, 8, col, "rgba(255,255,255,.7)", i3d(f,48))}'
                  f'<span style="position:absolute;top:8px;left:8px;font:600 11px Inter;background:rgba(255,255,255,.75);border-radius:999px;padding:2px 8px;color:{col}">{pr}</span></div>'
                  f'<div style="padding:10px 12px 12px"><div class="strong" style="font-size:14px">{n}</div><div class="small" style="font-size:12px">{fm(sv)} / {fm(tg)}</div>'
                  f'<div class="small" style="font-size:11px;margin-top:2px">{rate}</div>'
                  f'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span style="font:800 16px Jakarta;color:{col}">{pct} %</span><span class="sq" style="width:32px;height:32px;border-radius:16px;background:var(--brand)">{ico("add",18,"#fff")}</span></div></div></div>')
    body = (goals_title() + goals_hero() + f'<div class="sh" style="margin-top:4px"><span class="h2">Vos projets</span><span class="link">Ordre de priorité</span></div><div class="g2">{tiles}</div>' +
            f'<div class="small" style="margin:10px 2px 0">L’argent de la réserve famille n’est plus compté comme disponible.</div>' +
            f'<div class="sh"><span class="h2">Répartir chaque mois</span></div>' + distribute())
    return page(body, 'goals')

def plus_final():
    return plus_B()

DARK = [('<div class="t" style="background:var(--brand);color:#fff">', '<div class="t" style="background:#1F5C49;color:#fff">'),('.hero{position:relative;overflow:hidden;background:#0F4A3A', '.hero{position:relative;overflow:hidden;background:#123A2F'),
        ('box-shadow:0 26px 44px -14px rgba(15,74,58,.62),0 12px 22px -8px rgba(15,74,58,.34),0 2px 5px rgba(15,74,58,.18)', 'box-shadow:0 0 0 1px rgba(255,255,255,.09),0 26px 44px -10px rgba(0,0,0,.95),0 0 36px rgba(79,176,143,.16)'),
        ('--shadow:0 1px 2px rgba(60,45,20,.08)', '--shadow:none'),
        ('--brand:#0F4A3A', '--brand:#4FB08F'), ('#0F4A3A', '#6CC4A4'),
        ('#F4F1EA', '#13120F'), ('#FFFCF7', '#1D1B17'), ('#EDE7DC', '#29261F'), ('#EAE3D7', '#2C2923'), ('#1F1C17', '#F3EFE7'), ('#564E43', '#BDB4A4'), ('#6E6558', '#A0968A'),
        ('#DCEBE3', '#1E3A31'), ('#F5E6C4', '#3D3018'), ('#F6DAD7', '#42201D'), ('#F5DDD1', '#43271C'), ('#DBE6F2', '#1E2D3D'), ('#EEDDEA', '#37223A'), ('#E6E8EA', '#2A2F33'), ('#D8F0E0', '#173A25'),
        ('#1E6B52', '#7FD1B0'), ('#9A6400', '#E8B85A'), ('#B3261E', '#F08A82'), ('#B0502A', '#F09A75'), ('#2D5F8F', '#8DB8E3'), ('#7B3F70', '#D79CCB'), ('#55606A', '#B5BEC6'),
        ('#1E7A45', '#63C08A'), ('#8A5A00', '#D9A441'), ('rgba(255,255,255,.75)', 'rgba(0,0,0,.35)'), ('rgba(255,255,255,.7)', 'rgba(0,0,0,.25)'),
        ('.btn.pri{background:var(--brand);color:#fff}', '.btn.pri{background:var(--brand);color:#0B2A21}')]
def dark(h):
    for a, b in DARK: h = h.replace(a, b)
    return h

if __name__ == '__main__':
    out = '/tmp/claude-0/-home-user-VALEO/af71d198-0678-55f7-8b4f-1b972a15d4fd/scratchpad/abc/final/'
    import os; os.makedirs(out, exist_ok=True)
    for k, fn in [('accueil', home_final2), ('budget', budget_final), ('objectifs', goals_final), ('plus', plus_final)]:
        h = fn(); open(out + f'{k}-clair.html', 'w').write(h); open(out + f'{k}-sombre.html', 'w').write(dark(h))
    print('ok')
