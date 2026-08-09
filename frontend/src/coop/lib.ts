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
];
export const crop = (id: string): Crop => CROPS.find((c) => c.id === id) || CROPS[0];

export type Operator = { id: string; nom: string; color: string; ink: string; short: string };
export const OPERATORS: Operator[] = [
  { id: "orange", nom: "Orange Money", color: "#F16E00", ink: "#fff", short: "OM" },
  { id: "wave", nom: "Wave", color: "#1DC3F0", ink: "#062A33", short: "Wave" },
  { id: "mtn", nom: "MTN MoMo", color: "#FFCB05", ink: "#1a1a1a", short: "MoMo" },
  { id: "moov", nom: "Moov Money", color: "#1D4E9F", ink: "#fff", short: "Moov" },
];
export const op = (id: string): Operator => OPERATORS.find((o) => o.id === id) || OPERATORS[0];

export const ROLES: Record<string, { label: string; sub: string; icon: string }> = {
  patron: { label: "Patron / Acheteur", sub: "Gère la coopérative, approuve les prêts", icon: "shield-check" },
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
  rembourse: { label: "Remboursé", color: C.muted, bg: "#F2EEE7", icon: "check" },
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
export const ticketNo = (seq: number) => `P-2026-${String(seq).padStart(4, "0")}`;
export const byDateDesc = (a: any, b: any) => +new Date(b.date) - +new Date(a.date);

/* --------------------------------- Types --------------------------------- */
export type Momo = { operator: string; number: string; label?: string };
export type Culture = { cropId: string; superficie: number };
export type Member = {
  id: string;
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
export type Staff = { id: string; nom: string; role: string; tel?: string; photo?: string | null; prenoms?: string; email?: string; fonction?: string; idNumber?: string; pin?: PinRecord | null };
export type Retenue = { label: string; amount: number };
export type Collection = {
  id: string;
  seq: number;
  memberId: string;
  byStaffId: string;
  date: string;
  kg: number;
  prixKg: number;
  cropId?: string;
  brut: number;
  retenues: Retenue[];
  net: number;
  paye: number;
  reste: number;
  method: string;
  note: string;
  signature?: { paths: string[]; w: number; h: number } | null;
  _repay?: { loanId: string; amount: number } | null;
};
export type Loan = {
  id: string;
  memberId: string;
  type: string;
  amount: number;
  motif: string;
  date: string;
  status: string;
  soldeRestant: number;
  paymentMode?: string;
  decidedBy: string | null;
};
export type Mandat = { id: string; pisteurId: string; amount: number; date: string; note: string };
export type Depense = { id: string; pisteurId: string; category: string; amount: number; date: string; note: string };
export type CoopMomo = { id: string; operator: string; number: string; label?: string };
export type PriceHistory = { date: string; prixKg: number };
export type Coop = {
  nom: string;
  sigle?: string;
  agrement?: string;
  type?: string;
  dateCreation?: string;
  filieres?: string[];
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
  staff: Staff[];
  members: Member[];
  collections: Collection[];
  loans: Loan[];
  mandats: Mandat[];
  depenses: Depense[];
  priceHistory: PriceHistory[];
};
export type Session =
  | { side: "planteur"; memberId: string }
  | { side: "coop"; role: string; staffId: string };

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
    staff: [],
    members: [],
    collections: [],
    loans: [],
    mandats: [],
    depenses: [],
    priceHistory: [],
  };
}

export function migrate(d: any): Data {
  const out = { ...d };
  if (!Array.isArray(out.mandats)) out.mandats = [];
  if (!Array.isArray(out.depenses)) out.depenses = [];
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
  let seqBase = typeof out.memberSeq === "number" ? out.memberSeq : 1;
  out.members = out.members.map((m: any) => {
    let code = m.code;
    if (!code) {
      code = `PL-2026-${String(seqBase).padStart(4, "0")}`;
      seqBase += 1;
    }
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
  return out as Data;
}

/* ------------------------------ Derived calc ----------------------------- */
export function memberStats(mId: string, cols: Collection[]) {
  const list = cols.filter((c) => c.memberId === mId);
  return {
    kg: list.reduce((s, c) => s + c.kg, 0),
    net: list.reduce((s, c) => s + c.net, 0),
    paye: list.reduce((s, c) => s + c.paye, 0),
    reste: list.reduce((s, c) => s + c.reste, 0),
    count: list.length,
  };
}
export const activeLoan = (mId: string, loans: Loan[]) =>
  loans.find((l) => l.memberId === mId && l.status === "approuve" && l.soldeRestant > 0);

export const memberCultures = (m: any): Culture[] =>
  Array.isArray(m?.cultures) && m.cultures.length ? m.cultures : m?.cropId ? [{ cropId: m.cropId, superficie: Number(m.superficie) || 0 }] : [];
export const culturesLabel = (m: any): string => memberCultures(m).map((c) => crop(c.cropId).nom).join(", ") || "—";
export const totalSuperficie = (m: any): number => memberCultures(m).reduce((s, c) => s + (Number(c.superficie) || 0), 0);

export function pisteurStats(pid: string, data: Data) {
  const cols = (data.collections || []).filter((c) => c.byStaffId === pid);
  const poids = cols.reduce((s, c) => s + c.kg, 0);
  const achats = cols.reduce((s, c) => s + c.paye, 0);
  const mandat = (data.mandats || []).filter((m) => m.pisteurId === pid).reduce((s, m) => s + m.amount, 0);
  const depenses = (data.depenses || []).filter((x) => x.pisteurId === pid).reduce((s, x) => s + x.amount, 0);
  const commission = Math.round(poids * (data.commissionRate || 0));
  const solde = mandat - achats - depenses;
  return { poids, achats, mandat, depenses, commission, solde, count: cols.length };
}
