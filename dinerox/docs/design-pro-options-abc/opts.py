from base import *

EXTRA = """
/* A */
.qa{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0 4px}
.qa div{display:flex;flex-direction:column;align-items:center;gap:6px;font:600 12px Inter;color:var(--text)}
.qa .c{width:52px;height:52px;border-radius:26px;background:var(--surface);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center}
.qa .c.g{background:var(--brand)}
.voice{display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:999px;box-shadow:var(--shadow);padding:6px 6px 6px 6px;margin-top:14px}
.voice .m{width:40px;height:40px;border-radius:20px;background:var(--brand);display:flex;align-items:center;justify-content:center}
.voice .t{flex:1;font:400 14px Inter;color:var(--text3)}
.voice .k{width:40px;height:40px;border-radius:20px;background:var(--surface2);display:flex;align-items:center;justify-content:center}
.stack{position:relative;margin-bottom:12px}
.stack .b1,.stack .b2{position:absolute;left:12px;right:12px;height:20px;border-radius:18px;background:var(--surface);box-shadow:var(--shadow)}
.stack .b1{bottom:-6px;opacity:.8} .stack .b2{bottom:-12px;left:24px;right:24px;opacity:.55}
.notif{position:relative;z-index:2;padding:14px 14px 10px}
.notif .row{display:flex;gap:12px;align-items:flex-start}
.notif .ic{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}
.notif .act{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.pg{display:flex;gap:4px} .pg i{width:6px;height:6px;border-radius:3px;background:var(--divider);display:block} .pg i.on{background:var(--brand);width:16px}
.day{font:600 12px Inter;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;padding:12px 16px 4px}
.txr{display:flex;align-items:center;gap:12px;padding:8px 16px 10px}
.txr .ic{width:44px;height:44px;border-radius:14px;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex:none;position:relative}
.txr .mid{flex:1;min-width:0}
.txr .badge{position:absolute;right:-4px;bottom:-4px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{padding:12px 12px}
.stat .k{font:500 12px Inter;color:var(--text3)} .stat .v{font:700 15px Jakarta;margin-top:4px;font-variant-numeric:tabular-nums}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.envc{padding:14px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.envc .n{font:600 14px/18px Inter} .envc .s{font:600 12px Inter}
/* B */
.qb{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
.qb .t{border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:18px;min-height:96px}
.qb .t .l{font:600 15px Inter}
.qb .t .s{font:400 12px Inter;opacity:.8}
.ban{display:flex;gap:10px;align-items:flex-start;padding:12px 12px 12px 14px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow);margin-bottom:8px}
.ban .x{width:32px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;color:var(--text3);flex:none;margin:-4px -4px 0 0}
.jar{width:100%;height:84px;border-radius:16px;background:var(--surface2);position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.jar i{position:absolute;left:0;right:0;bottom:0;display:block}
.jar img{position:relative;margin-bottom:10px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.jc{padding:8px 8px 12px;display:flex;flex-direction:column;gap:6px;text-align:center}
.jc .n{font:600 12px/16px Inter;min-height:32px;display:flex;align-items:center;justify-content:center}
.jc .s{font:600 11px Inter}
/* C */
.chips{display:flex;gap:8px;margin:2px 0 6px}
.chip{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:999px;background:var(--surface);box-shadow:var(--shadow);font:600 13px Inter}
.hint{display:flex;align-items:center;gap:8px;font:400 13px Inter;color:var(--text3);margin:10px 2px 0}
.inbox .it{display:flex;gap:12px;padding:12px 14px;align-items:flex-start}
.inbox .it+.it{border-top:1px solid var(--divider)}
.inbox .ud{width:8px;height:8px;border-radius:4px;background:var(--brand);margin-top:7px;flex:none}
.tl{position:relative;padding-left:22px}
.tl:before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--divider)}
.tl .node{position:absolute;left:0;width:16px;height:16px;border-radius:8px;background:var(--bg);border:3px solid var(--brand)}
.tl .dl{font:600 12px Inter;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;margin:14px 0 6px;position:relative}
.bub{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.bub .n{font:600 12px/16px Inter} .bub .s{font:600 11px Inter}
.seg{display:flex;background:var(--surface2);border-radius:12px;padding:3px;margin:4px 0 12px}
.seg div{flex:1;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font:600 13px Inter;color:var(--text2)}
.seg .on{background:var(--surface);color:var(--text);box-shadow:var(--shadow)}
.fab{position:sticky;bottom:76px;margin-left:auto;margin-right:-4px;width:max-content;display:flex;align-items:center;gap:8px;background:var(--brand);color:#fff;border-radius:999px;padding:0 18px 0 14px;height:52px;font:600 15px Inter;box-shadow:0 10px 20px -6px rgba(15,74,58,.5);z-index:5}
.search{display:flex;align-items:center;gap:10px;height:46px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow);padding:0 14px;color:var(--text3);font:400 14px Inter;margin:4px 0 14px}
.acc{padding:4px 0}
.acc .h{display:flex;align-items:center;gap:12px;padding:12px 16px}
.acc .h+.h{border-top:1px solid var(--divider)}
.sq{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none}
"""

