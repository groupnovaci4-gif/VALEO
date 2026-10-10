/**
 * Mini-conversation de saisie (1.9) : état de l'échange, voix et enregistrement.
 *
 *  - toutes les phrases viennent de `core/entry/conversation` (modèles + calculs) ;
 *  - la réponse s'affiche ET est lue (`services/voice`) quand l'utilisateur a
 *    parlé ; mode silencieux du coach (`silent`) : texte seul ;
 *  - montants lus seulement si « Lire les montants pendant la saisie vocale » ;
 *  - l'historique de l'échange vit en MÉMOIRE, pour la feuille ouverte
 *    seulement : jamais stocké, jamais synchronisé ;
 *  - rien n'est enregistré sans « oui » ou « Tout valider » ; l'enregistrement
 *    est groupé (tout ou rien) et un seul « Annuler » annule tout le groupe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasKey, useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useCategoryLabels } from '@/hooks/useFinance';
import { useFormatParams } from '@/hooks/useInsightText';
import { entryPrefs } from '@/core/entry/prefs';
import { coachPrefs } from '@/core/coach/prefs';
import { MONEY_PARAM_KEYS, speakable } from '@/core/coach/voice';
import { applyCommand, followUps, greeting, interpretReply, nextAck, recap, savedSummary, startConversation, type ConvLabels, type ConvState, type Sentence } from '@/core/entry/conversation';
import type { EntryContext, EntryDraft } from '@/core/entry/parse';
import { envelopeStatuses, proposeIncomeAllocation, type EnvelopeStatus } from '@/core/budget';
import { budgetTransactions } from '@/core/reserve';
import { dailyAllowance } from '@/core/dailyAllowance';
import { monthKey, today } from '@/core/dates';
import { formatMoney, type CurrencyCode } from '@/core/money';
import { readJSON, storageKey, writeJSON } from '@/services/storage';
import { speak, stopVoice } from '@/services/voice';
import type { EntryMethod } from './useEntrySave';

export interface Bubble {
  id: string;
  from: 'user' | 'app';
  /** Texte affiché (déjà traduit et formaté). */
  text: string;
  /**
   * Puces sous le texte (lignes ajoutées, réponse de l'assistant). Dans la
   * reformulation complète, les opérations ne sont pas répétées : la carte de
   * confirmation, juste dessous, EST la liste (modifiable) ; la voix les lit.
   */
  bullets?: string[];
  /** Texte après les puces (nouveau total, question). */
  footer?: string;
  /** Question ouverte : à poser à l'assistant (analyse détaillée, avec consentement). */
  assistantQuestion?: string;
}

export interface Offers {
  envelopeFor: string | null;
  salary: {
    amount: number;
    split: { envelopeId: string | null; amount: number }[];
  } | null;
}

interface Memory {
  /** Jour de la dernière salutation (une seule par jour). */
  greetedDay?: string;
  lastAck?: string;
  /** Catégories pour lesquelles « En créer une ? » a déjà été proposé. */
  offeredEnvelopes?: string[];
}

let seq = 0;
const bid = () => `b${++seq}`;

