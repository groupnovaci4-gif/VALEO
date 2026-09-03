// VALEO — logique métier & données (100% hors-ligne)
import type { Localisation } from "./geo";
import type { PinRecord } from "./pin";

export const C = {
  teal: "#0E8E80",
  cocoa: "#0E8E80",
  cocoaSoft: "#3E6B62",
  green: "#1E7A4D",
  greenDark: "#155C39",
  lime: "#6E8B12",
  gold: "#B98328",
  rust: "#A9502A",
  due: "#B8791E",
  loss: "#B23B2E",
  bg: "#F7F3EC",
  card: "#FFFFFF",
  ink: "#241C15",
  muted: "#7A6E62",
  line: "#EAE2D5",
};

export type Crop = { id: string; nom: string; emoji: string };
export const CROPS: Crop[] = [
  { id: "cacao", nom: "Cacao", emoji: "🍫" },
  { id: "cafe", nom: "Café", emoji: "☕" },
  { id: "anacarde", nom: "Anacarde", emoji: "🌰" },
  { id: "hevea", nom: "Hévéa", emoji: "🪵" },
  { id: "palmier", nom: "Palmier à huile", emoji: "🌴" },
];
export const crop = (id: string): Crop => CROPS.find((c) => c.id === id) || CROPS[0];
export const DEFAULT_PRICES: Record<string, number> = { cacao: 1800, cafe: 1500, anacarde: 500, hevea: 400, palmier: 100 };
export const DEFAULT_COMM: Record<string, number> = { cacao: 25, cafe: 25, anacarde: 20, hevea: 15, palmier: 10 };
export const priceOf = (data: any, cropId: string): number => (data?.prices && data.prices[cropId] != null ? data.prices[cropId] : DEFAULT_PRICES[cropId] ?? data?.prixKg ?? 0);
export const commOf = (data: any, cropId: string): number => (data?.commissions && data.commissions[cropId] != null ? data.commissions[cropId] : DEFAULT_COMM[cropId] ?? data?.commissionRate ?? 0);

// Complétude du profil coopérative (0-100 %).
export function coopCompleteness(coop: any, patron?: any): number {
  const checks = [
    coop?.nom && coop.nom !== "Ma coopérative",
    coop?.type,
    Array.isArray(coop?.filieres) && coop.filieres.length > 0,
    coop?.tel,
    coop?.adresse || coop?.localite || coop?.region,
    coop?.agrement,
    patron?.tel,
    patron?.fonction,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

// Identifiant planteur : VAL-XXXX-YY (4 chiffres + 2 lettres majuscules), unique.
export const MEMBER_CODE_RE = /^VAL-\d{4}-[A-Z]{2}$/;
export function genMemberCode(existing?: any[]): string {
  const set = new Set((existing || []).map((x: any) => (typeof x === "string" ? x : x?.code)).filter(Boolean));
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 20000; i++) {
    const num = String(Math.floor(1000 + Math.random() * 9000));
    const y = L[Math.floor(Math.random() * 26)] + L[Math.floor(Math.random() * 26)];
    const code = `VAL-${num}-${y}`;
    if (!set.has(code)) return code;
  }
  return `VAL-${String(Date.now()).slice(-4)}-ZZ`;
}

export type Operator = { id: string; nom: string; color: string; ink: string; short: string };
export const OPERATORS: Operator[] = [
  { id: "orange", nom: "Orange Money", color: "#F16E00", ink: "#fff", short: "OM" },
  { id: "wave", nom: "Wave", color: "#1DC3F0", ink: "#062A33", short: "Wave" },
  { id: "mtn", nom: "MTN MoMo", color: "#FFCB05", ink: "#1a1a1a", short: "MoMo" },
  { id: "moov", nom: "Moov Money", color: "#1D4E9F", ink: "#fff", short: "Moov" },
];
export const op = (id: string): Operator => OPERATORS.find((o) => o.id === id) || OPERATORS[0];

export const ROLES: Record<string, { label: string; sub: string; icon: string }> = {
  patron: { label: "Patron / Acheteur", sub: "Gère la coopérative, approuve les avances", icon: "shield-check" },
  commis: { label: "Magasinier", sub: "Pèse, stocke et délivre les bordereaux", icon: "package" },
  pisteur: { label: "Pisteur / Délégué", sub: "Collecte en tournée dans les villages", icon: "truck" },
};

// Motifs de sortie du magasin. Sans eux, le « stock » ne pouvait que monter :
// il additionnait les entrées sans jamais rien retrancher.
export const SORTIE_TYPES = [
  { id: "expedition", nom: "Expédition", emoji: "🚚", sub: "Départ vers l'exportateur / usine" },
  { id: "vente", nom: "Vente", emoji: "💰", sub: "Vente directe depuis le magasin" },
  { id: "transfert", nom: "Transfert", emoji: "🔁", sub: "Vers un autre magasin de la coop" },
  { id: "perte", nom: "Perte / freinte", emoji: "⚠️", sub: "Casse, humidité, écart de pesée" },
];
export const sortieType = (id: string) => SORTIE_TYPES.find((t) => t.id === id) || SORTIE_TYPES[SORTIE_TYPES.length - 1];

export const DEPCATS = [
  { id: "transport", nom: "Transport" },
  { id: "sacs", nom: "Sacs / emballage" },
  { id: "carburant", nom: "Carburant" },
  { id: "restauration", nom: "Restauration" },
  { id: "manutention", nom: "Manutention" },
  { id: "autre", nom: "Autre" },
];
export const depcat = (id: string) => DEPCATS.find((c) => c.id === id) || DEPCATS[DEPCATS.length - 1];

export const STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  en_attente: { label: "En attente", color: C.due, bg: "#FDF7EC", icon: "clock" },
  approuve: { label: "Approuvé", color: C.green, bg: "#F0F6F2", icon: "check-circle" },
  refuse: { label: "Refusé", color: C.loss, bg: "#FBEFED", icon: "x-circle" },
  rembourse: { label: "Recouvré", color: C.muted, bg: "#F2EEE7", icon: "check" },
};

