import { useCallback, useEffect, useRef, useState } from "react";

import { storage } from "@/src/utils/storage";
import {
  Collection,
  CoopMomo,
  Data,
  Depense,
  Loan,
  Mandat,
  Member,
  Momo,
  Settlement,
  Staff,
  migrate,
  seed,
  uid,
} from "./lib";

const KEY = "coop:data:v3";
const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

async function fetchRemote(): Promise<Data | null> {
  if (!BACKEND) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${BACKEND}/api/state`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return migrate(await r.json());
  } catch {
    return null;
  }
}

async function pushRemote(d: Data): Promise<void> {
  if (!BACKEND) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    await fetch(`${BACKEND}/api/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: d }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch {}
}

export function useCoopData() {
  const [data, setData] = useState<Data | null>(null);
  const [ready, setReady] = useState(false);
  const remoteApply = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const remote = await fetchRemote();
      remoteApply.current = true;
      if (remote) setData(remote);
      else {
        const saved = await storage.getItem<any>(KEY, null);
        setData(saved ? migrate(saved) : seed());
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || !data) return;
    storage.setItem(KEY, data as any); // cache hors-ligne
    if (remoteApply.current) {
      remoteApply.current = false; // vient du backend/cache : ne pas renvoyer
      return;
    }
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => pushRemote(data), 700);
  }, [data, ready]);

  // Recharge la dernière version du backend (admin, autre appareil).
  const refresh = useCallback(async () => {
    const remote = await fetchRemote();
    if (remote) {
      remoteApply.current = true;
      setData(remote);
    }
  }, []);

  const addMember = useCallback((m: Partial<Member>) => {
    setData((d) => {
      if (!d) return d;
      const code = `PL-2026-${String(d.memberSeq).padStart(4, "0")}`;
      return { ...d, memberSeq: d.memberSeq + 1, members: [...d.members, { id: uid(), code, momo: null, photo: null, ...m } as Member] };
    });
  }, []);

  const addMandat = useCallback((m: Partial<Mandat>) => {
    setData((d) => (d ? { ...d, mandats: [...d.mandats, { id: uid(), date: new Date().toISOString(), ...m } as Mandat] } : d));
  }, []);

  const addDepense = useCallback((x: Partial<Depense>) => {
    setData((d) => (d ? { ...d, depenses: [...d.depenses, { id: uid(), date: new Date().toISOString(), ...x } as Depense] } : d));
  }, []);

  const addCollection = useCallback((c: any): Collection | null => {
    let created: Collection | null = null;
    setData((d) => {
      if (!d) return d;
      const rec: Collection = { ...c, id: c.id || uid(), seq: c.seq ?? d.seq };
      let loans = d.loans;
      if (c._repay && c._repay.amount > 0) {
        loans = loans.map((l) =>
          l.id === c._repay.loanId
            ? { ...l, soldeRestant: Math.max(0, l.soldeRestant - c._repay.amount), status: l.soldeRestant - c._repay.amount <= 0 ? "rembourse" : l.status }
            : l,
        );
      }
      delete (rec as any)._repay;
      // Solde des restes dus antérieurs, appliqué aux plus anciennes collectes d'abord (FIFO).
      const settleReq = Number(c._settle) || 0;
      let settle = settleReq;
      let cols = d.collections;
      let settlements = d.settlements || [];
      if (settle > 0) {
        cols = cols.map((x) => {
          if (x.memberId !== rec.memberId || x.reste <= 0 || settle <= 0) return x;
          const applied = Math.min(settle, x.reste);
          settle -= applied;
          return { ...x, paye: x.paye + applied, reste: x.reste - applied };
        });
        const appliedTotal = settleReq - settle;
        if (appliedTotal > 0) {
          settlements = [
            ...settlements,
            { id: uid(), memberId: rec.memberId, byStaffId: rec.byStaffId, amount: appliedTotal, method: rec.method, date: rec.date, viaPesee: true },
          ];
          (rec as any).oldRegle = appliedTotal;
        }
      }
      delete (rec as any)._settle;
      created = rec;
      return { ...d, seq: d.seq + 1, collections: [...cols, rec], loans, settlements };
    });
    return created;
  }, []);

  // Solde immédiat de tout le reste dû d'un planteur (paiement hors livraison). Retourne le reçu.
  const settleMemberDue = useCallback((memberId: string, byStaffId: string, method: string): Settlement | null => {
    let receipt: Settlement | null = null;
    setData((d) => {
      if (!d) return d;
      const total = d.collections.filter((c) => c.memberId === memberId).reduce((s, c) => s + (c.reste > 0 ? c.reste : 0), 0);
      if (total <= 0) return d;
      const rec: Settlement = { id: uid(), memberId, byStaffId, amount: total, method, date: new Date().toISOString(), viaPesee: false };
      receipt = rec;
      return {
        ...d,
        collections: d.collections.map((c) => (c.memberId === memberId && c.reste > 0 ? { ...c, paye: c.paye + c.reste, reste: 0 } : c)),
        settlements: [...(d.settlements || []), rec],
      };
    });
    return receipt;
  }, []);

  const addLoan = useCallback((l: Partial<Loan>) => {
    setData((d) => (d ? { ...d, loans: [...d.loans, { id: uid(), status: "en_attente", soldeRestant: 0, decidedBy: null, ...l } as Loan] } : d));
  }, []);

  const decideLoan = useCallback((id: string, status: string, by: string) => {
    setData((d) =>
      d ? { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status, soldeRestant: status === "approuve" ? l.amount : 0, decidedBy: by } : l)) } : d,
    );
  }, []);

  const approveLoan = useCallback((id: string, granted: number, paymentMode: string, by: string) => {
    setData((d) =>
      d
        ? { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: "approuve", amount: granted, soldeRestant: granted, paymentMode, decidedBy: by, decidedAt: new Date().toISOString() } : l)) }
        : d,
    );
  }, []);
  const refuseLoan = useCallback((id: string, by: string) => {
    setData((d) => (d ? { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: "refuse", soldeRestant: 0, decidedBy: by, decidedAt: new Date().toISOString() } : l)) } : d));
  }, []);

  const updateMember = useCallback((id: string, patch: Partial<Member>) => {
    setData((d) => (d ? { ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : d));
  }, []);
  const deleteMember = useCallback((id: string) => {
    setData((d) =>
      d ? { ...d, members: d.members.filter((m) => m.id !== id), collections: d.collections.filter((c) => c.memberId !== id), loans: d.loans.filter((l) => l.memberId !== id) } : d,
    );
  }, []);
  const updateStaff = useCallback((id: string, patch: Partial<Staff>) => {
    setData((d) => (d ? { ...d, staff: d.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d));
  }, []);
  const deleteStaff = useCallback((id: string) => {
    setData((d) => (d ? { ...d, staff: d.staff.filter((s) => s.id !== id) } : d));
  }, []);

  const linkMemberMomo = useCallback((mId: string, momo: Momo | null) => {
    setData((d) => (d ? { ...d, members: d.members.map((m) => (m.id === mId ? { ...m, momo } : m)) } : d));
  }, []);

  const setMemberPhoto = useCallback((mId: string, photo: string | null) => {
    setData((d) => (d ? { ...d, members: d.members.map((m) => (m.id === mId ? { ...m, photo } : m)) } : d));
  }, []);

  const addStaff = useCallback((s: Partial<Staff>) => {
    setData((d) => (d ? { ...d, staff: [...d.staff, { id: uid(), photo: null, ...s } as Staff] } : d));
  }, []);

  const setStaffPhoto = useCallback((id: string, photo: string | null) => {
    setData((d) => (d ? { ...d, staff: d.staff.map((s) => (s.id === id ? { ...s, photo } : s)) } : d));
  }, []);

  const addCoopMomo = useCallback((acc: Partial<CoopMomo>) => {
    setData((d) => (d ? { ...d, coop: { ...d.coop, momo: [...d.coop.momo, { id: uid(), ...acc } as CoopMomo] } } : d));
  }, []);

  const delCoopMomo = useCallback((id: string) => {
    setData((d) => (d ? { ...d, coop: { ...d.coop, momo: d.coop.momo.filter((a) => a.id !== id) } } : d));
  }, []);

  const setPrix = useCallback((p: { prixKg: number; saison: string; commissionRate?: number }) => {
    setData((d) => {
      if (!d) return d;
      const changed = p.prixKg !== d.prixKg;
      const priceHistory = changed ? [...(d.priceHistory || []), { date: new Date().toISOString(), prixKg: p.prixKg }] : d.priceHistory || [];
      return { ...d, prixKg: p.prixKg, saison: p.saison, commissionRate: p.commissionRate ?? d.commissionRate, priceHistory };
    });
  }, []);

  const reset = useCallback(() => setData(seed()), []);

  const replaceData = useCallback((d: Data) => setData(d), []);

  const setCollectionSignature = useCallback((id: string, signature: any) => {
    setData((d) => (d ? { ...d, collections: d.collections.map((c) => (c.id === id ? { ...c, signature } as any : c)) } : d));
  }, []);

  const createLoginPlanteur = useCallback((m: Partial<Member>): string => {
    const id = uid();
    setData((d) => {
      if (!d) return d;
      const code = `PL-2026-${String(d.memberSeq).padStart(4, "0")}`;
      return { ...d, memberSeq: d.memberSeq + 1, members: [...d.members, { id, code, momo: null, photo: null, ...m } as Member] };
    });
    return id;
  }, []);

  const createLoginCoop = useCallback((p: { coop: Partial<any>; responsable: { nom: string; prenoms?: string; tel?: string; email?: string; fonction?: string; idNumber?: string; photo?: string | null; pin?: any } }): string => {
    const id = uid();
    const r = p.responsable;
    const fullName = `${r.nom || ""} ${r.prenoms || ""}`.trim() || r.nom;
    setData((d) =>
      d
        ? {
            ...d,
            coop: { ...d.coop, ...p.coop, momo: d.coop.momo, filieres: p.coop.filieres || d.coop.filieres || [] },
            staff: [
              ...d.staff,
              { id, role: "patron", nom: fullName, prenoms: r.prenoms, tel: r.tel, email: r.email, fonction: r.fonction || "Responsable", idNumber: r.idNumber, photo: r.photo || null, pin: r.pin || null },
            ],
          }
        : d,
    );
    return id;
  }, []);

  return {
    data,
    ready,
    addMember,
    addMandat,
    addDepense,
    addCollection,
    settleMemberDue,
    addLoan,
    decideLoan,
    approveLoan,
    refuseLoan,
    updateMember,
    deleteMember,
    updateStaff,
    deleteStaff,
    linkMemberMomo,
    setMemberPhoto,
    addStaff,
    setStaffPhoto,
    addCoopMomo,
    delCoopMomo,
    setPrix,
    reset,
    replaceData,
    setCollectionSignature,
    createLoginPlanteur,
    createLoginCoop,
    refresh,
  };
}
