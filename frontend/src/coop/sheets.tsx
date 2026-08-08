import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  C,
  CROPS,
  Collection,
  DEPCATS,
  Data,
  Member,
  OPERATORS,
  activeLoan,
  crop,
  fDate,
  fF,
  fFull,
  fKg,
  group,
  ticketNo,
  waNumber,
} from "./lib";
import { Icon } from "./Icon";
import { Sig, SignaturePad, SigPreview, sigToSvg } from "./Signature";
import {
  Card,
  Chip,
  DeductRow,
  Field,
  Row,
  SaveBtn,
  SectionTitle,
  Select,
  Sheet,
  TInput,
  Toggle,
} from "./ui";

export function MemberSheet({ onClose, onSave }: any) {
  const [nom, setNom] = useState("");
  const [village, setVillage] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [superficie, setSuperficie] = useState("");
  const [cropId, setCropId] = useState("cacao");
  const [tel, setTel] = useState("");
  const valid = nom.trim() && village.trim();
  return (
    <Sheet title="Nouveau planteur" onClose={onClose}>
      <Field label="Nom & prénoms"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Kouassi Yao" /></Field>
      <Field label="Numéro de pièce d'identité"><TInput value={idNumber} onChangeText={setIdNumber} placeholder="Ex. CI 003 451 2" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Localité" flex><TInput value={village} onChangeText={setVillage} placeholder="Ex. Sikensi" /></Field>
        <Field label="Superficie (ha)" flex><TInput value={superficie} onChangeText={(t) => setSuperficie(t.replace(",", "."))} keyboardType="decimal-pad" placeholder="Ex. 2.5" /></Field>
      </View>
      <Field label="Culture">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {CROPS.map((c) => <Chip key={c.id} label={c.nom} emoji={c.emoji} active={cropId === c.id} onPress={() => setCropId(c.id)} />)}
        </View>
      </Field>
      <Field label="Téléphone"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
      <View style={{ backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted }}>Un <Text style={{ fontWeight: "700" }}>code planteur</Text> sera généré automatiquement (format PL-2026-000X).</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.green} onPress={() => onSave({ nom: nom.trim(), village: village.trim(), idNumber: idNumber.trim(), superficie: Number(superficie) || 0, cropId, tel: tel.trim() })}>Enregistrer</SaveBtn>
    </Sheet>
  );
}