/* ------------------------------ Formatters ------------------------------ */
export const group = (n: number): string =>
  Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const fF = (n: number) => `${group(n)} F`;
export const fFull = (n: number) => `${group(n)} FCFA`;
export const fKg = (n: number) => `${group(n)} kg`;
export const isToday = (iso: string) => {
  const d = new Date(iso),
    t = new Date();
  return d.toDateString() === t.toDateString();
};
export const fDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
export const fDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${fDate(iso)} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
// Ancien format, conservé pour afficher les bordereaux émis avant le passage
// à la numérotation par agent.
export const ticketNo = (seq: number) => `P-2026-${String(seq).padStart(4, "0")}`;

/**
 * Trigramme stable d'un agent, dérivé de son identifiant.
 *
 * Il rend le numéro de bordereau unique entre agents sans aucun compteur
 * partagé : deux agents hors-ligne ne peuvent plus émettre le même numéro.
 * Il est *dérivé* (et non stocké) pour ne nécessiter ni migration ni écriture
 * sur la fiche du collaborateur — écriture qu'un magasinier n'a d'ailleurs pas
 * le droit de faire.
 */
export function staffTag(staffId: string): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I ni O, confondus avec 1 et 0
  let h = 2166136261;
  for (let i = 0; i < (staffId || "").length; i++) {
    h ^= staffId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 3; i++) { out += L[h % L.length]; h = Math.floor(h / L.length); }
  return out;
}

// Numéro du prochain reçu de cet agent : sa propre suite, indépendante de
// celle des autres agents et des autres coopératives.
export function nextTicketSeq(staffId: string, data: Data): number {
  const own = [...(data.collections || []), ...(data.settlements || [])].filter((x: any) => x.byStaffId === staffId);
  return own.reduce((m: number, x: any) => Math.max(m, Number(x.seq) || 0), 0) + 1;
}

export const makeTicket = (staffId: string, seq: number) => `P-${staffTag(staffId)}-${String(seq).padStart(4, "0")}`;

// Numéro affiché d'un reçu : celui figé à l'émission, sinon l'ancien format.
export const ticketOf = (rec: { ticket?: string; seq?: number } | null | undefined): string =>
  (rec && rec.ticket) || (rec && rec.seq != null ? ticketNo(rec.seq) : "—");
export const byDateDesc = (a: any, b: any) => +new Date(b.date) - +new Date(a.date);

/* --------------------------------- Types --------------------------------- */
export type { Localisation } from "./geo";

export type Momo = { operator: string; number: string; label?: string };
// Horodatage de dernière écriture, posé automatiquement par la couche de
// synchronisation (store.prepareSync). Il arbitre les conflits côté serveur :
// sur un même enregistrement, la version la plus récente gagne.
export type Synced = { updatedAt?: string };
// Campagne (`data.saison`) figée à la création de l'écriture : sans elle, les
// bilans mélangent les campagnes et il devient impossible de les séparer
// rétroactivement.
export type Campagne = { saison?: string };
export type Culture = { cropId: string; superficie: number };
export type Member = Synced & {
  id: string;
  coopId?: string;
  code: string;
  nom: string;
  // Nom de la localité, recopié depuis `loc` quand une sélection structurée
  // est faite. Reste la valeur affichée sur les écrans, reçus et bilans.
  village: string;
  // Localisation structurée (District › Région › Département › Village).
  // Facultative : les fiches créées avant la sélection structurée n'en ont pas.
  loc?: Localisation;
  idNumber: string;
  superficie: number;
  cropId: string;
  cultures: Culture[];
  createdBy?: string | null;
  tel: string;
  momo: Momo | null;
  photo?: string | null;
  pin?: PinRecord | null;
};
export type Staff = Synced & { id: string; coopId?: string; nom: string; role: string; tel?: string; photo?: string | null; prenoms?: string; email?: string; fonction?: string; idNumber?: string; pin?: PinRecord | null };
export type Retenue = { label: string; amount: number };

/**
 * Où la pesée a eu lieu.
 *
 * - `magasin` : le planteur apporte sa production au magasin (patron ou
 *   magasinier). Le poids entre directement en stock.
 * - `bord_champ` : le pisteur/délégué collecte en tournée puis ramène au
 *   magasin. Le poids n'entre en stock qu'APRÈS vérification du magasinier,
 *   et c'est le poids vérifié qui compte (cf. `Verification`).
 */
export type Origine = "magasin" | "bord_champ";

/**
 * Vérification par le magasinier d'un poids ramené par un pisteur.
 *
 * Le poids déclaré au bord-champ et le poids constaté au magasin diffèrent
 * presque toujours (humidité, freinte, tassement). C'est `kg` — le poids
 * réellement constaté — qui entre en stock, jamais le poids déclaré.
 * L'écart n'est pas effacé : les deux valeurs restent lisibles côte à côte.
 */
export type Verification = {
  kg: number;
  byStaffId: string;
  date: string;
  note?: string;
};

/**
 * Livraison au magasin d'une collecte bord-champ.
 *
 * Le pisteur ramasse, transporte, puis DÉCLARE sa livraison : c'est cet acte
 * — et non la pesée au bord-champ — qui met la collecte « en attente de
 * vérification », alerte le patron et le magasinier, et la fait apparaître
 * dans la file du magasin. Tant qu'elle est absente, la marchandise est
 * réputée encore en tournée.
 *
 * Ce n'est volontairement PAS une `Sortie` : une sortie retranche du stock, or
 * le poids quitte la charge du pisteur au moment de la vérification. En créer
 * une ici le décompterait deux fois.
 */
export type Livraison = {
  date: string;
  byStaffId: string;
};

