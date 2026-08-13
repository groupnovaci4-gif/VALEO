import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { AppState, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, Session, fF, scopeData, uid } from "@/src/coop/lib";
import { Icon } from "@/src/coop/Icon";
import { Login, TopBar } from "@/src/coop/auth";
import {
  CollaborateurSheet,
  DepenseSheet,
  LinkMomoSheet,
  LoanApproveSheet,
  LoanSheet,
  MandatSheet,
  MemberSheet,
  PeseeSheet,
  ResetPinSheet,
  SettingsSheet,
  SettlementReceipt,
  StockSheet,
  Bordereau,
} from "@/src/coop/sheets";
import {
  ActivityLog,
  buildNotifications,
  CoopAccount,
  Collaborateurs,
  CollectorHome,
  CocoaHero,
  CommisDetail,
  Dashboard,
  Members,
  MemberDetail,
  NotificationsSheet,
  PatronPrets,
  PisteurHome,
  PisteurRecon,
  PlanteurMomo,
  PlanteurPoids,
  PlanteurPrets,
  SubTabs,
} from "@/src/coop/screens";
import { QuickActions, PartnersBanner } from "@/src/coop/home";
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
  const { data: raw, ready } = store;
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState("");
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [openCollab, setOpenCollab] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approveLoanObj, setApproveLoanObj] = useState<any>(null);
  const [editMember, setEditMember] = useState<any>(null);
  const [editCollab, setEditCollab] = useState<any>(null);
  const [resetTarget, setResetTarget] = useState<{ kind: "member" | "staff"; id: string; name: string } | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [settlementReceipt, setSettlementReceipt] = useState<any>(null);
  const [confirm, setConfirm] = useState<{ msg: string; onYes: () => void; yesLabel?: string; yesColor?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") store.refresh();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await store.refresh();
    setRefreshing(false);
  };

  useEffect(() => {
    const coopId = session && (session.side === "coop" || session.side === "planteur") ? session.coopId || "" : "";
    store.setCoopScope(coopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!ready || !raw) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.muted }}>Chargement…</Text>
      </View>
    );
  }

  const logout = () => { setSession(null); setOpenMember(null); setOpenCollab(null); setSheet(null); setTab(""); setEditMember(null); setEditCollab(null); setApproveLoanObj(null); setResetTarget(null); setConfirm(null); setShowNotif(false); setSettlementReceipt(null); };

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <Login
          data={raw}
          onCreatePlanteur={(m) => { const id = store.createLoginPlanteur(m); setSession({ side: "planteur", memberId: id }); setTab("poids"); }}
          onCreateCoop={(p) => { const res = store.createLoginCoop(p); setSession({ side: "coop", role: "patron", staffId: res.staffId, coopId: res.coopId }); setTab("bilan"); }}
          onPick={(s) => { setSession(s); setTab(s.side === "planteur" ? "poids" : s.role === "patron" ? "bilan" : s.role === "commis" ? "jour" : "tournee"); }}
        />
      </>
    );
  }

  const isCoop = session.side === "coop";
  const data = isCoop ? scopeData(raw, session.coopId) : raw;
  const me = session.side === "planteur" ? data.members.find((m) => m.id === session.memberId) : data.staff.find((s) => s.id === session.staffId);
  const role = session.side === "coop" ? session.role : undefined;
  const theme = session.side === "planteur" ? C.green : role === "patron" ? C.lime : C.teal;

  const savePesee = (c: any) => {
    const id = uid();
    const settleReq = Number(c._settle) || 0;
    const rec: any = { ...c, seq: data.seq, id };
    if (settleReq > 0) rec.oldRegle = settleReq;
    delete rec._repay;
    delete rec._settle;
    store.addCollection({ ...c, id });
    setSheet(null);
    setReceipt(rec);
  };

  const doRecap = async () => {
    try { await shareCampaign(data); } catch { setNotice("Impossible de générer le récapitulatif."); }
  };
  const doVillageRecap = async (village: string) => {
    try { await shareCampaign(data, { village }); } catch { setNotice("Impossible de générer le bilan du village."); }
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
  const staffIdNow = session.side === "coop" ? session.staffId : "";
  const settleMemberFn = (m: any, reste: number) =>
    setConfirm({
      msg: `Solder le reste dû de ${m.nom} (${fF(reste)}) ? Un reçu sera généré et le planteur sera marqué comme payé.`,
      yesLabel: "Solder",
      yesColor: C.green,
      onYes: () => {
        const receiptS = store.settleMemberDue(m.id, staffIdNow, "espece");
        setConfirm(null);
        if (receiptS) setSettlementReceipt(receiptS);
        setNotice("Reste dû soldé. Reçu généré.");
      },
    });
  const notif = buildNotifications(data, session);
  const coopNom = (raw.coops || []).find((c) => c.id === session.coopId)?.nom || data.coop?.nom || "";

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
          <QuickActions
            actions={[
              { icon: "piggy-bank", label: "Demander prêt", color: C.gold, onPress: () => setSheet("loan") },
              { icon: "wallet", label: "Mes prêts", color: C.green, onPress: () => setTab("prets") },
              { icon: "smartphone", label: "Mobile Money", color: C.teal, onPress: () => setTab("momo") },
            ]}
          />
          <SubTabs member={me} loans={data.loans} onGoPrets={() => setTab("prets")} />
          <PlanteurPoids member={me} data={data} onReceipt={setReceipt} onSetPhoto={(url: any) => store.setMemberPhoto(me.id, url)} />
          <PartnersBanner />
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
    const editMemberFn = (m: any) => { setEditMember(m); setSheet("member"); };
    const deleteMemberFn = (m: any) => setConfirm({ msg: `Supprimer le planteur ${m.nom} ? Ses collectes et prêts seront aussi supprimés.`, onYes: () => { store.deleteMember(m.id); setOpenMember(null); setConfirm(null); } });
    const editCollabFn = (s: any) => { setEditCollab(s); setSheet("collab"); };
    const deleteCollabFn = (s: any) => setConfirm({ msg: `Supprimer le collaborateur ${s.nom} ?`, onYes: () => { store.deleteStaff(s.id); setOpenCollab(null); setConfirm(null); } });
    const resetMemberFn = (m: any) => setResetTarget({ kind: "member", id: m.id, name: m.nom });
    const resetCollabFn = (s: any) => setResetTarget({ kind: "staff", id: s.id, name: s.nom });
    if (openMemberObj) body = <MemberDetail member={openMemberObj} data={data} onBack={() => setOpenMember(null)} onReceipt={setReceipt} onEdit={editMemberFn} onDelete={deleteMemberFn} onResetPin={resetMemberFn} onSettle={settleMemberFn} />;
    else if (tab === "collaborateurs" && collab)
      body = collab.role === "pisteur"
        ? <PisteurRecon pisteur={collab} data={data} onBack={() => setOpenCollab(null)} onNewMandat={() => setSheet("mandat")} onReceipt={setReceipt} onOpen={setOpenMember} onSetPhoto={(url: any) => store.setStaffPhoto(collab.id, url)} onEdit={editCollabFn} onDelete={deleteCollabFn} onResetPin={resetCollabFn} />
        : <CommisDetail staff={collab} data={data} onBack={() => setOpenCollab(null)} onReceipt={setReceipt} onOpen={setOpenMember} onSetPhoto={(url: any) => store.setStaffPhoto(collab.id, url)} onEdit={editCollabFn} onDelete={deleteCollabFn} onResetPin={resetCollabFn} />;
    else if (tab === "bilan") body = (
      <>
        <Dashboard
          theme={theme}
          data={data}
          onReceipt={setReceipt}
          onOpen={setOpenMember}
          onPeser={() => setSheet("pesee")}
          onPlanteurs={() => setTab("planteurs")}
          onStock={() => setSheet("stock")}
          onPrets={() => setTab("prets")}
          onOpenJournal={() => setTab("journal")}
        />
        <PartnersBanner />
      </>
    );
    else if (tab === "journal") body = <ActivityLog data={data} onBack={() => setTab("bilan")} />;
    else if (tab === "planteurs") body = <Members data={data} onOpen={setOpenMember} onAdd={() => setSheet("member")} onVillageRecap={doVillageRecap} />;
    else if (tab === "collaborateurs") body = <Collaborateurs data={data} onOpen={setOpenCollab} onAdd={() => setSheet("collab")} />;
    else if (tab === "prets") body = <PatronPrets data={data} onApprove={(l: any) => setApproveLoanObj(l)} onRefuse={(id: string) => store.refuseLoan(id, session.staffId)} onNew={() => setSheet("loan")} onBack={() => setTab("bilan")} />;
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
    if (openMemberObj) body = <MemberDetail member={openMemberObj} data={data} onBack={() => setOpenMember(null)} onReceipt={setReceipt} onSettle={settleMemberFn} />;
    else if (tab === "planteurs") body = <Members data={data} onOpen={setOpenMember} onAdd={() => setSheet("member")} onVillageRecap={doVillageRecap} />;
    else if (isPisteur) body = (
      <>
        <PisteurHome theme={theme} data={data} staffId={session.staffId} onNew={() => setSheet("pesee")} onNewDepense={() => setSheet("depense")} onReceipt={setReceipt} onOpen={setOpenMember} onPlanteurs={() => setTab("planteurs")} onStock={() => setSheet("stock")} />
        <CocoaHero />
        <PartnersBanner />
      </>
    );
    else body = (
      <>
        <CollectorHome theme={theme} data={data} staffId={session.staffId} isPisteur={false} onReceipt={setReceipt} onOpen={setOpenMember} onNew={() => setSheet("pesee")} onPlanteurs={() => setTab("planteurs")} onStock={() => setSheet("stock")} />
        <CocoaHero />
        <PartnersBanner />
      </>
    );
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
        coopNom={coopNom}
        onLogout={logout}
        onSettings={isCoop && role === "patron" ? () => setSheet("settings") : null}
        onBell={() => setShowNotif(true)}
        bellCount={notif.count}
        onSetPhoto={(url) => (session.side === "planteur" ? store.setMemberPhoto(session.memberId, url) : store.setStaffPhoto(session.staffId, url))}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme} colors={[theme]} />}>
        {body}
      </ScrollView>
      {nav}

      {sheet === "member" ? <MemberSheet initial={editMember} onClose={() => { setSheet(null); setEditMember(null); }} onSave={(m: any) => { if (editMember) store.updateMember(editMember.id, m); else { store.addMember(m); setTab("planteurs"); } setSheet(null); setEditMember(null); }} /> : null}
      {sheet === "pesee" ? <PeseeSheet data={data} role={role} staffId={staffId} onClose={() => setSheet(null)} onSave={savePesee} /> : null}
      {sheet === "loan" && session.side === "planteur" ? <LoanSheet data={data} fixedMember={me} onClose={() => setSheet(null)} onSave={(l: any) => { store.addLoan({ ...l, memberId: session.memberId, date: new Date().toISOString() }); setSheet(null); setTab("prets"); }} /> : null}
      {sheet === "loan" && session.side === "coop" ? <LoanSheet data={data} onClose={() => setSheet(null)} onSave={(l: any) => { store.addLoan({ date: new Date().toISOString(), ...l }); setSheet(null); }} /> : null}
      {sheet === "settings" ? <SettingsSheet data={data} onClose={() => setSheet(null)} onSave={(p: any) => { store.setCoopSettings(p); setSheet(null); }} onReset={() => { store.reset(); setSheet(null); }} /> : null}
      {sheet === "stock" ? <StockSheet data={data} staffId={staffId} scope={role === "patron" ? "all" : "mine"} onClose={() => setSheet(null)} /> : null}
      {sheet === "linkMomo" && session.side === "planteur" ? <LinkMomoSheet title="Lier mon Mobile Money" onClose={() => setSheet(null)} onSave={(mm: any) => { store.linkMemberMomo(session.memberId, mm); setSheet(null); }} /> : null}
      {sheet === "coopMomo" ? <LinkMomoSheet title="Ajouter un compte coop" withLabel onClose={() => setSheet(null)} onSave={(mm: any) => { store.addCoopMomo(mm); setSheet(null); }} /> : null}
      {sheet === "depense" ? <DepenseSheet onClose={() => setSheet(null)} onSave={(x: any) => { store.addDepense({ pisteurId: staffId, ...x }); setSheet(null); }} /> : null}
      {sheet === "mandat" ? <MandatSheet data={data} pisteurId={openCollab} onClose={() => setSheet(null)} onSave={(x: any) => { store.addMandat(x); setSheet(null); }} /> : null}
      {sheet === "collab" ? <CollaborateurSheet initial={editCollab} onClose={() => { setSheet(null); setEditCollab(null); }} onSave={(s: any) => { if (editCollab) store.updateStaff(editCollab.id, s); else { store.addStaff(s); setTab("collaborateurs"); } setSheet(null); setEditCollab(null); }} /> : null}
      {approveLoanObj ? <LoanApproveSheet loan={approveLoanObj} memberName={data.members.find((m) => m.id === approveLoanObj.memberId)?.nom || "—"} onClose={() => setApproveLoanObj(null)} onApprove={(granted: number, mode: string) => { store.approveLoan(approveLoanObj.id, granted, mode, staffId); setApproveLoanObj(null); }} /> : null}
      {resetTarget ? <ResetPinSheet name={resetTarget.name} onClose={() => setResetTarget(null)} onSave={(rec: any) => { if (resetTarget.kind === "member") store.updateMember(resetTarget.id, { pin: rec }); else store.updateStaff(resetTarget.id, { pin: rec }); setResetTarget(null); setNotice("Code secret réinitialisé avec succès."); }} /> : null}
      {receipt ? <Bordereau collection={receipt} member={data.members.find((m) => m.id === receipt.memberId)} saison={data.saison} onClose={() => setReceipt(null)} onSign={(sig) => store.setCollectionSignature(receipt.id, sig)} onNotice={setNotice} /> : null}
      {settlementReceipt ? <SettlementReceipt settlement={settlementReceipt} member={data.members.find((m) => m.id === settlementReceipt.memberId)} saison={data.saison} agent={data.staff.find((s) => s.id === settlementReceipt.byStaffId)?.nom || "—"} onClose={() => setSettlementReceipt(null)} onNotice={setNotice} /> : null}
      {showNotif ? <NotificationsSheet items={notif.items} onClose={() => setShowNotif(false)} /> : null}

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

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(30,20,12,0.5)", justifyContent: "center", padding: 28 }} onPress={() => setConfirm(null)}>
          <Pressable style={{ backgroundColor: "#fff", borderRadius: 18, padding: 20 }} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 14.5, color: C.ink, lineHeight: 21, marginBottom: 16 }}>{confirm?.msg}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setConfirm(null)} style={{ flex: 1, backgroundColor: "#F2EEE7", borderRadius: 12, paddingVertical: 12, alignItems: "center" }} testID="confirm-cancel">
                <Text style={{ color: C.ink, fontWeight: "700", fontSize: 15 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={() => confirm?.onYes()} style={{ flex: 1, backgroundColor: confirm?.yesColor || C.loss, borderRadius: 12, paddingVertical: 12, alignItems: "center" }} testID="confirm-yes">
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{confirm?.yesLabel || "Supprimer"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
