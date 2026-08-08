import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, Session, uid } from "@/src/coop/lib";
import { Icon } from "@/src/coop/Icon";
import { Login, TopBar } from "@/src/coop/auth";
import {
  CollaborateurSheet,
  DepenseSheet,
  LinkMomoSheet,
  LoanSheet,
  MandatSheet,
  MemberSheet,
  PeseeSheet,
  SettingsSheet,
  Bordereau,
} from "@/src/coop/sheets";
import {
  CoopAccount,
  Collaborateurs,
  CollectorHome,
  CommisDetail,
  Dashboard,
  Members,
  MemberDetail,
  PatronPrets,
  PisteurHome,
  PisteurRecon,
  PlanteurMomo,
  PlanteurPoids,
  PlanteurPrets,
  SubTabs,
} from "@/src/coop/screens";
import { useCoopData } from "@/src/coop/store";
import { shareCampaign } from "@/src/coop/reports";
import { exportData, importData } from "@/src/coop/backup";

type NavItem = { id: string; icon: string; label: string; badge?: number };

function NavBar({
  left,
  right,
  fabIcon,
  fabColor,
  active,
  theme,
  onTab,
  onFab,
}: {
  left: NavItem[];
  right: NavItem[];
  fabIcon: string;
  fabColor: string;
  active: string;
  theme: string;
  onTab: (id: string) => void;
  onFab: () => void;
}) {
  const insets = useSafeAreaInsets();
  const Btn = ({ item }: { item: NavItem }) => (
    <Pressable onPress={() => onTab(item.id)} style={{ flex: 1, alignItems: "center", gap: 3 }} testID={`nav-${item.id}`}>
      <View>
        <Icon name={item.icon} size={20} color={active === item.id ? theme : C.muted} />
        {item.badge && item.badge > 0 ? (
          <View style={{ position: "absolute", top: -6, right: -9, backgroundColor: C.loss, minWidth: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
            <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>{item.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 10.5, color: active === item.id ? theme : C.muted, fontWeight: active === item.id ? "700" : "500" }}>{item.label}</Text>
    </Pressable>
  );
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", borderTopWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 9, paddingBottom: insets.bottom + 8 }}>
      {left.map((i) => <Btn key={i.id} item={i} />)}
      <Pressable onPress={onFab} style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: fabColor, alignItems: "center", justifyContent: "center", marginHorizontal: 6, marginTop: -24, boxShadow: "0px 6px 16px rgba(30,122,77,0.4)", elevation: 6 }} testID="fab">
        <Icon name={fabIcon} size={22} color="#fff" />
      </Pressable>
      {right.map((i) => <Btn key={i.id} item={i} />)}
    </View>
  );
}