export type Collection = Synced & Campagne & {
  id: string;
  seq: number;
  // Numéro de bordereau figé à l'émission (format P-<agent>-0000).
  ticket?: string;
  coopId?: string;
  memberId: string;
  byStaffId: string;
  date: string;
  kg: number;
  prixKg: number;
  // Barème de commission (F/kg) figé à la création, au même titre que prixKg :
  // un changement de barème ne doit jamais réécrire l'historique.
  commissionRate?: number;
  cropId?: string;
  // Identifiant d'opération posé par le client à la validation : le serveur
  // ignore une seconde création portant le même (double-tap, rejeu réseau).
  clientOpId?: string;
  // Lieu de la pesée. Absent sur les collectes antérieures : `origineOf()`
  // fait alors le repli sur le rôle de l'agent, sans réécrire l'historique.
  origine?: Origine;
  // Livraison au magasin déclarée par le pisteur (collecte bord-champ).
  // Absente = encore en tournée ; présente = en attente de vérification.
  livraison?: Livraison | null;
  // Vérification du magasinier, pour une collecte bord-champ uniquement.
  // Tant qu'elle est absente, le poids n'est pas encore entré en magasin.
  verif?: Verification | null;
  brut: number;
  retenues: Retenue[];
  net: number;
  sacs?: number;
  weighings?: { brut: number; sacs: number; net: number }[];
  paye: number;
  reste: number;
  method: string;
  note: string;
  oldRegle?: number;
  // Montant du reste dû (au planteur) de CE reçu déjà soldé ultérieurement.
  // Champ de suivi interne : n'apparaît jamais sur le reçu d'origine.
  resteSolde?: number;
  signature?: { paths: string[]; w: number; h: number } | null;
  _repay?: { loanId?: string; amount: number } | null;
  _settle?: number | null;
};
/**
 * Qui est à l'origine de l'avance.
 *
 * - `planteur` : demandée depuis l'espace planteur, part « en_attente » et
 *   attend la décision du patron ;
 * - `pisteur` : accordée directement sur le terrain par le pisteur/délégué,
 *   qui engage la coopérative — elle naît donc « approuve » ;
 * - `patron` : saisie par le patron lui-même.
 */
export type LoanOrigine = "planteur" | "pisteur" | "patron";

export type Loan = Synced & Campagne & {
  id: string;
  coopId?: string;
  memberId: string;
  // Origine de la demande. Absente sur les avances antérieures.
  origine?: LoanOrigine;
  type: string;
  amount: number;
  motif: string;
  date: string;
  status: string;
  soldeRestant: number;
  paymentMode?: string;
  decidedBy: string | null;
  decidedAt?: string | null;
};
export type Settlement = Synced & Campagne & { id: string; coopId?: string; memberId: string; byStaffId: string; amount: number; method: string; date: string; viaPesee?: boolean; seq?: number; ticket?: string; clientOpId?: string; refs?: { seq: number; ticket?: string; amount: number }[] };
export type Mandat = Synced & Campagne & { id: string; coopId?: string; pisteurId: string; amount: number; date: string; note: string };
export type Depense = Synced & Campagne & { id: string; coopId?: string; pisteurId: string; category: string; amount: number; date: string; note: string };
// Sortie de magasin : expédition, vente, transfert ou perte. C'est la
// contrepartie des collectes dans le calcul du stock réel.
export type Sortie = Synced & Campagne & {
  id: string;
  coopId?: string;
  cropId: string;
  kg: number;
  type: string;
  date: string;
  byStaffId: string;
  destinataire?: string;
  note: string;
  clientOpId?: string;
};
export type CoopMomo = { id: string; operator: string; number: string; label?: string };
export type PriceHistory = { date: string; prixKg: number };
export type Coop = {
  id?: string;
  nom: string;
  sigle?: string;
  agrement?: string;
  type?: string;
  dateCreation?: string;
  filieres?: string[];
  prices?: Record<string, number>;
  commissions?: Record<string, number>;
  photo?: string | null;
  description?: string;
  region?: string;
  district?: string;
  departement?: string;
  commune?: string;
  localite?: string;
  adresse?: string;
  // Localisation structurée. Les champs texte ci-dessus restent renseignés
  // (affichage, espace admin, export) et sont recopiés depuis celle-ci.
  loc?: Localisation;
  tel?: string;
  email?: string;
  momo: CoopMomo[];
};
export const COOP_TYPES = [
  "Société coopérative simplifiée (SCOOPS)",
  "Coopérative avec conseil d'administration (COOP-CA)",
  "Union de coopératives",
  "Fédération / Confédération",
  "Autre",
];
export type Data = {
  saison: string;
  prixKg: number;
  seq: number;
  memberSeq: number;
  commissionRate: number;
  coop: Coop;
  coops?: Coop[];
  prices?: Record<string, number>;
  commissions?: Record<string, number>;
  staff: Staff[];
  members: Member[];
  collections: Collection[];
  loans: Loan[];
  mandats: Mandat[];
  depenses: Depense[];
  settlements: Settlement[];
  sorties: Sortie[];
  priceHistory: PriceHistory[];
};
export type Session =
  | { side: "planteur"; memberId: string; coopId?: string }
  | { side: "coop"; role: string; staffId: string; coopId?: string };

export const uid = () => Math.random().toString(36).slice(2, 9);

// Formate un numéro CI en international pour wa.me (indicatif 225).
export const waNumber = (tel?: string): string | null => {
  if (!tel) return null;
  let d = tel.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("225")) return d;
  if (d.startsWith("00225")) return d.slice(2);
  return `225${d}`;
};

/* --------------------------------- Seed ---------------------------------- */
// Base vierge — aucune donnée de démonstration. La coop et les planteurs
// sont créés par l'utilisateur ; la vraie source de vérité est le backend.
export function seed(): Data {
  return {
    saison: "Campagne 2025-2026",
    prixKg: 1800,
    seq: 1,
    memberSeq: 1,
    commissionRate: 25,
    coop: { nom: "Coopérative", momo: [], filieres: [] },
    coops: [],
    staff: [],
    members: [],
    collections: [],
    loans: [],
    mandats: [],
    depenses: [],
    settlements: [],
    sorties: [],
    priceHistory: [],
  };
}