export function PeseeSheet({ data, role, staffId, onClose, onSave }: { data: Data; role?: string; staffId: string; onClose: () => void; onSave: (c: any) => void }) {
  const [memberId, setMemberId] = useState(data.members[0]?.id || "");
  const [kg, setKg] = useState("");
  const [prixKg, setPrixKg] = useState(String(data.prixKg));
  const [credit, setCredit] = useState("");
  const [cotisation, setCotisation] = useState("");
  const [sacs, setSacs] = useState("");
  const [remb, setRemb] = useState("");
  const [method, setMethod] = useState("espece");
  const [payTout, setPayTout] = useState(true);
  const [payePartiel, setPayePartiel] = useState("");

  const member = data.members.find((m) => m.id === memberId);
  const loan = activeLoan(memberId, data.loans);
  useEffect(() => { setRemb(""); }, [memberId]);

  const brut = (Number(kg) || 0) * (Number(prixKg) || 0);
  const rembN = loan ? Math.min(Number(remb) || 0, loan.soldeRestant) : 0;
  const retTot = (Number(credit) || 0) + (Number(cotisation) || 0) + (Number(sacs) || 0) + rembN;
  const net = Math.max(0, brut - retTot);
  const paye = payTout ? net : Math.min(net, Number(payePartiel) || 0);
  const reste = net - paye;
  const momoDisabled = !member?.momo;
  const valid = memberId && Number(kg) > 0 && Number(prixKg) > 0;

  const submit = () => {
    const retenues: { label: string; amount: number }[] = [];
    if (Number(credit) > 0) retenues.push({ label: "Crédit intrants", amount: Number(credit) });
    if (Number(cotisation) > 0) retenues.push({ label: "Cotisation", amount: Number(cotisation) });
    if (Number(sacs) > 0) retenues.push({ label: "Sacs", amount: Number(sacs) });
    if (rembN > 0) retenues.push({ label: "Remboursement prêt", amount: rembN });
    onSave({
      memberId, byStaffId: staffId, date: new Date().toISOString(), kg: Number(kg), prixKg: Number(prixKg),
      brut, retenues, net, paye, reste, method: momoDisabled ? "espece" : method, note: "",
      _repay: loan && rembN > 0 ? { loanId: loan.id, amount: rembN } : null,
    });
  };

  if (data.members.length === 0)
    return (
      <Sheet title="Collecte" onClose={onClose}>
        <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucun planteur enregistré. Ajoutez-en un d'abord.</Text></Card>
      </Sheet>
    );

  return (
    <Sheet title={role === "pisteur" ? "Nouvelle collecte" : "Nouvelle pesée"} onClose={onClose}>
      <Field label="Planteur">
        <Select value={memberId} onChange={setMemberId} options={data.members.map((m) => ({ value: m.id, label: `${m.nom} — ${m.village}` }))} />
      </Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Poids (kg)" flex><TInput value={kg} onChangeText={(t) => setKg(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 320" /></Field>
        <Field label="Prix (F/kg)" flex><TInput value={prixKg} onChangeText={(t) => setPrixKg(t.replace(/\D/g, ""))} keyboardType="number-pad" /></Field>
      </View>
      <View style={{ backgroundColor: "#FBF7F0", borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 14 }}><Row label="Montant brut" value={fF(brut)} /></View>

      <SectionTitle>Retenues (facultatif)</SectionTitle>
      <View style={{ gap: 8, marginBottom: 14 }}>
        <DeductRow label="Crédit intrants" value={credit} onChange={setCredit} />
        <DeductRow label="Cotisation / ristourne" value={cotisation} onChange={setCotisation} />
        <DeductRow label="Sacs / emballage" value={sacs} onChange={setSacs} />
        {loan ? (
          <View style={{ backgroundColor: "#FDF7EC", borderWidth: 1, borderColor: "#EAD9BE", borderRadius: 10, padding: 11 }}>
            <Text style={{ fontSize: 12, color: C.due, marginBottom: 6 }}>Ce planteur a un prêt en cours — solde {fF(loan.soldeRestant)}</Text>
            <DeductRow label="Remboursement prêt" value={remb} onChange={(v) => setRemb(String(Math.min(Number(v) || 0, loan.soldeRestant)))} />
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: "#F0F6F2", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 12, padding: 12, marginBottom: 14 }}><Row label="Net à payer" value={fFull(net)} strong color={C.green} /></View>

      <Field label="Mode de paiement">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Toggle active={method === "espece"} onPress={() => setMethod("espece")} color={C.cocoa}>Espèces</Toggle>
          <Toggle active={method === "momo" && !momoDisabled} onPress={() => !momoDisabled && setMethod("momo")} color={C.green}>Mobile Money</Toggle>
        </View>
        {momoDisabled ? <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Ce planteur n'a pas encore lié de compte Mobile Money.</Text> : null}
      </Field>

      <Field label="Paiement">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Toggle active={payTout} onPress={() => setPayTout(true)} color={C.green}>Payer tout</Toggle>
          <Toggle active={!payTout} onPress={() => setPayTout(false)} color={C.due}>Partiel</Toggle>
        </View>
      </Field>
      {!payTout ? (
        <Field label="Montant payé maintenant (F)">
          <TInput value={payePartiel} onChangeText={(t) => setPayePartiel(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={`Max ${group(net)}`} />
          <Text style={{ fontSize: 12, color: C.due, marginTop: 6 }}>Reste à payer : <Text style={{ fontWeight: "700" }}>{fF(reste)}</Text></Text>
        </Field>
      ) : null}

      <SaveBtn disabled={!valid} color={C.green} onPress={submit}>Valider & générer le bordereau</SaveBtn>
    </Sheet>
  );
}

export function LoanSheet({ onClose, onSave }: any) {
  const [type, setType] = useState("intrant");
  const [amount, setAmount] = useState("");
  const [motif, setMotif] = useState("");
  const presets = type === "intrant" ? ["Engrais NPK", "Produits phyto", "Semences", "Petit matériel"] : ["Scolarité", "Santé", "Dépense familiale"];
  const valid = Number(amount) > 0 && motif.trim();
  return (
    <Sheet title="Demander un prêt" onClose={onClose}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, backgroundColor: "#F1EDE3", padding: 4, borderRadius: 12 }}>
        <Toggle active={type === "intrant"} onPress={() => { setType("intrant"); setMotif(""); }} color={C.green}>Intrant</Toggle>
        <Toggle active={type === "argent"} onPress={() => { setType("argent"); setMotif(""); }} color={C.gold}>Argent</Toggle>
      </View>
      <Field label={type === "intrant" ? "Valeur des intrants (F)" : "Montant souhaité (F)"}>
        <TInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 50000" />
      </Field>
      <Field label="Motif">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
          {presets.map((p) => <Chip key={p} label={p} active={motif === p} onPress={() => setMotif(p)} />)}
        </View>
        <TInput value={motif} onChangeText={setMotif} placeholder="Préciser le motif" />
      </Field>
      <View style={{ backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>La demande est envoyée au patron. Une fois approuvée, le remboursement est prélevé sur vos livraisons.</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.green} onPress={() => onSave({ type, amount: Number(amount), motif: motif.trim() })}>Envoyer la demande</SaveBtn>
    </Sheet>
  );
}

export function DepenseSheet({ onClose, onSave }: any) {
  const [category, setCategory] = useState("transport");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const valid = Number(amount) > 0;
  return (
    <Sheet title="Nouvelle dépense" onClose={onClose}>
      <Field label="Catégorie">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {DEPCATS.map((c) => <Chip key={c.id} label={c.nom} active={category === c.id} onPress={() => setCategory(c.id)} />)}
        </View>
      </Field>
      <Field label="Montant (F)"><TInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 15000" /></Field>
      <Field label="Note (facultatif)"><TInput value={note} onChangeText={setNote} placeholder="Ex. Location tricycle" /></Field>
      <SaveBtn disabled={!valid} color={C.teal} onPress={() => onSave({ category, amount: Number(amount), note: note.trim() })}>Enregistrer la dépense</SaveBtn>
    </Sheet>
  );
}

export function CollaborateurSheet({ onClose, onSave }: any) {
  const [role, setRole] = useState("pisteur");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const valid = nom.trim();
  return (
    <Sheet title="Nouveau collaborateur" onClose={onClose}>
      <Field label="Rôle">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Toggle active={role === "pisteur"} onPress={() => setRole("pisteur")} color={C.teal}>Pisteur</Toggle>
          <Toggle active={role === "commis"} onPress={() => setRole("commis")} color={C.teal}>Commis péseur</Toggle>
        </View>
      </Field>
      <Field label="Nom & prénoms"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Bakary Coulibaly" /></Field>
      <Field label="Téléphone (facultatif)"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
      <View style={{ backgroundColor: "#EAF3EF", borderWidth: 1, borderColor: "#CFE6E0", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Le collaborateur pourra se connecter depuis l'espace coopérative avec son rôle. Vous pourrez ensuite lui confier un mandat (pisteur) et suivre son activité.</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.teal} onPress={() => onSave({ role, nom: nom.trim(), tel: tel.trim() })}>Créer le collaborateur</SaveBtn>
    </Sheet>
  );
}

export function MandatSheet({ data, pisteurId, onClose, onSave }: { data: Data; pisteurId?: string | null; onClose: () => void; onSave: (x: any) => void }) {
  const pisteurs = data.staff.filter((s) => s.role === "pisteur");
  const [pid, setPid] = useState(pisteurId || pisteurs[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const valid = pid && Number(amount) > 0;
  return (
    <Sheet title="Donner un mandat" onClose={onClose}>
      <Field label="Pisteur">
        <Select value={pid} onChange={setPid} options={pisteurs.map((s) => ({ value: s.id, label: s.nom }))} />
      </Field>
      <Field label="Montant du mandat (F)"><TInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 1000000" /></Field>
      <Field label="Note (facultatif)"><TInput value={note} onChangeText={setNote} placeholder="Ex. zone / campagne" /></Field>
      <View style={{ backgroundColor: "#FBF7EC", borderWidth: 1, borderColor: "#EAD9BE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Le mandat est l'avance confiée au pisteur pour aller acheter le cacao. Il sera justifié par les achats, les dépenses et le solde en caisse.</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.lime} onPress={() => onSave({ pisteurId: pid, amount: Number(amount), note: note.trim() })}>Confier le mandat</SaveBtn>
    </Sheet>
  );
}

export function LinkMomoSheet({ title, withLabel, onClose, onSave }: any) {
  const [operator, setOperator] = useState("orange");
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const valid = number.trim().length >= 8;
  return (
    <Sheet title={title} onClose={onClose}>
      <Field label="Opérateur">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {OPERATORS.map((o) => (
            <Pressable key={o.id} onPress={() => setOperator(o.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: operator === o.id ? 2 : 1, borderColor: operator === o.id ? o.color : C.line, backgroundColor: "#fff", width: "47%" }}>
              <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: o.color, alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={14} color={o.ink} /></View>
              <Text style={{ fontWeight: "700", fontSize: 13 }}>{o.nom}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Numéro Mobile Money"><TInput value={number} onChangeText={setNumber} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
      {withLabel ? <Field label="Libellé du compte (facultatif)"><TInput value={label} onChangeText={setLabel} placeholder="Ex. Compte principal" /></Field> : null}
      <SaveBtn disabled={!valid} color={C.green} onPress={() => onSave({ operator, number: number.trim(), ...(withLabel ? { label: label.trim() } : {}) })}>Lier le compte</SaveBtn>
    </Sheet>
  );
}

export function SettingsSheet({ data, onClose, onSave, onReset }: any) {
  const [prixKg, setPrixKg] = useState(String(data.prixKg));
  const [saison, setSaison] = useState(data.saison);
  const [commissionRate, setCommissionRate] = useState(String(data.commissionRate));
  return (
    <Sheet title="Réglages" onClose={onClose}>
      <Field label="Prix bord champ par défaut (F/kg)">
        <TInput value={prixKg} onChangeText={(t) => setPrixKg(t.replace(/\D/g, ""))} keyboardType="number-pad" />
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Prix officiel de la campagne, appliqué par défaut à chaque pesée. Modifiable au cas par cas.</Text>
      </Field>
      <Field label="Commission pisteur (F/kg)">
        <TInput value={commissionRate} onChangeText={(t) => setCommissionRate(t.replace(/\D/g, ""))} keyboardType="number-pad" />
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Barème appliqué au poids collecté par chaque pisteur pour calculer sa commission.</Text>
      </Field>
      <Field label="Nom de la campagne"><TInput value={saison} onChangeText={setSaison} /></Field>
      {(data.priceHistory || []).length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <SectionTitle>Historique des prix</SectionTitle>
          <Card style={{ padding: 12 }}>
            {[...(data.priceHistory || [])].reverse().map((h: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderColor: C.line, borderStyle: "dashed" }}>
                <Text style={{ fontSize: 13, color: C.muted }}>{fDate(h.date)}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{fF(h.prixKg)}/kg</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <SaveBtn disabled={!(Number(prixKg) > 0 && saison.trim())} color={C.cocoa} onPress={() => onSave({ prixKg: Number(prixKg), saison: saison.trim(), commissionRate: Number(commissionRate) || 0 })}>Enregistrer</SaveBtn>
      <Pressable onPress={onReset} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, alignItems: "center", marginTop: 12 }}>
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: "600" }}>Réinitialiser les données de démonstration</Text>
      </Pressable>
    </Sheet>
  );
}

/* ------------------------------ Bordereau -------------------------------- */
function receiptHtml(c: Collection, member: Member | undefined, saison: string, sig?: Sig | null): string {
  const rows: string[] = [
    ["N° bordereau", ticketNo(c.seq)],
    ["Date", fDate(c.date)],
    ["Planteur", member?.nom || "—"],
    ["Village", member?.village || "—"],
    ["Culture", member ? crop(member.cropId).nom : "—"],
  ].map(([k, v]) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`);
  const wares = c.retenues.map((r) => `<tr><td>- ${r.label}</td><td class="r">− ${fF(r.amount)}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body{font-family:-apple-system,Roboto,'Helvetica Neue',sans-serif;color:#241C15;padding:24px;background:#fff}
    .h{background:#0E8E80;color:#fff;text-align:center;padding:20px;border-radius:14px 14px 0 0}
    .h .n{font-size:26px;font-weight:900;letter-spacing:1px}
    .h .t{font-size:12px;opacity:.9;font-style:italic;margin-top:4px}
    .h .s{font-size:12px;opacity:.85;margin-top:6px}
    .b{border:1px solid #EAE2D5;border-top:none;border-radius:0 0 14px 14px;padding:18px;font-family:'Courier New',monospace;font-size:14px}
    table{width:100%;border-collapse:collapse}
    td{padding:4px 0}
    .r{text-align:right}
    .dash{border-top:1px dashed #EAE2D5;margin:10px 0}
    .big{font-size:19px;font-weight:900}
    .due{color:#B8791E}
    .foot{text-align:center;font-size:11px;color:#7A6E62;margin-top:12px;font-family:sans-serif}
  </style></head><body>
    <div class="h"><div class="n">VALEO</div><div class="t">La valeur commence à la source.</div><div class="s">${saison} · Reçu de livraison</div></div>
    <div class="b">
      <table>${rows.join("")}</table>
      <div class="dash"></div>
      <table>
        <tr><td>Poids net</td><td class="r">${fKg(c.kg)}</td></tr>
        <tr><td>Prix / kg</td><td class="r">${fF(c.prixKg)}</td></tr>
        <tr><td><b>Montant brut</b></td><td class="r"><b>${fF(c.brut)}</b></td></tr>
      </table>
      ${wares ? `<div class="dash"></div><table>${wares}</table>` : ""}
      <div class="dash"></div>
      <table>
        <tr><td class="big">NET À PAYER</td><td class="r big">${fF(c.net)}</td></tr>
        <tr><td>Payé (${c.method === "momo" ? "Mobile Money" : "espèces"})</td><td class="r">${fF(c.paye)}</td></tr>
        ${c.reste > 0 ? `<tr><td class="due">Reste à payer</td><td class="r due">${fF(c.reste)}</td></tr>` : ""}
      </table>
      <div class="dash"></div>
      ${sig && sig.paths.length ? `<div style="margin-top:6px"><div style="font-size:11px;color:#7A6E62;font-family:sans-serif;margin-bottom:4px">Signature du planteur</div><div style="border:1px solid #EAE2D5;border-radius:8px;padding:6px;display:inline-block">${sigToSvg(sig, 70)}</div></div>` : ""}
      <div class="foot">Merci pour votre livraison. Conservez ce reçu.</div>
    </div>
  </body></html>`;
}

const TRow = ({ k, v, bold, big, muted, due }: { k: string; v: string; bold?: boolean; big?: boolean; muted?: boolean; due?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 3 }}>
    <Text style={{ fontSize: big ? 13 : 12.5, color: due ? C.due : muted ? C.muted : C.ink, fontFamily: "monospace" }}>{k}</Text>
    <Text style={{ fontWeight: bold ? "800" : "500", fontSize: big ? 17 : 13, color: due ? C.due : muted ? C.muted : C.ink, fontFamily: "monospace" }}>{v}</Text>
  </View>
);
const Dashed = () => <View style={{ borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed", marginVertical: 8 }} />;

export function Bordereau({ collection, member, saison, onClose, onSign, onNotice }: { collection: Collection; member?: Member; saison: string; onClose: () => void; onSign?: (sig: Sig | null) => void; onNotice?: (msg: string) => void }) {
  const insets = useSafeAreaInsets();
  const c = collection;
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState<Sig | null>((c as any).signature || null);
  const [signing, setSigning] = useState(false);
  const [draft, setDraft] = useState<Sig | null>((c as any).signature || null);

  const saveSig = () => {
    setSig(draft);
    onSign && onSign(draft);
    setSigning(false);
  };

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(c, member, saison, sig) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Bordereau ${ticketNo(c.seq)}` });
      }
    } catch {} finally {
      setBusy(false);
    }
  };
  const print = async () => {
    setBusy(true);
    try {
      await Print.printAsync({ html: receiptHtml(c, member, saison, sig) });
    } catch {} finally {
      setBusy(false);
    }
  };
  const whatsapp = async () => {
    const wa = waNumber(member?.tel);
    if (!wa) { onNotice && onNotice("Ce planteur n'a pas de numéro de téléphone enregistré."); return; }
    const msg =
      `*VALEO — Bordereau ${ticketNo(c.seq)}*\n` +
      `${saison}\n` +
      `Planteur : ${member?.nom || "—"}\n` +
      `Poids : ${fKg(c.kg)} × ${fF(c.prixKg)}\n` +
      `Net à payer : ${fFull(c.net)}\n` +
      `Payé (${c.method === "momo" ? "Mobile Money" : "espèces"}) : ${fF(c.paye)}\n` +
      (c.reste > 0 ? `Reste à payer : ${fF(c.reste)}\n` : "") +
      `\nMerci pour votre livraison.`;
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else onNotice && onNotice("WhatsApp n'est pas disponible sur cet appareil.");
    } catch {
      onNotice && onNotice("Impossible d'ouvrir WhatsApp.");
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, paddingBottom: 12 }}>
            <Text style={{ fontWeight: "800", fontSize: 17 }}>Bordereau de pesée</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="bordereau-close"><Icon name="x" size={22} color={C.muted} /></Pressable>
          </View>
          <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
              <View style={{ backgroundColor: C.teal, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 1 }}>VALEO</Text>
                <Text style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", fontStyle: "italic", marginTop: 3 }}>La valeur commence à la source.</Text>
                <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{saison} · Reçu de livraison</Text>
              </View>
              <View style={{ padding: 16 }}>
                <TRow k="N° bordereau" v={ticketNo(c.seq)} />
                <TRow k="Date" v={fDate(c.date)} />
                <TRow k="Planteur" v={member?.nom || "—"} />
                <TRow k="Village" v={member?.village || "—"} />
                <Dashed />
                <TRow k="Poids net" v={fKg(c.kg)} />
                <TRow k="Prix / kg" v={fF(c.prixKg)} />
                <TRow k="Montant brut" v={fF(c.brut)} bold />
                {c.retenues.length > 0 ? <Dashed /> : null}
                {c.retenues.map((r, i) => <TRow key={i} k={`- ${r.label}`} v={`− ${fF(r.amount)}`} muted />)}
                <Dashed />
                <TRow k="NET À PAYER" v={fF(c.net)} bold big />
                <TRow k={`Payé (${c.method === "momo" ? "Mobile Money" : "espèces"})`} v={fF(c.paye)} />
                {c.reste > 0 ? <TRow k="Reste à payer" v={fF(c.reste)} due /> : null}
                <Dashed />
                <Text style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 6 }}>Merci pour votre livraison. Conservez ce reçu.</Text>
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Signature du planteur</Text>
              {sig && !signing ? (
                <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 8 }}>
                  <View style={{ height: 120, alignItems: "center", justifyContent: "center" }}>
                    <SigPreview sig={sig} />
                  </View>
                  <Pressable onPress={() => { setDraft(sig); setSigning(true); }} style={{ alignSelf: "flex-end", marginTop: 4 }} testID="sig-redo">
                    <Text style={{ color: C.teal, fontSize: 13, fontWeight: "600" }}>Refaire la signature</Text>
                  </Pressable>
                </View>
              ) : signing ? (
                <View>
                  <SignaturePad value={draft} onChange={setDraft} />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <SaveBtn color={C.muted} onPress={() => setSigning(false)} style={{ flex: 1 }}>Annuler</SaveBtn>
                    <SaveBtn color={C.green} onPress={saveSig} style={{ flex: 1 }}>Enregistrer</SaveBtn>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => { setDraft(null); setSigning(true); }} style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }} testID="sig-add">
                  <Icon name="check" size={16} color={C.green} />
                  <Text style={{ color: C.green, fontWeight: "700", fontSize: 14 }}>Ajouter la signature du planteur</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <SaveBtn color={C.green} onPress={share} disabled={busy} icon={<Icon name="share" size={16} color="#fff" />} style={{ flex: 1 }}>Partager PDF</SaveBtn>
              <SaveBtn color={C.cocoa} onPress={print} disabled={busy} icon={<Icon name="printer" size={16} color="#fff" />} style={{ flex: 1 }}>Imprimer</SaveBtn>
            </View>
            {member?.tel?.trim() ? (
              <SaveBtn color="#25D366" onPress={whatsapp} icon={<Icon name="smartphone" size={16} color="#fff" />} style={{ marginTop: 10 }}>Envoyer par WhatsApp</SaveBtn>
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