def page(body, on):
    return head() + f'<style>{EXTRA}</style></head><body><div class="page">{body}{tabbar(on)}</div></body></html>'

# ───────────────────────── ACCUEIL ─────────────────────────
def tx_rows(style):
    h = ''
    for day, items in TX:
        h += f'<div class="day">{day}</div>'
        for n, sub, a, f, lg in items:
            icon = i3d(f, 30) if f else ico('swap-horizontal', 22, '#0F4A3A')
            badge = f'<span class="badge">{logo(lg, 18)}</span>' if lg else ''
            cls = 'pos' if not a.startswith('−') else 'neg'
            h += f'<div class="txr"><div class="ic">{icon}{badge}</div><div class="mid"><div class="strong">{n}</div><div class="small">{sub}</div></div><div class="amt {cls}">{a}</div></div>'
    return f'<div class="card" style="padding-bottom:6px">{h}</div>'

def env_rings():
    h = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st)
        pct = round(sp * 100 / bud)
        h += f'<div class="card envc">{ring(min(pct,100), 64, 7, col, "#EAE3D7", i3d(f, 30))}<div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div><div class="small" style="font-size:12px">{pct} % · {fm(bud)}</div></div>'
    return f'<div class="g2">{h}</div>'

def goals_compact():
    h = ''
    for f, n, sub, sv, tg, pr, rate in GOALS + [('backpack', 'Rentrée scolaire', 'Moment fort · 16 déc.', 0, 120000, '', '15 000 FCFA / semaine')]:
        pct = round(sv * 100 / tg)
        h += f'<div class="txr" style="padding:12px 16px">{ring(pct, 48, 5, GREEN, "#EAE3D7", i3d(f, 24))}<div class="mid"><div class="strong">{n}</div><div class="small">{fm(sv)} sur {fm(tg)}</div></div><div class="amt" style="color:var(--brand)">{pct} %</div></div>'
    return f'<div class="card">{h}</div>'

def month_stats():
    return (f'<div class="stats">'
            f'<div class="card stat"><div class="k">Revenus</div><div class="v" style="color:var(--pos)">450 000</div></div>'
            f'<div class="card stat"><div class="k">Dépenses</div><div class="v">326 000</div></div>'
            f'<div class="card stat"><div class="k">Épargne nette</div><div class="v">60 000</div></div></div>'
            f'<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin-top:8px"><span class="strong" style="font-weight:500">Reste à répartir</span><span class="amt">328 500 FCFA</span></div>')

def rewards_ai():
    return (f'<div class="g2" style="margin-top:22px">'
            f'<div class="card" style="padding:14px;display:flex;gap:10px;align-items:center">{i3d("trophy",36)}<div><div class="strong" style="font-size:14px">Mes récompenses</div><div class="small">Obtenue 2 fois</div></div></div>'
            f'<div class="card" style="padding:14px;display:flex;gap:10px;align-items:center"><span class="sq" style="background:{VIOLET};width:36px;height:36px;border-radius:18px">{ico("chatbubble-ellipses",19,"#fff")}</span><div><div class="strong" style="font-size:14px">DineroX IA</div><div class="small">Instantané</div></div></div></div>'
            f'<div style="display:flex;justify-content:center;margin-top:14px"><span class="btn ghost">{ico("bar-chart-outline",18,"#0F4A3A")} Rapports</span></div>')

def analysis():
    return (f'<div class="card" style="padding:16px"><div style="display:flex;gap:12px;align-items:flex-start">{i3d("chart-increasing",32)}<div><div class="strong">Votre analyse</div>'
            f'<div style="font:400 14px/20px Inter;margin-top:4px">Vos objectifs demandent 195 000 FCFA par mois ; il vous reste 55 750 FCFA par mois. Il manque 139 250 FCFA : allongez une échéance ou priorisez un objectif.</div>'
            f'<div style="display:flex;justify-content:space-between;margin-top:8px"><span class="small">Vos données</span><span class="link" style="display:flex;gap:6px;align-items:center">{ico("volume-medium-outline",16,"#0F4A3A")} Écouter</span></div></div></div></div>')

