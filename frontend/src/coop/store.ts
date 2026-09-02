import { useCallback, useEffect, useRef, useState } from "react";

import { storage } from "@/src/utils/storage";

import { loadCache, saveCache } from "./secureCache";
import { prepareSync } from "./sync";
import {
  Collection,
  Coop,
  CoopMomo,
  CROPS,
  Data,
  DEFAULT_COMM,
  DEFAULT_PRICES,
  Depense,
  genMemberCode,
  Loan,
  Mandat,
  Member,
  Momo,
  Origine,
  Settlement,
  Sortie,
  Staff,
  makeTicket,
  migrate,
  nextTicketSeq,
  seed,
  ticketOf,
  uid,
} from "./lib";

const KEY = "coop:data:v3";
const TOKEN_KEY = "coop:jwt";
const IDENT_KEY = "coop:identity";
const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Identity = { sub: string; coopId: string; role?: string; side: "coop" | "planteur" };
export function identToSession(id: Identity): any {
  return id.side === "planteur"
    ? { side: "planteur", memberId: id.sub, coopId: id.coopId }
    : { side: "coop", role: id.role, staffId: id.sub, coopId: id.coopId };
}

async function apiFetch(path: string, opts: any, token: string | null): Promise<Response | null> {
  if (!BACKEND) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${BACKEND}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers || {}) },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r;
  } catch {
    clearTimeout(t);
    return null;
  }
}

