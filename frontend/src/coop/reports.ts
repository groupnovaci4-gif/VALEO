import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { Data, fDate, fF, fFull, fKg, memberStats, outstandingReste, pisteurStats } from "./lib";

export function campaignHtml(data: Data, opts?: { village?: string }): string {
  const village = opts?.village;
  const scopedMembers = village ? data.members.filter((m) => m.village === village) : data.members;
  const memberIds = new Set(scopedMembers.map((m) => m.id));
  const cols = village ? data.collections.filter((c) => memberIds.has(c.memberId)) : data.collections;
  const totKg = cols.reduce((s, c) => s + c.kg, 0);
  const totNet = cols.reduce((s, c) => s + c.net, 0);
  const totPaye = cols.reduce((s, c) => s + c.paye + (c.resteSolde || 0), 0);
  const totReste = cols.reduce((s, c) => s + outstandingReste(c), 0);

  const members = [...scopedMembers].sort((a, b) => a.nom.localeCompare(b.nom));
  const memberRows = members
    .map((m) => {
      const s = memberStats(m.id, cols);
      if (s.count === 0 && s.kg === 0) return "";
      return `<tr><td>${m.code}</td><td>${m.nom}</td><td>${m.village}</td><td class="r">${fKg(s.kg)}</td><td class="r">${fF(s.net)}</td><td class="r">${fF(s.paye)}</td><td class="r due">${s.reste > 0 ? fF(s.reste) : "—"}</td></tr>`;
    })
    .filter(Boolean)
    .join("");

  const totalPrete = data.loans.filter((l) => (!village || memberIds.has(l.memberId)) && (l.status === "approuve" || l.status === "rembourse")).reduce((s, l) => s + l.amount, 0);
  const aRecouvrer = data.loans.filter((l) => !village || memberIds.has(l.memberId)).reduce((s, l) => s + (l.status === "approuve" ? l.soldeRestant : 0), 0);

  const pisteurs = village ? [] : data.staff.filter((s) => s.role === "pisteur");
  const pisteurRows = pisteurs
    .map((p) => {
      const st = pisteurStats(p.id, data);
      return `<tr><td>${p.nom}</td><td class="r">${fF(st.mandat)}</td><td class="r">${fKg(st.poids)}</td><td class="r">${fF(st.achats)}</td><td class="r">${fF(st.depenses)}</td><td class="r">${fF(st.solde)}</td></tr>`;
    })
    .join("");

  const today = fDate(new Date().toISOString());

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body{font-family:-apple-system,Roboto,'Helvetica Neue',sans-serif;color:#241C15;padding:26px;background:#fff}
    .h{background:#0E8E80;color:#fff;text-align:center;padding:22px;border-radius:14px}
    .h .n{font-size:28px;font-weight:900;letter-spacing:1px}
    .h .t{font-size:12px;opacity:.9;font-style:italic;margin-top:4px}
    .h .s{font-size:13px;opacity:.9;margin-top:8px;font-weight:700}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#7A6E62;margin:24px 0 8px}
    .kpis{display:flex;gap:12px;margin-top:16px}
    .k{flex:1;border:1px solid #EAE2D5;border-radius:12px;padding:12px}
    .k .l{font-size:11px;color:#7A6E62}
    .k .v{font-size:18px;font-weight:800;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;background:#F7F3EC;padding:8px 6px;font-size:11px;color:#7A6E62;text-transform:uppercase}
    td{padding:7px 6px;border-bottom:1px solid #F0EBE2}
    .r{text-align:right}
    .due{color:#B8791E}
    .tot td{font-weight:800;border-top:2px solid #EAE2D5;background:#FAF6EF}
    .foot{text-align:center;font-size:11px;color:#7A6E62;margin-top:24px}
  </style></head><body>
    <div class="h"><div class="n">VALEO</div><div class="t">La valeur commence à la source.</div><div class="s">${data.coop.nom} · ${data.saison}${village ? ` · Village : ${village}` : ""}</div></div>
    <div style="text-align:right;font-size:11px;color:#7A6E62;margin-top:8px">Édité le ${today} · Prix ${fF(data.prixKg)}/kg</div>

    <div class="kpis">
      <div class="k"><div class="l">Total collecté</div><div class="v">${fKg(totKg)}</div></div>
      <div class="k"><div class="l">Valeur nette</div><div class="v">${fF(totNet)}</div></div>
    </div>
    <div class="kpis">
      <div class="k"><div class="l">Déjà payé</div><div class="v" style="color:#1E7A4D">${fF(totPaye)}</div></div>
      <div class="k"><div class="l">Reste à payer</div><div class="v due">${fF(totReste)}</div></div>
    </div>

    <h2>Détail par planteur (${members.length})</h2>
    <table>
      <tr><th>Code</th><th>Nom</th><th>Village</th><th class="r">Livré</th><th class="r">Net</th><th class="r">Payé</th><th class="r">Reste</th></tr>
      ${memberRows || `<tr><td colspan="7" style="text-align:center;color:#7A6E62;padding:14px">Aucune collecte</td></tr>`}
      <tr class="tot"><td colspan="3">TOTAL</td><td class="r">${fKg(totKg)}</td><td class="r">${fF(totNet)}</td><td class="r">${fF(totPaye)}</td><td class="r">${fF(totReste)}</td></tr>
    </table>

    <h2>Avances</h2>
    <div class="kpis">
      <div class="k"><div class="l">Total avancé</div><div class="v">${fF(totalPrete)}</div></div>
      <div class="k"><div class="l">À recouvrer</div><div class="v due">${fF(aRecouvrer)}</div></div>
    </div>

    ${pisteurs.length > 0 ? `<h2>Pisteurs — justification de caisse</h2>
    <table>
      <tr><th>Pisteur / Délégué</th><th class="r">Mandat</th><th class="r">Poids</th><th class="r">Achats</th><th class="r">Dépenses</th><th class="r">Solde</th></tr>
      ${pisteurRows}
    </table>` : ""}

    <div class="foot">Document généré par VALEO — ${fFull(totNet)} de valeur collectée sur la campagne.</div>
  </body></html>`;
}

export async function shareCampaign(data: Data, opts?: { village?: string }): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: campaignHtml(data, opts) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Récapitulatif ${opts?.village || data.saison}` });
  } else {
    await Print.printAsync({ html: campaignHtml(data, opts) });
  }
}