def home_A():
    qa = ''.join(f'<div><span class="c{" g" if g else ""}">{ico(i,22,"#fff" if g else "#0F4A3A")}</span>{l}</div>' for i, l, g in [('time-outline', 'Historique', 0), ('arrow-down', 'Revenu', 0), ('swap-horizontal', 'Transfert', 0), ('keypad-outline', 'Saisir', 0)])
    i, c, t = ALERTS[0]
    notif = (f'<div class="stack"><div class="b2"></div><div class="b1"></div><div class="card notif"><div class="row"><span class="ic" style="background:{PASTEL[c]}">{ico(i,20,c)}</span>'
             f'<div style="flex:1"><div style="font:600 12px Inter;color:var(--text3);margin-bottom:2px">À LIRE · 1 sur 5</div><div style="font:500 15px/21px Inter">{t}</div></div></div>'
             f'<div class="act"><div class="pg"><i class="on"></i><i></i><i></i><i></i><i></i></div><div style="display:flex;gap:4px"><span class="btn ghost" style="min-height:36px">{ico("volume-medium-outline",16,"#0F4A3A")} Écouter</span><span class="btn sec" style="min-height:36px">J’ai lu</span></div></div></div></div>')
    voice = f'<div class="voice"><span class="m">{ico("mic",20,"#fff")}</span><span class="t">Parlez : « Hier carburant 15 000 »</span><span class="k">{ico("keypad-outline",18,"#0F4A3A")}</span></div>'
    body = (topbar(5) + hello() + hero() + f'<div class="qa">{qa}</div>' + voice +
            f'<div class="sh"><span class="h2">À lire</span><span class="link">Tout voir (5)</span></div>' + notif +
            f'<div class="sh"><span class="h2">Dernières opérations</span><span class="link">Tout voir</span></div>' + tx_rows('A') +
            f'<div class="sh"><span class="h2">Octobre</span><span class="small">Mois en cours</span></div>' + month_stats() +
            f'<div class="sh"><span class="h2">Enveloppes</span><span class="link">Gérer (6)</span></div>' + env_rings() +
            f'<div class="sh"><span class="h2">Objectifs</span><span class="link">Tout voir</span></div>' + goals_compact() +
            f'<div class="sh"><span class="h2">Analyse</span></div>' + analysis() + rewards_ai())
    return page(body, 'home')

def home_B():
    tiles = [('time-outline', 'Historique', 'Toutes vos opérations', BLEU), ('arrow-down', 'Revenu', 'Salaire, vente…', GREEN), ('swap-horizontal', 'Transfert', 'Entre vos comptes', OR), ('mic', 'Parler', '« Taxi 2 000 »', None)]
    qb = ''
    for i, l, s, c in tiles:
        if c is None:
            qb += f'<div class="t" style="background:var(--brand);color:#fff">{ico(i,26,"#fff")}<div><div class="l">{l}</div><div class="s">{s}</div></div></div>'
        else:
            qb += f'<div class="t" style="background:{PASTEL[c]};color:var(--text)">{ico(i,26,c)}<div><div class="l">{l}</div><div class="s" style="color:var(--text2)">{s}</div></div></div>'
    bans = ''.join(f'<div class="ban"><span class="sq" style="background:{PASTEL[c]}">{ico(i,18,c)}</span><div style="flex:1;font:500 14px/20px Inter">{t}<div style="margin-top:4px"><span class="link" style="font-size:13px;display:inline-flex;gap:4px;align-items:center">{ico("volume-medium-outline",15,"#0F4A3A")} Écouter</span></div></div><span class="x">{ico("close",18)}</span></div>' for i, c, t in ALERTS[:3])
    jars = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st); pct = min(100, round(sp * 100 / bud))
        jars += f'<div class="card jc"><div class="jar"><i style="height:{pct}%;background:{PASTEL[col]}"></i>{i3d(f,34)}</div><div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div></div>'
    goals = ''
    for f, n, sub, sv, tg, pr, rate in GOALS:
        pct = round(sv * 100 / tg)
        goals += f'<div class="card" style="padding:14px;flex:1"><div style="display:flex;justify-content:space-between;align-items:flex-start">{i3d(f,40)}<span style="font:700 18px Jakarta;color:var(--brand)">{pct} %</span></div><div class="strong" style="margin-top:10px">{n}</div><div class="small">{fm(sv)}<br>sur {fm(tg)}</div></div>'
    body = (topbar(3) + hello() + hero() + f'<div class="qb">{qb}</div>' +
            f'<div class="sh"><span class="h2">À lire</span><span class="small">Touchez × quand c’est lu</span></div>' + bans +
            f'<div class="sh"><span class="h2">Dernières opérations</span><span class="link">Tout voir</span></div>' + tx_rows('B') +
            f'<div class="sh"><span class="h2">Enveloppes</span><span class="link">Gérer (6)</span></div><div class="g3">{jars}</div>' +
            f'<div class="sh"><span class="h2">Octobre</span><span class="small">Mois en cours</span></div>' + month_stats() +
            f'<div class="sh"><span class="h2">Objectifs</span><span class="link">Tout voir</span></div><div style="display:flex;gap:10px">{goals}</div>' +
            f'<div class="sh"><span class="h2">Analyse</span></div>' + analysis() + rewards_ai())
    return page(body, 'home')