export function useCoopData() {
  const [data, setData] = useState<Data | null>(null);
  const [ready, setReady] = useState(false);
  const [bootSession, setBootSession] = useState<any>(null);
  const [authError, setAuthError] = useState(false);
  // Message d'erreur de synchronisation (écriture refusée par le serveur).
  const [syncError, setSyncError] = useState<string | null>(null);
  const remoteApply = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<Data | null>(null);
  // Dernière version connue du serveur : référence pour calculer ce qui a
  // changé localement (horodatages et suppressions).
  const serverRef = useRef<Data | null>(null);
  const dirty = useRef(false); // modifications locales non encore synchronisées
  const coopIdRef = useRef<string>("");
  const tokenRef = useRef<string>("");
  const setCoopScope = useCallback((id: string) => { coopIdRef.current = id || ""; }, []);
  const cid = () => coopIdRef.current || undefined;

  const clearAuth = useCallback(async () => {
    tokenRef.current = "";
    await storage.secureRemove(TOKEN_KEY);
    await storage.secureRemove(IDENT_KEY);
    await storage.removeItem(KEY);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
      const ident = await storage.secureGet<any>(IDENT_KEY, null);
      tokenRef.current = token || "";
      if (token && ident && ident.coopId) {
        coopIdRef.current = ident.coopId;
        setBootSession(identToSession(ident));
        const r = await apiFetch("/api/state", {}, token);
        remoteApply.current = true;
        if (r && r.ok) { const fresh = migrate(await r.json()); serverRef.current = fresh; setData(fresh); }
        else if (r && r.status === 401) { await clearAuth(); setBootSession(null); setData(seed()); }
        else { const saved = await loadCache<any>(KEY); setData(saved ? migrate(saved) : seed()); }
      } else {
        setData(seed());
      }
      setReady(true);
    })();
  }, [clearAuth]);

  // Tire la dernière version du backend et la prend comme nouvelle référence.
  const pull = useCallback(async () => {
    if (!tokenRef.current) return;
    const r = await apiFetch("/api/state", {}, tokenRef.current);
    if (r && r.ok) {
      const fresh = migrate(await r.json());
      serverRef.current = fresh;
      remoteApply.current = true;
      setData(fresh);
    } else if (r && r.status === 401) { await clearAuth(); setAuthError(true); }
  }, [clearAuth]);

  // Pousse les changements locaux (horodatés + suppressions explicites).
  const push = useCallback(async (current: Data) => {
    if (!tokenRef.current) return;
    const { data: payload, deletions } = prepareSync(current, serverRef.current);
    const r = await apiFetch("/api/state", { method: "PUT", body: JSON.stringify({ data: payload, deletions }) }, tokenRef.current);
    if (r && r.status === 401) { await clearAuth(); setAuthError(true); return; }
    if (r && r.status === 403) {
      // Le serveur a refusé une écriture que ce rôle n'a pas le droit de faire :
      // on annule la modification locale en rechargeant la vérité du serveur.
      let detail = "Votre rôle ne permet pas cette modification.";
      try { detail = (await r.json()).detail || detail; } catch {}
      dirty.current = false;
      setSyncError(detail);
      await pull();
      return;
    }
    if (r && r.ok) { serverRef.current = payload; dirty.current = false; }
    // Réseau indisponible : `dirty` reste vrai, la prochaine occasion réessaiera.
  }, [clearAuth, pull]);

  useEffect(() => {
    if (!ready || !data) return;
    dataRef.current = data;
    saveCache(KEY, data); // cache hors-ligne chiffré (AES)
    if (remoteApply.current) {
      remoteApply.current = false; // vient du backend/cache : ne pas renvoyer
      return;
    }
    if (!tokenRef.current) return; // non authentifié : pas de sync
    dirty.current = true; // changement local à pousser
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => { push(data); }, 700);
  }, [data, ready, push]);

  // Retour au premier plan / tiré-pour-rafraîchir.
  const refresh = useCallback(async () => {
    if (!tokenRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    // On pousse d'abord les changements locaux pour ne pas les perdre, puis on
    // tire : la fusion par enregistrement rend les deux sens compatibles.
    if (dirty.current && dataRef.current) await push(dataRef.current);
    await pull();
  }, [push, pull]);

  const applyAuth = useCallback(async (res: any) => {
    tokenRef.current = res.token;
    await storage.secureSet(TOKEN_KEY, res.token);
    await storage.secureSet(IDENT_KEY, res.identity);
    coopIdRef.current = res.identity.coopId || "";
    remoteApply.current = true;
    setAuthError(false);
    setSyncError(null);
    const fresh = migrate(res.state);
    serverRef.current = fresh;
    setData(fresh);
    return identToSession(res.identity);
  }, []);

  // Vérifie une réponse de connexion et lève un message lisible par l'utilisateur.
  const assertLoginOk = async (r: Response | null) => {
    if (!r) throw new Error("Connexion au serveur impossible. Vérifiez votre réseau.");
    if (r.status === 401) throw new Error("Identifiants incorrects.");
    if (r.status === 429) {
      // Compte temporairement verrouillé après trop d'essais : le serveur dit
      // combien de temps attendre, on relaie son message tel quel.
      let m = "Trop de tentatives. Réessayez dans quelques minutes.";
      try { m = (await r.json()).detail || m; } catch {}
      throw new Error(m);
    }
    if (!r.ok) throw new Error("Erreur de connexion.");
  };

  const authLoginCoop = useCallback(async (identifier: string, secret: string) => {
    const r = await apiFetch("/api/auth/coop/login", { method: "POST", body: JSON.stringify({ identifier, secret }) }, null);
    await assertLoginOk(r);
    return applyAuth(await r!.json());
  }, [applyAuth]);

  const authLoginPlanteur = useCallback(async (phone: string, pin: string) => {
    const r = await apiFetch("/api/auth/planteur/login", { method: "POST", body: JSON.stringify({ phone, pin }) }, null);
    await assertLoginOk(r);
    return applyAuth(await r!.json());
  }, [applyAuth]);

  const authRegisterCoop = useCallback(async (p: { nom: string; email: string; password: string }) => {
    const r = await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(p) }, null);
    if (!r) throw new Error("Connexion au serveur impossible. Vérifiez votre réseau.");
    if (r.status === 409) throw new Error("Un compte existe déjà pour cette adresse e-mail.");
    if (!r.ok) { let m = "Erreur lors de la création."; try { m = (await r.json()).detail || m; } catch {} throw new Error(m); }
    return applyAuth(await r.json());
  }, [applyAuth]);

  const authLogout = useCallback(async () => {
    await clearAuth();
    serverRef.current = null;
    dirty.current = false;
    setSyncError(null);
    setBootSession(null);
    setData(seed());
  }, [clearAuth]);

  // Journal d'audit : envoi best-effort (acteur/horodatage posés côté serveur).
  const logAudit = useCallback((action: string, meta: Record<string, any> = {}) => {
    if (!tokenRef.current) return;
    apiFetch("/api/audit", { method: "POST", body: JSON.stringify({ action, meta }) }, tokenRef.current).catch(() => {});
  }, []);
  const fetchAudit = useCallback(async (): Promise<any[]> => {
    if (!tokenRef.current) return [];
    const r = await apiFetch("/api/audit", {}, tokenRef.current);
    return r && r.ok ? await r.json() : [];
  }, []);


  const addMember = useCallback((m: Partial<Member>) => {
    setData((d) => {
      if (!d) return d;
      const code = genMemberCode(d.members);
      return { ...d, memberSeq: d.memberSeq + 1, members: [...d.members, { id: uid(), coopId: cid(), code, momo: null, photo: null, ...m } as Member] };
    });
  }, []);

  const addMandat = useCallback((m: Partial<Mandat>) => {
    setData((d) => (d ? { ...d, mandats: [...d.mandats, { id: uid(), coopId: cid(), saison: d.saison, date: new Date().toISOString(), ...m } as Mandat] } : d));
  }, []);

  // Sortie de magasin (expédition, vente, transfert, perte) : contrepartie des
  // collectes dans le calcul du stock.
  const addSortie = useCallback((x: Partial<Sortie>) => {
    setData((d) => (d ? { ...d, sorties: [...(d.sorties || []), { id: uid(), coopId: cid(), saison: d.saison, date: new Date().toISOString(), ...x } as Sortie] } : d));
    logAudit("sortie_stock", { cropId: x.cropId, kg: x.kg, type: x.type, destinataire: x.destinataire || "" });
  }, [logAudit]);

  const addDepense = useCallback((x: Partial<Depense>) => {
    setData((d) => (d ? { ...d, depenses: [...d.depenses, { id: uid(), coopId: cid(), saison: d.saison, date: new Date().toISOString(), ...x } as Depense] } : d));
  }, []);

  const addCollection = useCallback((c: any): Collection | null => {
    let created: Collection | null = null;
    let repayAudit = 0;
    setData((d) => {
      if (!d) return d;
      const staffId = c.byStaffId || "";
      // Suite propre à l'agent : le numéro reste unique même si deux agents
      // pèsent hors-ligne en même temps.
      let nextSeq = c.seq ?? nextTicketSeq(staffId, d);
      // L'origine est figée à la création, au même titre que le prix : elle
      // décide si le poids entre directement en magasin (pesée du patron ou du
      // magasinier) ou s'il doit d'abord être vérifié (collecte d'un pisteur).
      const agent = (d.staff || []).find((x) => x.id === staffId);
      const origine: Origine = c.origine || (agent && agent.role === "pisteur" ? "bord_champ" : "magasin");
      // NB : toute collecte créée à partir d'ici porte son origine. Les
      // collectes antérieures n'en ont pas et restent comptées en magasin
      // (cf. `origineOf`) — leur livraison est déjà faite.
      const rec: Collection = {
        ...c, id: c.id || uid(), seq: nextSeq, ticket: c.ticket || makeTicket(staffId, nextSeq),
        coopId: c.coopId || cid(), saison: c.saison || d.saison, origine,
      };
      let dSeq = Math.max(d.seq, nextSeq + 1); // compteur hérité, conservé pour l'espace admin

      // --- Recouvrement d'avance : applique le montant recouvré aux avances
      //     approuvées du planteur (FIFO), en réduisant le solde restant. ---
      let loans = d.loans;
      const repayAmt = c._repay && c._repay.amount > 0 ? c._repay.amount : 0;
      repayAudit = repayAmt;
      if (repayAmt > 0) {
        let left = repayAmt;
        const active = loans
          .filter((l) => l.memberId === rec.memberId && l.status === "approuve" && l.soldeRestant > 0)
          .sort((a, b) => +new Date(a.date) - +new Date(b.date));
        const applied: Record<string, number> = {};
        for (const l of active) {
          if (left <= 0) break;
          const take = Math.min(left, l.soldeRestant);
          applied[l.id] = take;
          left -= take;
        }
        loans = loans.map((l) => {
          if (applied[l.id] == null) return l;
          const nsr = Math.max(0, l.soldeRestant - applied[l.id]);
          return { ...l, soldeRestant: nsr, status: nsr <= 0 ? "rembourse" : l.status };
        });
      }
      delete (rec as any)._repay;

      // --- Solde des restes dus antérieurs (au planteur), sans modifier les
      //     reçus d'origine : on incrémente resteSolde (FIFO) et on émet un
      //     reçu de solde distinct référençant les reçus initiaux. ---
      const settleReq = Number(c._settle) || 0;
      let settle = settleReq;
      let cols = d.collections;
      let settlements = d.settlements || [];
      if (settle > 0) {
        const refs: { seq: number; ticket?: string; amount: number }[] = [];
        // Même cloisonnement qu'ailleurs : un pisteur ne solde que ses propres
        // restes. `origine === "bord_champ"` identifie sa pesée sans avoir à
        // relire son rôle une seconde fois.
        const sien = (x: Collection) => origine !== "bord_champ" || x.byStaffId === rec.byStaffId;
        cols = cols
          .slice()
          .sort((a, b) => +new Date(a.date) - +new Date(b.date))
          .map((x) => {
            const out = Math.max(0, (x.reste || 0) - (x.resteSolde || 0));
            if (x.memberId !== rec.memberId || !sien(x) || out <= 0 || settle <= 0) return x;
            const applied = Math.min(settle, out);
            settle -= applied;
            refs.push({ seq: x.seq, ticket: ticketOf(x), amount: applied });
            return { ...x, resteSolde: (x.resteSolde || 0) + applied };
          });
        const appliedTotal = settleReq - settle;
        if (appliedTotal > 0) {
          // Le reçu de solde prend le numéro suivant de la suite de l'agent.
          const settSeq = nextSeq + 1;
          dSeq = Math.max(dSeq, settSeq + 1);
          settlements = [
            ...settlements,
            { id: uid(), coopId: rec.coopId, saison: d.saison, memberId: rec.memberId, byStaffId: rec.byStaffId, amount: appliedTotal, method: rec.method, date: rec.date, viaPesee: true, seq: settSeq, ticket: makeTicket(staffId, settSeq), clientOpId: rec.clientOpId ? `${rec.clientOpId}:solde` : undefined, refs },
          ];
          (rec as any).oldRegle = appliedTotal;
        }
      }
      delete (rec as any)._settle;
      created = rec;
      return { ...d, seq: dSeq, collections: [...cols, rec], loans, settlements };
    });
    if (created) { const cc: any = created; logAudit("pesee", { memberId: cc.memberId, seq: cc.seq, cropId: cc.cropId, origine: cc.origine, kg: cc.kg, net: cc.net, paye: cc.paye, reste: cc.reste, recouvre: repayAudit, oldRegle: cc.oldRegle || 0 }); }
    return created;
  }, [logAudit]);

  // Solde immédiat de tout le reste dû d'un planteur (paiement hors livraison).
  // Ne modifie PAS les reçus d'origine : suit le solde via resteSolde et émet
  // un nouveau reçu de solde référençant les reçus initiaux. Retourne ce reçu.
  const settleMemberDue = useCallback((memberId: string, byStaffId: string, method: string, opts?: { onlyMine?: boolean }): Settlement | null => {
    let receipt: Settlement | null = null;
    // Un pisteur ne solde que les restes issus de SES pesées : ceux du patron
    // ou du magasinier ne sortent pas de sa caisse (le serveur refuserait
    // l'écriture, mais l'écran ne doit pas les proposer non plus).
    const sien = (c: Collection) => !opts?.onlyMine || c.byStaffId === byStaffId;
    setData((d) => {
      if (!d) return d;
      const outOf = (c: Collection) => Math.max(0, (c.reste || 0) - (c.resteSolde || 0));
      const total = d.collections.filter((c) => c.memberId === memberId && sien(c)).reduce((s, c) => s + outOf(c), 0);
      if (total <= 0) return d;
      const refs: { seq: number; ticket?: string; amount: number }[] = [];
      const collections = d.collections
        .slice()
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))
        .map((c) => {
          if (c.memberId !== memberId || !sien(c)) return c;
          const out = outOf(c);
          if (out <= 0) return c;
          refs.push({ seq: c.seq, ticket: ticketOf(c), amount: out });
          return { ...c, resteSolde: (c.resteSolde || 0) + out };
        });
      const settSeq = nextTicketSeq(byStaffId, d);
      const rec: Settlement = { id: uid(), coopId: cid(), saison: d.saison, memberId, byStaffId, amount: total, method, date: new Date().toISOString(), viaPesee: false, seq: settSeq, ticket: makeTicket(byStaffId, settSeq), refs };
      receipt = rec;
      return { ...d, seq: Math.max(d.seq, settSeq + 1), collections, settlements: [...(d.settlements || []), rec] };
    });
    if (receipt) logAudit("solde", { memberId, seq: (receipt as any).seq, amount: (receipt as any).amount, method, refs: (receipt as any).refs });
    return receipt;
  }, [logAudit]);

  /**
   * Vérification par le magasinier d'un poids ramené par un pisteur.
   *
   * N'altère JAMAIS la pesée d'origine (poids déclaré, montant, reçu déjà
   * remis au planteur) : la vérification s'ajoute à côté. C'est elle qui
   * décide du poids entrant en magasin.
   */
  const verifyCollection = useCallback((collectionId: string, kg: number, byStaffId: string, note?: string) => {
    let done: { memberId: string; declare: number } | null = null;
    setData((d) => {
      if (!d) return d;
      const cur = d.collections.find((c) => c.id === collectionId);
      if (!cur || (cur.verif && cur.verif.byStaffId)) return d; // déjà vérifiée
      done = { memberId: cur.memberId, declare: cur.kg };
      const verif = { kg, byStaffId, date: new Date().toISOString(), note: note || "" };
      return { ...d, collections: d.collections.map((c) => (c.id === collectionId ? { ...c, verif } : c)) };
    });
    if (done) {
      const info: any = done;
      logAudit("verification_poids", { collectionId, memberId: info.memberId, declare: info.declare, verifie: kg, ecart: kg - info.declare, note: note || "" });
    }
  }, [logAudit]);

  const addLoan = useCallback((l: Partial<Loan>) => {
    setData((d) => (d ? { ...d, loans: [...d.loans, { id: uid(), coopId: cid(), saison: d.saison, status: "en_attente", soldeRestant: 0, decidedBy: null, origine: "planteur", ...l } as Loan] } : d));
  }, []);

  /**
   * Avance accordée directement sur le terrain par le pisteur/délégué.
   *
   * Réutilise le MÊME système d'avance : seule l'origine change. Elle naît
   * « approuve » parce que le pisteur engage la coopérative au moment où il
   * remet l'argent au planteur — la faire naître « en_attente » afficherait
   * une dette inexistante tant que le patron n'a pas cliqué.
   */
  const grantLoan = useCallback((l: Partial<Loan>, by: string) => {
    const amount = Number(l.amount) || 0;
    setData((d) =>
      d
        ? {
            ...d,
            loans: [
              ...d.loans,
              {
                id: uid(), coopId: cid(), saison: d.saison, type: "argent", motif: "", date: new Date().toISOString(),
                ...l,
                amount, origine: "pisteur", status: "approuve", soldeRestant: amount,
                decidedBy: by, decidedAt: new Date().toISOString(),
              } as Loan,
            ],
          }
        : d,
    );
    logAudit("avance_accordee_terrain", { memberId: l.memberId, amount, motif: l.motif || "", type: l.type || "argent" });
  }, [logAudit]);

  const approveLoan = useCallback((id: string, granted: number, paymentMode: string, by: string) => {
    let mid = "";
    setData((d) => {
      if (!d) return d;
      mid = d.loans.find((l) => l.id === id)?.memberId || "";
      return { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: "approuve", amount: granted, soldeRestant: granted, paymentMode, decidedBy: by, decidedAt: new Date().toISOString() } : l)) };
    });
    logAudit("avance_approuvee", { loanId: id, memberId: mid, amount: granted, paymentMode });
  }, [logAudit]);
  const refuseLoan = useCallback((id: string, by: string) => {
    let mid = "";
    setData((d) => {
      if (!d) return d;
      mid = d.loans.find((l) => l.id === id)?.memberId || "";
      return { ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: "refuse", soldeRestant: 0, decidedBy: by, decidedAt: new Date().toISOString() } : l)) };
    });
    logAudit("avance_refusee", { loanId: id, memberId: mid });
  }, [logAudit]);

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
    setData((d) => (d ? { ...d, staff: [...d.staff, { id: uid(), coopId: cid(), photo: null, ...s } as Staff] } : d));
  }, []);

  const setStaffPhoto = useCallback((id: string, photo: string | null) => {
    setData((d) => (d ? { ...d, staff: d.staff.map((s) => (s.id === id ? { ...s, photo } : s)) } : d));
  }, []);

  // Applique une mise à jour à la coopérative actuellement en portée (dans coops[]).
  const patchCurrentCoop = (d: Data, fn: (c: Coop) => Coop): Data => {
    const id = coopIdRef.current;
    const coops = (d.coops || []).map((c) => (c.id === id ? fn(c) : c));
    return { ...d, coops, coop: coops.find((c) => c.id === id) || d.coop };
  };

  const addCoopMomo = useCallback((acc: Partial<CoopMomo>) => {
    setData((d) => (d ? patchCurrentCoop(d, (c) => ({ ...c, momo: [...(c.momo || []), { id: uid(), ...acc } as CoopMomo] })) : d));
  }, []);

  const delCoopMomo = useCallback((id: string) => {
    setData((d) => (d ? patchCurrentCoop(d, (c) => ({ ...c, momo: (c.momo || []).filter((a) => a.id !== id) })) : d));
  }, []);

  const setPrix = useCallback((p: { prixKg: number; saison: string; commissionRate?: number }) => {
    setData((d) => {
      if (!d) return d;
      const changed = p.prixKg !== d.prixKg;
      const priceHistory = changed ? [...(d.priceHistory || []), { date: new Date().toISOString(), prixKg: p.prixKg }] : d.priceHistory || [];
      return { ...d, prixKg: p.prixKg, saison: p.saison, commissionRate: p.commissionRate ?? d.commissionRate, priceHistory };
    });
  }, []);

  // Réglages par produit (prix d'achat + commission) pour la coopérative en portée.
  const setCoopSettings = useCallback((p: { saison?: string; prices: Record<string, number>; commissions: Record<string, number> }) => {
    setData((d) => {
      if (!d) return d;
      const withSaison = p.saison ? { ...d, saison: p.saison } : d;
      const prevCacao = (d.coops || []).find((c) => c.id === coopIdRef.current)?.prices?.cacao;
      const changed = prevCacao != null && p.prices.cacao != null && p.prices.cacao !== prevCacao;
      const priceHistory = changed ? [...(d.priceHistory || []), { date: new Date().toISOString(), prixKg: p.prices.cacao }] : d.priceHistory || [];
      return patchCurrentCoop({ ...withSaison, priceHistory }, (c) => ({ ...c, prices: { ...c.prices, ...p.prices }, commissions: { ...c.commissions, ...p.commissions } }));
    });
  }, []);

  // Met à jour le profil (identité + coordonnées) de la coopérative en portée.
  const setCoopProfile = useCallback((patch: Record<string, any>) => {
    setData((d) => (d ? patchCurrentCoop(d, (c) => ({ ...c, ...patch })) : d));
  }, []);
  const replaceData = useCallback((d: Data) => setData(d), []);
  const clearSyncError = useCallback(() => setSyncError(null), []);

  const setCollectionSignature = useCallback((id: string, signature: any) => {
    setData((d) => (d ? { ...d, collections: d.collections.map((c) => (c.id === id ? { ...c, signature } as any : c)) } : d));
  }, []);

  const createLoginPlanteur = useCallback((m: Partial<Member>): string => {
    const id = uid();
    setData((d) => {
      if (!d) return d;
      const code = genMemberCode(d.members);
      return { ...d, memberSeq: d.memberSeq + 1, members: [...d.members, { id, coopId: cid(), code, momo: null, photo: null, ...m } as Member] };
    });
    return id;
  }, []);

  const createLoginCoop = useCallback((p: { coop: Partial<any>; responsable: { nom: string; prenoms?: string; tel?: string; email?: string; fonction?: string; idNumber?: string; photo?: string | null; pin?: any } }): { staffId: string; coopId: string } => {
    const staffId = uid();
    const coopId = uid();
    coopIdRef.current = coopId;
    const r = p.responsable;
    const fullName = `${r.nom || ""} ${r.prenoms || ""}`.trim() || r.nom;
    const prices: Record<string, number> = {};
    const commissions: Record<string, number> = {};
    CROPS.forEach((c) => { prices[c.id] = DEFAULT_PRICES[c.id]; commissions[c.id] = DEFAULT_COMM[c.id]; });
    setData((d) =>
      d
        ? {
            ...d,
            coops: [
              ...(d.coops || []),
              { id: coopId, ...p.coop, momo: [], filieres: p.coop.filieres || [], prices, commissions } as unknown as Coop,
            ],
            staff: [
              ...d.staff,
              { id: staffId, coopId, role: "patron", nom: fullName, prenoms: r.prenoms, tel: r.tel, email: r.email, fonction: r.fonction || "Responsable", idNumber: r.idNumber, photo: r.photo || null, pin: r.pin || null },
            ],
          }
        : d,
    );
    return { staffId, coopId };
  }, []);

  return {
    data,
    ready,
    bootSession,
    authError,
    syncError,
    clearSyncError,
    authLoginCoop,
    authLoginPlanteur,
    authRegisterCoop,
    authLogout,
    fetchAudit,
    addMember,
    addMandat,
    addDepense,
    addSortie,
    addCollection,
    settleMemberDue,
    addLoan,
    grantLoan,
    approveLoan,
    refuseLoan,
    verifyCollection,
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
    setCoopSettings,
    setCoopProfile,
    setCoopScope,
    replaceData,
    setCollectionSignature,
    createLoginPlanteur,
    createLoginCoop,
    refresh,
  };
}
