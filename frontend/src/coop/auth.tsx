import React, { useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, MEMBER_CODE_RE, ROLES, Session, waNumber } from "./lib";
import { isValidPassword, isValidPin, normalizePhone } from "./pin";
import { Icon } from "./Icon";
import { VALEO_LOGO } from "./brand";
import { Field, PhotoAvatar, SaveBtn, TInput } from "./ui";

// Logo officiel, via la source unique `brand.ts` : remplacer le fichier
// suffit à mettre à jour l'appli partout.

// Le planteur se connecte avec son téléphone OU son identifiant VAL-XXXX-YY :
// le backend accepte les deux (server.py, planteur_login).
const isPlanteurIdentifier = (v: string): boolean =>
  MEMBER_CODE_RE.test((v || "").trim().toUpperCase()) || normalizePhone(v).length >= 6;

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
  onLogin,
  authLoginCoop,
  authLoginPlanteur,
  authRegisterCoop,
}: {
  onLogin: (s: Session) => void;
  authLoginCoop: (identifier: string, secret: string) => Promise<Session>;
  authLoginPlanteur: (phone: string, pin: string) => Promise<Session>;
  authRegisterCoop: (p: { nom: string; email: string; password: string }) => Promise<Session>;
}) {
  const [tab, setTab] = useState<"coop" | "planteur">("coop");
  const [screen, setScreen] = useState<"home" | "createCoop">("home");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const insets = useSafeAreaInsets();

  if (screen === "createCoop") return <CreateCoop onBack={() => setScreen("home")} onRegister={authRegisterCoop} onDone={onLogin} />;

  const switchTab = (t: "coop" | "planteur") => { setTab(t); setErr(""); setPin(""); setPass(""); };

  const doLogin = async () => {
    if (busy) return;
    setErr("");
    try {
      if (tab === "coop") {
        const ident = email.trim();
        if (ident.includes("@")) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident)) { setErr("Saisissez une adresse e-mail valide."); return; }
          if (!isValidPassword(pass)) { setErr("Mot de passe : au moins 6 caractères."); return; }
        } else {
          if (normalizePhone(ident).length < 6) { setErr("Saisissez votre e-mail (Patron) ou votre téléphone (membre)."); return; }
          if (!isValidPin(pass)) { setErr("Le code doit contenir 6 chiffres."); return; }
        }
        setBusy(true);
        onLogin(await authLoginCoop(ident, pass));
      } else {
        const ident = phone.trim();
        if (!isPlanteurIdentifier(ident)) { setErr("Saisissez votre téléphone ou votre identifiant VAL-XXXX-YY."); return; }
        if (!isValidPin(pin)) { setErr("Le code doit contenir 6 chiffres."); return; }
        setBusy(true);
        onLogin(await authLoginPlanteur(phone.trim(), pin));
      }
    } catch (e: any) {
      setErr(e?.message || "Erreur de connexion.");
    } finally {
      setBusy(false);
    }
  };

  const doForgot = async () => {
    if (tab === "coop") { Alert.alert("Mot de passe oublié", "Contactez l'administrateur VALEO pour réinitialiser votre mot de passe."); return; }
    const wa = normalizePhone(phone).length >= 6 ? waNumber(phone) : null;
    if (!wa) { Alert.alert("Code oublié", "Saisissez d'abord votre numéro de téléphone (WhatsApp) pour contacter votre coopérative."); return; }
    const msg = encodeURIComponent("Bonjour, j'ai oublié mon code secret VALEO. Merci de m'aider à le récupérer / réinitialiser.");
    try { await Linking.openURL(`https://wa.me/${wa}?text=${msg}`); }
    catch { Alert.alert("WhatsApp", "Impossible d'ouvrir WhatsApp sur cet appareil."); }
  };


  const isCoop = tab === "coop";
  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: insets.top + 20, paddingHorizontal: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Image source={VALEO_LOGO} style={{ width: 132, height: 132 }} resizeMode="contain" />
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

      {isCoop ? (
        <>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginBottom: 7 }}>E-mail (Patron) ou téléphone (membre)</Text>
          <View style={fieldWrap}>
            <Icon name="mail" size={18} color={C.muted} />
            <TInput value={email} onChangeText={(t) => { setEmail(t.trim()); setErr(""); }} placeholder="e-mail ou n° de téléphone" autoCapitalize="none" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginTop: 14, marginBottom: 7 }}>Mot de passe ou code secret</Text>
          <View style={fieldWrap}>
            <Icon name="key" size={18} color={C.muted} />
            <TInput value={pass} onChangeText={(t) => { setPass(t); setErr(""); }} placeholder="Mot de passe (Patron) ou code 6 chiffres" secureTextEntry={!showPin} onSubmitEditing={doLogin} returnKeyType="go" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }} />
            <Pressable onPress={() => setShowPin((v) => !v)} hitSlop={8} testID="toggle-pin"><Icon name={showPin ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginBottom: 7 }}>Téléphone ou identifiant planteur</Text>
          <View style={fieldWrap}>
            <Icon name="phone" size={18} color={C.muted} />
            <TInput value={phone} onChangeText={(t) => { setPhone(t.replace(/[^\dA-Za-z-]/g, "").toUpperCase()); setErr(""); }} placeholder="ex. 07 00 00 00 01 ou VAL-1234-AB" autoCapitalize="characters" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, marginTop: 14, marginBottom: 7 }}>Code secret à 6 chiffres</Text>
          <View style={fieldWrap}>
            <Icon name="key" size={18} color={C.muted} />
            <TInput value={pin} onChangeText={(t) => { setPin(t.replace(/\D/g, "").slice(0, 6)); setErr(""); }} placeholder="••••••" keyboardType="number-pad" secureTextEntry={!showPin} maxLength={6} onSubmitEditing={doLogin} returnKeyType="go" style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0, letterSpacing: 4 }} />
            <Pressable onPress={() => setShowPin((v) => !v)} hitSlop={8} testID="toggle-pin"><Icon name={showPin ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>
          </View>
        </>
      )}

      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
        <Pressable onPress={doForgot} testID="forgot"><Text style={{ fontSize: 13, fontWeight: "700", color: C.green }}>Code oublié ?</Text></Pressable>
      </View>

      {err ? <Text style={{ color: C.rust, fontSize: 12.5, marginTop: 8 }}>{err}</Text> : null}

      <SaveBtn color={C.greenDark} style={{ marginTop: 14 }} onPress={doLogin}>{busy ? "Connexion…" : "Se connecter"}</SaveBtn>

      {isCoop ? (
        <Pressable onPress={() => setScreen("createCoop")} testID="create-coop" style={{ marginTop: 14, backgroundColor: "#DCEBE1", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="building" size={17} color={C.green} />
          <Text style={{ fontWeight: "800", fontSize: 14, color: C.green }}>Créer une coopérative</Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: 14, backgroundColor: "#F3FAF5", borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Icon name="shield-check" size={16} color={C.muted} />
          <Text style={{ flex: 1, fontSize: 12, color: C.muted, lineHeight: 17 }}>Votre compte est créé par votre coopérative. Contactez le Patron / Acheteur pour être enregistré.</Text>
        </View>
      )}

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

/* -------- Création coopérative (minimale : responsable + email + mot de passe) -------- */
function CreateCoop({ onBack, onRegister, onDone }: { onBack: () => void; onRegister: (p: { nom: string; email: string; password: string }) => Promise<any>; onDone: (s: any) => void }) {
  const insets = useSafeAreaInsets();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passOk = isValidPassword(pass) && pass === pass2;
  const valid = nom.trim().length >= 2 && emailOk && passOk;

  const submit = async () => {
    if (busy) return;
    setErr("");
    if (!nom.trim()) { setErr("Saisissez le nom du responsable."); return; }
    if (!emailOk) { setErr("Adresse e-mail invalide."); return; }
    if (!isValidPassword(pass)) { setErr("Mot de passe : au moins 6 caractères."); return; }
    if (pass !== pass2) { setErr("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true);
    try {
      onDone(await onRegister({ nom: nom.trim(), email: email.trim(), password: pass }));
    } catch (e: any) {
      setErr(e?.message || "Erreur lors de la création.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthHeader title="Créer une coopérative" sub="Quelques informations suffisent pour démarrer" onBack={onBack} theme={C.teal} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <View style={{ width: 66, height: 66, borderRadius: 20, backgroundColor: "#DCEBE1", alignItems: "center", justifyContent: "center" }}>
            <Icon name="building" size={30} color={C.teal} />
          </View>
          <Text style={{ fontSize: 13, color: C.muted, textAlign: "center", marginTop: 12, lineHeight: 19 }}>Créez votre compte en quelques secondes. Vous compléterez le profil de la coopérative plus tard depuis les réglages.</Text>
        </View>

        <Field label="Nom du responsable *"><TInput value={nom} onChangeText={(t) => { setNom(t); setErr(""); }} placeholder="Ex. Diomandé Mamadou" /></Field>
        <Field label="Adresse e-mail *"><TInput value={email} onChangeText={(t) => { setEmail(t.trim()); setErr(""); }} keyboardType="email-address" autoCapitalize="none" placeholder="responsable@coop.ci" /></Field>
        <Field label="Mot de passe *">
          <View style={fieldWrap}>
            <Icon name="key" size={18} color={C.muted} />
            <TInput value={pass} onChangeText={(t) => { setPass(t); setErr(""); }} placeholder="Au moins 6 caractères" secureTextEntry={!show} style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }} />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}><Icon name={show ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>
          </View>
        </Field>
        <Field label="Confirmer le mot de passe *"><TInput value={pass2} onChangeText={(t) => { setPass2(t); setErr(""); }} placeholder="Retapez le mot de passe" secureTextEntry={!show} /></Field>
        {pass && pass2 && pass !== pass2 ? <Text style={{ color: C.rust, fontSize: 12, marginTop: -6, marginBottom: 10 }}>Les deux mots de passe ne correspondent pas.</Text> : null}

        {err ? <Text style={{ color: C.rust, fontSize: 12.5, marginBottom: 8 }}>{err}</Text> : null}

        <View style={{ backgroundColor: "#EAF3EF", borderWidth: 1, borderColor: "#CFE6E0", borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>Vous serez connecté comme <Text style={{ fontWeight: "700" }}>Patron</Text>. Vous vous connecterez ensuite avec votre <Text style={{ fontWeight: "700" }}>e-mail + mot de passe</Text>.</Text>
        </View>
        <SaveBtn disabled={!valid || busy} color={C.teal} onPress={submit}>{busy ? "Création…" : "Créer & accéder au tableau de bord"}</SaveBtn>
      </KeyboardAwareScrollView>
    </View>
  );
}
