import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, COOP_TYPES, CROPS, Data, OPERATORS, ROLES, Session } from "./lib";
import { Icon } from "./Icon";
import { ValeoMark, ValeoWordmark } from "./Logo";
import { Card, Chip, Field, PhotoAvatar, SaveBtn, Select, TInput } from "./ui";

/* ------------------------------- Top bar --------------------------------- */
export function TopBar({
  theme,
  me,
  isCoop,
  role,
  onLogout,
  onSettings,
  onSetPhoto,
}: {
  theme: string;
  me: any;
  isCoop: boolean;
  role?: string;
  onLogout: () => void;
  onSettings?: (() => void) | null;
  onSetPhoto: (url: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const label = isCoop ? ROLES[role || "patron"].label : "Espace planteur";
  return (
    <View style={{ backgroundColor: theme, paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
          <PhotoAvatar photo={me && me.photo} size={40} editable onChange={onSetPhoto} fallbackIcon={isCoop ? "scale" : "sprout"} fallbackColor={isCoop ? C.teal : C.green} />
          <View style={{ flexShrink: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: 15.5, color: "#fff" }} numberOfLines={1}>{me && me.nom}</Text>
            <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.82)" }}>{label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
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
  const [screen, setScreen] = useState<"home" | "create" | "createCoop">("home");
  const [staffId, setStaffId] = useState(data.staff[0]?.id || "");
  const [existingId, setExistingId] = useState("");
  const insets = useSafeAreaInsets();

  if (screen === "create") return <CreatePlanteur onBack={() => setScreen("home")} onSubmit={onCreatePlanteur} />;
  if (screen === "createCoop") return <CreateCoop onBack={() => setScreen("home")} onSubmit={onCreateCoop} />;

  const chosen = data.staff.find((s) => s.id === staffId);

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 22, paddingBottom: 8, alignItems: "center" }}>
        <View style={{ width: 68, height: 68, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", boxShadow: "0px 3px 10px rgba(30,20,12,0.08)" }}>
          <ValeoMark size={46} />
        </View>
        <View style={{ marginTop: 8 }}><ValeoWordmark size={30} /></View>
        <Text style={{ marginTop: 6, color: "#2E8B3D", fontWeight: "800", fontSize: 10.5, letterSpacing: 1.2 }}>TRACER · GÉRER · VALORISER</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 16 }}>
        {/* Coopérative */}
        <Card style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }}>
            <View style={iconBox("#EAF3EF")}><Icon name="building" size={21} color={C.teal} /></View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 16 }}>Espace coopérative</Text>
              <Text style={{ fontSize: 12.5, color: C.muted }}>Gérez la collecte, l'équipe et les paiements</Text>
            </View>
          </View>
          <SaveBtn color={C.teal} icon={<Icon name="building" size={18} color="#fff" />} onPress={() => setScreen("createCoop")}>Créer une coopérative</SaveBtn>
          {data.staff.length > 0 ? (
            <>
              <Divider label="DÉJÀ INSCRIT ?" />
              <View style={{ marginBottom: 10 }}>
                <Select value={staffId} onChange={setStaffId} options={data.staff.map((s) => ({ value: s.id, label: `${ROLES[s.role].label} — ${s.nom}` }))} />
              </View>
              <SaveBtn color={C.cocoa} onPress={() => chosen && onPick({ side: "coop", role: chosen.role, staffId: chosen.id })}>Se connecter</SaveBtn>
            </>
          ) : null}
        </Card>

        {/* Planteur */}
        <Card style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }}>
            <View style={iconBox("#EDF5F0")}><Icon name="sprout" size={21} color={C.green} /></View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 16 }}>Espace planteur</Text>
              <Text style={{ fontSize: 12.5, color: C.muted }}>Suivez vos poids, prêts et paiements</Text>
            </View>
          </View>
          <SaveBtn color={C.green} icon={<Icon name="user-plus" size={18} color="#fff" />} onPress={() => setScreen("create")}>Créer un compte planteur</SaveBtn>
          {data.members.length > 0 ? (
            <>
              <Divider label="DÉJÀ INSCRIT ?" />
              <View style={{ marginBottom: 10 }}>
                <Select value={existingId} onChange={setExistingId} placeholder="Choisir mon nom…" options={data.members.map((m) => ({ value: m.id, label: `${m.nom} — ${m.village}` }))} />
              </View>
              <SaveBtn disabled={!existingId} color={C.green} onPress={() => existingId && onPick({ side: "planteur", memberId: existingId })}>Se connecter</SaveBtn>
            </>
          ) : null}
        </Card>
      </View>
    </KeyboardAwareScrollView>
  );
}
const iconBox = (bg: string) => ({ width: 42, height: 42, borderRadius: 12, backgroundColor: bg, alignItems: "center" as const, justifyContent: "center" as const });
const Divider = ({ label }: { label: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    <Text style={{ fontSize: 11.5, color: C.muted, fontWeight: "600" }}>{label}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
  </View>
);

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
  const [superficie, setSuperficie] = useState("");
  const [cropId, setCropId] = useState("cacao");
  const [tel, setTel] = useState("");
  const [withMomo, setWithMomo] = useState(false);
  const [operator, setOperator] = useState("orange");
  const [number, setNumber] = useState("");
  const valid = nom.trim() && village.trim() && idNumber.trim();
  const submit = () => {
    const momo = withMomo && number.trim().length >= 8 ? { operator, number: number.trim() } : null;
    onSubmit({ nom: nom.trim(), village: village.trim(), idNumber: idNumber.trim(), superficie: Number(superficie) || 0, cropId, tel: tel.trim() || (momo ? momo.number : ""), momo, photo });
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
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field label="Localité" flex><TInput value={village} onChangeText={setVillage} placeholder="Ex. Sikensi" /></Field>
          <Field label="Superficie (ha)" flex><TInput value={superficie} onChangeText={(t) => setSuperficie(t.replace(",", "."))} keyboardType="decimal-pad" placeholder="Ex. 2.5" /></Field>
        </View>
        <Field label="Culture principale">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {CROPS.map((c) => <Chip key={c.id} label={c.nom} emoji={c.emoji} active={cropId === c.id} onPress={() => setCropId(c.id)} />)}
          </View>
        </Field>
        <Field label="Téléphone"><TInput value={tel} onChangeText={setTel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>

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

  const toggleFiliere = (id: string) => setFilieres((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const valid = nom.trim() && rnom.trim() && rprenoms.trim();

  const submit = () => {
    onSubmit({
      coop: {
        nom: nom.trim(), sigle: sigle.trim(), agrement: agrement.trim(), type, dateCreation: dateCreation.trim(),
        filieres, photo, description: description.trim(),
        region: region.trim(), district: district.trim(), departement: departement.trim(), commune: commune.trim(),
        localite: localite.trim(), adresse: adresse.trim(), tel: tel.trim(), email: email.trim(),
      },
      responsable: {
        nom: rnom.trim(), prenoms: rprenoms.trim(), fonction: rfonction.trim(), tel: rtel.trim(),
        email: remail.trim(), idNumber: rid.trim(), photo: rphoto,
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
          <Field label="Téléphone" flex><TInput value={rtel} onChangeText={setRtel} keyboardType="phone-pad" placeholder="07 00 00 00 00" /></Field>
          <Field label="Email" flex><TInput value={remail} onChangeText={setRemail} keyboardType="email-address" autoCapitalize="none" placeholder="nom@email.com" /></Field>
        </View>
        <Field label="Pièce d'identité"><TInput value={rid} onChangeText={setRid} placeholder="Ex. CNI CI 003 451 2" /></Field>

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