export default function App() {
  const store = useCoopData();
  const { data, ready } = store;
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState("");
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [openCollab, setOpenCollab] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  if (!ready || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.muted }}>Chargement…</Text>
      </View>
    );
  }

  const logout = () => { setSession(null); setOpenMember(null); setOpenCollab(null); setSheet(null); setTab(""); };

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <Login
          data={data}
          onCreatePlanteur={(m) => { const id = store.createLoginPlanteur(m); setSession({ side: "planteur", memberId: id }); setTab("poids"); }}
          onCreateCoop={(p) => { const id = store.createLoginCoop(p); setSession({ side: "coop", role: "patron", staffId: id }); setTab("bilan"); }}
          onPick={(s) => { setSession(s); setTab(s.side === "planteur" ? "poids" : s.role === "patron" ? "bilan" : s.role === "commis" ? "jour" : "tournee"); }}
        />
      </>
    );
  }

  const me = session.side === "planteur" ? data.members.find((m) => m.id === session.memberId) : data.staff.find((s) => s.id === session.staffId);
  const isCoop = session.side === "coop";
  const role = session.side === "coop" ? session.role : undefined;
  const theme = session.side === "planteur" ? C.green : role === "patron" ? C.lime : C.teal;

  const savePesee = (c: any) => {
    const id = uid();
    const rec = { ...c, seq: data.seq, id };
    delete rec._repay;
    store.addCollection({ ...c, id });
    setSheet(null);
    setReceipt(rec);
  };

  const doRecap = async () => {
    try { await shareCampaign(data); } catch { setNotice("Impossible de générer le récapitulatif."); }
  };
  const doExport = async () => {
    const ok = await exportData(data);
    setNotice(ok ? "Sauvegarde créée. Choisissez où l'enregistrer ou l'envoyer." : "Échec de la sauvegarde.");
  };
  const doRestore = async () => {
    const restored = await importData();
    if (restored) { store.replaceData(restored); setOpenMember(null); setOpenCollab(null); setNotice("Données restaurées avec succès."); }
    else setNotice("Aucune donnée restaurée (fichier invalide ou annulé).");
  };

  const openMemberObj = openMember ? data.members.find((m) => m.id === openMember) : null;
  const pendingLoans = data.loans.filter((l) => l.status === "en_attente").length;

  let body: React.ReactNode = null;
  let nav: React.ReactNode = null;

  if (session.side === "planteur" && me) {
    nav = (
      <NavBar
        theme={C.green}
        active={tab}
        fabIcon="plus"
        fabColor={C.green}
        left={[{ id: "poids", icon: "package", label: "Mes poids" }]}
        right={[{ id: "momo", icon: "smartphone", label: "Mobile Money" }]}
        onTab={setTab}
        onFab={() => setSheet("loan")}
      />
    );
    if (tab === "poids")
      body = (
        <>
          <SubTabs member={me} loans={data.loans} onGoPrets={() => setTab("prets")} />
          <PlanteurPoids member={me} data={data} onReceipt={setReceipt} onSetPhoto={(url: any) => store.setMemberPhoto(me.id, url)} />
        </>
      );
    else if (tab === "prets")
      body = (
        <>
          <Pressable onPress={() => setTab("poids")} style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 12 }}>
            <Icon name="arrow-left" size={15} color={C.cocoa} /><Text style={{ color: C.cocoa, fontWeight: "600", fontSize: 13 }}>Mes poids</Text>
          </Pressable>
          <PlanteurPrets member={me} data={data} onNew={() => setSheet("loan")} />
        </>
      );
    else body = <PlanteurMomo member={me} data={data} onLink={() => setSheet("linkMomo")} onUnlink={() => store.linkMemberMomo(me.id, null)} />;
  } else if (isCoop && role === "patron") {
    nav = (
      <NavBar
        theme={C.lime}
        active={tab}
        fabIcon="scale"
        fabColor={C.green}
        left={[{ id: "bilan", icon: "trending-up", label: "Bilan" }, { id: "planteurs", icon: "users", label: "Planteurs" }]}
        right={[{ id: "collaborateurs", icon: "briefcase", label: "Équipe" }, { id: "coop", icon: "building", label: "Coop", badge: pendingLoans }]}
        onTab={(t) => { setTab(t); setOpenMember(null); setOpenCollab(null); }}
        onFab={() => setSheet("pesee")}
      />
    );
    const collab = openCollab ? data.staff.find((s) => s.id === openCollab) : null;
    if (openMemberObj) body = <MemberDetail member={openMemberObj} data={data} onBack={() => setOpenMember(null)} onReceipt={setReceipt} />;
    else if (tab === "collaborateurs" && collab)
      body = collab.role === "pisteur"
        ? <PisteurRecon pisteur={collab} data={data} onBack={() => setOpenCollab(null)} onNewMandat={() => setSheet("mandat")} onReceipt={setReceipt} onOpen={setOpenMember} onSetPhoto={(url: any) => store.setStaffPhoto(collab.id, url)} />
        : <CommisDetail staff={collab} data={data} onBack={() => setOpenCollab(null)} onReceipt={setReceipt} onOpen={setOpenMember} onSetPhoto={(url: any) => store.setStaffPhoto(collab.id, url)} />;
    else if (tab === "bilan") body = <Dashboard theme={theme} data={data} onReceipt={setReceipt} onOpen={setOpenMember} onOpenPrets={() => setTab("prets")} />;
    else if (tab === "planteurs") body = <Members data={data} onOpen={setOpenMember} onAdd={() => setSheet("member")} />;
    else if (tab === "collaborateurs") body = <Collaborateurs data={data} onOpen={setOpenCollab} onAdd={() => setSheet("collab")} />;
    else if (tab === "prets") body = <PatronPrets data={data} onDecide={(id: string, st: string) => store.decideLoan(id, st, "st_patron")} onBack={() => setTab("bilan")} />;
    else body = <CoopAccount data={data} onAddMomo={() => setSheet("coopMomo")} onDelMomo={store.delCoopMomo} onSettings={() => setSheet("settings")} onReset={store.reset} onOpenPrets={() => setTab("prets")} pendingLoans={pendingLoans} onRecap={doRecap} onExport={doExport} onRestore={doRestore} />;
  } else if (isCoop) {
    const isPisteur = role === "pisteur";
    nav = (
      <NavBar
        theme={C.teal}
        active={tab}
        fabIcon="scale"
        fabColor={C.green}
        left={[{ id: isPisteur ? "tournee" : "jour", icon: "clipboard", label: isPisteur ? "Ma tournée" : "Mes pesées" }]}
        right={[{ id: "planteurs", icon: "users", label: "Planteurs" }]}
        onTab={(t) => { setTab(t); setOpenMember(null); }}
        onFab={() => setSheet("pesee")}
      />
    );
    if (openMemberObj) body = <MemberDetail member={openMemberObj} data={data} onBack={() => setOpenMember(null)} onReceipt={setReceipt} />;
    else if (tab === "planteurs") body = <Members data={data} onOpen={setOpenMember} onAdd={() => setSheet("member")} />;
    else if (isPisteur) body = <PisteurHome theme={theme} data={data} staffId={session.staffId} onNewCollecte={() => setSheet("pesee")} onNewDepense={() => setSheet("depense")} onReceipt={setReceipt} onOpen={setOpenMember} />;
    else body = <CollectorHome theme={theme} data={data} staffId={session.staffId} isPisteur={false} onReceipt={setReceipt} onOpen={setOpenMember} onNew={() => setSheet("pesee")} />;
  }

  const staffId = session.side === "coop" ? session.staffId : "";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <TopBar
        theme={theme}
        me={me}
        isCoop={isCoop}
        role={role}
        onLogout={logout}
        onSettings={isCoop && role === "patron" ? () => setSheet("settings") : null}
        onSetPhoto={(url) => (session.side === "planteur" ? store.setMemberPhoto(session.memberId, url) : store.setStaffPhoto(session.staffId, url))}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      {nav}

      {sheet === "member" ? <MemberSheet onClose={() => setSheet(null)} onSave={(m: any) => { store.addMember(m); setSheet(null); setTab("planteurs"); }} /> : null}
      {sheet === "pesee" ? <PeseeSheet data={data} role={role} staffId={staffId} onClose={() => setSheet(null)} onSave={savePesee} /> : null}
      {sheet === "loan" && session.side === "planteur" ? <LoanSheet onClose={() => setSheet(null)} onSave={(l: any) => { store.addLoan({ memberId: session.memberId, date: new Date().toISOString(), ...l }); setSheet(null); setTab("prets"); }} /> : null}
      {sheet === "settings" ? <SettingsSheet data={data} onClose={() => setSheet(null)} onSave={(p: any) => { store.setPrix(p); setSheet(null); }} onReset={() => { store.reset(); setSheet(null); }} /> : null}
      {sheet === "linkMomo" && session.side === "planteur" ? <LinkMomoSheet title="Lier mon Mobile Money" onClose={() => setSheet(null)} onSave={(mm: any) => { store.linkMemberMomo(session.memberId, mm); setSheet(null); }} /> : null}
      {sheet === "coopMomo" ? <LinkMomoSheet title="Ajouter un compte coop" withLabel onClose={() => setSheet(null)} onSave={(mm: any) => { store.addCoopMomo(mm); setSheet(null); }} /> : null}
      {sheet === "depense" ? <DepenseSheet onClose={() => setSheet(null)} onSave={(x: any) => { store.addDepense({ pisteurId: staffId, ...x }); setSheet(null); }} /> : null}
      {sheet === "mandat" ? <MandatSheet data={data} pisteurId={openCollab} onClose={() => setSheet(null)} onSave={(x: any) => { store.addMandat(x); setSheet(null); }} /> : null}
      {sheet === "collab" ? <CollaborateurSheet onClose={() => setSheet(null)} onSave={(s: any) => { store.addStaff(s); setSheet(null); setTab("collaborateurs"); }} /> : null}
      {receipt ? <Bordereau collection={receipt} member={data.members.find((m) => m.id === receipt.memberId)} saison={data.saison} onClose={() => setReceipt(null)} onSign={(sig) => store.setCollectionSignature(receipt.id, sig)} /> : null}

      <Modal visible={!!notice} transparent animationType="fade" onRequestClose={() => setNotice(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "center", padding: 28 }} onPress={() => setNotice(null)}>
          <Pressable style={{ backgroundColor: "#fff", borderRadius: 18, padding: 20 }} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 14.5, color: C.ink, lineHeight: 21, marginBottom: 16 }}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)} style={{ backgroundColor: C.cocoa, borderRadius: 12, paddingVertical: 12, alignItems: "center" }} testID="notice-ok">
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>D'accord</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
