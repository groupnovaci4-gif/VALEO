// VALEO — logique métier & données (100% hors-ligne)
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
export const ticketNo = (seq: number) => `P-2026-${String(seq).padStart(4, "0")}`;
export const byDateDesc = (a: any, b: any) => +new Date(b.date) - +new Date(a.date);

/* --------------------------------- Types --------------------------------- */
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
  village: string;
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
export type Collection = Synced & Campagne & {
  id: string;
  seq: number;
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
export type Loan = Synced & Campagne & {
  id: string;
  coopId?: string;
  memberId: string;
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
export type Settlement = Synced & Campagne & { id: string; coopId?: string; memberId: string; byStaffId: string; amount: number; method: string; date: string; viaPesee?: boolean; seq?: number; clientOpId?: string; refs?: { seq: number; amount: number }[] };
export type Mandat = Synced & Campagne & { id: string; coopId?: string; pisteurId: string; amount: number; date: string; note: string };
export type Depense = Synced & Campagne & { id: string; coopId?: string; pisteurId: string; category: string; amount: number; date: string; note: string };
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
    priceHistory: [],
  };
}

export function migrate(d: any): Data {
  const out = { ...d };
  if (!Array.isArray(out.mandats)) out.mandats = [];
  if (!Array.isArray(out.depenses)) out.depenses = [];
  if (!Array.isArray(out.settlements)) out.settlements = [];
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
      cultures: Array.isArray(m.cultures) && m.cultures.length ? m.cultures : [{ cropId: m.cropId || "cacao", superficie: Number(m.superficie) || 0 }],
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
  }
  // Chaque coopérative a des prix/commissions complets.
  out.coops = out.coops.map((c: any) => {
    const prices = { ...c.prices };
    const commissions = { ...c.commissions };
    CROPS.forEach((cr) => {
      if (prices[cr.id] == null) prices[cr.id] = DEFAULT_PRICES[cr.id] ?? out.prixKg;
      if (commissions[cr.id] == null) commissions[cr.id] = DEFAULT_COMM[cr.id] ?? out.commissionRate;
    });
    return { ...c, prices, commissions, momo: Array.isArray(c.momo) ? c.momo : [], filieres: Array.isArray(c.filieres) ? c.filieres : [] };
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
  };
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
  const depenses = (data.depenses || []).filter((x) => x.pisteurId === pid).reduce((s, x) => s + x.amount, 0);
  const commission = cols.reduce((s, c) => s + Math.round(c.kg * collectionComm(data, c)), 0);
  const solde = mandat - achats - depenses;
  return { poids, achats, achatsPesees, soldes, mandat, depenses, commission, solde, count: cols.length };
}
