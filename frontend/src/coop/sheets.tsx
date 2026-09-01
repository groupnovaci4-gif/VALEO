import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  C,
  COOP_TYPES,
  CROPS,
  Collection,
  Culture,
  DEPCATS,
  Data,
  Member,
  OPERATORS,
  coopCompleteness,
  crop,
  fDate,
  fDateTime,
  fF,
  fFull,
  fKg,
  group,
  memberCultures,
  memberStats,
  commOf,
  priceOf,
  scopeSaison,
  SORTIE_TYPES,
  sortieType,
  stockDispo,
  stockStats,
  ticketNo,
  ticketOf,
  totalSuperficie,
  waNumber,
} from "./lib";
import { Localisation, libelleLocalite, rapprocherTexte } from "./geo";
import { Icon } from "./Icon";
import { createPinRecord, isValidPin } from "./pin";
import { Sig, SignaturePad, SigPreview, sigToSvg } from "./Signature";
import {
  Card,
  Chip,
  CulturesPicker,
  Field,
  LieuPicker,
  PhotoAvatar,
  Row,
  SaveBtn,
  SectionTitle,
  Select,
  Sheet,
  TInput,
  Toggle,
} from "./ui";

export function MemberSheet({ onClose, onSave, initial }: any) {
  const [nom, setNom] = useState(initial?.nom || "");
  // Localisation structurée ; reconstruite depuis l'ancien champ texte pour
  // une fiche créée avant cette évolution (aucune donnée perdue).
  const [loc, setLoc] = useState<Localisation>(() => initial?.loc || rapprocherTexte({ village: initial?.village }));
  // `village` reste la valeur affichée partout (listes, filtres, reçus, PDF) :
  // elle est recopiée depuis la sélection, plus jamais saisie à la main.
  const village = libelleLocalite(loc);
  const [idNumber, setIdNumber] = useState(initial?.idNumber || "");
  const [cultures, setCultures] = useState<Culture[]>(initial ? memberCultures(initial) : []);
  const [tel, setTel] = useState(initial?.tel || "");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const pinTouched = pin.length > 0 || pin2.length > 0;
  const pinOk = initial ? (!pinTouched || (isValidPin(pin) && pin === pin2)) : (isValidPin(pin) && pin === pin2);
  const valid = nom.trim() && village.trim() && pinOk;
  const save = async () => {
    const base: any = { nom: nom.trim(), village: village.trim(), loc, idNumber: idNumber.trim(), cultures, cropId: cultures[0]?.cropId || "cacao", superficie: totalSuperficie({ cultures }), tel: tel.trim() };
    if (isValidPin(pin) && pin === pin2) base.pin = await createPinRecord(pin);
    onSave(base);
  };
  return (
    <Sheet title={initial ? "Modifier le planteur" : "Nouveau planteur"} onClose={onClose}>
      <Field label="Nom & prénoms"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Kouassi Yao" /></Field>
      <Field label="Numéro de pièce d'identité"><TInput value={idNumber} onChangeText={setIdNumber} placeholder="Ex. CI 003 451 2" /></Field>
      <Field label="Localisation">
        {/* Sélection hiérarchique : District → Région → Département → Village.
            Le nom retenu alimente `village`, utilisé par les filtres et les reçus. */}
        <LieuPicker value={loc} onChange={setLoc} />
      </Field>
      <Field label="Cultures & superficies (plusieurs possibles)">
        <CulturesPicker value={cultures} onChange={setCultures} />
      </Field>
      <Field label="Téléphone"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label={initial ? "Nouveau code (6 chiffres)" : "Code secret (6 chiffres)"} flex><TInput value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
        <Field label="Confirmer le code" flex><TInput value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
      </View>
      {pin && pin2 && pin !== pin2 ? <Text style={{ color: C.loss, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux codes ne correspondent pas.</Text> : null}
      {initial ? <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>Laissez vide pour conserver le code actuel.</Text> : null}
      {!initial ? (
        <View style={{ backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: C.muted }}>Un <Text style={{ fontWeight: "700" }}>identifiant planteur</Text> unique sera généré automatiquement (format VAL-XXXX-YY). Le planteur se connecte avec cet identifiant (ou son téléphone) et son <Text style={{ fontWeight: "700" }}>code secret</Text>.{!tel.trim() ? <Text style={{ color: C.due }}>{"\n"}Sans téléphone, il ne pourra se connecter qu&apos;avec son identifiant : notez-le et remettez-le lui.</Text> : null}</Text>
        </View>
      ) : null}
      <SaveBtn disabled={!valid} color={C.green} onPress={save}>Enregistrer</SaveBtn>
    </Sheet>
  );
}

const NumPad = ({ onKey }: { onKey: (k: string) => void }) => {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {keys.map((k) => (
        <Pressable key={k} onPress={() => onKey(k)} testID={`num-${k}`} style={{ width: "31.3%", height: 52, borderRadius: 12, backgroundColor: k === "back" ? "#F7E9E2" : "#fff", borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          {k === "back" ? <Text style={{ fontSize: 22, color: C.rust, fontWeight: "800" }}>⌫</Text> : <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{k}</Text>}
        </Pressable>
      ))}
      <View style={{ width: "31.3%" }} />
    </View>
  );
};

type Weigh = { brut: number; sacs: number; net: number };

export function PeseeSheet({ data, role, staffId, onClose, onSave }: { data: Data; role?: string; staffId: string; onClose: () => void; onSave: (c: any) => void }) {
  // Identifiant d'opération unique à cette saisie : si la validation part deux
  // fois (double-tap, rejeu réseau), le serveur ne crée qu'une seule pesée.
  const [clientOpId] = useState(() => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [memberId, setMemberId] = useState(data.members[0]?.id || "");
  const member = data.members.find((m) => m.id === memberId);
  const memCrops = memberCultures(member).map((c) => c.cropId);
  const cropChoices = memCrops.length ? memCrops : CROPS.map((c) => c.id);
  const [cropId, setCropId] = useState(cropChoices[0] || "cacao");
  const [brutStr, setBrutStr] = useState("");
  const [sacs, setSacs] = useState(0);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [weighs, setWeighs] = useState<Weigh[]>([]);
  const [showPay, setShowPay] = useState(false);
  const [method, setMethod] = useState("espece");
  const [payTout, setPayTout] = useState(true);
  const [payePartiel, setPayePartiel] = useState("");
  const [recAll, setRecAll] = useState(true);
  const [recStr, setRecStr] = useState("");

  useEffect(() => {
    const cc = memberCultures(data.members.find((m) => m.id === memberId));
    setCropId(cc[0]?.cropId || "cacao");
    setWeighs([]); setBrutStr(""); setSacs(0); setEditIdx(null); setShowPay(false);
    setRecAll(true); setRecStr(""); setPayTout(true); setPayePartiel("");
  }, [memberId, data.members]);

  const prix = priceOf(data, cropId);
  const brutNow = Number(brutStr) || 0;
  const netNow = Math.max(0, brutNow - sacs);
  const totalBrut = weighs.reduce((s, w) => s + w.brut, 0);
  const totalSacs = weighs.reduce((s, w) => s + w.sacs, 0);
  const totalNet = weighs.reduce((s, w) => s + w.net, 0);
  const montant = totalNet * prix;
  // Avance encore à recouvrer auprès de ce planteur (avances approuvées).
  const avanceDue = data.loans
    .filter((l) => l.memberId === memberId && l.status === "approuve" && l.soldeRestant > 0)
    .reduce((s, l) => s + l.soldeRestant, 0);
  const recMax = Math.min(avanceDue, montant);
  const recouvre = avanceDue <= 0 ? 0 : recAll ? recMax : Math.min(recMax, Number(recStr) || 0);
  const avanceReste = avanceDue - recouvre; // reste d'avance conservé
  const netAPayer = Math.max(0, montant - recouvre); // net dû au planteur pour cette livraison
  const oldReste = memberStats(memberId, data.collections).reste;
  const totalDu = netAPayer + oldReste;
  const payeNow = payTout ? totalDu : Math.min(totalDu, Number(payePartiel) || 0);
  const settleOld = Math.min(payeNow, oldReste);
  const payeCurrent = Math.min(netAPayer, payeNow - settleOld);
  const resteCurrent = netAPayer - payeCurrent;
  const resteApres = totalDu - payeNow;
  const momoDisabled = !member?.momo;

  const onKey = (k: string) => {
    if (k === "back") setBrutStr((s) => s.slice(0, -1));
    else setBrutStr((s) => (s.length >= 6 ? s : s === "0" ? k : s + k));
  };
  const addWeigh = () => {
    if (brutNow <= 0) return;
    const w: Weigh = { brut: brutNow, sacs, net: Math.max(0, brutNow - sacs) };
    setWeighs((prev) => {
      if (editIdx != null) { const copy = [...prev]; copy[editIdx] = w; return copy; }
      return [...prev, w];
    });
    setBrutStr(""); setSacs(0); setEditIdx(null);
  };
  const editWeigh = (i: number) => { const w = weighs[i]; setBrutStr(String(w.brut)); setSacs(w.sacs); setEditIdx(i); };
  const delWeigh = (i: number) => { setWeighs((prev) => prev.filter((_, idx) => idx !== i)); if (editIdx === i) { setEditIdx(null); setBrutStr(""); setSacs(0); } };

  const confirm = () => {
    const retenues = recouvre > 0 ? [{ label: "Recouvrement d'avance", amount: recouvre }] : [];
    onSave({
      memberId, byStaffId: staffId, date: new Date().toISOString(), kg: totalNet, prixKg: prix, cropId,
      // Barème figé au moment de la pesée : un changement de réglage ultérieur
      // ne doit pas réécrire la commission déjà due sur cette collecte.
      commissionRate: commOf(data, cropId),
      clientOpId,
      brut: montant, retenues, net: netAPayer, sacs: totalSacs, weighings: weighs,
      paye: payeCurrent, reste: resteCurrent, method: momoDisabled ? "espece" : method, note: "",
      _repay: recouvre > 0 ? { amount: recouvre } : null, _settle: settleOld > 0 ? settleOld : null,
    });
  };

  if (data.members.length === 0)
    return (
      <Sheet title="Pesée" onClose={onClose}>
        <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucun planteur enregistré. Ajoutez-en un d&apos;abord.</Text></Card>
      </Sheet>
    );

  return (
    <Sheet title={role === "pisteur" ? "Nouvelle collecte" : "Nouvelle pesée"} onClose={onClose}>
      <Field label="Planteur">
        <Select value={memberId} onChange={setMemberId} options={data.members.map((m) => ({ value: m.id, label: `${m.nom} — ${m.village}` }))} />
      </Field>
      {member ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: "#DCEBE1", alignItems: "center", justifyContent: "center" }}><Icon name="user" size={18} color={C.green} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 15 }}>{member.nom}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{member.code} · {member.village}</Text>
          </View>
        </View>
      ) : null}
      <Field label="Produit pesé">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {cropChoices.map((id: string) => <Chip key={id} label={crop(id).nom} emoji={crop(id).emoji} active={cropId === id} onPress={() => setCropId(id)} />)}
        </View>
        <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Prix en vigueur : <Text style={{ fontWeight: "800", color: C.green }}>{fF(prix)}/kg</Text> · tare 1 kg / sac</Text>
      </Field>

      <SectionTitle>{editIdx != null ? "Modifier la pesée" : "Saisir une pesée"}</SectionTitle>
      <View style={{ backgroundColor: "#FBF7F0", borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: C.muted }}>Poids brut relevé (kg)</Text>
        <Text style={{ fontSize: 40, fontWeight: "900", color: C.ink, marginTop: 2, marginBottom: 10 }}>{brutStr || "0"} <Text style={{ fontSize: 18, color: C.muted }}>kg</Text></Text>
        <NumPad onKey={onKey} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700" }}>Nombre de sacs</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => setSacs((s) => Math.max(0, s - 1))} testID="sacs-minus" style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>−</Text></Pressable>
            <Text style={{ fontSize: 20, fontWeight: "900", minWidth: 30, textAlign: "center" }}>{sacs}</Text>
            <Pressable onPress={() => setSacs((s) => s + 1)} testID="sacs-plus" style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>+</Text></Pressable>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />
        <Row label={`Tare (${sacs} × 1 kg)`} value={`− ${fKg(sacs)}`} />
        <Row label="Poids net de cette pesée" value={fKg(netNow)} strong color={C.green} />
        <SaveBtn disabled={brutNow <= 0} color={C.teal} onPress={addWeigh} style={{ marginTop: 10 }}>{editIdx != null ? "Mettre à jour la pesée" : "Ajouter cette pesée"}</SaveBtn>
      </View>

      {weighs.length > 0 ? (
        <>
          <SectionTitle>Pesées saisies ({weighs.length})</SectionTitle>
          <View style={{ gap: 8, marginBottom: 12 }}>
            {weighs.map((w, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: editIdx === i ? C.teal : C.line, borderRadius: 12, padding: 12 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#F0EBE2", alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "800", color: C.cocoaSoft }}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", fontSize: 14 }}>Net {fKg(w.net)}</Text>
                  <Text style={{ fontSize: 11.5, color: C.muted }}>Brut {fKg(w.brut)} · {w.sacs} sac{w.sacs > 1 ? "s" : ""}</Text>
                </View>
                <Pressable onPress={() => editWeigh(i)} hitSlop={8} testID={`edit-weigh-${i}`}><Icon name="edit" size={17} color={C.teal} /></Pressable>
                <Pressable onPress={() => delWeigh(i)} hitSlop={8} testID={`del-weigh-${i}`}><Icon name="trash" size={17} color={C.loss} /></Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {!showPay ? (
        <SaveBtn disabled={weighs.length === 0} color={C.green} onPress={() => setShowPay(true)}>Calculer</SaveBtn>
      ) : (
        <>
          <View style={{ backgroundColor: "#EAF6EE", borderWidth: 1, borderColor: "#CFE6D8", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <Row label="Poids brut total" value={fKg(totalBrut)} />
            <Row label={`Tare (${totalSacs} sacs × 1 kg)`} value={`− ${fKg(totalSacs)}`} />
            <Row label="Poids net total" value={fKg(totalNet)} strong color={C.ink} />
            <View style={{ height: 1, backgroundColor: "#CFE6D8", marginVertical: 8 }} />
            <Row label={`Montant (${fKg(totalNet)} × ${fF(prix)})`} value={fFull(montant)} strong color={C.green} />
          </View>

          {avanceDue > 0 ? (
            <View style={{ backgroundColor: "#FBF0F0", borderWidth: 1, borderColor: "#EAD0CE", borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name="piggy-bank" size={16} color={C.loss} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: C.ink }}>Avance à recouvrer</Text>
                <Text style={{ fontSize: 14, fontWeight: "900", color: C.loss }}>{fF(avanceDue)}</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 10, lineHeight: 16 }}>Ce planteur a une avance en cours. Choisissez le montant recouvré sur cette pesée.</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: recAll ? 0 : 10 }}>
                <Toggle active={recAll} onPress={() => setRecAll(true)} color={C.loss}>Recouvrer {recMax >= avanceDue ? "tout" : "le max"}</Toggle>
                <Toggle active={!recAll} onPress={() => setRecAll(false)} color={C.due}>Partiel</Toggle>
              </View>
              {!recAll ? (
                <TInput value={recStr} onChangeText={(t) => setRecStr(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={`Max ${group(recMax)}`} />
              ) : null}
              <View style={{ height: 1, backgroundColor: "#EAD0CE", marginVertical: 10 }} />
              <Row label="Montant recouvré" value={`− ${fF(recouvre)}`} color={C.loss} />
              <Row label="Reste d'avance conservé" value={fF(avanceReste)} color={avanceReste > 0 ? C.due : C.muted} />
              <Row label="Net à payer au planteur" value={fFull(netAPayer)} strong color={C.green} />
            </View>
          ) : null}

          {oldReste > 0 ? (
            <View style={{ backgroundColor: "#FDF7EC", borderWidth: 1, borderColor: "#EAD9BE", borderRadius: 10, padding: 11, marginBottom: 14, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Icon name="wallet" size={16} color={C.due} />
              <Text style={{ flex: 1, fontSize: 12, color: C.due, lineHeight: 17 }}>Reste dû précédent <Text style={{ fontWeight: "800" }}>{fF(oldReste)}</Text> ajouté. Total à payer : <Text style={{ fontWeight: "800" }}>{fFull(totalDu)}</Text></Text>
            </View>
          ) : null}

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
              <TInput value={payePartiel} onChangeText={(t) => setPayePartiel(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={`Max ${group(totalDu)}`} />
              <Text style={{ fontSize: 12, color: C.due, marginTop: 6 }}>Reste à payer : <Text style={{ fontWeight: "700" }}>{fF(resteApres)}</Text></Text>
            </Field>
          ) : null}
          <SaveBtn color={C.green} onPress={confirm}>Confirmer &amp; générer le bordereau</SaveBtn>
        </>
      )}
    </Sheet>
  );
}

export function LoanSheet({ onClose, onSave, data, fixedMember }: any) {
  const [memberId, setMemberId] = useState(fixedMember?.id || data?.members[0]?.id || "");
  const [type, setType] = useState("intrant");
  const [amount, setAmount] = useState("");
  const [motif, setMotif] = useState("");
  const presets = type === "intrant" ? ["Engrais NPK", "Produits phyto", "Semences", "Petit matériel"] : ["Scolarité", "Santé", "Dépense familiale"];
  const valid = (fixedMember?.id || memberId) && Number(amount) > 0 && motif.trim();
  if (!fixedMember && (!data || data.members.length === 0))
    return (
      <Sheet title="Nouvelle avance" onClose={onClose}>
        <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucun planteur enregistré. Ajoutez-en un d'abord.</Text></Card>
      </Sheet>
    );
  return (
    <Sheet title={fixedMember ? "Demander une avance" : "Nouvelle avance"} onClose={onClose}>
      <Field label="Planteur bénéficiaire">
        {fixedMember ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 12, padding: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#DCEBE1", alignItems: "center", justifyContent: "center" }}><Icon name="user" size={17} color={C.green} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 14 }}>{fixedMember.nom}</Text>
              <Text style={{ fontSize: 12, color: C.muted }}>{fixedMember.village}{fixedMember.code ? ` · ${fixedMember.code}` : ""}</Text>
            </View>
          </View>
        ) : (
          <Select value={memberId} onChange={setMemberId} options={data.members.map((m: Member) => ({ value: m.id, label: `${m.nom} — ${m.village}` }))} />
        )}
      </Field>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, backgroundColor: "#F1EDE3", padding: 4, borderRadius: 12 }}>
        <Toggle active={type === "intrant"} onPress={() => { setType("intrant"); setMotif(""); }} color={C.green}>Intrant</Toggle>
        <Toggle active={type === "argent"} onPress={() => { setType("argent"); setMotif(""); }} color={C.gold}>Argent</Toggle>
      </View>
      <Field label={type === "intrant" ? "Valeur des intrants (F)" : "Montant demandé (F)"}>
        <TInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="Ex. 50000" />
      </Field>
      <Field label="Motif">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
          {presets.map((p) => <Chip key={p} label={p} active={motif === p} onPress={() => setMotif(p)} />)}
        </View>
        <TInput value={motif} onChangeText={setMotif} placeholder="Préciser le motif" />
      </Field>
      <View style={{ backgroundColor: "#FDF7EC", borderWidth: 1, borderColor: "#EAD9BE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Enregistré comme demande <Text style={{ fontWeight: "700" }}>en attente</Text>. Approuvez-la ensuite pour fixer le montant accordé et le mode de versement.</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.cocoa} onPress={() => onSave({ memberId: fixedMember?.id || memberId, type, amount: Number(amount), motif: motif.trim() })}>Enregistrer la demande</SaveBtn>
    </Sheet>
  );
}

export function LoanApproveSheet({ loan, memberName, onClose, onApprove }: any) {
  const [mode, setMode] = useState("espece");
  const [amount, setAmount] = useState(String(loan.amount));
  const val = Number(amount) > 0 && Number(amount) <= loan.amount;
  return (
    <Sheet title="Approuver l'avance" onClose={onClose}>
      <View style={{ backgroundColor: "#F0F6F2", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 13, color: C.muted }}>Demande de <Text style={{ fontWeight: "800", color: C.ink }}>{memberName}</Text></Text>
        <Text style={{ fontSize: 16, fontWeight: "800", marginTop: 2 }}>{loan.type === "intrant" ? "Intrant" : "Argent"} · {fF(loan.amount)}</Text>
        <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{loan.motif}</Text>
      </View>
      <Field label="Montant accordé (≤ demande)">
        <TInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={`Max ${group(loan.amount)}`} />
        {Number(amount) > loan.amount ? <Text style={{ fontSize: 12, color: C.loss, marginTop: 6 }}>Le montant ne peut pas dépasser la demande ({fF(loan.amount)}).</Text> : null}
      </Field>
      <Field label="Mode de versement">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Toggle active={mode === "espece"} onPress={() => setMode("espece")} color={C.cocoa}>Espèces</Toggle>
          <Toggle active={mode === "momo"} onPress={() => setMode("momo")} color={C.green}>Mobile Money</Toggle>
        </View>
      </Field>
      <SaveBtn disabled={!val} color={C.green} onPress={() => onApprove(Number(amount), mode)}>Approuver & verser</SaveBtn>
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

export function CollaborateurSheet({ onClose, onSave, initial }: any) {
  const [role, setRole] = useState(initial?.role || "pisteur");
  const [nom, setNom] = useState(initial?.nom || "");
  const [tel, setTel] = useState(initial?.tel || "");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const pinTouched = pin.length > 0 || pin2.length > 0;
  const pinOk = initial ? (!pinTouched || (isValidPin(pin) && pin === pin2)) : (isValidPin(pin) && pin === pin2);
  const valid = nom.trim() && tel.trim() && pinOk;
  const save = async () => {
    const base: any = { role, nom: nom.trim(), tel: tel.trim() };
    if (isValidPin(pin) && pin === pin2) base.pin = await createPinRecord(pin);
    onSave(base);
  };
  return (
    <Sheet title={initial ? "Modifier le collaborateur" : "Nouveau collaborateur"} onClose={onClose}>
      <Field label="Rôle">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Toggle active={role === "pisteur"} onPress={() => setRole("pisteur")} color={C.teal}>Pisteur / Délégué</Toggle>
          <Toggle active={role === "commis"} onPress={() => setRole("commis")} color={C.teal}>Magasinier</Toggle>
        </View>
      </Field>
      <Field label="Nom & prénoms"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Bakary Coulibaly" /></Field>
      <Field label="Téléphone"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label={initial ? "Nouveau code (6 chiffres)" : "Code secret (6 chiffres)"} flex><TInput value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
        <Field label="Confirmer le code" flex><TInput value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
      </View>
      {pin && pin2 && pin !== pin2 ? <Text style={{ color: C.loss, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux codes ne correspondent pas.</Text> : null}
      {initial ? <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 10 }}>Laissez vide pour conserver le code actuel.</Text> : null}
      <View style={{ backgroundColor: "#EAF3EF", borderWidth: 1, borderColor: "#CFE6E0", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Le collaborateur se connecte depuis l'espace coopérative avec son <Text style={{ fontWeight: "700" }}>nom, son téléphone</Text> et son <Text style={{ fontWeight: "700" }}>code secret</Text>. Un Pisteur / Délégué reçoit un mandat ; un Magasinier pèse et voit tous les planteurs.</Text>
      </View>
      <SaveBtn disabled={!valid} color={C.teal} onPress={save}>{initial ? "Enregistrer" : "Créer le collaborateur"}</SaveBtn>
    </Sheet>
  );
}

export function ResetPinSheet({ name, onClose, onSave }: any) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const ok = isValidPin(pin) && pin === pin2;
  const save = async () => { onSave(await createPinRecord(pin)); };
  return (
    <Sheet title="Réinitialiser le code secret" onClose={onClose}>
      <Text style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 19 }}>Définissez un nouveau code secret à 6 chiffres pour <Text style={{ fontWeight: "800", color: C.ink }}>{name}</Text>. Communiquez-le à la personne concernée.</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Nouveau code" flex><TInput value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
        <Field label="Confirmer" flex><TInput value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
      </View>
      {pin && pin2 && pin !== pin2 ? <Text style={{ color: C.loss, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux codes ne correspondent pas.</Text> : null}
      <SaveBtn disabled={!ok} color={C.gold} onPress={save}>Enregistrer le nouveau code</SaveBtn>
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

export function SettingsSheet({ data, onClose, onSave }: any) {
  const [saison, setSaison] = useState(data.saison);
  const crops = CROPS; // Tous les produits sont toujours réglables (prix + commission).
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    crops.forEach((c) => (o[c.id] = String(priceOf(data, c.id))));
    return o;
  });
  const [commissions, setCommissions] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    crops.forEach((c) => (o[c.id] = String(commOf(data, c.id))));
    return o;
  });
  const valid = saison.trim() && crops.every((c) => Number(prices[c.id]) >= 0);
  const submit = () => {
    const p: Record<string, number> = {};
    const cm: Record<string, number> = {};
    crops.forEach((c) => { p[c.id] = Number(prices[c.id]) || 0; cm[c.id] = Number(commissions[c.id]) || 0; });
    onSave({ saison: saison.trim(), prices: p, commissions: cm });
  };
  return (
    <Sheet title="Réglages" onClose={onClose}>
      <Field label="Nom de la campagne"><TInput value={saison} onChangeText={setSaison} /></Field>
      <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>Fixez pour chaque produit le prix d'achat bord champ (F/kg) et la commission du pisteur / délégué (F/kg).</Text>
      {crops.map((c) => (
        <View key={c.id} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontWeight: "800", fontSize: 14, marginBottom: 10 }}>{c.emoji} {c.nom}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Prix d'achat (F/kg)</Text>
              <TInput value={prices[c.id] || ""} onChangeText={(t) => setPrices((s) => ({ ...s, [c.id]: t.replace(/\D/g, "") }))} keyboardType="number-pad" placeholder="0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Commission pisteur (F/kg)</Text>
              <TInput value={commissions[c.id] || ""} onChangeText={(t) => setCommissions((s) => ({ ...s, [c.id]: t.replace(/\D/g, "") }))} keyboardType="number-pad" placeholder="0" />
            </View>
          </View>
        </View>
      ))}
      {(data.priceHistory || []).length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <SectionTitle>Historique du prix cacao</SectionTitle>
          <Card style={{ padding: 12 }}>
            {[...(data.priceHistory || [])].reverse().slice(0, 8).map((h: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderColor: C.line, borderStyle: "dashed" }}>
                <Text style={{ fontSize: 13, color: C.muted }}>{fDate(h.date)}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{fF(h.prixKg)}/kg</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <SaveBtn disabled={!valid} color={C.cocoa} onPress={submit}>Enregistrer</SaveBtn>
    </Sheet>
  );
}

/* --------------------------- Profil coopérative -------------------------- */
export function CoopProfileSheet({ coop, patron, onClose, onSave }: { coop: any; patron?: any; onClose: () => void; onSave: (p: { coopPatch: Record<string, any>; patronPatch: Record<string, any> }) => void }) {
  const c = coop || {};
  const [photo, setPhoto] = useState<string | null>(c.photo || null);
  const [nom, setNom] = useState(c.nom && c.nom !== "Ma coopérative" ? c.nom : "");
  const [sigle, setSigle] = useState(c.sigle || "");
  const [agrement, setAgrement] = useState(c.agrement || "");
  const [type, setType] = useState(c.type || COOP_TYPES[0]);
  const [dateCreation, setDateCreation] = useState(c.dateCreation || "");
  const [filieres, setFilieres] = useState<string[]>(c.filieres || []);
  const [description, setDescription] = useState(c.description || "");
  // Localisation structurée. Une fiche créée avant cette évolution n'a pas de
  // `loc` : on la reconstruit depuis ses anciens champs texte, sans rien perdre.
  const [loc, setLoc] = useState<Localisation>(() =>
    c.loc || rapprocherTexte({ district: c.district, region: c.region, departement: c.departement, village: c.localite }),
  );
  const [adresse, setAdresse] = useState(c.adresse || "");
  const [tel, setTel] = useState(c.tel || "");
  const [email, setEmail] = useState(c.email || "");
  const [rtel, setRtel] = useState(patron?.tel || "");
  const [rfonction, setRfonction] = useState(patron?.fonction || "");

  const toggleFiliere = (id: string) => setFilieres((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  // Aperçu en temps réel de la complétude.
  const live = coopCompleteness(
    { nom: nom.trim() || "Ma coopérative", type, filieres, tel: tel.trim(), adresse: adresse.trim(), localite: libelleLocalite(loc), region: loc.region || "", agrement: agrement.trim() },
    { tel: rtel.trim(), fonction: rfonction.trim() },
  );
  const valid = nom.trim().length >= 2;

  const submit = () => {
    onSave({
      coopPatch: {
        nom: nom.trim() || "Ma coopérative", sigle: sigle.trim(), agrement: agrement.trim(), type,
        dateCreation: dateCreation.trim(), filieres, photo, description: description.trim(),
        // Les champs texte restent alimentés (affichage, espace admin, export) :
        // ils sont désormais recopiés depuis la sélection, jamais saisis à la main.
        loc,
        region: loc.region || "", district: loc.district || "", departement: loc.departement || "",
        commune: loc.sousPrefecture || loc.departement || "", localite: libelleLocalite(loc), adresse: adresse.trim(),
        tel: tel.trim(), email: email.trim(),
      },
      patronPatch: { tel: rtel.trim(), fonction: rfonction.trim() || "Responsable" },
    });
  };

  return (
    <Sheet title="Profil de la coopérative" onClose={onClose}>
      <View style={{ backgroundColor: live === 100 ? "#EAF6EE" : "#FFF6E8", borderWidth: 1, borderColor: live === 100 ? "#CFE6D7" : "#F0DFC0", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: C.ink }}>Profil complété</Text>
          <Text style={{ fontSize: 16, fontWeight: "900", color: live === 100 ? C.green : C.gold }}>{live}%</Text>
        </View>
        <View style={{ height: 8, borderRadius: 6, backgroundColor: "#E7E0D4", overflow: "hidden" }}>
          <View style={{ height: 8, width: `${live}%`, borderRadius: 6, backgroundColor: live === 100 ? C.green : C.gold }} />
        </View>
        <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 16 }}>{live === 100 ? "Profil complet — merci !" : "Complétez les informations ci-dessous pour finaliser le profil de votre coopérative."}</Text>
      </View>

      <SectionTitle>Identité</SectionTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <PhotoAvatar photo={photo} size={68} editable onChange={setPhoto} fallbackIcon="building" fallbackColor={C.teal} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 13.5 }}>Logo de la coopérative</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>Facultatif</Text>
        </View>
      </View>
      <Field label="Nom officiel *"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Société Coopérative COOPAGRI" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Sigle" flex><TInput value={sigle} onChangeText={setSigle} placeholder="Ex. COOPAGRI" /></Field>
        <Field label="Date de création" flex><TInput value={dateCreation} onChangeText={setDateCreation} placeholder="JJ/MM/AAAA" /></Field>
      </View>
      <Field label="N° d'agrément"><TInput value={agrement} onChangeText={setAgrement} placeholder="Ex. CI-COOP-2020-01234" /></Field>
      <Field label="Type de coopérative">
        <Select value={type} onChange={setType} options={COOP_TYPES.map((t) => ({ value: t, label: t }))} />
      </Field>
      <Field label="Filières exploitées">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {CROPS.map((cr) => <Chip key={cr.id} label={cr.nom} emoji={cr.emoji} active={filieres.includes(cr.id)} onPress={() => toggleFiliere(cr.id)} />)}
        </View>
      </Field>
      <Field label="Description">
        <TInput value={description} onChangeText={setDescription} placeholder="Quelques mots sur la coopérative" multiline numberOfLines={3} style={{ minHeight: 76, textAlignVertical: "top" }} />
      </Field>

      <SectionTitle>Coordonnées</SectionTitle>
      <Field label="Localisation">
        {/* Sélection hiérarchique : District → Région → Département → Village.
            Remplace la saisie manuelle pour éviter les orthographes multiples. */}
        <LieuPicker value={loc} onChange={setLoc} />
      </Field>
      <Field label="Adresse"><TInput value={adresse} onChangeText={setAdresse} placeholder="Ex. Quartier, rue…" /></Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Téléphone" flex><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
        <Field label="Email" flex><TInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="coop@email.com" /></Field>
      </View>

      <SectionTitle>Responsable</SectionTitle>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Téléphone" flex><TInput value={rtel} onChangeText={setRtel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
        <Field label="Fonction" flex><TInput value={rfonction} onChangeText={setRfonction} placeholder="Ex. Président" /></Field>
      </View>

      <SaveBtn disabled={!valid} color={C.teal} onPress={submit}>Enregistrer le profil</SaveBtn>
    </Sheet>
  );
}

/* ------------------------------ Journal d'audit -------------------------- */
const AUDIT_LABELS: Record<string, { t: string; icon: string; color: string }> = {
  pesee: { t: "Pesée / paiement", icon: "scale", color: C.teal },
  solde: { t: "Solde du reste dû payé", icon: "banknote", color: C.green },
  avance_approuvee: { t: "Avance accordée", icon: "check-circle", color: C.green },
  avance_refusee: { t: "Avance refusée", icon: "x-circle", color: C.loss },
};
export function AuditSheet({ data, onClose, fetchAudit }: { data: Data; onClose: () => void; fetchAudit: () => Promise<any[]> }) {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { (async () => setItems(await fetchAudit()))(); }, [fetchAudit]);
  const staffName = (id: string) => (data.staff || []).find((s: any) => s.id === id)?.nom || "";
  const memberName = (id: string) => (data.members || []).find((m: any) => m.id === id)?.nom || "";
  const detail = (e: any) => {
    const m = e.meta || {};
    if (e.action === "pesee") return `${memberName(m.memberId) || "Planteur"} · net ${fF(m.net || 0)} · payé ${fF(m.paye || 0)}${m.recouvre ? ` · recouvré ${fF(m.recouvre)}` : ""}`;
    if (e.action === "solde") return `${memberName(m.memberId) || "Planteur"} · ${fF(m.amount || 0)}`;
    if (e.action === "avance_approuvee") return `${memberName(m.memberId) || "Planteur"} · ${fF(m.amount || 0)}`;
    if (e.action === "avance_refusee") return `${memberName(m.memberId) || "Planteur"}`;
    return "";
  };
  return (
    <Sheet title="Journal d'audit" onClose={onClose}>
      <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 14, lineHeight: 18 }}>Traçabilité des opérations financières (acteur et horodatage enregistrés côté serveur, non modifiables depuis l&apos;application).</Text>
      {items === null ? (
        <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Chargement…</Text></Card>
      ) : items.length === 0 ? (
        <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucune opération enregistrée.</Text></Card>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((e, i) => {
            const lbl = AUDIT_LABELS[e.action] || { t: e.action, icon: "clock", color: C.muted };
            const actor = staffName(e.actorId) || (e.side === "planteur" ? "Planteur" : e.actorRole || "—");
            return (
              <Card key={i} style={{ padding: 12, flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: lbl.color + "22", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <Icon name={lbl.icon} size={16} color={lbl.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", fontSize: 13.5, color: C.ink }}>{lbl.t}</Text>
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{detail(e)}</Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Par {actor} · {fDateTime(e.at)}</Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

/* ------------------------------ Bordereau -------------------------------- */
function receiptHtml(c: Collection, member: Member | undefined, saison: string, sig?: Sig | null): string {
  const rows: string[] = [
    ["N° bordereau", ticketOf(c)],
    ["Date", fDate(c.date)],
    ["Planteur", member?.nom || "—"],
    ["Village", member?.village || "—"],
    ["Produit", crop(c.cropId || member?.cropId || "cacao").nom],
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
    .ok{color:#1E7A4D}
    .foot{text-align:center;font-size:11px;color:#7A6E62;margin-top:12px;font-family:sans-serif}
  </style></head><body>
    <div class="h"><div class="n">VALEO</div><div class="t">La valeur commence à la source.</div><div class="s">${saison} · Reçu de livraison</div></div>
    <div class="b">
      <table>${rows.join("")}</table>
      <div class="dash"></div>
      <table>
        ${c.sacs ? `<tr><td>Sacs (tare ${c.sacs} kg)</td><td class="r">${c.sacs}</td></tr>` : ""}
        <tr><td>Poids net</td><td class="r">${fKg(c.kg)}</td></tr>
        <tr><td>Prix / kg</td><td class="r">${fF(c.prixKg)}</td></tr>
        <tr><td><b>Montant brut</b></td><td class="r"><b>${fF(c.brut)}</b></td></tr>
      </table>
      ${wares ? `<div class="dash"></div><table>${wares}</table>` : ""}
      <div class="dash"></div>
      <table>
        <tr><td class="big">NET À PAYER</td><td class="r big">${fF(c.net)}</td></tr>
        <tr><td>Payé (${c.method === "momo" ? "Mobile Money" : "espèces"})</td><td class="r">${fF(c.paye)}</td></tr>
        ${c.oldRegle && c.oldRegle > 0 ? `<tr><td class="ok">Ancien reste soldé</td><td class="r ok">${fF(c.oldRegle)}</td></tr>` : ""}
        ${c.reste > 0 ? `<tr><td class="due">Reste à payer</td><td class="r due">${fF(c.reste)}</td></tr>` : ""}
      </table>
      <div class="dash"></div>
      <table>
        <tr><td class="big">TOTAL REMIS</td><td class="r big">${fF((c.paye || 0) + (c.oldRegle || 0))}</td></tr>
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
    const valid = draft && draft.paths.some((p) => p && p.indexOf("L") !== -1) ? draft : null;
    setSig(valid);
    onSign && onSign(valid);
    setSigning(false);
  };

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(c, member, saison, sig) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Bordereau ${ticketOf(c)}` });
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
      `*VALEO — Bordereau ${ticketOf(c)}*\n` +
      `${saison}\n` +
      `Planteur : ${member?.nom || "—"}\n` +
      `Poids : ${fKg(c.kg)} × ${fF(c.prixKg)}\n` +
      `Net à payer : ${fFull(c.net)}\n` +
      `Payé (${c.method === "momo" ? "Mobile Money" : "espèces"}) : ${fF(c.paye)}\n` +
      (c.oldRegle && c.oldRegle > 0 ? `Ancien reste soldé : ${fF(c.oldRegle)}\n` : "") +
      (c.reste > 0 ? `Reste à payer : ${fF(c.reste)}\n` : "") +
      `*TOTAL REMIS : ${fFull((c.paye || 0) + (c.oldRegle || 0))}*\n` +
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
                <TRow k="N° bordereau" v={ticketOf(c)} />
                <TRow k="Date" v={fDate(c.date)} />
                <TRow k="Planteur" v={member?.nom || "—"} />
                <TRow k="Village" v={member?.village || "—"} />
                <TRow k="Produit" v={crop(c.cropId || member?.cropId || "cacao").nom} />
                <Dashed />
                {c.sacs ? <TRow k="Sacs (tare)" v={`${c.sacs} · ${fKg(c.sacs)}`} /> : null}
                <TRow k="Poids net" v={fKg(c.kg)} />
                <TRow k="Prix / kg" v={fF(c.prixKg)} />
                <TRow k="Montant brut" v={fF(c.brut)} bold />
                {c.retenues.length > 0 ? <Dashed /> : null}
                {c.retenues.map((r, i) => <TRow key={i} k={`- ${r.label}`} v={`− ${fF(r.amount)}`} muted />)}
                <Dashed />
                <TRow k="NET À PAYER" v={fF(c.net)} bold big />
                <TRow k={`Payé (${c.method === "momo" ? "Mobile Money" : "espèces"})`} v={fF(c.paye)} />
                {c.oldRegle && c.oldRegle > 0 ? (
                  <View style={{ backgroundColor: "#EAF6EE", borderWidth: 1, borderColor: "#CFE6D8", borderRadius: 8, padding: 9, marginVertical: 6, flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <Icon name="check-circle" size={15} color={C.green} />
                    <Text style={{ flex: 1, fontSize: 12, color: C.green, fontWeight: "700" }}>Ancien reste soldé : {fF(c.oldRegle)}</Text>
                  </View>
                ) : null}
                {c.reste > 0 ? <TRow k="Reste à payer" v={fF(c.reste)} due /> : null}
                <Dashed />
                {/* Somme réellement remise au planteur : paiement de la pesée
                    du jour + ancien reste soldé à cette occasion. */}
                <TRow k="TOTAL REMIS" v={fF((c.paye || 0) + (c.oldRegle || 0))} bold big />
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


function settlementHtml(s: any, member: Member | undefined, saison: string, agent: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body{font-family:-apple-system,Roboto,'Helvetica Neue',sans-serif;color:#241C15;padding:24px;background:#fff}
    .h{background:#2E8B3D;color:#fff;text-align:center;padding:20px;border-radius:14px 14px 0 0}
    .h .n{font-size:26px;font-weight:900;letter-spacing:1px}
    .h .t{font-size:12px;opacity:.9;font-style:italic;margin-top:4px}
    .h .s{font-size:12px;opacity:.85;margin-top:6px}
    .b{border:1px solid #EAE2D5;border-top:none;border-radius:0 0 14px 14px;padding:18px;font-family:'Courier New',monospace;font-size:14px}
    table{width:100%;border-collapse:collapse} td{padding:4px 0} .r{text-align:right}
    .dash{border-top:1px dashed #EAE2D5;margin:10px 0} .big{font-size:19px;font-weight:900;color:#2E8B3D}
    .foot{text-align:center;font-size:11px;color:#7A6E62;margin-top:12px;font-family:sans-serif}
  </style></head><body>
    <div class="h"><div class="n">VALEO</div><div class="t">La valeur commence à la source.</div><div class="s">${saison} · Reçu de solde</div></div>
    <div class="b">
      <table>
        <tr><td>N° reçu</td><td class="r">${ticketOf(s)}</td></tr>
        <tr><td>Date</td><td class="r">${fDateTime(s.date)}</td></tr>
        <tr><td>Planteur</td><td class="r">${member?.nom || "—"}</td></tr>
        <tr><td>Village</td><td class="r">${member?.village || "—"}</td></tr>
        <tr><td>Réglé par</td><td class="r">${agent || "—"}</td></tr>
        ${s.refs && s.refs.length ? `<tr><td>Nature</td><td class="r">Solde du reçu ${s.refs.map((r: any) => (r.ticket || ticketNo(r.seq))).join(", ")}</td></tr>` : ""}
      </table>
      <div class="dash"></div>
      <table>
        <tr><td class="big">SOLDE PAYÉ</td><td class="r big">${fFull(s.amount)}</td></tr>
        <tr><td>Mode</td><td class="r">${s.method === "momo" ? "Mobile Money" : "Espèces"}</td></tr>
        <tr><td>Type d'opération</td><td class="r">${s.viaPesee ? "Soldé lors d'une pesée" : "Paiement direct (hors livraison)"}</td></tr>
      </table>
      ${s.refs && s.refs.length ? `<div class="dash"></div><table>${s.refs.map((r: any) => `<tr><td>Réf. reçu ${(r.ticket || ticketNo(r.seq))}</td><td class="r">${fF(r.amount)}</td></tr>`).join("")}</table>` : ""}
      <div class="foot">Solde du reste dû au planteur. Le reçu initial reste inchangé. Conservez ce reçu.</div>
    </div>
  </body></html>`;
}

export function SettlementReceipt({ settlement, member, saison, agent, onClose, onNotice }: any) {
  const insets = useSafeAreaInsets();
  const s = settlement;
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: settlementHtml(s, member, saison, agent) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Reçu de solde" });
    } catch {} finally { setBusy(false); }
  };
  const print = async () => {
    setBusy(true);
    try { await Print.printAsync({ html: settlementHtml(s, member, saison, agent) }); } catch {} finally { setBusy(false); }
  };
  const whatsapp = async () => {
    const wa = waNumber(member?.tel);
    if (!wa) { onNotice && onNotice("Ce planteur n'a pas de numéro de téléphone enregistré."); return; }
    const msg = `*VALEO — Reçu de solde ${ticketOf(s)}*\n${saison}\nPlanteur : ${member?.nom || "—"}\nDate : ${fDateTime(s.date)}\n${s.refs && s.refs.length ? `Solde du reçu ${s.refs.map((r: any) => (r.ticket || ticketNo(r.seq))).join(", ")}\n` : ""}Solde payé : ${fFull(s.amount)}\nMode : ${s.method === "momo" ? "Mobile Money" : "Espèces"}\n\nVotre reste dû a été soldé. Merci.`;
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else onNotice && onNotice("WhatsApp n'est pas disponible."); } catch { onNotice && onNotice("Impossible d'ouvrir WhatsApp."); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, paddingBottom: 12 }}>
            <Text style={{ fontWeight: "800", fontSize: 17 }}>Reçu de solde</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="settlement-close"><Icon name="x" size={22} color={C.muted} /></Pressable>
          </View>
          <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
              <View style={{ backgroundColor: C.green, paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 1 }}>VALEO</Text>
                <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{saison} · Reçu de solde</Text>
              </View>
              <View style={{ padding: 16 }}>
                <TRow k="N° reçu" v={ticketOf(s)} />
                <TRow k="Date & heure" v={fDateTime(s.date)} />
                <TRow k="Planteur" v={member?.nom || "—"} />
                <TRow k="Village" v={member?.village || "—"} />
                <TRow k="Réglé par" v={agent || "—"} />
                {s.refs && s.refs.length ? <TRow k="Nature" v={`Solde du reçu ${s.refs.map((r: any) => (r.ticket || ticketNo(r.seq))).join(", ")}`} /> : null}
                <Dashed />
                <TRow k="SOLDE PAYÉ" v={fFull(s.amount)} bold big />
                <TRow k="Mode" v={s.method === "momo" ? "Mobile Money" : "Espèces"} />
                <TRow k="Type d'opération" v={s.viaPesee ? "Soldé lors d'une pesée" : "Paiement direct"} />
                {s.refs && s.refs.length ? (
                  <>
                    <Dashed />
                    <Text style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Référence(s) du reçu initial</Text>
                    {s.refs.map((r: any, i: number) => <TRow key={i} k={(r.ticket || ticketNo(r.seq))} v={fF(r.amount)} muted />)}
                  </>
                ) : null}
                <Dashed />
                <Text style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 6 }}>Solde du reste dû au planteur. Le reçu initial reste inchangé.</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <SaveBtn color={C.green} onPress={share} disabled={busy} icon={<Icon name="share" size={16} color="#fff" />} style={{ flex: 1 }}>Partager PDF</SaveBtn>
              <SaveBtn color={C.cocoa} onPress={print} disabled={busy} icon={<Icon name="printer" size={16} color="#fff" />} style={{ flex: 1 }}>Imprimer</SaveBtn>
            </View>
            {member?.tel?.trim() ? <SaveBtn color="#25D366" onPress={whatsapp} icon={<Icon name="smartphone" size={16} color="#fff" />} style={{ marginTop: 10 }}>Envoyer par WhatsApp</SaveBtn> : null}
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}


/* -------------------------------- Stock ---------------------------------- */
export function SortieSheet({ data, staffId, scope, onClose, onSave }: { data: Data; staffId?: string; scope?: "all" | "mine"; onClose: () => void; onSave: (x: any) => void }) {
  // Identifiant d'opération : une sortie validée deux fois ne doit pas être
  // décomptée deux fois du stock.
  const [clientOpId] = useState(() => `so-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const st = stockStats(data, { scope, staffId });
  const dispo = st.rows.filter((r) => r.stock > 0);
  const [cropId, setCropId] = useState(dispo[0]?.cropId || "cacao");
  const [type, setType] = useState("expedition");
  const [kg, setKg] = useState("");
  const [destinataire, setDestinataire] = useState("");
  const [note, setNote] = useState("");

  const max = stockDispo(data, cropId, { scope, staffId });
  const n = Number(kg) || 0;
  const trop = n > max;
  const valid = n > 0 && !trop;

  if (dispo.length === 0)
    return (
      <Sheet title="Sortie de magasin" onClose={onClose}>
        <Card style={{ padding: 20 }}>
          <Text style={{ textAlign: "center", color: C.muted }}>Aucun stock disponible. Enregistrez d&apos;abord une pesée.</Text>
        </Card>
      </Sheet>
    );

  return (
    <Sheet title="Sortie de magasin" onClose={onClose}>
      <Field label="Produit">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {dispo.map((r) => (
            <Chip key={r.cropId} label={`${crop(r.cropId).nom} · ${fKg(r.stock)}`} emoji={crop(r.cropId).emoji} active={cropId === r.cropId} onPress={() => { setCropId(r.cropId); setKg(""); }} />
          ))}
        </View>
        <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Stock disponible : <Text style={{ fontWeight: "800", color: C.green }}>{fKg(max)}</Text></Text>
      </Field>
      <Field label="Motif de la sortie">
        <View style={{ gap: 8 }}>
          {SORTIE_TYPES.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setType(t.id)}
              testID={`sortie-${t.id}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: type === t.id ? C.teal : C.line, backgroundColor: type === t.id ? "#EAF3EF" : "#fff", borderRadius: 12, padding: 11 }}
            >
              <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: C.ink }}>{t.nom}</Text>
                <Text style={{ fontSize: 11.5, color: C.muted }}>{t.sub}</Text>
              </View>
              {type === t.id ? <Icon name="check-circle" size={17} color={C.teal} /> : null}
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Poids sorti (kg)">
        <TInput value={kg} onChangeText={(t) => setKg(t.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={`Max ${group(max)}`} />
        {trop ? <Text style={{ fontSize: 12, color: C.loss, marginTop: 6 }}>Le stock disponible n&apos;est que de {fKg(max)}.</Text> : null}
      </Field>
      <Field label={type === "perte" ? "Cause (facultatif)" : "Destinataire (facultatif)"}>
        <TInput value={destinataire} onChangeText={setDestinataire} placeholder={type === "perte" ? "Ex. humidité" : "Ex. SACO Abidjan"} />
      </Field>
      <Field label="Note (facultatif)"><TInput value={note} onChangeText={setNote} placeholder="N° de camion, bon de livraison…" /></Field>
      <SaveBtn
        disabled={!valid}
        color={C.rust}
        onPress={() => onSave({ cropId, type, kg: n, destinataire: destinataire.trim(), note: note.trim(), byStaffId: staffId, clientOpId })}
      >
        Enregistrer la sortie
      </SaveBtn>
    </Sheet>
  );
}

export function StockSheet({ data, staffId, scope, onClose, onNewSortie }: { data: Data; staffId?: string; scope?: "all" | "mine"; onClose: () => void; onNewSortie?: () => void }) {
  const insets = useSafeAreaInsets();
  // Campagne en cours : le stock d'une campagne close n'a plus de sens ici.
  const campagne = scopeSaison(data);
  const st = stockStats(campagne, { scope, staffId });
  const mouvements = (campagne.sorties || [])
    .filter((x) => (scope === "mine" && staffId ? x.byStaffId === staffId : true))
    .slice()
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const agent = (id: string) => (data.staff || []).find((x) => x.id === id)?.nom || "—";
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, paddingBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 17 }}>Stock en magasin</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{scope === "mine" ? "Vos poids non encore sortis" : "Magasin de la coopérative"} · {data.saison}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} testID="stock-close"><Icon name="x" size={22} color={C.muted} /></Pressable>
          </View>
          <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
            <Card style={{ backgroundColor: C.greenDark, borderColor: C.greenDark, padding: 18, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="package" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Stock actuel</Text>
              </View>
              <Text style={{ fontSize: 33, fontWeight: "900", color: st.stock < 0 ? "#FFC9C0" : "#fff", marginTop: 4 }}>{group(st.stock)} <Text style={{ fontSize: 17 }}>kg</Text></Text>
              <View style={{ flexDirection: "row", gap: 20, marginTop: 8, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Entrées (pesées)</Text>
                  <Text style={{ fontSize: 14.5, fontWeight: "800", color: "#fff" }}>{fKg(st.entrees)}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Sorties</Text>
                  <Text style={{ fontSize: 14.5, fontWeight: "800", color: "#fff" }}>− {fKg(st.sorties)}</Text>
                </View>
              </View>
              {st.stock < 0 ? (
                <Text style={{ fontSize: 11.5, color: "#FFC9C0", marginTop: 8, lineHeight: 16 }}>
                  Stock négatif : plus de sorties que d&apos;entrées ont été saisies. Vérifiez les pesées et les sorties.
                </Text>
              ) : null}
            </Card>

            {onNewSortie ? (
              <SaveBtn color={C.rust} icon={<Icon name="truck" size={17} color="#fff" />} onPress={onNewSortie} style={{ marginBottom: 18 }}>
                Enregistrer une sortie
              </SaveBtn>
            ) : null}

            <SectionTitle>Par produit</SectionTitle>
            {st.rows.length === 0 ? (
              <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucun mouvement pour le moment.</Text></Card>
            ) : (
              <View style={{ gap: 9 }}>
                {st.rows.map((r) => (
                  <Card key={r.cropId} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#F0EBE2", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 20 }}>{r.cr.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", fontSize: 15 }}>{r.cr.nom}</Text>
                      <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{fKg(r.entrees)} entrés · {fKg(r.sorties)} sortis</Text>
                    </View>
                    <Text style={{ fontWeight: "900", fontSize: 16, color: r.stock < 0 ? C.loss : C.teal }}>{fKg(r.stock)}</Text>
                  </Card>
                ))}
              </View>
            )}

            <View style={{ height: 18 }} />
            <SectionTitle>Sorties enregistrées ({mouvements.length})</SectionTitle>
            {mouvements.length === 0 ? (
              <Card style={{ padding: 20 }}><Text style={{ textAlign: "center", color: C.muted }}>Aucune sortie enregistrée.</Text></Card>
            ) : (
              <View style={{ gap: 8 }}>
                {mouvements.map((x) => (
                  <Card key={x.id} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F7EDE7", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 16 }}>{sortieType(x.type).emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 13.5 }}>{sortieType(x.type).nom} · {crop(x.cropId).nom}</Text>
                      <Text style={{ fontSize: 11.5, color: C.muted }}>{fDateTime(x.date)} · {agent(x.byStaffId)}{x.destinataire ? ` · ${x.destinataire}` : ""}{x.note ? ` · ${x.note}` : ""}</Text>
                    </View>
                    <Text style={{ fontWeight: "800", fontSize: 13.5, color: C.rust }}>− {fKg(x.kg)}</Text>
                  </Card>
                ))}
              </View>
            )}
            <View style={{ height: 16 }} />
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
