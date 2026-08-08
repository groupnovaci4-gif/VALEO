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
  Staff,
  migrate,
  seed,
  uid,
} from "./lib";

const KEY = "coop:data:v3";

export function useCoopData() {
  const [data, setData] = useState<Data | null>(null);
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<any>(KEY, null);
      setData(saved ? migrate(saved) : seed());
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready && data) {
      if (first.current) {
        first.current = false;
      }
      storage.setItem(KEY, data as any);
    }
  }, [data, ready]);

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
      const rec: Collection = { id: uid(), seq: d.seq, ...c };
      let loans = d.loans;
      if (c._repay && c._repay.amount > 0) {
        loans = loans.map((l) =>
          l.id === c._repay.loanId
            ? { ...l, soldeRestant: Math.max(0, l.soldeRestant - c._repay.amount), status: l.soldeRestant - c._repay.amount <= 0 ? "rembourse" : l.status }
            : l,
        );
      }
      delete (rec as any)._repay;
      created = rec;
      return { ...d, seq: d.seq + 1, collections: [...d.collections, rec], loans };
    });
    return created;
  }, []);

  const addLoan = useCallback((l: Partial<Loan>) => {
    setData((d) => (d ? { ...d, loans: [...d.loans, { id: uid(), status: "en_attente", soldeRestant: 0, decidedBy: null, ...l } as Loan] } : d));
  }, []);

  const decideLoan = useCallback((id: string, status: string, by: string) => {
    setData((d) =>
      d ? { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status, soldeRestant: status === "approuve" ? l.amount : 0, decidedBy: by } : l)) } : d,
    );
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
    setData((d) => (d ? { ...d, prixKg: p.prixKg, saison: p.saison, commissionRate: p.commissionRate ?? d.commissionRate } : d));
  }, []);

  const reset = useCallback(() => setData(seed()), []);

  const createLoginPlanteur = useCallback((m: Partial<Member>): string => {
    const id = uid();
    setData((d) => {
      if (!d) return d;
      const code = `PL-2026-${String(d.memberSeq).padStart(4, "0")}`;
      return { ...d, memberSeq: d.memberSeq + 1, members: [...d.members, { id, code, momo: null, photo: null, ...m } as Member] };
    });
    return id;
  }, []);

  const createLoginCoop = useCallback((p: { coopNom?: string; nom: string; tel?: string; photo?: string | null }): string => {
    const id = uid();
    setData((d) =>
      d
        ? { ...d, coop: { ...d.coop, nom: p.coopNom || d.coop.nom }, staff: [...d.staff, { id, role: "patron", nom: p.nom, tel: p.tel, photo: p.photo || null }] }
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
    addLoan,
    decideLoan,
    linkMemberMomo,
    setMemberPhoto,
    addStaff,
    setStaffPhoto,
    addCoopMomo,
    delCoopMomo,
    setPrix,
    reset,
    createLoginPlanteur,
    createLoginCoop,
  };
}