def home_C():
    chips = ''.join(f'<span class="chip">{ico(i,16,"#0F4A3A")}{l}</span>' for i, l in [('time-outline', 'Historique'), ('arrow-down', 'Revenu'), ('swap-horizontal', 'Transfert')])
    inbox = ''.join(f'<div class="it"><span class="ud"></span><span class="sq" style="background:{PASTEL[c]};width:32px;height:32px">{ico(i,17,c)}</span><div style="flex:1;font:500 14px/20px Inter">{t}</div>{ico("volume-medium-outline",18,"#0F4A3A")}</div>' for i, c, t in ALERTS[:4])
    tl = ''
    for day, items in TX:
        for n, sub, a, f, lg in items:
            icon = i3d(f, 26) if f else ico('swap-horizontal', 20, '#0F4A3A')
            cls = 'pos' if not a.startswith('−') else 'neg'
            tl += (f'<div class="dl"><span class="node" style="top:-1px;left:-22px"></span>{day}</div>'
                   f'<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px">{icon}<div style="flex:1;min-width:0"><div class="strong">{n}</div><div class="small">{sub}</div></div><div class="amt {cls}">{a}</div></div>')
    bubs = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st); pct = min(100, round(sp * 100 / bud))
        bubs += f'<div class="bub">{ring(pct, 76, 6, col, "#EAE3D7", i3d(f, 34))}<div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div></div>'
    body = (topbar(4) + hello() + hero() + f'<div class="chips">{chips}</div>' +
            f'<div class="hint">{ico("mic-outline",16,"#6E6558")} Astuce : touchez le micro et dites « Hier carburant 15 000 »</div>' +
            f'<div class="sh"><span class="h2">Notifications</span><span class="link">Tout marquer comme lu</span></div><div class="card inbox">{inbox}</div>' +
            f'<div class="sh"><span class="h2">Fil des opérations</span><span class="link">Tout voir</span></div><div class="tl">{tl}</div>' +
            f'<div class="sh"><span class="h2">Enveloppes</span><span class="link">Gérer (6)</span></div><div class="card" style="padding:16px 8px"><div class="g3" style="row-gap:16px">{bubs}</div></div>' +
            f'<div class="sh"><span class="h2">Octobre</span><span class="small">Mois en cours</span></div>' + month_stats() +
            f'<div class="sh"><span class="h2">Objectifs</span><span class="link">Tout voir</span></div>' + goals_compact() +
            f'<div class="sh"><span class="h2">Analyse</span></div>' + analysis() + rewards_ai() +
            f'<div class="fab">{ico("mic",20,"#fff")} Parler</div>')
    return page(body, 'home')

# ───────────────────────── BUDGET ─────────────────────────
def budget_title():
    return topbar() + '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin:4px 0 12px"><div><div style="font:700 24px Jakarta">Budget</div><div class="small">octobre 2026</div></div></div>'

def donut_summary():
    inner = '<div style="text-align:center"><div style="font:800 22px Jakarta">90 %</div><div class="small" style="font-size:11px">consommé</div></div>'
    return (f'<div class="card" style="padding:18px;display:flex;gap:16px;align-items:center">{ring(90, 116, 12, "#0F4A3A", "#EAE3D7", inner)}'
            f'<div style="flex:1"><div class="small">Reste dans les enveloppes</div><div style="font:800 26px Jakarta;margin:2px 0 8px" class="num">44 000 <span style="font:600 14px Inter">FCFA</span></div>'
            f'<div style="display:flex;justify-content:space-between;font:500 13px/22px Inter"><span class="muted">Prévu</span><span class="num">420 000</span></div>'
            f'<div style="display:flex;justify-content:space-between;font:500 13px/22px Inter"><span class="muted">Dépensé</span><span class="num">376 000</span></div>'
            f'<div style="display:flex;justify-content:space-between;font:500 13px/22px Inter"><span class="muted">À répartir</span><span class="num">328 500</span></div></div></div>')

def budget_A():
    i, c, t = ALERTS[0]
    notif = (f'<div class="stack" style="margin-top:12px"><div class="b2"></div><div class="b1"></div><div class="card notif"><div class="row"><span class="ic" style="background:{PASTEL[c]}">{ico(i,20,c)}</span>'
             f'<div style="flex:1"><div style="font:600 12px Inter;color:var(--text3);margin-bottom:2px">À LIRE · 1 sur 3</div><div style="font:500 15px/21px Inter">{t}</div></div></div>'
             f'<div class="act"><div class="pg"><i class="on"></i><i></i><i></i></div><div style="display:flex;gap:4px"><span class="btn ghost" style="min-height:36px">{ico("volume-medium-outline",16,"#0F4A3A")} Écouter</span><span class="btn sec" style="min-height:36px">J’ai lu</span></div></div></div></div>')
    body = (budget_title() + donut_summary() + notif +
            f'<div class="sh"><span class="h2">Enveloppes</span><span class="small">6</span></div>' + env_rings() +
            f'<div style="display:flex;flex-direction:column;gap:10px;margin-top:16px"><span class="btn pri">{ico("add",20,"#fff")} Nouvelle enveloppe</span><span class="btn sec">{ico("sparkles-outline",18,"#7B3F70")} Budget automatique</span></div>')
    return page(body, 'budget')