export function migrate(d: any): Data {
  const out = { ...d };
  if (!Array.isArray(out.mandats)) out.mandats = [];
  if (!Array.isArray(out.depenses)) out.depenses = [];
  if (!Array.isArray(out.settlements)) out.settlements = [];
  if (!Array.isArray(out.sorties)) out.sorties = [];
  if (!Array.isArray(out.loans)) out.loans = [];
  if (!Array.isArray(out.collections)) out.collections = [];
  if (!Array.isArray(out.staff)) out.staff = [];
  if (!Array.isArray(out.members)) out.members = [];
  if (typeof out.commissionRate !== "number") out.commissionRate = 25;
  if (typeof out.prixKg !== "number") out.prixKg = 1800;
  if (!out.saison) out.saison = "Campagne 2025-2026";
  if (!out.coop) out.coop = { nom: "Coopérative", momo: [] };
  if (!Array.isArray(out.coop.momo)) out.coop.momo = [];
  if (!Array.isArray(out.coop.filieres)) out.coop.filieres = [];
  if (!Array.isArray(out.priceHistory)) out.priceHistory = [{ date: new Date().toISOString(), prixKg: out.prixKg }];
  const seqBase = typeof out.memberSeq === "number" ? out.memberSeq : 1;
  const usedCodes = new Set<string>();
  out.members = out.members.map((m: any) => {
    let code = m.code;
    if (!code || !MEMBER_CODE_RE.test(code) || usedCodes.has(code)) {
      code = genMemberCode(Array.from(usedCodes));
    }
    usedCodes.add(code);
    return {
      ...m,
      code,
      momo: m.momo != null ? m.momo : null,
      photo: m.photo != null ? m.photo : null,
      // `cultures` n'est PLUS injecté ici. Le faire réécrivait la fiche de
      // chaque planteur au chargement ; comme `prepareSync` renvoie toutes les
      // lignes, le serveur voyait un champ interdit et refusait TOUT le PUT
      // (403) — y compris la demande d'avance que le planteur venait de créer.
      // La valeur par défaut est dérivée à la lecture par `memberCultures()`.
      createdBy: m.createdBy != null ? m.createdBy : null,
    };
  });
  out.memberSeq = seqBase;

  // ---- Migration multi-coopérative : chaque coopérative devient étanche. ----
  if (!Array.isArray(out.coops)) out.coops = [];
  if (out.coops.length === 0) {
    // Regroupe les données existantes dans une coopérative unique héritée.
    const legacyId = uid();
    const prices: Record<string, number> = {};
    const commissions: Record<string, number> = {};
    CROPS.forEach((c) => {
      prices[c.id] = DEFAULT_PRICES[c.id] ?? out.prixKg;
      commissions[c.id] = DEFAULT_COMM[c.id] ?? out.commissionRate;
    });
    if (typeof out.prixKg === "number") prices.cacao = out.prixKg;
    out.coops = [{ id: legacyId, ...out.coop, prices, commissions }];
    out.staff = out.staff.map((s: any) => ({ ...s, coopId: s.coopId || legacyId }));
    out.members = out.members.map((m: any) => ({ ...m, coopId: m.coopId || legacyId }));
    out.collections = out.collections.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
    out.loans = out.loans.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
    out.mandats = out.mandats.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
    out.depenses = out.depenses.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
    out.settlements = out.settlements.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
    out.sorties = out.sorties.map((x: any) => ({ ...x, coopId: x.coopId || legacyId }));
  }
  // Fiche coopérative : on ne la COMPLÈTE pas (invariant 23).
  //
  // On remplissait ici les prix et commissions manquants avec les barèmes par
  // défaut. Comme `prepareSync` renvoie la fiche coop, ces valeurs inventées
  // partaient au serveur, qui les lisait comme un changement de réglage — et
  // refusait TOUT le PUT d'un pisteur ou d'un magasinier (403 « seul le patron
  // peut changer "prices" »). Une coopérative fraîchement créée n'a pas encore
  // de barème : aucun agent ne pouvait donc rien enregistrer.
  //
  // Les barèmes se dérivent à la LECTURE (`priceOf` / `commOf` retombent sur
  // `DEFAULT_PRICES` / `DEFAULT_COMM`), jamais en réécrivant l'enregistrement.
  // On se contente ici de réparer une valeur du mauvais type, sans jamais
  // ajouter une clé que le serveur n'a pas envoyée.
  out.coops = out.coops.map((c: any) => {
    const fix: any = { ...c };
    if ("momo" in c && !Array.isArray(c.momo)) fix.momo = [];
    if ("filieres" in c && !Array.isArray(c.filieres)) fix.filieres = [];
    return fix;
  });
  return out as Data;
}

// Vue filtrée pour une coopérative : n'expose QUE ses propres données.
export function scopeData(raw: Data, coopId?: string): Data {
  const list = raw.coops || [];
  const c = (coopId && list.find((x) => x.id === coopId)) || list[0] || raw.coop || { nom: "Coopérative", momo: [], filieres: [] };
  const id = c.id || coopId;
  return {
    ...raw,
    coop: c,
    prices: c.prices || {},
    commissions: c.commissions || {},
    staff: (raw.staff || []).filter((s) => !id || s.coopId === id),
    members: (raw.members || []).filter((m) => !id || m.coopId === id),
    collections: (raw.collections || []).filter((x) => !id || x.coopId === id),
    loans: (raw.loans || []).filter((x) => !id || x.coopId === id),
    mandats: (raw.mandats || []).filter((x) => !id || x.coopId === id),
    depenses: (raw.depenses || []).filter((x) => !id || x.coopId === id),
    settlements: (raw.settlements || []).filter((x) => !id || x.coopId === id),
    sorties: (raw.sorties || []).filter((x) => !id || x.coopId === id),
  };
}

/* ------------------------------ Campagnes -------------------------------- */
/**
 * Une écriture appartient-elle à la campagne donnée ?
 *
 * Les écritures antérieures à l'estampillage n'ont pas de `saison` : elles sont
 * rattachées à la campagne active, faute de mieux, plutôt que d'être masquées.
 */
export const inSaison = (x: { saison?: string }, saison?: string): boolean =>
  !saison || !x.saison || x.saison === saison;

/**
 * Vue « campagne en cours » : filtre la PRODUCTION (collectes, mandats,
 * dépenses, soldes) sur la campagne active.
 *
 * Les **dettes ne sont jamais filtrées** : un reste dû ou une avance à
 * recouvrer suit le planteur d'une campagne à l'autre. Les écrans qui parlent
 * d'argent dû (fiche planteur, rappels de paiement, avances) doivent donc
 * continuer d'utiliser `data`, pas cette vue. Voir CLAUDE.md §4.
 */
