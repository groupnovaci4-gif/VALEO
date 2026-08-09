import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  C,
  Collection,
  CROPS,
  Data,
  Member,
  Staff,
  byDateDesc,
  crop,
  culturesLabel,
  depcat,
  fDate,
  fDateTime,
  fF,
  fFull,
  fKg,
  isToday,
  memberCultures,
  memberStats,
  op,
  pisteurStats,
  ticketNo,
} from "./lib";
import { Icon } from "./Icon";
import {
  Card,
  CodeChip,
  Empty,
  GhostBtn,
  InfoLine,
  LoanRow,
  LoanTypeChip,
  MiniKpi,
  MomoBadge,
  PhotoAvatar,
  Row,
  SaveBtn,
  SectionTitle,
  StatCell,
  TInput,
} from "./ui";

const nameOf = (data: Data, id: string) => data.members.find((m) => m.id === id)?.nom || "—";

const HeroCard = ({ theme, icon, label, big, sub }: { theme: string; icon: string; label: string; big: string; sub: string }) => (
  <Card style={{ backgroundColor: theme, padding: 18, marginBottom: 14, borderColor: theme }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={16} color="rgba(255,255,255,0.85)" />
      <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{label}</Text>
    </View>
    <Text style={{ fontSize: 33, fontWeight: "800", marginTop: 4, color: "#fff" }}>{big}</Text>
    <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{sub}</Text>
  </Card>
);

const CollectionRow = ({ title, sub, onOpen, onReceipt }: { title: string; sub: string; onOpen?: () => void; onReceipt?: () => void }) => (
  <Card style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F3ECE2", alignItems: "center", justifyContent: "center" }}><Icon name="user" size={17} color={C.cocoaSoft} /></View>
    <Pressable onPress={onOpen} style={{ flex: 1 }} disabled={!onOpen}>
      <Text style={{ fontWeight: "700", fontSize: 14 }}>{title}</Text>
      <Text style={{ fontSize: 11.5, color: C.muted }}>{sub}</Text>
    </Pressable>
    {onReceipt ? <Pressable onPress={onReceipt} hitSlop={8} testID="row-receipt"><Icon name="receipt" size={17} color={C.cocoaSoft} /></Pressable> : null}
  </Card>
);

const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={{ height: 36, flexShrink: 0, justifyContent: "center", paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: active ? C.teal : C.line, backgroundColor: active ? C.teal : "#fff" }}
    testID={`filter-${label}`}
  >
    <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#fff" : C.muted }}>{label}</Text>
  </Pressable>
);

const ResetPinButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} testID="staff-resetpin" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#FBF3E3", borderRadius: 12, paddingVertical: 11, marginBottom: 14 }}>
    <Icon name="key" size={16} color={C.gold} /><Text style={{ color: C.gold, fontWeight: "700", fontSize: 13.5 }}>Réinitialiser le code secret</Text>
  </Pressable>
);

const StaffLoginCard = ({ staff }: { staff: Staff }) => (
  <Card style={{ padding: 13, marginBottom: 16, backgroundColor: "#EAF3EF", borderColor: "#CFE6E0" }}>
    <Text style={{ fontWeight: "800", fontSize: 13, marginBottom: 4 }}>Identifiant de connexion (Espace coopérative)</Text>
    <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 18 }}>Nom <Text style={{ fontWeight: "700", color: C.ink }}>{staff.nom}</Text> + téléphone <Text style={{ fontWeight: "700", color: C.ink }}>{staff.tel || "—"}</Text> + son code secret à 4 chiffres.</Text>
  </Card>
);