def budget_B():
    bans = ''.join(f'<div class="ban"><span class="sq" style="background:{PASTEL[c]}">{ico(i,18,c)}</span><div style="flex:1;font:500 14px/20px Inter">{t}<div style="margin-top:4px"><span class="link" style="font-size:13px;display:inline-flex;gap:4px;align-items:center">{ico("volume-medium-outline",15,"#0F4A3A")} Écouter</span></div></div><span class="x">{ico("close",18)}</span></div>' for i, c, t in ALERTS[:3])
    jars = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st); pct = min(100, round(sp * 100 / bud))
        jars += f'<div class="card jc"><div class="jar" style="height:110px"><i style="height:{pct}%;background:{PASTEL[col]}"></i>{i3d(f,38)}</div><div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div><div class="small" style="font-size:11px">{fm(sp)} / {fm(bud)}</div></div>'
    add = f'<div class="card jc" style="justify-content:center;align-items:center;border:2px dashed var(--divider);box-shadow:none;background:transparent">{ico("add-circle",34,"#0F4A3A")}<div class="n">Nouvelle enveloppe</div></div>'
    body = (budget_title() +
            f'<div class="card" style="padding:18px"><div class="small">Reste dans les enveloppes</div><div style="font:800 32px Jakarta;margin:2px 0 10px" class="num">44 000 <span style="font:600 15px Inter">FCFA</span></div>'
            f'<div style="height:10px;border-radius:5px;background:#EAE3D7;overflow:hidden"><i style="display:block;width:90%;height:100%;background:var(--brand)"></i></div><div class="small" style="margin-top:6px">Consommé : 90 %</div>'
            f'<div class="stats" style="margin-top:14px"><div><div class="small" style="font-size:12px">Prévu</div><div class="strong num">420 000</div></div><div><div class="small" style="font-size:12px">Dépensé</div><div class="strong num">376 000</div></div><div><div class="small" style="font-size:12px">À répartir</div><div class="strong num">328 500</div></div></div></div>'
            f'<div class="sh"><span class="h2">À lire</span><span class="small">Touchez × quand c’est lu</span></div>' + bans +
            f'<div class="sh"><span class="h2">Enveloppes</span><span class="link">{ico("sparkles-outline",15,"#0F4A3A")} Budget automatique</span></div><div class="g3">{jars}{add}</div>')
    return page(body, 'budget')

def budget_C():
    inbox = ''.join(f'<div class="it"><span class="ud"></span><span class="sq" style="background:{PASTEL[c]};width:32px;height:32px">{ico(i,17,c)}</span><div style="flex:1;font:500 14px/20px Inter">{t}</div>{ico("volume-medium-outline",18,"#0F4A3A")}</div>' for i, c, t in ALERTS[:3])
    bubs = ''
    for f, n, sp, bud, st in ENV:
        lab, col = envstate(sp, bud, st); pct = min(100, round(sp * 100 / bud))
        bubs += f'<div class="bub">{ring(pct, 84, 7, col, "#EAE3D7", i3d(f, 38))}<div class="n">{n}</div><div class="s" style="color:{col}">{lab}</div><div class="small" style="font-size:11px">{round(sp*100/bud)} %</div></div>'
    body = (budget_title() + donut_summary() +
            f'<div class="seg" style="margin-top:16px"><div class="on">Enveloppes</div><div>Notifications (3)</div></div>' +
            f'<div class="card" style="padding:18px 8px"><div class="g3" style="row-gap:18px">{bubs}</div></div>' +
            f'<div class="sh"><span class="h2">Notifications</span><span class="link">Tout marquer comme lu</span></div><div class="card inbox">{inbox}</div>' +
            f'<div class="g2" style="margin-top:16px"><span class="btn pri">{ico("add",18,"#fff")} Nouvelle</span><span class="btn sec">{ico("sparkles-outline",16,"#7B3F70")} Automatique</span></div>')
    return page(body, 'budget')

# ───────────────────────── OBJECTIFS ─────────────────────────
def goals_hero():
    return (f'<div class="hero">{PATTERN}<div class="body" style="padding:16px">'
            f'<div style="display:flex;justify-content:space-between;align-items:center"><div class="cap" style="font-size:13px">Épargne pour vos projets</div><span class="mp">20 %</span></div>'
            f'<div class="big num" style="margin-top:4px">450 000<small>FCFA</small></div><div class="cap">sur 2 200 000 FCFA visés · reste 1 750 000 FCFA</div>'
            f'<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.22);margin-top:12px;overflow:hidden"><i style="display:block;width:20%;height:100%;background:#E8B85A"></i></div></div></div>')

def goals_title(seg=False):
    return topbar() + f'<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px"><div style="font:700 24px Jakarta">Objectifs</div><span class="btn pri" style="min-height:40px;padding:0 14px">{ico("add",18,"#fff")} Nouveau</span></div>'