export function useConversation(ctx: EntryContext) {
  const { t, lang } = useI18n();
  const fmt = useFormatParams();
  const cats = useCategoryLabels();
  const { user, profile, engine, activeSpace } = useApp();
  const ePrefs = entryPrefs(profile?.preferences);
  const silent = coachPrefs(profile?.preferences).silent;
  const [state, setState] = useState<ConvState | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [phase, setPhase] = useState<'talking' | 'done'>('talking');
  const [offers, setOffers] = useState<Offers>({
    envelopeFor: null,
    salary: null,
  });
  const [speaking, setSpeaking] = useState(false);
  const memory = useRef<Memory>({});
  const memKey = user ? storageKey(user.uid, 'entryConversation') : null;

  useEffect(() => {
    if (!memKey) return;
    void readJSON<Memory>(memKey)
      .then((m) => {
        if (m) memory.current = m;
      })
      .catch(() => undefined);
  }, [memKey]);
  const remember = useCallback(
    (patch: Memory) => {
      memory.current = { ...memory.current, ...patch };
      if (memKey) void writeJSON(memKey, memory.current).catch(() => undefined);
    },
    [memKey],
  );
  // La voix se tait quand la feuille se ferme.
  useEffect(() => () => void stopVoice(), []);

  const labels: ConvLabels = {
    line: (d: EntryDraft) =>
      d.type === 'savings' ? t('entry.type.savings') : d.newCategoryName ? d.newCategoryName : d.categoryId ? cats.byId(d.subcategoryId ?? d.categoryId) : t('entry.confirm.categoryMissing'),
    account: (id) => ctx.accounts.find((a) => a.id === id)?.name ?? t('entry.confirm.accountAuto'),
  };

  /** Texte affiché d'une phrase. */
  const show = useCallback((s: Sentence) => (hasKey(s.key) ? t(s.key, fmt(s.params)) : ''), [t, fmt]);

  /** Texte lu : montants en toutes lettres de devise (« 30 000 francs »), ou retirés si le réglage est coupé. */
  const spoken = useCallback(
    (ss: Sentence[]) => {
      const currency = activeSpace?.currency ?? 'XOF';
      const unit = currency === 'XOF' || currency === 'XAF' ? (lang === 'en' ? 'CFA francs' : 'francs') : currency;
      const parts: string[] = [];
      for (const s of ss) {
        const hasMoney = Object.keys(s.params ?? {}).some((k) => MONEY_PARAM_KEYS.has(k));
        let key = s.key;
        if (hasMoney && !ePrefs.speakAmounts) {
          if (!hasKey(`${s.key}.voice`)) continue;
          key = `${s.key}.voice`;
        }
        const params = Object.fromEntries(
          Object.entries(fmt(s.params)).map(([k, v]) => [
            k,
            MONEY_PARAM_KEYS.has(k) && typeof s.params?.[k] === 'number' ? `${formatMoney(s.params[k] as number, currency, { hideSymbol: true })} ${unit}` : v,
          ]),
        );
        if (hasKey(key)) parts.push(t(key, params));
      }
      return speakable(parts);
    },
    [activeSpace?.currency, lang, ePrefs.speakAmounts, fmt, t],
  );

  /** Affiche une réponse de DineroX ; la lit aussi si l'utilisateur a parlé (jamais en mode silencieux). */
  const say = useCallback(
    (ss: Sentence[], aloud: boolean, showBullets = false) => {
      // Reformulation complète : la carte de confirmation, juste dessous, est la liste.
      // Correction (« j'ajoute : … ») : les lignes ajoutées sont écrites dans la bulle, à leur place.
      const cut = showBullets ? ss.findIndex((s) => s.bullet) : -1;
      const head = (cut < 0 ? ss.filter((s) => !s.bullet) : ss.slice(0, cut)).map(show).filter(Boolean).join(' ');
      const bullets =
        cut < 0
          ? []
          : ss
              .filter((s) => s.bullet)
              .map(show)
              .filter(Boolean);
      const footer =
        cut < 0
          ? ''
          : ss
              .slice(cut)
              .filter((s) => !s.bullet)
              .map(show)
              .filter(Boolean)
              .join(' ');
      setBubbles((b) => [
        ...b,
        {
          id: bid(),
          from: 'app',
          text: head,
          ...(bullets.length ? { bullets } : {}),
          ...(footer ? { footer } : {}),
        },
      ]);
      if (!aloud || silent) return;
      const words = spoken(ss);
      if (!words) return;
      setSpeaking(true);
      void speak(words, { language: lang === 'en' ? 'en' : 'fr' }).finally(() => setSpeaking(false));
    },
    [show, spoken, silent, lang],
  );

  const userSaid = (text: string) => setBubbles((b) => [...b, { id: bid(), from: 'user', text }]);

  /** Coupe la voix immédiatement (toucher sur la bulle ou sur le micro). */
  const hush = useCallback(() => {
    setSpeaking(false);
    void stopVoice();
  }, []);

  /** Premier tour : la transcription, puis la reformulation complète. */
  const start = useCallback(
    (transcript: string, drafts: EntryDraft[], method: EntryMethod) => {
      const s = startConversation(drafts);
      const day = today();
      const first = memory.current.greetedDay !== day;
      const ack = nextAck(memory.current.lastAck ?? null);
      const opening = first ? greeting(new Date().getHours(), profile?.firstName) : { key: ack };
      remember(first ? { greetedDay: day } : { lastAck: ack });
      setState(s);
      setPhase('talking');
      setOffers({ envelopeFor: null, salary: null });
      setBubbles([{ id: bid(), from: 'user', text: transcript }]);
      say(recap(s, labels, opening), method === 'voice');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [say, remember, profile?.firstName, t, cats],
  );

  /** Correction faite sur la carte (toucher) : l'état suit, sans nouvelle phrase. */
  const setDrafts = useCallback((drafts: EntryDraft[]) => setState((s) => (s ? { ...s, drafts } : s)), []);

  /** Réponse à une question (bouton ou voix). */
  const answer = useCallback(
    (optionId: string, aloud: boolean) => {
      if (!state) return;
      const r = applyCommand(state, { kind: 'answer', optionId }, labels);
      setState(r.state);
      say(r.reply, aloud);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, say, t, cats],
  );

  /**
   * Réponse dite ou écrite. Renvoie ce que l'écran doit faire ensuite :
   * valider, annuler, ou router une question vers l'assistant.
   */
  const reply = useCallback(
    (text: string, aloud: boolean): 'confirm' | 'cancel' | 'question' | null => {
      if (!state || !text.trim()) return null;
      userSaid(text.trim());
      const cmd = interpretReply(text, state, ctx, labels);
      if (cmd.kind === 'confirm' || cmd.kind === 'cancel' || cmd.kind === 'question') return cmd.kind;
      if (cmd.kind === 'unknown') {
        say([{ key: state.pending ? 'conv.answerFirst' : 'conv.unknown' }], aloud);
        return null;
      }
      const r = applyCommand(state, cmd, labels);
      setState(r.state);
      say(r.reply, aloud, true);
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, ctx, say, t, cats],
  );

  /** Lit un texte déjà affiché ailleurs (réponse à une question posée au micro). */
  const speakNow = useCallback(
    (lines: string[]) => {
      if (silent) return;
      const words = speakable(lines);
      if (words) void speak(words, { language: lang === 'en' ? 'en' : 'fr' });
    },
    [silent, lang],
  );

  /** Texte libre de DineroX (réponse de l'assistant, déjà calculée et traduite). */
  const sayText = useCallback(
    (text: string, bullets: string[], aloud: boolean, assistantQuestion?: string) => {
      setBubbles((b) => [...b, { id: bid(), from: 'app', text, bullets, ...(assistantQuestion ? { assistantQuestion } : {}) }]);
      if (!aloud || silent) return;
      const words = speakable([text, ...bullets]);
      if (!words) return;
      setSpeaking(true);
      void speak(words, { language: lang === 'en' ? 'en' : 'fr' }).finally(() => setSpeaking(false));
    },
    [silent, lang],
  );

  /** État des enveloppes du mois, maintenant (photo prise AVANT l'enregistrement). */
  const statusesNow = useCallback((): EnvelopeStatus[] => {
    if (!engine || !activeSpace) return [];
    const d = engine.getData(activeSpace.id);
    return envelopeStatuses(d.envelopes, budgetTransactions(d.transactions, d.goalContributions), d.budgets, monthKey(today()), activeSpace.currency as CurrencyCode, d.accounts);
  }, [engine, activeSpace]);

  /**
   * Après l'enregistrement : bilan calculé par le code (nombre, total, enveloppes
   * qui franchissent un seuil en UNE phrase, nouveau reste par jour) et propositions.
   */
  const saved = useCallback(
    (drafts: EntryDraft[], before: EnvelopeStatus[], aloud: boolean) => {
      if (!engine || !activeSpace) return;
      const after = engine.getData(activeSpace.id);
      const currency = activeSpace.currency as CurrencyCode;
      const month = monthKey(today());
      const afterStatuses = statusesNow();
      const allowance = dailyAllowance({
        data: after,
        currency,
        today: today(),
        financial: profile?.financial,
      });
      say(
        savedSummary({
          drafts,
          before,
          after: afterStatuses,
          month,
          budgets: after.budgets,
          allowance,
        }),
        aloud,
      );
      const f = followUps({
        drafts,
        envelopes: after.envelopes,
        offered: memory.current.offeredEnvelopes ?? [],
      });
      if (f.envelopeFor)
        remember({
          offeredEnvelopes: [...(memory.current.offeredEnvelopes ?? []), f.envelopeFor],
        });
      setOffers({
        envelopeFor: f.envelopeFor,
        salary: f.salary
          ? {
              amount: f.salary,
              split: proposeIncomeAllocation(f.salary, afterStatuses, currency),
            }
          : null,
      });
      setState((s) => (s ? { ...s, pending: null } : s));
      setPhase('done');
    },
    [engine, activeSpace, profile?.financial, say, remember, statusesNow],
  );

  /** Groupe annulé : plus de propositions, la bulle le dit. */
  const undone = useCallback(() => {
    hush();
    setOffers({ envelopeFor: null, salary: null });
    setBubbles((b) => [...b, { id: bid(), from: 'app', text: t('entry.undone') }]);
  }, [hush, t]);

  return {
    state,
    bubbles,
    phase,
    offers,
    speaking,
    labels,
    start,
    setDrafts,
    answer,
    reply,
    sayText,
    speakNow,
    saved,
    statusesNow,
    hush,
    undone,
  };
}
