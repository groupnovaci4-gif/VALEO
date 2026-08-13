import React, { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, COOP_TYPES, CROPS, Culture, Data, OPERATORS, ROLES, Session, totalSuperficie, waNumber } from "./lib";
import { createPinRecord, isValidPin, normalizePhone, normalizeText, verifyPinAsync } from "./pin";
import { getBiometricState, promptBiometric, readSession, saveSession } from "./biometric";
import { Icon } from "./Icon";
import { Card, Chip, CulturesPicker, Field, PhotoAvatar, SaveBtn, Select, TInput } from "./ui";

const VALEO_EMBLEM = require("../../assets/images/adaptive-icon.png");

/* ------------------------------- Top bar --------------------------------- */
export function TopBar({
  theme,
  me,
  isCoop,
  role,
  coopNom,
  onLogout,
  onSettings,
  onSetPhoto,
  onBell,
  bellCount = 0,
}: {
  theme: string;
  me: any;
  isCoop: boolean;
  role?: string;
  coopNom?: string;
  onLogout: () => void;
  onSettings?: (() => void) | null;
  onSetPhoto: (url: string | null) => void;
  onBell?: (() => void) | null;
  bellCount?: number;
}) {
  const insets = useSafeAreaInsets();
  const label = isCoop ? ROLES[role || "patron"].label : "Planteur";
  return (
    <View style={{ backgroundColor: theme, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
          <PhotoAvatar photo={me && me.photo} size={40} editable onChange={onSetPhoto} fallbackIcon={isCoop ? "scale" : "sprout"} fallbackColor={isCoop ? C.teal : C.green} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 15.5, color: "#fff" }} numberOfLines={1}>{me && me.nom}</Text>
            {coopNom ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
                <Icon name="building" size={11} color="rgba(255,255,255,0.85)" />
                <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.92)", fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>{coopNom}</Text>
              </View>
            ) : null}
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", marginTop: 1 }}>{label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onBell ? (
            <Pressable onPress={onBell} style={topIcon} testID="topbar-bell">
              <Icon name="bell" size={17} color="#fff" />
              {bellCount > 0 ? (
                <View style={{ position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: "#E4572E", borderWidth: 1.5, borderColor: theme, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>{bellCount > 9 ? "9+" : bellCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {onSettings ? (
            <Pressable onPress={onSettings} style={topIcon} testID="topbar-settings"><Icon name="settings" size={17} color="#fff" /></Pressable>
          ) : null}
          <Pressable onPress={onLogout} style={topIcon} testID="topbar-logout"><Icon name="log-out" size={17} color="#fff" /></Pressable>
        </View>
      </View>
    </View>
  );
}
const topIcon = { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 8, alignItems: "center" as const, justifyContent: "center" as const };

/* ------------------------------- Login ----------------------------------- */
export function Login({
  data,
  onPick,
  onCreatePlanteur,
  onCreateCoop,
}: {
  data: Data;
  onPick: (s: Session) => void;
  onCreatePlanteur: (m: any) => void;
  onCreateCoop: (p: any) => void;
}) {
  const [tab, setTab] = useState<"coop" | "planteur">("coop");
  const [screen, setScreen] = useState<"home" | "create" | "createCoop">("home");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [bio, setBio] = useState<{ available: boolean; label: string }>({ available: false, label: "empreinte" });
  const [hasSaved, setHasSaved] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      setBio(await getBiometricState());
      setHasSaved(!!(await readSession()));
    })();
  }, []);

  if (screen === "create") return <CreatePlanteur onBack={() => setScreen("home")} onSubmit={onCreatePlanteur} />;
  if (screen === "createCoop") return <CreateCoop onBack={() => setScreen("home")} onSubmit={onCreateCoop} />;

  const switchTab = (t: "coop" | "planteur") => { setTab(t); setErr(""); setPin(""); };
  const pick = async (s: Session) => { await saveSession(s); onPick(s); };

  const doLogin = async () => {
    const dig = normalizePhone(phone);
    if (dig.length < 6) { setErr("Saisissez un numéro de téléphone valide."); return; }
    if (!isValidPin(pin)) { setErr("Le code doit contenir 6 chiffres."); return; }
    if (tab === "coop") {
      const s = data.staff.find((st) => normalizePhone(st.tel) === dig);
      if (!s) { setErr("Aucun compte coopérative pour ce numéro."); return; }
      if (s.pin && !(await verifyPinAsync(pin, s.pin))) { setErr("Code secret incorrect."); return; }
      pick({ side: "coop", role: s.role, staffId: s.id, coopId: s.coopId });
    } else {
      const q = normalizeText(phone);
      const m = data.members.find((mm) => normalizePhone(mm.tel) === dig || normalizeText(mm.code) === q);
      if (!m) { setErr("Aucun planteur pour ce numéro / code."); return; }
      if (m.pin && !(await verifyPinAsync(pin, m.pin))) { setErr("Code secret incorrect."); return; }
      pick({ side: "planteur", memberId: m.id, coopId: m.coopId });
    }
  };

  const doBiometric = async () => {
    const saved = await readSession();
    if (!saved) { Alert.alert("Biométrie", "Connectez-vous d'abord avec votre code une première fois."); return; }
    const ok = await promptBiometric();
    if (ok) onPick(saved);
  };

  const doForgot = async () => {
    const wa = waNumber(phone);
    if (!wa) { Alert.alert("Code oublié", "Saisissez d'abord votre numéro de téléphone (WhatsApp)."); return; }
    const msg = encodeURIComponent("Bonjour, j'ai oublié mon code secret VALEO. Merci de m'aider à le récupérer / réinitialiser.");
    try { await Linking.openURL(`https://wa.me/${wa}?text=${msg}`); }
    catch { Alert.alert("WhatsApp", "Impossible d'ouvrir WhatsApp sur cet appareil."); }
  };


  const isCoop = tab === "coop";
  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: insets.top + 20, paddingHorizontal: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Image source={VALEO_EMBLEM} style={{ width: 82, height: 82 }} resizeMode="contain" />
        <Text style={{ marginTop: 8, fontSize: 11, fontWeight: "700", letterSpacing: 3, color: C.muted }}>TRACER. GÉRER. VALORISER.</Text>
      </View>

      <View style={{ flexDirection: "row", backgroundColor: "#ECEFEA", borderRadius: 14, padding: 5, marginBottom: 18 }}>
        {([["coop", "Espace Coopérative"], ["planteur", "Espace Planteur"]] as const).map(([k, lab]) => (
          <Pressable key={k} onPress={() => switchTab(k)} testID={`tab-${k}`} style={{ flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: "center", backgroundColor: tab === k ? "#fff" : "transparent", boxShadow: tab === k ? "0px 1px 4px rgba(30,20,12,0.12)" : undefined }}>
            <Text style={{ fontWeight: "800", fontSize: 13, color: tab === k ? C.ink : C.muted }}>{lab}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ alignItems: "center", marginBottom: 18 }}>
        <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: "#DCEBE1", alignItems: "center", justifyContent: "center" }}>
          <Icon name={isCoop ? "building" : "sprout"} size={28} color={C.green} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: "900", color: C.ink, marginTop: 12 }}>{isCoop ? "Connexion Coopérative" : "Connexion Planteur"}</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{isCoop ? "Gérez la collecte et les paiements" : "Suivez vos livraisons et paiements"}</Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginBottom: 7 }}>Numéro de téléphone</Text>
      <View style={fieldWrap}>
        <Icon name="phone" size={18} color={C.muted} />
        <TInput value={phone} onChangeText={(t) => { setPhone(t.replace(/[^\d]/g, "")); setErr(""); }} placeholder="ex. 07 00 00 00 01" keyboardType="phone-pad" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }} />
      </View>

      <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginTop: 14, marginBottom: 7 }}>Code secret à 6 chiffres</Text>
      <View style={fieldWrap}>
        <Icon name="key" size={18} color={C.muted} />
        <TInput value={pin} onChangeText={(t) => { setPin(t.replace(/\D/g, "").slice(0, 6)); setErr(""); }} placeholder="••••••" keyboardType="number-pad" secureTextEntry={!showPin} maxLength={6} onSubmitEditing={doLogin} returnKeyType="go" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0, letterSpacing: 4 }} />
        <Pressable onPress={() => setShowPin((v) => !v)} hitSlop={8} testID="toggle-pin"><Icon name={showPin ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
        <Pressable onPress={doForgot} testID="forgot"><Text style={{ fontSize: 13, fontWeight: "700", color: C.green }}>Code oublié ?</Text></Pressable>
      </View>

      {err ? <Text style={{ color: C.rust, fontSize: 12.5, marginTop: 8 }}>{err}</Text> : null}

      <SaveBtn color={C.greenDark} style={{ marginTop: 14 }} onPress={doLogin}>Se connecter</SaveBtn>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
        <Text style={{ fontSize: 12.5, color: C.muted }}>ou</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
      </View>

      <Pressable onPress={doBiometric} testID="biometric" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingVertical: 15, backgroundColor: "#fff", opacity: bio.available && hasSaved ? 1 : 0.55 }}>
        <Icon name="fingerprint" size={22} color={C.greenDark} />
        <Text style={{ fontWeight: "800", fontSize: 14.5, color: C.ink }}>Se connecter avec l&apos;empreinte</Text>
      </Pressable>

      <Pressable onPress={() => setScreen(isCoop ? "createCoop" : "create")} testID={isCoop ? "create-coop" : "create-planteur"} style={{ marginTop: 14, backgroundColor: "#DCEBE1", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon name={isCoop ? "building" : "user-plus"} size={17} color={C.green} />
        <Text style={{ fontWeight: "800", fontSize: 14, color: C.green }}>{isCoop ? "Créer une coopérative" : "Créer un compte planteur"}</Text>
      </Pressable>

      <View style={{ flex: 1 }} />
      <Text style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 24 }}>© 2026 Valeo. Tous droits réservés.</Text>
    </KeyboardAwareScrollView>
  );
}
const fieldWrap = { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 3 };