def goals_A():
    cards = ''
    for f, n, sub, sv, tg, pr, rate in GOALS:
        pct = round(sv * 100 / tg)
        cards += (f'<div class="card" style="padding:16px;margin-bottom:12px"><div style="display:flex;gap:14px;align-items:center">{ring(pct, 72, 7, GREEN, "#EAE3D7", i3d(f, 36))}'
                  f'<div style="flex:1"><div style="font:600 11px Inter;color:var(--brand);text-transform:uppercase;letter-spacing:.4px">{pr}</div><div style="font:700 17px Jakarta;margin-top:2px">{n}</div><div class="small">{sub}</div></div>'
                  f'<div style="font:800 20px Jakarta;color:var(--brand)">{pct} %</div></div>'
                  f'<div style="display:flex;justify-content:space-between;margin:12px 0 10px;font:500 13px Inter"><span class="num"><b>{fm(sv)}</b> <span class="muted">sur {fm(tg)}</span></span><span class="muted">{rate}</span></div>'
                  f'<span class="btn sec" style="width:100%">{ico("add",18)} Ajouter de l’argent</span></div>')
    reserve = (f'<div class="card" style="padding:16px;display:flex;gap:14px;align-items:center">{ring(27, 60, 6, OR, "#EAE3D7", i3d("composees/famille_coeur_3d_medium-dark", 30))}'
               f'<div style="flex:1"><div class="strong">Réserve famille et cérémonies</div><div class="small">80 000 sur 300 000 FCFA · 25 000 FCFA / mois</div></div>{ico("chevron-forward",18,"#6E6558")}</div>'
               f'<div class="small" style="margin:8px 2px 0">L’argent mis de côté pour la famille et les cérémonies n’est plus compté comme disponible.</div>')
    season = f'<div class="card" style="padding:16px;display:flex;gap:14px;align-items:center">{ring(0, 60, 6, BLEU, "#EAE3D7", i3d("backpack", 30))}<div style="flex:1"><div class="strong">Rentrée scolaire · 16 déc.</div><div class="small">Dans 8 semaines : 120 000 FCFA prévus, soit 15 000 FCFA par semaine.</div></div>{ico("chevron-forward",18,"#6E6558")}</div>'
    body = (goals_title() + goals_hero() + f'<div class="seg"><div class="on">Projets (2)</div><div>Réserves (1)</div><div>Moments forts (1)</div></div>' + cards +
            f'<div style="display:flex;justify-content:center"><span class="btn ghost">{ico("swap-vertical",18,"#0F4A3A")} Modifier l’ordre de priorité</span></div>' +
            f'<div class="sh"><span class="h2">Réserves</span><span class="link">Ajouter</span></div>' + reserve +
            f'<div class="sh"><span class="h2">Moments forts</span></div>' + season +
            f'<div class="sh"><span class="h2">Répartir chaque mois</span></div>' + distribute())
    return page(body, 'goals')

def distribute():
    return (f'<div class="card" style="padding:16px"><div class="small">Ce qui me reste chaque mois</div><div style="font:800 22px Jakarta;margin:2px 0 12px" class="num">55 750 FCFA</div>'
            f'<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:#EAE3D7"><i style="display:block;width:99%;background:{GREEN}"></i></div>'
            f'<div style="display:flex;justify-content:space-between;margin-top:10px;font:500 13px Inter"><span>● Ma moto</span><span class="num">55 000 FCFA</span></div>'
            f'<div style="display:flex;justify-content:space-between;margin-top:6px;font:500 13px Inter" class="muted"><span>○ Fonds d’urgence</span><span class="num">0 FCFA</span></div>'
            f'<div class="small" style="margin-top:8px">Les objectifs prioritaires sont financés en premier.</div></div>')

def goals_B():
    tiles = ''
    for f, n, sub, sv, tg, pr, rate in GOALS + [('backpack', 'Rentrée scolaire', '16 déc. · moment fort', 0, 120000, 'Moment fort', '15 000 FCFA / sem.'), ('composees/famille_coeur_3d_medium-dark', 'Réserve famille', 'Réserve', 80000, 300000, 'Réserve', '25 000 FCFA / mois')]:
        pct = round(sv * 100 / tg); col = OR if pr == 'Réserve' else BLEU if pr == 'Moment fort' else GREEN
        tiles += (f'<div class="card" style="overflow:hidden"><div style="height:96px;background:{PASTEL[col]};display:flex;align-items:center;justify-content:center;position:relative">{i3d(f,52)}'
                  f'<span style="position:absolute;top:8px;left:8px;font:600 11px Inter;background:rgba(255,255,255,.75);border-radius:999px;padding:2px 8px;color:{col}">{pr}</span></div>'
                  f'<div style="padding:10px 12px 12px"><div class="strong" style="font-size:14px">{n}</div><div class="small" style="font-size:12px">{fm(sv)} / {fm(tg)}</div>'
                  f'<div style="height:6px;border-radius:3px;background:#EAE3D7;margin:8px 0 6px;overflow:hidden"><i style="display:block;width:{max(pct,2)}%;height:100%;background:{col}"></i></div>'
                  f'<div style="display:flex;justify-content:space-between;align-items:center"><span style="font:700 13px Inter;color:{col}">{pct} %</span><span class="sq" style="width:30px;height:30px;border-radius:15px;background:var(--brand)">{ico("add",18,"#fff")}</span></div></div></div>')
    body = (goals_title() + goals_hero() + f'<div class="sh" style="margin-top:4px"><span class="h2">Vos projets</span><span class="link">Ordre de priorité</span></div><div class="g2">{tiles}</div>' +
            f'<div class="small" style="margin:10px 2px 0">L’argent de la réserve famille n’est plus compté comme disponible.</div>' +
            f'<div class="sh"><span class="h2">Répartir chaque mois</span></div>' + distribute())
    return page(body, 'goals')