export function scopeSaison(data: Data, saison?: string): Data {
  const s = saison || data.saison;
  return {
    ...data,
    collections: (data.collections || []).filter((x) => inSaison(x, s)),
    mandats: (data.mandats || []).filter((x) => inSaison(x, s)),
    depenses: (data.depenses || []).filter((x) => inSaison(x, s)),
    settlements: (data.settlements || []).filter((x) => inSaison(x, s)),
    sorties: (data.sorties || []).filter((x) => inSaison(x, s)),
  };
}

// Campagnes présentes dans les données, de la plus récente à la plus ancienne.
export function saisons(data: Data): string[] {
  const set = new Set<string>();
  [...(data.collections || []), ...(data.loans || []), ...(data.settlements || [])].forEach((x: any) => {
    if (x.saison) set.add(x.saison);
  });
  if (data.saison) set.add(data.saison);
  return Array.from(set).sort().reverse();
}

/* ------------------------------ Derived calc ----------------------------- */
// Reste dû RÉEL d'un reçu de pesée (reste d'origine moins ce qui a été soldé ensuite).
export const outstandingReste = (c: Collection): number => Math.max(0, (c.reste || 0) - (c.resteSolde || 0));

export function memberStats(mId: string, cols: Collection[]) {
  const list = cols.filter((c) => c.memberId === mId);
  return {
    kg: list.reduce((s, c) => s + c.kg, 0),
    net: list.reduce((s, c) => s + c.net, 0),
    paye: list.reduce((s, c) => s + c.paye + (c.resteSolde || 0), 0),
    reste: list.reduce((s, c) => s + outstandingReste(c), 0),
    count: list.length,
  };
}
export const activeLoan = (mId: string, loans: Loan[]) =>
  loans.find((l) => l.memberId === mId && l.status === "approuve" && l.soldeRestant > 0);

export const memberCultures = (m: any): Culture[] =>
  Array.isArray(m?.cultures) && m.cultures.length ? m.cultures : m?.cropId ? [{ cropId: m.cropId, superficie: Number(m.superficie) || 0 }] : [];
export const culturesLabel = (m: any): string => memberCultures(m).map((c) => crop(c.cropId).nom).join(", ") || "—";
export const totalSuperficie = (m: any): number => memberCultures(m).reduce((s, c) => s + (Number(c.superficie) || 0), 0);

// Barème de commission applicable à une collecte : celui figé à la création,
// sinon (données antérieures) le barème courant du produit.
export const collectionComm = (data: Data, c: Collection): number =>
  c.commissionRate != null ? c.commissionRate : commOf(data, c.cropId || "cacao");

/* ------------------- Origine du poids & vérification magasin ------------------ */

/**
 * Origine d'une collecte.
 *
 * Volontairement fondée sur le SEUL champ enregistré, sans repli sur le rôle
 * de l'agent. Les collectes antérieures à la vérification n'ont pas ce champ :
 * elles ont déjà été livrées et comptées en magasin à l'époque. Les déduire du
 * rôle les ferait toutes rebasculer « à vérifier » — le stock du magasin
 * chuterait du jour au lendemain et une file d'attente fictive apparaîtrait
 * pour des livraisons faites depuis longtemps.
 *
 * La vérification s'applique donc aux collectes enregistrées **à partir de
 * maintenant**, pour lesquelles `addCollection` fige toujours l'origine (et le
 * serveur la contrôle).
 */
export function origineOf(c: Collection, _data?: Data): Origine {
  return c.origine === "bord_champ" ? "bord_champ" : "magasin";
}

/** Collecte ramenée du bord-champ par un pisteur (donc à vérifier au magasin). */
export const estBordChamp = (c: Collection, _data?: Data): boolean => c.origine === "bord_champ";

/** Une collecte bord-champ dont le magasinier a constaté le poids réel. */
export const estVerifiee = (c: Collection): boolean => !!(c.verif && c.verif.byStaffId);

/** Collecte que le pisteur a déclaré avoir livrée au magasin. */
export const estLivree = (c: Collection): boolean => !!(c.livraison && c.livraison.date);

/**
 * Statut d'une collecte bord-champ, tel qu'il se lit à l'écran.
 * `collectee` → en tournée · `en_attente` → livrée, à vérifier · `verifiee`.
 */
export type StatutLivraison = "collectee" | "en_attente" | "verifiee";
export function statutLivraison(c: Collection): StatutLivraison {
  if (estVerifiee(c)) return "verifiee";
  return estLivree(c) ? "en_attente" : "collectee";
}

export const LIBELLE_STATUT: Record<StatutLivraison, string> = {
  collectee: "En tournée",
  en_attente: "En attente de vérification",
  verifiee: "Vérifiée",
};

/**
 * Poids réellement entré dans le magasin de la coopérative.
 *
 * - pesée au magasin (patron ou magasinier) : le poids pesé ;
 * - collecte bord-champ vérifiée : le poids **constaté par le magasinier** ;
 * - collecte bord-champ non encore vérifiée : **rien**. Le cacao est encore
 *   dans le véhicule du pisteur, l'annoncer en magasin serait un stock fictif.
 */
export function kgEnStock(c: Collection, data: Data): number {
  if (!estBordChamp(c, data)) return Number(c.kg) || 0;
  return estVerifiee(c) ? Number(c.verif!.kg) || 0 : 0;
}

/** Écart entre le poids déclaré au bord-champ et le poids constaté au magasin. */
export const ecartVerif = (c: Collection): number =>
  estVerifiee(c) ? (Number(c.verif!.kg) || 0) - (Number(c.kg) || 0) : 0;

/**
 * Manquant valorisé d'une collecte : ce que la coopérative a payé pour de la
 * marchandise qu'elle n'a jamais reçue.
 *
 * Le pisteur a réglé le planteur sur le poids DÉCLARÉ, avec l'argent du
 * mandat. Si le magasin en constate moins, la différence est de l'argent de la
 * coopérative sorti sans contrepartie : elle est à sa charge, comme un
 * manquant de caisse.
 *
 * Valorisé au prix FIGÉ sur la collecte (jamais au prix courant), au même
 * titre que le montant payé au planteur.
 */