/* ============================ COOP SCREENS =============================== */
export function Dashboard({ data, onReceipt, onOpen, theme, onOpenPrets, onOpenJournal }: any) {
  const cols: Collection[] = data.collections;
  const t = {
    kg: cols.reduce((s, c) => s + c.kg, 0),
    net: cols.reduce((s, c) => s + c.net, 0),
    paye: cols.reduce((s, c) => s + c.paye, 0),
    reste: cols.reduce((s, c) => s + c.reste, 0),
    active: new Set(cols.map((c) => c.memberId)).size,
  };
  const pending = data.loans.filter((l: any) => l.status === "en_attente").length;
  const recent = [...cols].sort(byDateDesc).slice(0, 4);
  return (
    <View>
      <HeroCard theme={theme} icon="package" label="Collecté cette campagne" big={fKg(t.kg)} sub={`${cols.length} collectes · ${t.active} planteurs · valeur ${fFull(t.net)}`} />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <MiniKpi icon={<Icon name="banknote" size={16} color={C.green} />} label="Déjà payé" value={fF(t.paye)} tint={C.green} />
        <MiniKpi icon={<Icon name="wallet" size={16} color={C.due} />} label="Reste à payer" value={fF(t.reste)} tint={C.due} />
      </View>
      {pending > 0 ? (
        <Pressable onPress={onOpenPrets} style={{ backgroundColor: "#FDF7EC", borderWidth: 1, borderColor: "#EAD9BE", borderRadius: 16, padding: 13, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 }} testID="dash-pending-loans">
          <Icon name="clock" size={18} color={C.due} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600" }}>{pending} demande{pending > 1 ? "s" : ""} de prêt en attente</Text>
          <Text style={{ fontSize: 12, color: C.due, fontWeight: "700" }}>Voir →</Text>
        </Pressable>
      ) : null}
      {onOpenJournal ? (
        <Pressable onPress={onOpenJournal} testID="dash-journal" style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#EAF3EF", alignItems: "center", justifyContent: "center" }}><Icon name="activity" size={17} color={C.teal} /></View>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700" }}>Journal d'activité</Text>
          <Text style={{ fontSize: 12, color: C.teal, fontWeight: "700" }}>Voir →</Text>
        </Pressable>
      ) : null}
      <SectionTitle>Dernières collectes</SectionTitle>
      <View style={{ gap: 8 }}>
        {recent.map((c) => (
          <CollectionRow key={c.id} title={nameOf(data, c.memberId)} sub={`${fKg(c.kg)} · ${fDate(c.date)} · ${c.method === "momo" ? "Mobile Money" : "espèces"}`} onOpen={() => onOpen(c.memberId)} onReceipt={() => onReceipt(c)} />
        ))}
      </View>
      {(() => {
        const impayes = data.members
          .map((m: Member) => ({ m, reste: memberStats(m.id, cols).reste }))
          .filter((x: any) => x.reste > 0)
          .sort((a: any, b: any) => b.reste - a.reste);
        if (impayes.length === 0) return null;
        return (
          <View style={{ marginTop: 18 }}>
            <SectionTitle>Rappels de paiement ({impayes.length})</SectionTitle>
            <View style={{ gap: 8 }}>
              {impayes.map(({ m, reste }: any) => (
                <Pressable key={m.id} onPress={() => onOpen(m.id)} testID={`impaye-${m.id}`}>
                  <Card style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FDF7EC", alignItems: "center", justifyContent: "center" }}><Icon name="wallet" size={17} color={C.due} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 14 }}>{m.nom}</Text>
                      <Text style={{ fontSize: 11.5, color: C.muted }}>{m.code} · {m.village}</Text>
                    </View>
                    <Text style={{ fontWeight: "800", fontSize: 14.5, color: C.due }}>{fF(reste)}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })()}
      <View style={{ height: 20 }} />
    </View>
  );
}

const staffNameOf = (data: Data, id: string) => data.staff.find((s) => s.id === id)?.nom || "—";
type Ev = { id: string; date: string; icon: string; tint: string; title: string; sub: string };
function buildActivity(data: Data): Ev[] {
  const evs: Ev[] = [];
  (data.collections || []).forEach((c: any) =>
    evs.push({ id: "c" + c.id, date: c.date, icon: "scale", tint: C.teal, title: `Pesée — ${nameOf(data, c.memberId)}`, sub: `${fKg(c.kg)} · net ${fF(c.net)} · payé ${fF(c.paye)}${c.reste > 0 ? ` · reste ${fF(c.reste)}` : ""}` }),
  );
  const loanMap: Record<string, [string, string, string]> = {
    en_attente: ["Demande de prêt", C.due, "clock"],
    approuve: ["Prêt approuvé", C.green, "check-circle"],
    refuse: ["Prêt refusé", C.loss, "x-circle"],
    rembourse: ["Prêt remboursé", C.muted, "check"],
  };
  (data.loans || []).forEach((l: any) => {
    const [t, tint, icon] = loanMap[l.status] || loanMap.en_attente;
    evs.push({ id: "l" + l.id, date: l.date, icon, tint, title: `${t} — ${nameOf(data, l.memberId)}`, sub: `${l.type === "intrant" ? "Intrant" : "Argent"} · ${fF(l.amount)}${l.motif ? ` · ${l.motif}` : ""}` });
  });
  (data.mandats || []).forEach((m: any) => evs.push({ id: "m" + m.id, date: m.date, icon: "wallet", tint: C.gold, title: `Mandat confié — ${staffNameOf(data, m.pisteurId)}`, sub: `${fF(m.amount)}${m.note ? ` · ${m.note}` : ""}` }));
  (data.depenses || []).forEach((x: any) => evs.push({ id: "d" + x.id, date: x.date, icon: "receipt", tint: C.rust, title: `Dépense — ${staffNameOf(data, x.pisteurId)}`, sub: `${depcat(x.category).nom} · ${fF(x.amount)}${x.note ? ` · ${x.note}` : ""}` }));
  return evs.sort(byDateDesc);
}

export function ActivityLog({ data, onBack }: any) {
  const events = buildActivity(data);
  return (
    <View>
      <GhostBtn onPress={onBack} style={{ marginBottom: 12 }}>← Retour</GhostBtn>
      <SectionTitle>Journal d'activité ({events.length})</SectionTitle>
      <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Historique horodaté des pesées, prêts, mandats et dépenses.</Text>
      {events.length === 0 ? <Empty text="Aucune activité pour le moment." /> : (
        <View style={{ gap: 8 }}>
          {events.map((e) => (
            <Card key={e.id} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: e.tint + "22", alignItems: "center", justifyContent: "center" }}><Icon name={e.icon} size={16} color={e.tint} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 13.5 }}>{e.title}</Text>
                <Text style={{ fontSize: 11.5, color: C.muted }}>{e.sub}</Text>
              </View>
              <Text style={{ fontSize: 10.5, color: C.muted, marginLeft: 6 }}>{fDateTime(e.date)}</Text>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function CollectorHome({ data, staffId, isPisteur, onReceipt, onOpen, onNew, theme }: any) {
  const mine: Collection[] = data.collections.filter((c: Collection) => c.byStaffId === staffId);
  const today = mine.filter((c) => isToday(c.date));
  const kgAll = mine.reduce((s, c) => s + c.kg, 0);
  const kgToday = today.reduce((s, c) => s + c.kg, 0);
  const list = [...mine].sort(byDateDesc);
  return (
    <View>
      <HeroCard theme={theme} icon={isPisteur ? "truck" : "scale"} label={`${isPisteur ? "Ma tournée" : "Mes pesées"} — aujourd'hui`} big={fKg(kgToday)} sub={`${today.length} collectes aujourd'hui · ${fKg(kgAll)} au total`} />
      <SaveBtn color={C.green} icon={<Icon name="scale" size={18} color="#fff" />} onPress={onNew} style={{ marginBottom: 18 }}>{isPisteur ? "Nouvelle collecte" : "Nouvelle pesée"}</SaveBtn>
      <SectionTitle>Historique</SectionTitle>
      {list.length === 0 ? <Empty text="Aucune collecte enregistrée pour l'instant." /> : (
        <View style={{ gap: 8 }}>
          {list.map((c) => (
            <CollectionRow key={c.id} title={nameOf(data, c.memberId)} sub={`${fKg(c.kg)} · ${fDate(c.date)}${c.reste > 0 ? ` · reste ${fF(c.reste)}` : ""}`} onOpen={() => onOpen(c.memberId)} onReceipt={() => onReceipt(c)} />
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

const Segments = ({ segs, seg, setSeg, theme }: { segs: [string, string][]; seg: string; setSeg: (s: string) => void; theme: string }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
    {segs.map(([id, label]) => (
      <Pressable key={id} onPress={() => setSeg(id)} style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 20, backgroundColor: seg === id ? theme : "#F0EBE2", flexShrink: 0 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: seg === id ? "#fff" : C.muted }}>{label}</Text>
      </Pressable>
    ))}
  </ScrollView>
);

export function PisteurHome({ theme, data, staffId, onNewDepense, onReceipt, onOpen }: any) {
  const [seg, setSeg] = useState("mandats");
  const st = pisteurStats(staffId, data);
  const mandats = (data.mandats || []).filter((m: any) => m.pisteurId === staffId).sort(byDateDesc);
  const deps = (data.depenses || []).filter((x: any) => x.pisteurId === staffId).sort(byDateDesc);
  const cols = (data.collections || []).filter((c: Collection) => c.byStaffId === staffId).sort(byDateDesc);
  const segs: [string, string][] = [["mandats", "Mandats reçus"], ["collectes", "Collectes"], ["depenses", "Dépenses"], ["commission", "Commission"]];
  return (
    <View>
      <HeroCard theme={theme} icon="package" label="Poids collecté — tournée" big={fKg(st.poids)} sub={`${st.count} collectes · commission ${fFull(st.commission)}`} />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <MiniKpi icon={<Icon name="wallet" size={16} color={C.gold} />} label="Mandat reçu" value={fF(st.mandat)} tint={C.gold} />
        <MiniKpi icon={<Icon name="coins" size={16} color={st.solde >= 0 ? C.green : C.loss} />} label="Solde en caisse" value={fF(st.solde)} tint={st.solde >= 0 ? C.green : C.loss} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <MiniKpi icon={<Icon name="receipt" size={16} color={C.rust} />} label="Dépenses" value={fF(st.depenses)} tint={C.rust} />
        <MiniKpi icon={<Icon name="coins" size={16} color={C.green} />} label="Commission" value={fF(st.commission)} tint={C.green} />
      </View>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Justification de caisse</Text>
        <Row label="Mandat reçu" value={fF(st.mandat)} />
        <View style={{ height: 6 }} />
        <Row label="− Achats payés aux planteurs" value={fF(st.achats)} />
        <View style={{ height: 6 }} />
        <Row label="− Dépenses de tournée" value={fF(st.depenses)} />
        <View style={{ borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed", marginVertical: 10 }} />
        <Row label="Solde en caisse à justifier" value={fF(st.solde)} strong color={st.solde >= 0 ? C.green : C.loss} />
      </Card>

      <Segments segs={segs} seg={seg} setSeg={setSeg} theme={theme} />

      {seg === "mandats" && (mandats.length === 0 ? <Empty text="Aucun mandat reçu. Le patron vous confie un mandat pour acheter le cacao." /> : (
        <View style={{ gap: 8 }}>
          {mandats.map((m: any) => (
            <Card key={m.id} style={{ padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#FBF3E3", alignItems: "center", justifyContent: "center" }}><Icon name="wallet" size={18} color={C.gold} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 15 }}>{fFull(m.amount)}</Text><Text style={{ fontSize: 11.5, color: C.muted }}>{fDate(m.date)}{m.note ? ` · ${m.note}` : ""}</Text></View>
              <View style={{ backgroundColor: "#F0F6F2", paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 }}><Text style={{ color: C.green, fontSize: 11, fontWeight: "700" }}>Reçu</Text></View>
            </Card>
          ))}
        </View>
      ))}

      {seg === "collectes" && (cols.length === 0 ? <Empty text="Aucune collecte. Touchez la balance pour peser un planteur." /> : (
        <View style={{ gap: 8 }}>
          {cols.map((c: Collection) => (
            <CollectionRow key={c.id} title={nameOf(data, c.memberId)} sub={`${fKg(c.kg)} · ${fDate(c.date)} · payé ${fF(c.paye)}`} onOpen={() => onOpen(c.memberId)} onReceipt={() => onReceipt(c)} />
          ))}
        </View>
      ))}

      {seg === "depenses" && (
        <View>
          <SaveBtn color={theme} icon={<Icon name="plus" size={17} color="#fff" />} onPress={onNewDepense} style={{ marginBottom: 12 }}>Nouvelle dépense</SaveBtn>
          {deps.length === 0 ? <Empty text="Aucune dépense enregistrée." /> : (
            <View style={{ gap: 8 }}>
              {deps.map((x: any) => (
                <Card key={x.id} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F7EDE7", alignItems: "center", justifyContent: "center" }}><Icon name="receipt" size={16} color={C.rust} /></View>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 13.5 }}>{depcat(x.category).nom}</Text><Text style={{ fontSize: 11.5, color: C.muted }}>{fDate(x.date)}{x.note ? ` · ${x.note}` : ""}</Text></View>
                  <Text style={{ fontWeight: "800", fontSize: 14, color: C.rust }}>{fF(x.amount)}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>
      )}

      {seg === "commission" && (
        <Card style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center" }}><Icon name="coins" size={19} color={C.green} /></View>
            <View><Text style={{ fontWeight: "800", fontSize: 15 }}>Ma commission</Text><Text style={{ fontSize: 12, color: C.muted }}>Barème {fF(data.commissionRate)} / kg</Text></View>
          </View>
          <Row label="Poids collecté" value={fKg(st.poids)} />
          <View style={{ height: 6 }} />
          <Row label={`× barème (${fF(data.commissionRate)}/kg)`} value={fKg(st.poids)} />
          <View style={{ borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed", marginVertical: 10 }} />
          <Row label="Commission due" value={fFull(st.commission)} strong color={C.green} />
        </Card>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function PisteurRecon({ pisteur, data, onBack, onNewMandat, onReceipt, onOpen, onSetPhoto, onEdit, onDelete, onResetPin }: any) {
  const st = pisteurStats(pisteur.id, data);
  const mandats = (data.mandats || []).filter((m: any) => m.pisteurId === pisteur.id).sort(byDateDesc);
  const deps = (data.depenses || []).filter((x: any) => x.pisteurId === pisteur.id).sort(byDateDesc);
  const cols = (data.collections || []).filter((c: Collection) => c.byStaffId === pisteur.id).sort(byDateDesc);
  return (
    <View>
      <GhostBtn onPress={onBack} style={{ marginBottom: 12 }}>← Retour</GhostBtn>
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <PhotoAvatar photo={pisteur.photo} size={48} editable onChange={onSetPhoto} fallbackIcon="truck" fallbackColor={C.teal} />
          <View style={{ flexShrink: 1 }}><Text style={{ fontWeight: "800", fontSize: 17 }}>{pisteur.nom}</Text><Text style={{ fontSize: 12.5, color: C.muted }}>Pisteur / Délégué · suivi de collecte{pisteur.tel ? ` · ${pisteur.tel}` : ""}</Text></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <StatCell label="Mandat donné" value={fF(st.mandat)} color={C.gold} />
          <StatCell label="Poids" value={fKg(st.poids)} color={C.teal} />
          <StatCell label="Achats" value={fF(st.achats)} color={C.cocoaSoft} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <StatCell label="Dépenses" value={fF(st.depenses)} color={C.rust} />
          <StatCell label="Commission" value={fF(st.commission)} color={C.green} />
          <StatCell label="À justifier" value={fF(st.solde)} color={st.solde >= 0 ? C.green : C.loss} strong />
        </View>
      </Card>
      {onEdit ? (
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 14 }}>
          <Pressable onPress={() => onEdit(pisteur)} testID="staff-edit" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="settings" size={16} color={C.cocoa} /><Text style={{ color: C.cocoa, fontWeight: "700", fontSize: 13.5 }}>Modifier</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(pisteur)} testID="staff-delete" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: "#EAD7D2", borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="trash" size={16} color={C.loss} /><Text style={{ color: C.loss, fontWeight: "700", fontSize: 13.5 }}>Supprimer</Text>
          </Pressable>
        </View>
      ) : null}
      {onResetPin ? <ResetPinButton onPress={() => onResetPin(pisteur)} /> : null}
      {onEdit ? <StaffLoginCard staff={pisteur} /> : null}
      <SaveBtn color={C.lime} icon={<Icon name="wallet" size={17} color="#fff" />} onPress={onNewMandat} style={{ marginBottom: 18 }}>Donner un mandat</SaveBtn>

      <SectionTitle>Mandats donnés</SectionTitle>
      {mandats.length === 0 ? <Empty text="Aucun mandat confié à ce pisteur." /> : (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {mandats.map((m: any) => (
            <Card key={m.id} style={{ padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FBF3E3", alignItems: "center", justifyContent: "center" }}><Icon name="wallet" size={17} color={C.gold} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 14 }}>{fFull(m.amount)}</Text><Text style={{ fontSize: 11.5, color: C.muted }}>{fDate(m.date)}{m.note ? ` · ${m.note}` : ""}</Text></View>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Dépenses ({fF(st.depenses)})</SectionTitle>
      {deps.length === 0 ? <Empty text="Aucune dépense." /> : (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {deps.map((x: any) => (
            <Card key={x.id} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "#F7EDE7", alignItems: "center", justifyContent: "center" }}><Icon name="receipt" size={15} color={C.rust} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 13.5 }}>{depcat(x.category).nom}</Text><Text style={{ fontSize: 11.5, color: C.muted }}>{fDate(x.date)}{x.note ? ` · ${x.note}` : ""}</Text></View>
              <Text style={{ fontWeight: "800", fontSize: 13.5, color: C.rust }}>{fF(x.amount)}</Text>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Collectes ({st.count})</SectionTitle>
      {cols.length === 0 ? <Empty text="Aucune collecte." /> : (
        <View style={{ gap: 8 }}>
          {cols.map((c: Collection) => (
            <CollectionRow key={c.id} title={nameOf(data, c.memberId)} sub={`${fKg(c.kg)} · ${fDate(c.date)} · payé ${fF(c.paye)}`} onOpen={() => onOpen(c.memberId)} onReceipt={() => onReceipt(c)} />
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function Collaborateurs({ data, onOpen, onAdd }: any) {
  const collabs: Staff[] = data.staff.filter((s: Staff) => s.role === "pisteur" || s.role === "commis");
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle noMargin>Mes collaborateurs</SectionTitle>
        <GhostBtn onPress={onAdd} testID="add-collab">+ Ajouter</GhostBtn>
      </View>
      <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Créez et gérez vos pisteurs/délégués et magasiniers. Touchez un Pisteur / Délégué pour lui confier un mandat.</Text>
      {collabs.length === 0 ? <Empty text="Aucun collaborateur. Touchez « Ajouter » pour créer un Pisteur / Délégué ou un Magasinier." /> : (
        <View style={{ gap: 9 }}>
          {collabs.map((s) => {
            const isP = s.role === "pisteur";
            const st = pisteurStats(s.id, data);
            return (
              <Pressable key={s.id} onPress={() => onOpen(s.id)} testID={`collab-${s.id}`}>
                <Card style={{ padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <PhotoAvatar photo={s.photo} size={44} fallbackIcon={isP ? "truck" : "scale"} fallbackColor={C.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 15 }}>{s.nom}</Text>
                    <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{isP ? "Pisteur / Délégué" : "Magasinier"} · {fKg(st.poids)}{isP ? ` · solde ${fF(st.solde)}` : " pesés"}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={C.muted} />
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function CommisDetail({ staff, data, onBack, onReceipt, onOpen, onSetPhoto, onEdit, onDelete, onResetPin }: any) {
  const cols = (data.collections || []).filter((c: Collection) => c.byStaffId === staff.id).sort(byDateDesc);
  const poids = cols.reduce((s: number, c: Collection) => s + c.kg, 0);
  const valeur = cols.reduce((s: number, c: Collection) => s + c.net, 0);
  return (
    <View>
      <GhostBtn onPress={onBack} style={{ marginBottom: 12 }}>← Retour</GhostBtn>
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <PhotoAvatar photo={staff.photo} size={48} editable onChange={onSetPhoto} fallbackIcon="scale" fallbackColor={C.teal} />
          <View style={{ flexShrink: 1 }}><Text style={{ fontWeight: "800", fontSize: 17 }}>{staff.nom}</Text><Text style={{ fontSize: 12.5, color: C.muted }}>Magasinier{staff.tel ? ` · ${staff.tel}` : ""}</Text></View>
        </View>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <StatCell label="Poids pesé" value={fKg(poids)} color={C.teal} />
          <StatCell label="Pesées" value={String(cols.length)} color={C.cocoaSoft} />
          <StatCell label="Valeur" value={fF(valeur)} color={C.gold} strong />
        </View>
      </Card>
      {onEdit ? (
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 14 }}>
          <Pressable onPress={() => onEdit(staff)} testID="staff-edit" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="settings" size={16} color={C.cocoa} /><Text style={{ color: C.cocoa, fontWeight: "700", fontSize: 13.5 }}>Modifier</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(staff)} testID="staff-delete" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: "#EAD7D2", borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="trash" size={16} color={C.loss} /><Text style={{ color: C.loss, fontWeight: "700", fontSize: 13.5 }}>Supprimer</Text>
          </Pressable>
        </View>
      ) : null}
      {onResetPin ? <ResetPinButton onPress={() => onResetPin(staff)} /> : null}
      {onEdit ? <StaffLoginCard staff={staff} /> : null}
      <SectionTitle>Pesées</SectionTitle>
      {cols.length === 0 ? <Empty text="Ce magasinier n'a pas encore enregistré de pesée." /> : (
        <View style={{ gap: 8 }}>
          {cols.map((c: Collection) => (
            <CollectionRow key={c.id} title={nameOf(data, c.memberId)} sub={`${fKg(c.kg)} · ${fDate(c.date)}`} onOpen={() => onOpen(c.memberId)} onReceipt={() => onReceipt(c)} />
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function Members({ data, onOpen, onAdd, onVillageRecap, restrictTo }: any) {
  const [q, setQ] = useState("");
  const [selVillage, setSelVillage] = useState("all");
  const [selCrop, setSelCrop] = useState("all");
  const query = q.trim().toLowerCase();
  const base = restrictTo ? data.members.filter((m: Member) => (m as any).createdBy === restrictTo) : data.members;
  const villages = Array.from(new Set(base.map((m: Member) => m.village).filter(Boolean))).sort() as string[];
  const sorted = [...base]
    .filter((m: Member) => !query || m.nom.toLowerCase().includes(query) || m.village.toLowerCase().includes(query) || (m.code || "").toLowerCase().includes(query))
    .filter((m: Member) => selVillage === "all" || m.village === selVillage)
    .filter((m: Member) => selCrop === "all" || memberCultures(m).some((c) => c.cropId === selCrop))
    .sort((a: Member, b: Member) => a.nom.localeCompare(b.nom));
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle noMargin>{restrictTo ? "Mes planteurs" : "Planteurs"} ({base.length})</SectionTitle>
        <GhostBtn onPress={onAdd} testID="add-member">+ Ajouter</GhostBtn>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 }}>
        <Icon name="search" size={17} color={C.muted} />
        <TInput value={q} onChangeText={setQ} placeholder="Rechercher nom, village, code…" style={{ flex: 1, borderWidth: 0, paddingHorizontal: 0, backgroundColor: "transparent" }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
        <FilterChip label="Tous villages" active={selVillage === "all"} onPress={() => setSelVillage("all")} />
        {villages.map((v) => <FilterChip key={v} label={v} active={selVillage === v} onPress={() => setSelVillage(v)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
        <FilterChip label="Toutes cultures" active={selCrop === "all"} onPress={() => setSelCrop("all")} />
        {CROPS.map((c) => <FilterChip key={c.id} label={`${c.emoji} ${c.nom}`} active={selCrop === c.id} onPress={() => setSelCrop(c.id)} />)}
      </ScrollView>
      {selVillage !== "all" && onVillageRecap ? (
        <Pressable onPress={() => onVillageRecap(selVillage)} testID="village-recap" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EAF3EF", borderRadius: 12, paddingVertical: 11, marginBottom: 12 }}>
          <Icon name="share" size={16} color={C.teal} />
          <Text style={{ color: C.teal, fontWeight: "700", fontSize: 13.5 }}>Bilan PDF de {selVillage}</Text>
        </Pressable>
      ) : null}
      {sorted.length === 0 ? <Empty text="Aucun planteur trouvé." /> : (
        <View style={{ gap: 9 }}>
          {sorted.map((m: Member) => {
            const s = memberStats(m.id, data.collections);
            return (
              <Pressable key={m.id} onPress={() => onOpen(m.id)} testID={`member-${m.id}`}>
                <Card style={{ padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <PhotoAvatar photo={m.photo} size={42} fallbackIcon="user" fallbackColor={C.cocoaSoft} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 15 }}>{m.nom}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: C.teal }}>{m.code}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Icon name="map-pin" size={11} color={C.muted} /><Text style={{ fontSize: 12, color: C.muted }}>{m.village}</Text></View>
                      {m.momo ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Icon name="smartphone" size={11} color={C.muted} /><Text style={{ fontSize: 12, color: C.muted }}>{op(m.momo.operator).short}</Text></View> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontWeight: "800", fontSize: 14 }}>{fKg(s.kg)}</Text>
                    <Text style={{ fontSize: 11.5, color: s.reste > 0 ? C.due : C.muted }}>{s.reste > 0 ? `reste ${fF(s.reste)}` : "soldé"}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function MemberDetail({ member, data, onBack, onReceipt, onEdit, onDelete, onResetPin, onSettle }: any) {
  const s = memberStats(member.id, data.collections);
  const list = data.collections.filter((c: Collection) => c.memberId === member.id).sort(byDateDesc);
  const loans = data.loans.filter((l: any) => l.memberId === member.id);
  return (
    <View>
      <GhostBtn onPress={onBack} style={{ marginBottom: 12 }}>← Retour</GhostBtn>
      <Card style={{ padding: 16, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 }}>
          <PhotoAvatar photo={member.photo} size={46} fallbackIcon="user" fallbackColor={C.cocoaSoft} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 17 }}>{member.nom}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 }}><CodeChip code={member.code} /><Text style={{ fontSize: 12, color: C.muted }}>{crop(member.cropId).nom}</Text></View>
          </View>
          {member.momo ? <MomoBadge operator={member.momo.operator} /> : null}
        </View>
        <View style={{ backgroundColor: "#FAF6EF", borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: "row", flexWrap: "wrap" }}>
          <View style={{ width: "50%", marginBottom: 10 }}><InfoLine label="Pièce d'identité" value={member.idNumber} /></View>
          <View style={{ width: "50%", marginBottom: 10 }}><InfoLine label="Superficie totale" value={memberCultures(member).reduce((s: number, c: any) => s + (Number(c.superficie) || 0), 0) ? `${memberCultures(member).reduce((s: number, c: any) => s + (Number(c.superficie) || 0), 0)} ha` : "—"} /></View>
          <View style={{ width: "100%", marginBottom: 10 }}><InfoLine label="Cultures" value={culturesLabel(member)} /></View>
          <View style={{ width: "50%" }}><InfoLine label="Localité" value={member.village} /></View>
          <View style={{ width: "50%" }}><InfoLine label="Téléphone" value={member.tel} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <StatCell label="Livré" value={fKg(s.kg)} color={C.cocoaSoft} />
          <StatCell label="Payé" value={fF(s.paye)} color={C.green} />
          <StatCell label="Reste dû" value={fF(s.reste)} color={s.reste > 0 ? C.due : C.muted} strong />
        </View>
      </Card>
      {onSettle && s.reste > 0 ? (
        <Pressable onPress={() => onSettle(member, s.reste)} testID="member-settle" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: C.green, borderRadius: 12, paddingVertical: 12, marginBottom: 14 }}>
          <Icon name="banknote" size={17} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Solder le reste dû ({fF(s.reste)})</Text>
        </Pressable>
      ) : null}
      {onEdit ? (
        <View style={{ flexDirection: "row", gap: 9, marginBottom: 16 }}>
          <Pressable onPress={() => onEdit(member)} testID="member-edit" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="settings" size={16} color={C.cocoa} /><Text style={{ color: C.cocoa, fontWeight: "700", fontSize: 13.5 }}>Modifier</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(member)} testID="member-delete" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: "#EAD7D2", borderRadius: 12, paddingVertical: 11 }}>
            <Icon name="trash" size={16} color={C.loss} /><Text style={{ color: C.loss, fontWeight: "700", fontSize: 13.5 }}>Supprimer</Text>
          </Pressable>
        </View>
      ) : null}
      {onResetPin ? (
        <Pressable onPress={() => onResetPin(member)} testID="member-resetpin" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#FBF3E3", borderRadius: 12, paddingVertical: 11, marginBottom: 14 }}>
          <Icon name="key" size={16} color={C.gold} /><Text style={{ color: C.gold, fontWeight: "700", fontSize: 13.5 }}>Réinitialiser le code secret</Text>
        </Pressable>
      ) : null}
      {onEdit ? (
        <Card style={{ padding: 13, marginBottom: 16, backgroundColor: "#F3FAF5", borderColor: "#D8E8DE" }}>
          <Text style={{ fontWeight: "800", fontSize: 13, marginBottom: 4 }}>Identifiant de connexion (Espace planteur)</Text>
          <Text style={{ fontSize: 12.5, color: C.muted, lineHeight: 18 }}>Code <Text style={{ fontWeight: "700", color: C.ink }}>{member.code}</Text>{member.tel ? <Text> ou téléphone <Text style={{ fontWeight: "700", color: C.ink }}>{member.tel}</Text></Text> : null} + son code secret à 4 chiffres.</Text>
        </Card>
      ) : null}
      {loans.length > 0 ? (
        <>
          <SectionTitle>Prêts</SectionTitle>
          <View style={{ gap: 8, marginBottom: 16 }}>{loans.map((l: any) => <LoanRow key={l.id} loan={l} />)}</View>
        </>
      ) : null}
      <SectionTitle>Collectes</SectionTitle>
      {list.length === 0 ? <Empty text="Aucune collecte pour ce planteur." /> : (
        <View style={{ gap: 8 }}>
          {list.map((c: Collection) => (
            <Card key={c.id} style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ fontWeight: "700", fontSize: 14 }}>{fKg(c.kg)} <Text style={{ color: C.muted, fontWeight: "400", fontSize: 12 }}>× {fF(c.prixKg)}</Text></Text>
                  <Text style={{ fontSize: 11.5, color: C.muted }}>{ticketNo(c.seq)} · {fDate(c.date)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "800", fontSize: 14, color: C.gold }}>{fF(c.net)}</Text>
                  {c.reste > 0 ? <Text style={{ fontSize: 11, color: C.due }}>reste {fF(c.reste)}</Text> : null}
                </View>
              </View>
              <GhostBtn onPress={() => onReceipt(c)} style={{ marginTop: 10, width: "100%", justifyContent: "center", alignSelf: "stretch" }}>🧾 Bordereau</GhostBtn>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function PatronPrets({ data, onApprove, onRefuse, onNew, onBack }: any) {
  const pending = data.loans.filter((l: any) => l.status === "en_attente");
  const others = data.loans.filter((l: any) => l.status !== "en_attente");
  const totalPrete = data.loans.filter((l: any) => l.status === "approuve" || l.status === "rembourse").reduce((s: number, l: any) => s + l.amount, 0);
  const totalDu = data.loans.reduce((s: number, l: any) => s + (l.status === "approuve" ? l.soldeRestant : 0), 0);
  return (
    <View>
      {onBack ? <GhostBtn onPress={onBack} style={{ marginBottom: 12 }}>← Retour</GhostBtn> : null}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        <MiniKpi icon={<Icon name="coins" size={16} color={C.gold} />} label="Total prêté" value={fF(totalPrete)} tint={C.gold} />
        <MiniKpi icon={<Icon name="wallet" size={16} color={C.due} />} label="À recouvrer" value={fF(totalDu)} tint={C.due} />
      </View>
      <SaveBtn color={C.cocoa} icon={<Icon name="plus" size={17} color="#fff" />} onPress={onNew} style={{ marginBottom: 18 }}>Nouveau prêt / créance</SaveBtn>
      <SectionTitle>Demandes en attente ({pending.length})</SectionTitle>
      {pending.length === 0 ? <Empty text="Aucune demande en attente." /> : (
        <View style={{ gap: 10, marginBottom: 18 }}>
          {pending.map((l: any) => (
            <Card key={l.id} style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <LoanTypeChip type={l.type} />
                <Text style={{ marginLeft: "auto", fontWeight: "800", fontSize: 16 }}>{fF(l.amount)}</Text>
              </View>
              <Text style={{ fontWeight: "700", fontSize: 14.5 }}>{nameOf(data, l.memberId)}</Text>
              <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>{l.motif} · {fDate(l.date)}</Text>
              <View style={{ flexDirection: "row", gap: 9, marginTop: 12 }}>
                <Pressable onPress={() => onRefuse(l.id)} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }} testID={`loan-refuse-${l.id}`}>
                  <Icon name="x-circle" size={16} color={C.loss} /><Text style={{ color: C.loss, fontWeight: "700", fontSize: 13.5 }}>Refuser</Text>
                </Pressable>
                <Pressable onPress={() => onApprove(l)} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, backgroundColor: C.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }} testID={`loan-approve-${l.id}`}>
                  <Icon name="check-circle" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13.5 }}>Approuver</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}
      <SectionTitle>Historique</SectionTitle>
      {others.length === 0 ? <Empty text="Aucun prêt traité." /> : (
        <View style={{ gap: 8 }}>{others.map((l: any) => <LoanRow key={l.id} loan={l} name={nameOf(data, l.memberId)} />)}</View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function CoopAccount({ data, onAddMomo, onDelMomo, onSettings, onReset, onOpenPrets, pendingLoans, onRecap, onExport, onRestore }: any) {
  const co = data.coop || {};
  const patron = (data.staff || []).find((s: Staff) => s.role === "patron");
  const filieresTxt = (co.filieres || []).map((id: string) => crop(id).nom).join(", ");
  const info: [string, string | undefined][] = [
    ["Type", co.type],
    ["Agrément", co.agrement],
    ["Date de création", co.dateCreation],
    ["Filières", filieresTxt],
    ["Région", co.region],
    ["District", co.district],
    ["Département", co.departement],
    ["Commune", co.commune],
    ["Localité", co.localite],
    ["Adresse", co.adresse],
    ["Téléphone", co.tel],
    ["Email", co.email],
  ];
  const shown = info.filter(([, v]) => v && String(v).trim());
  return (
    <View>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <PhotoAvatar photo={co.photo} size={52} fallbackIcon="building" fallbackColor={C.teal} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>{co.nom}</Text>
            <Text style={{ fontSize: 12.5, color: C.muted }}>{co.sigle ? `${co.sigle} · ` : ""}{data.saison}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Prix {fF(data.prixKg)}/kg · commission {fF(data.commissionRate)}/kg</Text>
          </View>
        </View>
        {co.description ? <Text style={{ fontSize: 13, color: C.ink, marginTop: 12, lineHeight: 19 }}>{co.description}</Text> : null}
        {shown.length > 0 ? (
          <View style={{ backgroundColor: "#FAF6EF", borderRadius: 12, padding: 12, marginTop: 12, flexDirection: "row", flexWrap: "wrap" }}>
            {shown.map(([l, v], i) => (
              <View key={i} style={{ width: "50%", marginBottom: i < shown.length - (shown.length % 2 === 0 ? 2 : 1) ? 10 : 0 }}>
                <InfoLine label={l} value={v} />
              </View>
            ))}
          </View>
        ) : null}
        {patron ? (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed", paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PhotoAvatar photo={patron.photo} size={38} fallbackIcon="user" fallbackColor={C.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", fontSize: 13.5 }}>{patron.nom}</Text>
              <Text style={{ fontSize: 12, color: C.muted }}>{patron.fonction || "Responsable"}{patron.tel ? ` · ${patron.tel}` : ""}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      <SectionTitle>Administration</SectionTitle>
      <View style={{ gap: 9, marginBottom: 20 }}>
        <Pressable onPress={onOpenPrets} testID="coop-loans">
          <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#F3ECE2", alignItems: "center", justifyContent: "center" }}><Icon name="piggy-bank" size={19} color={C.cocoa} /></View>
            <Text style={{ flex: 1, fontWeight: "600", fontSize: 14 }}>Demandes de prêt</Text>
            {pendingLoans > 0 ? <View style={{ backgroundColor: C.due, borderRadius: 20, paddingVertical: 2, paddingHorizontal: 9 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{pendingLoans}</Text></View> : null}
            <Icon name="chevron-right" size={17} color={C.muted} />
          </Card>
        </Pressable>
        <Pressable onPress={onSettings} testID="coop-settings">
          <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#F3ECE2", alignItems: "center", justifyContent: "center" }}><Icon name="settings" size={19} color={C.cocoa} /></View>
            <Text style={{ flex: 1, fontWeight: "600", fontSize: 14 }}>Réglages (prix, commission, campagne)</Text>
            <Icon name="chevron-right" size={17} color={C.muted} />
          </Card>
        </Pressable>
      </View>

      <SectionTitle>Données & rapports</SectionTitle>
      <View style={{ gap: 9, marginBottom: 20 }}>
        <Pressable onPress={onRecap} testID="coop-recap">
          <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#EAF3EF", alignItems: "center", justifyContent: "center" }}><Icon name="receipt" size={19} color={C.teal} /></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", fontSize: 14 }}>Récapitulatif de campagne</Text><Text style={{ fontSize: 12, color: C.muted }}>Bilan complet en PDF, prêt à partager</Text></View>
            <Icon name="share" size={17} color={C.muted} />
          </Card>
        </Pressable>
        <Pressable onPress={onExport} testID="coop-export">
          <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center" }}><Icon name="package" size={19} color={C.green} /></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", fontSize: 14 }}>Sauvegarder les données</Text><Text style={{ fontSize: 12, color: C.muted }}>Exporter un fichier de sauvegarde</Text></View>
            <Icon name="chevron-right" size={17} color={C.muted} />
          </Card>
        </Pressable>
        <Pressable onPress={onRestore} testID="coop-restore">
          <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: "#FBF7EC", alignItems: "center", justifyContent: "center" }}><Icon name="link" size={19} color={C.gold} /></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", fontSize: 14 }}>Restaurer une sauvegarde</Text><Text style={{ fontSize: 12, color: C.muted }}>Importer sur ce téléphone</Text></View>
            <Icon name="chevron-right" size={17} color={C.muted} />
          </Card>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <SectionTitle noMargin>Comptes Mobile Money de la coop</SectionTitle>
        <GhostBtn onPress={onAddMomo} testID="add-coop-momo">+ Lier</GhostBtn>
      </View>
      <Text style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>Comptes depuis lesquels la coopérative verse les paiements et prêts aux planteurs.</Text>
      <View style={{ gap: 10, marginBottom: 20 }}>
        {data.coop.momo.map((a: any) => {
          const o = op(a.operator);
          return (
            <Card key={a.id} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: o.color, alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={20} color={o.ink} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 14.5 }}>{o.nom}</Text><Text style={{ fontSize: 12.5, color: C.muted }}>{a.number}{a.label ? ` · ${a.label}` : ""}</Text></View>
              <Pressable onPress={() => onDelMomo(a.id)} hitSlop={8}><Icon name="x" size={17} color={C.muted} /></Pressable>
            </Card>
          );
        })}
        {data.coop.momo.length === 0 ? <Empty text="Aucun compte lié. Touchez « Lier » pour ajouter un compte Mobile Money." /> : null}
      </View>

      <Pressable onPress={onReset} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 20 }} testID="reset-data">
        <Text style={{ color: C.muted, fontSize: 12.5, fontWeight: "600" }}>Réinitialiser les données de démonstration</Text>
      </Pressable>
    </View>
  );
}

/* ========================== PLANTEUR SCREENS ============================= */
export function SubTabs({ member, loans, onGoPrets }: any) {
  const pending = loans.filter((l: any) => l.memberId === member.id && l.status === "en_attente").length;
  const due = loans.filter((l: any) => l.memberId === member.id && l.status === "approuve").reduce((s: number, l: any) => s + l.soldeRestant, 0);
  return (
    <Pressable onPress={onGoPrets} testID="planteur-goto-prets" style={{ marginBottom: 14 }}>
      <View style={{ backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#E1F1E8", alignItems: "center", justifyContent: "center" }}><Icon name="piggy-bank" size={19} color={C.green} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 14 }}>Mes prêts</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>{pending > 0 ? `${pending} en attente · ` : ""}{due > 0 ? `${fF(due)} à rembourser` : "à jour"}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={C.muted} />
      </View>
    </Pressable>
  );
}

export function PlanteurPoids({ member, data, onReceipt, onSetPhoto }: any) {
  const s = memberStats(member.id, data.collections);
  const list = data.collections.filter((c: Collection) => c.memberId === member.id).sort(byDateDesc);
  return (
    <View>
      <HeroCard theme={C.green} icon="package" label="Total livré cette campagne" big={fKg(s.kg)} sub={`${s.count} livraisons · valeur ${fFull(s.net)}`} />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
        <MiniKpi icon={<Icon name="banknote" size={16} color={C.green} />} label="Reçu" value={fF(s.paye)} tint={C.green} />
        <MiniKpi icon={<Icon name="wallet" size={16} color={C.due} />} label="Reste dû par la coop" value={fF(s.reste)} tint={C.due} />
      </View>
      <Card style={{ padding: 14, marginBottom: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <PhotoAvatar photo={member.photo} size={54} editable onChange={onSetPhoto} fallbackIcon="user" fallbackColor={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 14 }}>Mon profil</Text>
            <View style={{ marginTop: 4 }}><CodeChip code={member.code} /></View>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <View style={{ width: "50%", marginBottom: 10 }}><InfoLine label="Pièce d'identité" value={member.idNumber} /></View>
          <View style={{ width: "50%", marginBottom: 10 }}><InfoLine label="Superficie" value={member.superficie ? `${member.superficie} ha` : "—"} /></View>
          <View style={{ width: "50%" }}><InfoLine label="Localité" value={member.village} /></View>
          <View style={{ width: "50%" }}><InfoLine label="Téléphone" value={member.tel} /></View>
        </View>
      </Card>
      <SectionTitle>Mes livraisons</SectionTitle>
      {list.length === 0 ? <Empty text="Aucune livraison enregistrée pour le moment." /> : (
        <View style={{ gap: 8 }}>
          {list.map((c: Collection) => (
            <Card key={c.id} style={{ padding: 13 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text style={{ fontWeight: "800", fontSize: 16 }}>{fKg(c.kg)}</Text>
                  <Text style={{ fontSize: 11.5, color: C.muted }}>{ticketNo(c.seq)} · {fDate(c.date)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "700", fontSize: 14, color: C.gold }}>{fF(c.net)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Icon name={c.method === "momo" ? "smartphone" : "coins"} size={11} color={C.muted} />
                    <Text style={{ fontSize: 11, color: C.muted }}>{c.method === "momo" ? "Mobile Money" : "Espèces"}</Text>
                  </View>
                </View>
              </View>
              {c.reste > 0 ? <View style={{ marginTop: 8, backgroundColor: "#FDF7EC", borderRadius: 8, padding: 8 }}><Text style={{ fontSize: 12, color: C.due }}>Reste à percevoir : <Text style={{ fontWeight: "700" }}>{fF(c.reste)}</Text></Text></View> : null}
              <GhostBtn onPress={() => onReceipt(c)} color={C.green} style={{ marginTop: 10, width: "100%", justifyContent: "center", alignSelf: "stretch" }}>🧾 Mon bordereau</GhostBtn>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function PlanteurPrets({ member, data, onNew }: any) {
  const list = data.loans.filter((l: any) => l.memberId === member.id).sort(byDateDesc);
  const due = list.filter((l: any) => l.status === "approuve").reduce((s: number, l: any) => s + l.soldeRestant, 0);
  return (
    <View>
      <Card style={{ backgroundColor: due > 0 ? C.due : C.green, padding: 18, marginBottom: 14, borderColor: due > 0 ? C.due : C.green }}>
        <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>À rembourser à la coopérative</Text>
        <Text style={{ fontSize: 30, fontWeight: "800", marginTop: 3, color: "#fff" }}>{fFull(due)}</Text>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>Prélevé automatiquement sur vos prochaines livraisons.</Text>
      </Card>
      <SaveBtn color={C.green} icon={<Icon name="plus" size={18} color="#fff" />} onPress={onNew} style={{ marginBottom: 18 }}>Demander un prêt</SaveBtn>
      <SectionTitle>Mes demandes</SectionTitle>
      {list.length === 0 ? <Empty text="Vous n'avez pas encore fait de demande de prêt." /> : (
        <View style={{ gap: 8 }}>{list.map((l: any) => <LoanRow key={l.id} loan={l} />)}</View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}

export function PlanteurMomo({ member, data, onLink, onUnlink }: any) {
  const linked = member.momo;
  const momoPayments = data.collections.filter((c: Collection) => c.memberId === member.id && c.method === "momo").sort(byDateDesc);
  return (
    <View>
      <SectionTitle>Mon compte Mobile Money</SectionTitle>
      {linked ? (
        <Card style={{ padding: 0, overflow: "hidden", marginBottom: 8 }}>
          <View style={{ backgroundColor: op(linked.operator).color, paddingVertical: 18, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={22} color={op(linked.operator).ink} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 16, color: op(linked.operator).ink }}>{op(linked.operator).nom}</Text>
              <Text style={{ fontSize: 13.5, color: op(linked.operator).ink, opacity: 0.9 }}>{linked.number}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.25)", paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20 }}>
              <Icon name="check" size={13} color={op(linked.operator).ink} /><Text style={{ fontSize: 11.5, fontWeight: "700", color: op(linked.operator).ink }}>Lié</Text>
            </View>
          </View>
          <View style={{ padding: 12 }}><Text style={{ fontSize: 12.5, color: C.muted }}>Vos paiements de la coopérative peuvent être versés directement sur ce compte.</Text></View>
        </Card>
      ) : (
        <Card style={{ padding: 20, alignItems: "center", marginBottom: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Icon name="link" size={24} color={C.green} /></View>
          <Text style={{ fontWeight: "700", fontSize: 15 }}>Aucun compte lié</Text>
          <Text style={{ fontSize: 13, color: C.muted, textAlign: "center", marginVertical: 8, lineHeight: 20 }}>Liez votre compte Mobile Money pour recevoir vos paiements sans vous déplacer.</Text>
          <SaveBtn color={C.green} onPress={onLink}>Lier mon Mobile Money</SaveBtn>
        </Card>
      )}
      {linked ? (
        <Pressable onPress={onUnlink} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#EAD7D2", borderRadius: 12, padding: 12, alignItems: "center", marginTop: 8 }} testID="unlink-momo">
          <Text style={{ color: C.loss, fontSize: 12.5, fontWeight: "600" }}>Délier ce compte</Text>
        </Pressable>
      ) : null}

      <View style={{ height: 6 }} />
      <SectionTitle>Paiements reçus par Mobile Money</SectionTitle>
      {momoPayments.length === 0 ? <Empty text="Aucun paiement Mobile Money pour l'instant." /> : (
        <View style={{ gap: 8 }}>
          {momoPayments.map((c: Collection) => (
            <Card key={c.id} style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={17} color={C.green} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 13.5 }}>Paiement livraison</Text><Text style={{ fontSize: 11.5, color: C.muted }}>{ticketNo(c.seq)} · {fDate(c.date)}</Text></View>
              <Text style={{ fontWeight: "800", fontSize: 14, color: C.green }}>+{fF(c.paye)}</Text>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}