def goals_C():
    steps = [('16 déc. 2026', 'backpack', 'Rentrée scolaire', 'Moment fort · 15 000 FCFA / semaine', 0, 120000, BLEU),
             ('Août 2027', 'composees/moto_rouge_3d', 'Ma moto', 'Priorité 1 · 75 000 FCFA / mois', 450000, 1200000, GREEN),
             ('Février 2030', 'shield', 'Mon fonds d’urgence', 'Priorité 2 · à votre rythme', 0, 1000000, GREEN)]
    tl = ''
    for d, f, n, sub, sv, tg, col in steps:
        pct = round(sv * 100 / tg)
        tl += (f'<div class="dl"><span class="node" style="left:-22px;top:-1px;border-color:{col}"></span>{d}</div>'
               f'<div class="card" style="padding:14px"><div style="display:flex;gap:12px;align-items:center">{i3d(f,40)}<div style="flex:1"><div class="strong">{n}</div><div class="small">{sub}</div></div><span style="font:800 17px Jakarta;color:{col}">{pct} %</span></div>'
               f'<div style="height:6px;border-radius:3px;background:#EAE3D7;margin:10px 0 8px;overflow:hidden"><i style="display:block;width:{max(pct,2)}%;height:100%;background:{col}"></i></div>'
               f'<div style="display:flex;justify-content:space-between;align-items:center"><span class="small num">{fm(sv)} sur {fm(tg)}</span><span class="btn sec" style="min-height:34px;padding:0 12px">{ico("add",16)} Ajouter</span></div></div>')
    vault = (f'<div class="card" style="padding:16px;display:flex;gap:14px;align-items:center;background:{PASTEL[OR]}">{i3d("composees/famille_coeur_3d_medium-dark",44)}'
             f'<div style="flex:1"><div style="font:600 11px Inter;color:{OR};text-transform:uppercase;letter-spacing:.4px">Réserve</div><div class="strong">Famille et cérémonies</div><div class="small" style="color:var(--text2)">80 000 / 300 000 FCFA · 25 000 FCFA / mois</div></div>{ico("chevron-forward",18,"#6E6558")}</div>'
             f'<div class="small" style="margin:8px 2px 0">L’argent mis de côté pour la famille et les cérémonies n’est plus compté comme disponible.</div>')
    body = (goals_title() + goals_hero() + vault + f'<div class="sh"><span class="h2">Votre feuille de route</span><span class="link">Ordre</span></div><div class="tl">{tl}</div>' +
            f'<div class="sh"><span class="h2">Répartir chaque mois</span></div>' + distribute())
    return page(body, 'goals')

# ───────────────────────── PLUS ─────────────────────────
MENU = [('MON ARGENT', [('list', 'Historique des opérations', GREEN), ('wallet', 'Comptes', GREEN), ('cash', 'Épargne', GREEN), ('people', 'Mes tontines', OR), ('heart', 'Famille et obligations', ROUGE), ('calendar-number', "Moments forts de l'année", TERRE), ('calculator', 'Puis-je contribuer ?', BLEU), ('receipt', 'Dettes et crédits', ROUGE), ('business', 'Patrimoine', OR), ('repeat', 'Opérations récurrentes', BLEU)]),
        ('INTELLIGENCE', [('chatbubble-ellipses', 'Parler à DineroX', VIOLET), ('analytics', 'Analyse financière', GREEN), ('calendar', 'Calendrier financier', BLEU), ('trending-up', 'Indépendance financière', OR), ('trophy', 'Mes récompenses', OR), ('speedometer', 'Mon score', GREEN)]),
        ('PLANIFIER', [('people-circle', 'Famille', TERRE), ('bar-chart', 'Rapports', BLEU), ('notifications', 'Notifications', OR), ('pricetags', 'Catégories', VIOLET)]),
        ('APPLICATION', [('gift', 'Inviter des amis', TERRE), ('logo-whatsapp', 'Suivre DineroX sur WhatsApp', '#178A45'), ('star', 'Donner mon avis', OR), ('sparkles', 'Formules', VIOLET), ('settings', 'Paramètres', GRIS)])]