export const manquantVerif = (c: Collection): number =>
  Math.round(Math.max(0, -ecartVerif(c)) * (Number(c.prixKg) || 0));

/**
 * « Poids plus » valorisé : le magasin a reçu PLUS que le poids déclaré.
 *
 * Il revient au pisteur, et c'est la pratique réelle du métier : le mandat est
 * confié pour acheter un poids donné, et l'acheteur n'attend en retour que le
 * poids correspondant au mandat octroyé. Tout ce qui arrive en plus est le
 * fruit de la tournée de l'agent — sa marge — et lui est versé.
 *
 * Symétrique du manquant : l'un ampute sa caisse, l'autre l'abonde.
 */
export const poidsPlusVerif = (c: Collection): number =>
  Math.round(Math.max(0, ecartVerif(c)) * (Number(c.prixKg) || 0));

/**
 * Collectes bord-champ **livrées** au magasin et en attente de vérification.
 *
 * La livraison est la condition : une collecte encore en tournée n'a rien à
 * faire dans la file du magasinier, et n'alerte personne. C'est ce qui fait
 * partir les notifications au bon moment — à la livraison, pas à la pesée.
 * `staffId` restreint à celles d'un pisteur donné (son propre suivi).
 */
export function aVerifier(data: Data, staffId?: string): Collection[] {
  return (data.collections || [])
    .filter((c) => estBordChamp(c, data) && estLivree(c) && !estVerifiee(c) && (!staffId || c.byStaffId === staffId))
    .sort(byDateDesc);
}

/**
 * Collectes qu'un pisteur a en tournée et n'a pas encore livrées.
 * C'est ce qu'il coche dans « Livraison de poids au magasin ».
 */
export function aLivrer(data: Data, staffId: string): Collection[] {
  return (data.collections || [])
    .filter((c) => c.byStaffId === staffId && estBordChamp(c, data) && !estLivree(c) && !estVerifiee(c))
    .sort(byDateDesc);
}

/* --------------------------- Restes dus par agent ------------------------- */

/**
 * Restes dus aux planteurs générés par les pesées d'UN agent.
 *
 * Un pisteur ne solde que ce qu'il a lui-même engagé : le reste d'une pesée du
 * magasinier ne sort pas de sa caisse et ne le regarde pas. La règle est
 * appliquée sur les données (le serveur refuse l'écriture), pas seulement à
 * l'affichage.
 */
export function restesAgent(data: Data, staffId: string, memberId?: string): Collection[] {
  return (data.collections || []).filter(
    (c) => c.byStaffId === staffId && outstandingReste(c) > 0 && (!memberId || c.memberId === memberId),
  );
}

/**
 * Collectes visibles pour le calcul des restes dus.
 *
 * `agentId` renseigné (pisteur) : uniquement ses propres pesées — il ne voit
 * ni ne solde ce qu'il n'a pas engagé. Sinon (patron, magasinier) : tout.
 */
export const collectesPourRestes = (data: Data, agentId?: string): Collection[] =>
  agentId ? (data.collections || []).filter((c) => c.byStaffId === agentId) : data.collections || [];

/** Total du reste dû d'un planteur, limité aux pesées d'un agent donné. */
export const resteAgentTotal = (data: Data, staffId: string, memberId: string): number =>
  restesAgent(data, staffId, memberId).reduce((s, c) => s + outstandingReste(c), 0);

/* ------------------------- Situation des avances -------------------------- */

/**
 * Situation d'un planteur au regard des avances, pour décider en connaissance
 * de cause avant d'en accorder une nouvelle (règle métier : le pisteur doit
 * voir ce qui existe déjà).
 */
export function avancesInfo(memberId: string, data: Data) {
  // Jamais filtré par campagne : une dette suit le planteur d'une campagne à
  // l'autre (invariant « les dettes sont reportées »).
  const list = (data.loans || []).filter((l) => l.memberId === memberId).sort(byDateDesc);
  const enCours = list.filter((l) => l.status === "approuve" && l.soldeRestant > 0);
  const enAttente = list.filter((l) => l.status === "en_attente");
  return {
    list,
    enCours,
    enAttente,
    // Reste à rembourser, toutes avances approuvées confondues.
    reste: enCours.reduce((s, l) => s + (Number(l.soldeRestant) || 0), 0),
    // Montant déjà demandé et non encore tranché par le patron.
    attente: enAttente.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    accorde: list.filter((l) => l.status === "approuve" || l.status === "rembourse").reduce((s, l) => s + (Number(l.amount) || 0), 0),
    nbRembourse: list.filter((l) => l.status === "rembourse").length,
  };
}

/**
 * Stock réel, par produit : entrées − sorties.
 *
 * Deux portées, qui ne comptent PAS la même chose :
 *
 * - `all` (magasinier et patron) — le magasin de la coopérative :
 *   pesées du patron + pesées du magasinier + collectes des pisteurs
 *   **après vérification**, au poids constaté par le magasinier. Une collecte
 *   bord-champ non vérifiée n'y figure pas : la marchandise n'est pas encore
 *   entrée.
 * - `mine` (pisteur) — ce qu'il a collecté et **pas encore remis** :
 *   ses collectes bord-champ non vérifiées, au poids qu'il a déclaré. Dès que
 *   le magasinier vérifie, le poids quitte sa charge et entre au magasin.
 *
 * Le stock n'est PAS borné à zéro : un négatif signale une erreur de saisie,
 * le masquer serait pire que l'afficher.
 */