/* ----------------------------- Create screens ---------------------------- */
function AuthHeader({ title, sub, onBack, theme }: { title: string; sub: string; onBack: () => void; theme: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: theme, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
      <Pressable onPress={onBack} style={[topIcon, { alignSelf: "flex-start", marginBottom: 12 }]} testID="auth-back"><Icon name="arrow-left" size={18} color="#fff" /></Pressable>
      <Text style={{ fontWeight: "800", fontSize: 20, color: "#fff" }}>{title}</Text>
      <Text style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function CreatePlanteur({ onBack, onSubmit }: { onBack: () => void; onSubmit: (m: any) => void }) {
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [village, setVillage] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [cultures, setCultures] = useState<Culture[]>([]);
  const [tel, setTel] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [withMomo, setWithMomo] = useState(false);
  const [operator, setOperator] = useState("orange");
  const [number, setNumber] = useState("");
  const pinOk = isValidPin(pin) && pin === pin2;
  const valid = nom.trim() && village.trim() && idNumber.trim() && pinOk;
  const submit = async () => {
    const momo = withMomo && number.trim().length >= 8 ? { operator, number: number.trim() } : null;
    const pinRec = await createPinRecord(pin);
    onSubmit({ nom: nom.trim(), village: village.trim(), idNumber: idNumber.trim(), cultures, cropId: cultures[0]?.cropId || "cacao", superficie: totalSuperficie({ cultures }), tel: tel.trim() || (momo ? momo.number : ""), momo, photo, pin: pinRec });
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthHeader title="Créer un compte planteur" sub="Un code planteur unique vous sera attribué" onBack={onBack} theme={C.green} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <PhotoAvatar photo={photo} size={72} editable onChange={setPhoto} fallbackColor={C.green} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 13.5 }}>Photo du planteur</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>Facultatif — prendre ou importer</Text>
          </View>
        </View>
        <Field label="Nom & prénoms"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Kouassi Yao" /></Field>
        <Field label="Numéro de pièce d'identité"><TInput value={idNumber} onChangeText={setIdNumber} placeholder="Ex. CI 003 451 2" /></Field>
        <Field label="Localité / village"><TInput value={village} onChangeText={setVillage} placeholder="Ex. Sikensi" /></Field>
        <Field label="Cultures & superficies (plusieurs possibles)">
          <CulturesPicker value={cultures} onChange={setCultures} />
        </Field>
        <Field label="Téléphone"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Code secret (6 chiffres)" flex><TInput value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
          <Field label="Confirmer le code" flex><TInput value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
        </View>
        {pin && pin2 && pin !== pin2 ? <Text style={{ color: C.rust, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux codes ne correspondent pas.</Text> : null}

        <Pressable onPress={() => setWithMomo(!withMomo)} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#EDF5F0", alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={18} color={C.green} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 13.5 }}>Lier un compte Mobile Money</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>Facultatif — pour recevoir vos paiements</Text>
          </View>
          <View style={{ width: 42, height: 24, borderRadius: 20, backgroundColor: withMomo ? C.green : "#D9D2C7", justifyContent: "center" }}>
            <View style={{ width: 18, height: 18, borderRadius: 10, backgroundColor: "#fff", marginLeft: withMomo ? 21 : 3 }} />
          </View>
        </Pressable>

        {withMomo ? (
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", marginBottom: 6 }}>Opérateur</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {OPERATORS.map((o) => (
                <Pressable key={o.id} onPress={() => setOperator(o.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 11, borderWidth: operator === o.id ? 2 : 1, borderColor: operator === o.id ? o.color : C.line, backgroundColor: "#fff", width: "47%" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: o.color, alignItems: "center", justifyContent: "center" }}><Icon name="smartphone" size={13} color={o.ink} /></View>
                  <Text style={{ fontWeight: "700", fontSize: 12.5 }}>{o.nom}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: "600", marginBottom: 6 }}>Numéro Mobile Money</Text>
            <TInput value={number} onChangeText={setNumber} keyboardType="phone-pad" placeholder="07 00 00 00 00" />
          </Card>
        ) : null}

        <View style={{ backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Votre compte est lié à la coopérative. Un <Text style={{ fontWeight: "700" }}>code planteur</Text> unique vous sera attribué automatiquement.</Text>
        </View>
        <SaveBtn disabled={!valid} color={C.green} onPress={submit}>Créer mon compte & continuer</SaveBtn>
      </KeyboardAwareScrollView>
    </View>
  );
}

function CreateCoop({ onBack, onSubmit }: { onBack: () => void; onSubmit: (p: any) => void }) {
  const insets = useSafeAreaInsets();
  // Identité
  const [photo, setPhoto] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [sigle, setSigle] = useState("");
  const [agrement, setAgrement] = useState("");
  const [type, setType] = useState(COOP_TYPES[0]);
  const [dateCreation, setDateCreation] = useState("");
  const [filieres, setFilieres] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  // Coordonnées
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [departement, setDepartement] = useState("");
  const [commune, setCommune] = useState("");
  const [localite, setLocalite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  // Responsable
  const [rphoto, setRphoto] = useState<string | null>(null);
  const [rnom, setRnom] = useState("");
  const [rprenoms, setRprenoms] = useState("");
  const [rfonction, setRfonction] = useState("");
  const [rtel, setRtel] = useState("");
  const [remail, setRemail] = useState("");
  const [rid, setRid] = useState("");
  const [rpin, setRpin] = useState("");
  const [rpin2, setRpin2] = useState("");

  const toggleFiliere = (id: string) => setFilieres((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const pinOk = isValidPin(rpin) && rpin === rpin2;
  const valid = nom.trim() && rnom.trim() && rprenoms.trim() && rtel.trim() && pinOk;

  const submit = async () => {
    const pinRec = await createPinRecord(rpin);
    onSubmit({
      coop: {
        nom: nom.trim(), sigle: sigle.trim(), agrement: agrement.trim(), type, dateCreation: dateCreation.trim(),
        filieres, photo, description: description.trim(),
        region: region.trim(), district: district.trim(), departement: departement.trim(), commune: commune.trim(),
        localite: localite.trim(), adresse: adresse.trim(), tel: tel.trim(), email: email.trim(),
      },
      responsable: {
        nom: rnom.trim(), prenoms: rprenoms.trim(), fonction: rfonction.trim(), tel: rtel.trim(),
        email: remail.trim(), idNumber: rid.trim(), photo: rphoto, pin: pinRec,
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthHeader title="Créer une coopérative" sub="Renseignez l'identité, les coordonnées et le responsable" onBack={onBack} theme={C.teal} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">

        <SectionLabel icon="building" text="Identité de la coopérative" color={C.teal} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <PhotoAvatar photo={photo} size={72} editable onChange={setPhoto} fallbackIcon="building" fallbackColor={C.teal} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 13.5 }}>Logo / photo de la coopérative</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>Facultatif</Text>
          </View>
        </View>
        <Field label="Nom officiel *"><TInput value={nom} onChangeText={setNom} placeholder="Ex. Société Coopérative COOPAGRI" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Sigle / nom commercial" flex><TInput value={sigle} onChangeText={setSigle} placeholder="Ex. COOPAGRI" /></Field>
          <Field label="Date de création" flex><TInput value={dateCreation} onChangeText={setDateCreation} placeholder="JJ/MM/AAAA" /></Field>
        </View>
        <Field label="N° d'enregistrement / agrément"><TInput value={agrement} onChangeText={setAgrement} placeholder="Ex. CI-COOP-2020-01234" /></Field>
        <Field label="Type de coopérative">
          <Select value={type} onChange={setType} options={COOP_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Filières exploitées">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {CROPS.map((c) => <Chip key={c.id} label={c.nom} emoji={c.emoji} active={filieres.includes(c.id)} onPress={() => toggleFiliere(c.id)} />)}
          </View>
        </Field>
        <Field label="Description / présentation">
          <TInput value={description} onChangeText={setDescription} placeholder="Quelques mots sur la coopérative" multiline numberOfLines={3} style={{ minHeight: 76, textAlignVertical: "top" }} />
        </Field>

        <SectionLabel icon="map-pin" text="Coordonnées" color={C.gold} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Région" flex><TInput value={region} onChangeText={setRegion} placeholder="Ex. Agnéby-Tiassa" /></Field>
          <Field label="District" flex><TInput value={district} onChangeText={setDistrict} placeholder="Ex. Lagunes" /></Field>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Département" flex><TInput value={departement} onChangeText={setDepartement} placeholder="Ex. Sikensi" /></Field>
          <Field label="Commune" flex><TInput value={commune} onChangeText={setCommune} placeholder="Ex. Sikensi" /></Field>
        </View>
        <Field label="Localité / village"><TInput value={localite} onChangeText={setLocalite} placeholder="Ex. Gomon" /></Field>
        <Field label="Adresse"><TInput value={adresse} onChangeText={setAdresse} placeholder="Ex. Quartier, rue…" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Téléphone" flex><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
          <Field label="Email" flex><TInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="coop@email.com" /></Field>
        </View>

        <SectionLabel icon="user" text="Responsable (Patron)" color={C.green} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <PhotoAvatar photo={rphoto} size={72} editable onChange={setRphoto} fallbackIcon="user" fallbackColor={C.green} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "700", fontSize: 13.5 }}>Photo du responsable</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>Facultatif</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Nom *" flex><TInput value={rnom} onChangeText={setRnom} placeholder="Ex. Diomandé" /></Field>
          <Field label="Prénoms *" flex><TInput value={rprenoms} onChangeText={setRprenoms} placeholder="Ex. Mamadou" /></Field>
        </View>
        <Field label="Fonction"><TInput value={rfonction} onChangeText={setRfonction} placeholder="Ex. Président / Gérant" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Téléphone *" flex><TInput value={rtel} onChangeText={setRtel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
          <Field label="Email" flex><TInput value={remail} onChangeText={setRemail} keyboardType="email-address" autoCapitalize="none" placeholder="nom@email.com" /></Field>
        </View>
        <Field label="Pièce d'identité"><TInput value={rid} onChangeText={setRid} placeholder="Ex. CNI CI 003 451 2" /></Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Code secret (6 chiffres) *" flex><TInput value={rpin} onChangeText={(t) => setRpin(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
          <Field label="Confirmer le code *" flex><TInput value={rpin2} onChangeText={(t) => setRpin2(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" /></Field>
        </View>
        {rpin && rpin2 && rpin !== rpin2 ? <Text style={{ color: C.rust, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux codes ne correspondent pas.</Text> : null}

        <View style={{ backgroundColor: "#EAF3EF", borderWidth: 1, borderColor: "#CFE6E0", borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Vous serez connecté comme <Text style={{ fontWeight: "700" }}>Patron / Acheteur</Text>. Les champs marqués <Text style={{ fontWeight: "700" }}>*</Text> sont obligatoires.</Text>
        </View>
        <SaveBtn disabled={!valid} color={C.teal} onPress={submit}>Créer & accéder au tableau de bord</SaveBtn>
      </KeyboardAwareScrollView>
    </View>
  );
}

const SectionLabel = ({ icon, text, color }: { icon: string; text: string; color: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 12 }}>
    <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={16} color={color} />
    </View>
    <Text style={{ fontSize: 14.5, fontWeight: "800", color: C.ink }}>{text}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line, marginLeft: 4 }} />
  </View>
);