def plus_head():
    return topbar() + (f'<div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 6px"><div style="font:700 24px Jakarta">Plus</div>'
                       f'<span style="display:inline-flex;align-items:center;gap:6px;font:600 12px Inter;color:var(--text2);background:var(--surface2);border-radius:999px;padding:4px 10px"><i style="width:8px;height:8px;border-radius:4px;background:var(--brand);display:inline-block"></i>Local</span></div>'
                       f'<div class="hero" style="margin-top:8px">{PATTERN}<div class="body" style="padding:16px"><div class="cap">Patrimoine net consolidé</div><div class="big num" style="font-size:30px">4 385 500<small>FCFA</small></div><div class="cap">4 comptes actifs</div></div></div>')

def plus_A():
    h = ''
    for sec, items in MENU:
        rows = ''.join(f'<div class="h"><span class="sq" style="background:{c}">{ico(i,19,"#fff")}</span><span class="strong" style="flex:1;font-weight:500">{n}</span>{ico("chevron-forward",18,"#6E6558")}</div>' for i, n, c in items)
        h += f'<div class="sh" style="margin:18px 2px 8px"><span style="font:600 12px Inter;letter-spacing:.6px;color:var(--text2)">{sec}</span></div><div class="card acc">{rows}</div>'
    return page(plus_head() + f'<div class="search">{ico("search",18)} Rechercher une rubrique</div>' + h, 'more')

def plus_B():
    h = ''
    for sec, items in MENU:
        cells = ''.join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="sq" style="width:52px;height:52px;border-radius:16px;background:{PASTEL.get(c,"#D8F0E0")}">{ico(i,24,c)}</span><span style="font:600 11px/14px Inter">{n}</span></div>' for i, n, c in items)
        h += f'<div class="sh" style="margin:18px 2px 10px"><span style="font:600 12px Inter;letter-spacing:.6px;color:var(--text2)">{sec}</span></div><div class="card" style="padding:16px 8px"><div style="display:grid;grid-template-columns:repeat(4,1fr);row-gap:16px;column-gap:2px">{cells}</div></div>'
    return page(plus_head() + h, 'more')

def plus_C():
    fav = [MENU[0][1][0], MENU[0][1][1], MENU[0][1][3], MENU[1][1][0]]
    favs = ''.join(f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center"><span class="sq" style="width:56px;height:56px;border-radius:28px;background:{c}">{ico(i,24,"#fff")}</span><span style="font:600 12px/15px Inter">{n.replace(" des opérations","")}</span></div>' for i, n, c in fav)
    acc = ''
    for sec, items in MENU:
        icons = ''.join(f'<span class="sq" style="width:22px;height:22px;border-radius:11px;background:{c};margin-left:-6px;border:2px solid var(--surface)">{ico(i,11,"#fff")}</span>' for i, n, c in items[:4])
        acc += (f'<div class="h" style="padding:16px"><div style="flex:1"><div class="strong">{sec.capitalize()}</div><div class="small">{len(items)} rubriques</div></div>'
                f'<div style="display:flex;padding-left:6px">{icons}</div>{ico("chevron-down",18,"#6E6558")}</div>')
    opened = ''.join(f'<div class="h" style="padding:10px 16px 10px 28px"><span class="sq" style="width:30px;height:30px;border-radius:15px;background:{c}">{ico(i,16,"#fff")}</span><span style="flex:1;font:500 14px Inter">{n}</span>{ico("chevron-forward",16,"#6E6558")}</div>' for i, n, c in MENU[0][1])
    return page(plus_head() + f'<div class="search">{ico("search",18)} Rechercher : tontine, dettes, rapports…</div>' +
                f'<div class="sh" style="margin:6px 2px 10px"><span class="h2">Raccourcis</span><span class="link">Modifier</span></div><div class="card" style="padding:16px 8px"><div style="display:grid;grid-template-columns:repeat(4,1fr)">{favs}</div></div>' +
                f'<div class="sh"><span class="h2">Toutes les rubriques</span></div><div class="card acc">{acc.replace(ico("chevron-down",18,"#6E6558"), ico("chevron-up",18,"#6E6558"),1).replace("rubriques</div></div>", "rubriques</div></div>",1)}</div>'
                .replace('</div><div class="h" style="padding:16px"><div style="flex:1"><div class="strong">Intelligence', '</div>' + opened + '<div class="h" style="padding:16px"><div style="flex:1"><div class="strong">Intelligence', 1), 'more')

PAGES = {'accueil': (home_A, home_B, home_C), 'budget': (budget_A, budget_B, budget_C), 'objectifs': (goals_A, goals_B, goals_C), 'plus': (plus_A, plus_B, plus_C)}
if __name__ == '__main__':
    import os
    out = '/tmp/claude-0/-home-user-VALEO/af71d198-0678-55f7-8b4f-1b972a15d4fd/scratchpad/abc/'
    for k, fns in PAGES.items():
        for L, fn in zip('ABC', fns):
            open(f'{out}{k}-{L}.html', 'w').write(fn())
    print('ok')