export function stockStats(data: Data, opts?: { scope?: "all" | "mine"; staffId?: string }) {
  const mine = opts?.scope === "mine" && !!opts?.staffId;
  const staffId = opts?.staffId;
  const cols = (data.collections || []).filter((c) => !mine || c.byStaffId === staffId);
  const outs = (data.sorties || []).filter((x) => !mine || x.byStaffId === staffId);
  // En charge d'un pisteur : le déclaré tant que ce n'est pas vérifié.
  // En magasin : le vérifié, et rien avant la vérification.
  const poids = (c: Collection): number =>
    mine ? (estBordChamp(c, data) && !estVerifiee(c) ? Number(c.kg) || 0 : 0) : kgEnStock(c, data);
  const rows = CROPS.map((cr) => {
    const list = cols.filter((c) => (c.cropId || "cacao") === cr.id);
    const outList = outs.filter((x) => (x.cropId || "cacao") === cr.id);
    const entrees = list.reduce((s, c) => s + poids(c), 0);
    const sorties = outList.reduce((s, x) => s + (Number(x.kg) || 0), 0);
    // Poids annoncés par les pisteurs et pas encore vérifiés : hors stock,
    // mais affichés à part pour que le magasinier sache ce qui l'attend.
    const attente = mine
      ? 0
      : list.filter((c) => estBordChamp(c, data) && !estVerifiee(c)).reduce((s, c) => s + (Number(c.kg) || 0), 0);
    return {
      cr,
      cropId: cr.id,
      entrees,
      sorties,
      attente,
      stock: entrees - sorties,
      count: list.filter((c) => poids(c) > 0).length,
      valeur: list.reduce((s, c) => s + (poids(c) > 0 ? Number(c.net) || 0 : 0), 0),
    };
  }).filter((r) => r.entrees > 0 || r.sorties > 0 || r.attente > 0);
  return {
    rows,
    entrees: rows.reduce((s, r) => s + r.entrees, 0),
    sorties: rows.reduce((s, r) => s + r.sorties, 0),
    attente: rows.reduce((s, r) => s + r.attente, 0),
    stock: rows.reduce((s, r) => s + r.stock, 0),
    count: rows.reduce((s, r) => s + r.count, 0),
    valeur: rows.reduce((s, r) => s + r.valeur, 0),
  };
}

// Stock encore disponible pour un produit : borne haute d'une nouvelle sortie.
export const stockDispo = (data: Data, cropId: string, opts?: { scope?: "all" | "mine"; staffId?: string }): number => {
  const r = stockStats(data, opts).rows.find((x) => x.cropId === cropId);
  return r ? r.stock : 0;
};

export function pisteurStats(pid: string, data: Data) {
  const cols = (data.collections || []).filter((c) => c.byStaffId === pid);
  const poids = cols.reduce((s, c) => s + c.kg, 0);
  // Payé sur les pesées du jour…
  const achatsPesees = cols.reduce((s, c) => s + c.paye, 0);
  // …plus les anciens restes dus soldés par cet agent (à la pesée ou hors
  // livraison) : cet argent sort aussi de sa caisse, mais il est enregistré
  // dans `settlements`, jamais dans `collection.paye`.
  const soldes = (data.settlements || []).filter((x) => x.byStaffId === pid).reduce((s, x) => s + (x.amount || 0), 0);
  const achats = achatsPesees + soldes;
  const mandat = (data.mandats || []).filter((m) => m.pisteurId === pid).reduce((s, m) => s + m.amount, 0);
  // Frais de tournée : ils ne servent QU'À l'agent, pour son propre suivi.
  // Le pisteur/délégué est un prestataire rémunéré à la commission : il est
  // autonome sur ses dépenses, qui n'entament donc pas le mandat de la
  // coopérative (invariant 24). Elles restent renvoyées ici parce que son
  // écran les lui affiche, mais elles ne pèsent plus sur `solde`.
  const depenses = (data.depenses || []).filter((x) => x.pisteurId === pid).reduce((s, x) => s + x.amount, 0);
  const commission = cols.reduce((s, c) => s + Math.round(c.kg * collectionComm(data, c)), 0);
  // Manquant : marchandise payée au bord-champ mais jamais entrée au magasin.
  // C'est de l'argent du mandat sorti sans contrepartie, donc à la charge de
  // l'agent — au même titre qu'un billet manquant dans sa sacoche.
  const manquant = cols.reduce((s, c) => s + manquantVerif(c), 0);
  // « Poids plus » : ce qui est arrivé au magasin au-delà du poids déclaré.
  // Il revient à l'agent (cf. `poidsPlusVerif`).
  const poidsPlus = cols.reduce((s, c) => s + poidsPlusVerif(c), 0);
  // Poids réellement remis au magasin (après vérification), pour distinguer ce
  // qu'il a collecté de ce que la coopérative a effectivement reçu.
  const poidsRemis = cols.reduce((s, c) => s + (estVerifiee(c) ? Number(c.verif!.kg) || 0 : 0), 0);
  // Le manquant ampute la caisse de l'agent, le poids plus l'abonde : les deux
  // écarts de vérification sont de vrais mouvements d'argent le concernant.
  // Ses dépenses, elles, n'entrent pas : le mandat est confié pour ACHETER du
  // cacao, et sa commission couvre ses frais (invariant 24).
  const solde = mandat - achats - manquant + poidsPlus;
  return { poids, poidsRemis, achats, achatsPesees, soldes, mandat, depenses, commission, manquant, poidsPlus, solde, count: cols.length };
}

/* ------------------------------ Notifications ---------------------------- */

/** L'agent est-il un pisteur / délégué ? (ses dépenses lui sont personnelles) */
export const estPisteur = (data: Data, id?: string): boolean =>
  !!id && (data.staff || []).some((s) => s.id === id && s.role === "pisteur");

/** Nom d'un collaborateur (l'agent qui a pesé), ou tiret. */
export const staffNameOf = (data: Data, id?: string) => (data.staff || []).find((s) => s.id === id)?.nom || "—";

/** Nom d'un planteur, ou tiret : les listes ne doivent jamais afficher un id. */
export const nameOf = (data: Data, id: string) => (data.members || []).find((m) => m.id === id)?.nom || "—";

