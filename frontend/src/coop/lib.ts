// VALEO — logique métier & données (100% hors-ligne)

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
  commis: { label: "Commis péseur", sub: "Pèse et délivre les bordereaux", icon: "scale" },
  pisteur: { label: "Pisteur", sub: "Collecte en tournée dans les villages", icon: "truck" },
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
export type Member = {
  id: string;
  code: string;
  nom: string;
  village: string;
  idNumber: string;
  superficie: number;
  cropId: string;
  tel: string;
  momo: Momo | null;
  photo?: string | null;
};
export type Staff = { id: string; nom: string; role: string; tel?: string; photo?: string | null };
export type Retenue = { label: string; amount: number };
export type Collection = {
  id: string;
  seq: number;
  memberId: string;
  byStaffId: string;
  date: string;
  kg: number;
  prixKg: number;
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
  decidedBy: string | null;
};
export type Mandat = { id: string; pisteurId: string; amount: number; date: string; note: string };
export type Depense = { id: string; pisteurId: string; category: string; amount: number; date: string; note: string };
export type CoopMomo = { id: string; operator: string; number: string; label?: string };
export type PriceHistory = { date: string; prixKg: number };
export type Data = {
  saison: string;
  prixKg: number;
  seq: number;
  memberSeq: number;
  commissionRate: number;
  coop: { nom: string; momo: CoopMomo[] };
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
export function seed(): Data {
  const ids: Record<string, string> = {};
  const names = ["Kouassi Yao", "Aya Brou", "Konan Kouadio", "Amoin Adjoua", "Gnamien Koffi"];
  names.forEach((n) => (ids[n] = uid()));
  const vil: Record<string, string> = { "Kouassi Yao": "Sikensi", "Aya Brou": "Sikensi", "Konan Kouadio": "Gomon", "Amoin Adjoua": "Gomon", "Gnamien Koffi": "Bécédi" };
  const momo: Record<string, Momo> = { "Kouassi Yao": { operator: "orange", number: "07 08 11 22 33" }, "Aya Brou": { operator: "wave", number: "05 44 55 66 77" } };
  const idcard: Record<string, string> = { "Kouassi Yao": "CI 003 451 2", "Aya Brou": "CI 008 823 1", "Konan Kouadio": "CI 010 293 4", "Amoin Adjoua": "CI 011 904 5", "Gnamien Koffi": "CI 012 778 8" };
  const superf: Record<string, number> = { "Kouassi Yao": 3, "Aya Brou": 1.5, "Konan Kouadio": 2, "Amoin Adjoua": 2.5, "Gnamien Koffi": 4 };
  const tels: Record<string, string> = { "Kouassi Yao": "07 08 11 22 33", "Aya Brou": "05 44 55 66 77", "Konan Kouadio": "01 23 45 67 89", "Amoin Adjoua": "07 77 88 99 00", "Gnamien Koffi": "05 11 22 33 44" };
  const members: Member[] = names.map((n, i) => ({ id: ids[n], code: `PL-2026-${String(i + 1).padStart(4, "0")}`, nom: n, village: vil[n], idNumber: idcard[n], superficie: superf[n], cropId: "cacao", tel: tels[n], momo: momo[n] || null, photo: null }));

  const staff: Staff[] = [
    { id: "st_patron", nom: "M. Diomandé", role: "patron", photo: null },
    { id: "st_commis", nom: "Awa Touré", role: "commis", photo: null },
    { id: "st_pisteur", nom: "Bakary Coulibaly", role: "pisteur", photo: null },
  ];

  const now = new Date();
  const dOff = (days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 9).toISOString();
  const mk = (seq: number, nom: string, days: number, kg: number, ret: Retenue[], paye: number, staffId: string, method: string): Collection => {
    const prixKg = 1800,
      brut = kg * prixKg,
      retTot = ret.reduce((s, r) => s + r.amount, 0),
      net = brut - retTot;
    return { id: uid(), seq, memberId: ids[nom], byStaffId: staffId, date: dOff(days), kg, prixKg, brut, retenues: ret, net, paye, reste: net - paye, method, note: "" };
  };
  const collections: Collection[] = [
    mk(1, "Kouassi Yao", 6, 320, [{ label: "Remboursement prêt", amount: 20000 }], 556000, "st_commis", "espece"),
    mk(2, "Konan Kouadio", 6, 180, [], 324000, "st_commis", "momo"),
    mk(3, "Aya Brou", 4, 95, [{ label: "Cotisation", amount: 4000 }], 167000, "st_pisteur", "momo"),
    mk(4, "Gnamien Koffi", 2, 240, [], 300000, "st_commis", "espece"),
    mk(5, "Kouassi Yao", 0, 150, [], 270000, "st_commis", "espece"),
    mk(6, "Amoin Adjoua", 0, 210, [{ label: "Sacs", amount: 3000 }], 375000, "st_pisteur", "espece"),
  ];

  const loans: Loan[] = [
    { id: uid(), memberId: ids["Kouassi Yao"], type: "intrant", amount: 60000, motif: "Engrais NPK", date: dOff(20), status: "approuve", soldeRestant: 40000, decidedBy: "st_patron" },
    { id: uid(), memberId: ids["Gnamien Koffi"], type: "argent", amount: 150000, motif: "Scolarité enfants", date: dOff(1), status: "en_attente", soldeRestant: 0, decidedBy: null },
    { id: uid(), memberId: ids["Aya Brou"], type: "intrant", amount: 40000, motif: "Produits phyto", date: dOff(0), status: "en_attente", soldeRestant: 0, decidedBy: null },
  ];

  const mandats: Mandat[] = [
    { id: uid(), pisteurId: "st_pisteur", amount: 1000000, date: dOff(7), note: "Mandat campagne — zone Gomon" },
  ];
  const depenses: Depense[] = [
    { id: uid(), pisteurId: "st_pisteur", category: "transport", amount: 15000, date: dOff(4), note: "Location tricycle" },
    { id: uid(), pisteurId: "st_pisteur", category: "sacs", amount: 10000, date: dOff(4), note: "" },
    { id: uid(), pisteurId: "st_pisteur", category: "restauration", amount: 8000, date: dOff(0), note: "" },
  ];

  return {
    saison: "Campagne 2025-2026",
    prixKg: 1800,
    seq: 7,
    memberSeq: 6,
    commissionRate: 25,
    coop: { nom: "Coopérative COOPAGRI", momo: [{ id: uid(), operator: "wave", number: "01 02 03 04 05", label: "Compte principal" }] },
    staff,
    members,
    collections,
    loans,
    mandats,
    depenses,
    priceHistory: [{ date: dOff(30), prixKg: 1700 }, { date: dOff(10), prixKg: 1800 }],
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
  if (!Array.isArray(out.priceHistory)) out.priceHistory = [{ date: new Date().toISOString(), prixKg: out.prixKg }];
  let seqBase = typeof out.memberSeq === "number" ? out.memberSeq : 1;
  out.members = out.members.map((m: any) => {
    let code = m.code;
    if (!code) {
      code = `PL-2026-${String(seqBase).padStart(4, "0")}`;
      seqBase += 1;
    }
    return { ...m, code, momo: m.momo != null ? m.momo : null, photo: m.photo != null ? m.photo : null };
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