export type Notif = { id: string; kind: "action" | "info"; date: string; icon: string; tint: string; title: string; sub: string };
export function buildNotifications(data: Data, session: any): { items: Notif[]; count: number } {
  const items: Notif[] = [];
  const isCoop = session.side === "coop";
  const isPatron = isCoop && session.role === "patron";
  if (isPatron) {
    data.loans.filter((l) => l.status === "en_attente").forEach((l) => items.push({ id: "lp" + l.id, kind: "action", date: l.date, icon: "clock", tint: C.due, title: "Demande d'avance en attente", sub: `${nameOf(data, l.memberId)} · ${fF(l.amount)}` }));
    data.loans.filter((l) => l.status === "approuve" || l.status === "refuse").forEach((l) => items.push({ id: "ld" + l.id, kind: "info", date: (l as any).decidedAt || l.date, icon: l.status === "approuve" ? "check-circle" : "x-circle", tint: l.status === "approuve" ? C.green : C.loss, title: l.status === "approuve" ? "Avance accordée" : "Avance refusée", sub: `${nameOf(data, l.memberId)} · ${fF(l.amount)}` }));
  }
  if (isCoop) {
    // Cloche d'un agent : un pisteur n'est alerté que de SES PROPRES pesées.
    // Sans ce filtre, sa cloche lui annonçait les restes du patron et du
    // magasinier, qu'il n'a pourtant ni le droit de voir ni celui de solder —
    // et, tout autant, le nom du planteur et la somme versée sur la pesée d'un
    // autre agent. Le patron et le magasinier, eux, voient tout (invariant 21).
    const agentCloisonne = isCoop && !isPatron && session.role === "pisteur" ? session.staffId : undefined;
    const colsVues = collectesPourRestes(data, agentCloisonne);
    (data.members || []).forEach((m) => {
      const st = memberStats(m.id, colsVues);
      if (st.reste > 0) {
        const lastC = colsVues.filter((c) => c.memberId === m.id && outstandingReste(c) > 0).sort(byDateDesc)[0];
        items.push({ id: "rd" + m.id, kind: "action", date: lastC ? lastC.date : new Date().toISOString(), icon: "wallet", tint: C.due, title: "Reste à payer au planteur", sub: `${m.nom} · ${fF(st.reste)}` });
      }
    });
    (data.settlements || [])
      .filter((s: any) => !agentCloisonne || s.byStaffId === agentCloisonne)
      .forEach((s: any) => items.push({ id: "st" + s.id, kind: "info", date: s.date, icon: "banknote", tint: C.green, title: s.viaPesee ? "Reste soldé (à la pesée)" : "Reste soldé", sub: `${nameOf(data, s.memberId)} · ${fF(s.amount)}` }));
    colsVues.filter((c) => c.paye > 0).forEach((c) => items.push({ id: "pp" + c.id, kind: "info", date: c.date, icon: "scale", tint: C.teal, title: "Pesée payée", sub: `${nameOf(data, c.memberId)} · ${fF(c.paye)}` }));

    // Livraison au magasin : le patron doit savoir qu'un poids attend d'être
    // vérifié, le magasinier qu'il a une pesée à faire. Le pisteur, lui, a
    // déjà son suivi de remise sur son accueil : l'alerter de sa propre
    // livraison n'apprendrait rien.
    if (isPatron || session.role === "commis") {
      aVerifier(data).forEach((c) =>
        items.push({
          id: "vf" + c.id,
          kind: "action",
          date: c.date,
          icon: "truck",
          tint: C.due,
          title: isPatron ? "Livraison à vérifier au magasin" : "Livraison à vérifier",
          sub: `${staffNameOf(data, c.byStaffId)} · ${nameOf(data, c.memberId)} · ${fKg(c.kg)}`,
        }),
      );
    }
    // Écart constaté : l'information intéresse le patron (caisse de l'agent).
    if (isPatron) {
      (data.collections || [])
        .filter((c) => estVerifiee(c) && ecartVerif(c) !== 0)
        .forEach((c) => {
          const e = ecartVerif(c);
          items.push({
            id: "ec" + c.id,
            kind: "info",
            date: c.verif!.date,
            icon: e < 0 ? "alert-triangle" : "trending-up",
            tint: e < 0 ? C.loss : C.green,
            title: e < 0 ? "Manquant après vérification" : "Poids plus constaté",
            sub: `${staffNameOf(data, c.byStaffId)} · ${fKg(c.kg)} → ${fKg(Number(c.verif!.kg) || 0)} (${e > 0 ? "+" : ""}${e} kg)`,
          });
        });
    }
  }
  if (session.side === "planteur") {
    const m = data.members.find((x) => x.id === session.memberId);
    if (m) {
      const st = memberStats(m.id, data.collections);
      if (st.reste > 0) items.push({ id: "myr", kind: "action", date: new Date().toISOString(), icon: "wallet", tint: C.due, title: "Reste à percevoir", sub: `La coopérative vous doit ${fF(st.reste)}` });
      data.loans.filter((l) => l.memberId === m.id).forEach((l) => items.push({ id: "ml" + l.id, kind: l.status === "en_attente" ? "action" : "info", date: (l as any).decidedAt || l.date, icon: l.status === "approuve" ? "check-circle" : l.status === "refuse" ? "x-circle" : "clock", tint: l.status === "approuve" ? C.green : l.status === "refuse" ? C.loss : C.due, title: l.status === "approuve" ? "Avance accordée" : l.status === "refuse" ? "Avance refusée" : "Demande en attente", sub: `${fF(l.amount)}${l.motif ? " · " + l.motif : ""}` }));
      data.collections.filter((c) => c.memberId === m.id && c.paye > 0).forEach((c) => items.push({ id: "mp" + c.id, kind: "info", date: c.date, icon: "scale", tint: C.teal, title: "Pesée payée", sub: `${fKg(c.kg)} · ${fF(c.paye)}` }));
      (data.settlements || []).filter((s: any) => s.memberId === m.id).forEach((s: any) => items.push({ id: "ms" + s.id, kind: "info", date: s.date, icon: "banknote", tint: C.green, title: "Solde reçu", sub: `${fF(s.amount)}${s.refs && s.refs.length ? " · réf. " + s.refs.map((r: any) => r.ticket || ticketNo(r.seq)).join(", ") : ""}` }));
    }
  }
  items.sort(byDateDesc);
  return { items, count: items.filter((i) => i.kind === "action").length };
}
