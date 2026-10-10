/**
 * Feuille de saisie, ouverte par le micro central (voix ; appui long :
 * clavier), la bulle de l'accueil, l'Historique et le rappel du soir.
 *
 *  - VOIX : la reconnaissance du téléphone transforme la voix en texte ;
 *  - PHRASE ÉCRITE : « Écrivez comme vous parlez » (même parseur) ;
 *  - SAISIE RAPIDE : montant au pavé numérique → une catégorie récente → enregistré.
 *
 * Voix et phrase passent par la carte de confirmation : rien n'est enregistré
 * sans « Tout valider ». Une question est répondue ici (ou ouverte dans
 * l'assistant) ; un doute (« opération ou question ? ») est demandé.
 * Si la voix échoue, la saisie manuelle et la phrase restent disponibles.
 *
 * 1.9 — Voix et phrase ouvrent une MINI-CONVERSATION (`ConversationView`) :
 * reformulation lue à voix haute, questions, corrections dites (« le loyer c'est
 * 120 000 »), puis « oui ». L'IA (`parseVoiceEntry`) n'est appelée que si le
 * parseur local est peu sûr, en ligne et avec consentement.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, hasKey, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { useFormatParams } from '@/hooks/useInsightText';
import { Button, Chip, Field, Icon, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { useTheme } from '@/theme';
import { useQuickAdd } from '@/features/QuickAdd';
import { needsAi, parseEntryText, type EntryContext, type EntryDraft, type EntryParse } from '@/core/entry/parse';
import { entryVocabularyWords } from '@/core/entry/vocabularyWords';
import { recentCategories } from '@/core/entry/recent';
import { entryPrefs } from '@/core/entry/prefs';
import { answerQuestion } from '@/core/ai/answers';
import { FREE_VOICE_ENTRIES_PER_DAY, hasFeature, withinLimit } from '@/core/subscription';
import { currencyInfo, parseAmountInput, toMinor, type CurrencyCode } from '@/core/money';
import { speechInput, type SpeechPermission } from '@/services/speechInput';
import { readEntryStats, voiceToday } from '@/services/entryStats';
import { stopVoice } from '@/services/voice';
import { analytics } from '@/services/analytics';
import { ActionError } from '@/store/actions';
import { activeReserves, reserveBalance, reserveEligible } from '@/core/reserve';
import { applyTontine } from '@/core/tontineEntry';
import { tontineContributionCategory } from '@/core/tontine';
import { canUseReserve } from '@/core/permissions';
import { ConfirmCard } from './ConfirmCard';
import { UNDO_MS, useEntrySave, type EntryMethod } from './useEntrySave';
import { useEntryStats } from './useEntryStats';
import { useVoiceRecorder } from './useVoiceRecorder';
import { useCategoryPick } from '@/features/categories/CategoryPicker';
import { pickCategories } from '@/core/categoryOps';
import { useCategoryCatalog } from '@/services/categoryCatalog';
import { liveTranscript } from '@/core/entry/recorder';
import { RecorderBar } from './RecorderBar';
import type { EntryMode } from './EntryProvider';
import { ConversationView } from './ConversationView';
import { useConversation } from './useConversation';
import { aiUsage, chooseUnderstanding } from '@/core/entry/aiGuard';
import { parseVoiceRemotely } from '@/services/voiceParse';

type View_ =
  | { kind: 'input' }
  /** 1.9 — Mini-conversation (voix ou phrase) ; `thinking` : l'IA est consultée. */
  | { kind: 'conversation'; method: EntryMethod; text: string; edited: boolean; thinking?: boolean }
  | { kind: 'confirm'; drafts: EntryDraft[]; method: EntryMethod; text: string; edited: boolean }
  | { kind: 'answer'; text: string; bullets: string[]; question: string }
  | { kind: 'ambiguous'; text: string };

/** Message sous le micro (l'état de l'enregistrement lui-même vit dans `core/entry/recorder`). */
type VoiceState = 'idle' | 'explain' | 'denied' | 'unavailable' | 'limit' | 'nothing';

/** Thèmes de question accessibles en formule gratuite (comme l'assistant). */
const FREE_TOPICS = new Set(['spent_month', 'income_month', 'remaining_category', 'balance', 'spent_category']);

export function EntrySheet({ mode, onClose, onModeChange }: { mode: EntryMode | null; onClose: () => void; onModeChange: (m: EntryMode) => void }) {
  const { t } = useI18n();
  const visible = mode !== null;
  // Contenu monté seulement à l'ouverture : chaque saisie repart d'un état propre.
  return (
    <Sheet visible={visible} onClose={onClose} title={t('entry.title')}>
      {visible ? <EntryBody mode={mode} onClose={onClose} onModeChange={onModeChange} /> : null}
    </Sheet>
  );
}

function EntryBody({ mode, onClose, onModeChange }: { mode: EntryMode; onClose: () => void; onModeChange: (m: EntryMode) => void }) {
  const { t, lang } = useI18n();
  const { colors, radius } = useTheme();
  const toast = useToast();
  const money = useMoney();
  const fmt = useFormatParams();
  const cats = useCategoryLabels();
  const quick = useQuickAdd();
  const { plan, profile, user, role, mode: appMode, online, activeSpace } = useApp();
  const { data, currency, now } = useFinance();
  const stats = useEntryStats();
  const { saveDrafts, undo } = useEntrySave();
  /** Opérations du dernier « oui » : « Annuler » les retire toutes, pendant 5 secondes. */
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!undoIds) return;
    const timer = setTimeout(() => setUndoIds(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoIds]);
  const [view, setView] = useState<View_>({ kind: 'input' });
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amountText, setAmountText] = useState('');
  const [phrase, setPhrase] = useState('');
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [partial, setPartial] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const ePrefs = entryPrefs(profile?.preferences);
  const catalog = useCategoryCatalog();

  const accounts = useMemo(() => data.accounts.filter((a) => a.active && !a.deleted), [data.accounts]);
  // Compte par défaut : le dernier utilisé (s'il existe encore), sinon le premier compte courant.
  const defaultAccountId = useMemo(() => {
    const last = accounts.find((a) => a.id === stats?.lastAccountId && a.currency === currency);
    return last?.id ?? accounts.find((a) => !a.isSavings && a.currency === currency)?.id ?? accounts.find((a) => a.currency === currency)?.id ?? null;
  }, [accounts, stats?.lastAccountId, currency]);
  // Saisie rapide : catégories PROPOSÉES (ni désactivées, ni masquées par défaut), récentes en premier.
  const pick = useCategoryPick(type);
  const visibleIds = useMemo(() => pickCategories(pick.categories, { ...pick.base, kind: type, showAll: false, query: '', recent: [] }).map((c) => c.id), [pick.categories, pick.base, type]);
  const recent = useMemo(() => recentCategories(stats?.recent[type] ?? [], visibleIds, data.categories.filter((c) => visibleIds.includes(c.id) || !!c.parentId), 6), [stats?.recent, type, visibleIds, data.categories]);

  // ─── Mini-conversation (1.9) ───────────────────────────────────────
  const entryCtx: EntryContext = { today: now, currency: currency as CurrencyCode, accounts, categories: data.categories, defaultAccountId, catalog, goals: data.goals };
  const conv = useConversation(entryCtx);
  /** Vrai pendant la conversation : une note vocale est alors une RÉPONSE, pas une nouvelle saisie. */
  const talking = useRef(false);
  const isTalking = view.kind === 'conversation' && conv.phase === 'talking';
  useEffect(() => {
    talking.current = isTalking;
  }, [isTalking]);
  /** IA autorisée : en ligne, compte connecté, consentement donné (sinon parseur local seul). */
  const aiAllowed = appMode === 'firebase' && online && !!profile?.preferences.aiConsent;

  /** « Compréhension avancée : 2/3 aujourd'hui » (après un appel à l'IA seulement). */
  const [aiNote, setAiNote] = useState<string | null>(null);

  const converse = (text: string, drafts: EntryDraft[], method: 'voice' | 'text_phrase') => {
    setView({ kind: 'conversation', method, text, edited: false });
    conv.start(text, drafts, method);
  };

  /** Le parseur local est peu sûr : l'IA est consultée (8 s au plus), sa réponse est revérifiée. */
  const askAi = (text: string, local: EntryDraft[], method: 'voice' | 'text_phrase', fallback: () => void) => {
    setView({ kind: 'conversation', method, text, edited: false, thinking: true });
    void parseVoiceRemotely({
      transcript: text,
      language: lang === 'en' ? 'en' : 'fr',
      today: now,
      currency,
      categories: data.categories.filter((c) => !c.deleted && c.disabled !== true).map((c) => ({ id: c.id, label: cats.byId(c.id), kind: c.kind, parentId: c.parentId ?? null })),
      accounts: accounts.map((a) => a.name),
      spaceId: activeSpace?.id,
    }).then((res) => {
      // Note discrète, seulement quand l'IA a été sollicitée : usage du jour, ou quota atteint.
      const usage = res === 'quota' ? null : aiUsage(res);
      setAiNote(res === 'quota' ? t('conv.aiQuotaReached') : usage ? t('conv.aiQuota', { used: usage.used, limit: usage.limit }) : null);
      const raw = res === 'quota' ? null : res;
      const chosen = chooseUnderstanding(local, raw, text, entryCtx);
      analytics.track('voice_understood', { source: chosen.source });
      if (chosen.drafts.length) converse(text, chosen.drafts, method);
      else fallback();
    });
  };

  /** Réponse à une question posée à la place d'une saisie : calculée par le code (thèmes gratuits) ou verrouillée. */
  const answerFor = (intent: Extract<EntryParse, { kind: 'question' }>['intent']): { text: string; bullets: string[] } => {
    if (!hasFeature(plan, 'ai_assistant') && !FREE_TOPICS.has(intent.topic)) return { text: t('ai.locked'), bullets: [] };
    const a = answerQuestion({ ...intent, amount: intent.amount === null ? null : toMinor(intent.amount, currency) }, { data, currency: currency as CurrencyCode, now, categoryName: cats.byId });
    return {
      text: hasKey(a.key) ? t(a.key, fmt(a.params, { monthDates: true })) : '',
      bullets: (a.bullets ?? []).map((b) => (hasKey(b.key) ? t(b.key as TKey, fmt(b.params, { monthDates: true })) : '')).filter(Boolean),
    };
  };

  // ─── Analyse d'un texte (voix ou phrase) ───────────────────────────
  /** Analyse un texte ; faux si rien n'a été compris (« Je n'ai rien entendu »). */
  const analyze = (text: string, method: 'voice' | 'text_phrase'): boolean => {
    const r: EntryParse = parseEntryText(text, entryCtx);
    // Tontine : « Tontine 10 000 », « J'ai cotisé ma tontine du bureau », « J'ai reçu la tontine »
    // → la tontine correspondante est proposée sur la carte de confirmation.
    const has = (id: string) => data.categories.some((c) => c.id === id && !c.deleted);
    const tontineCat = tontineContributionCategory(data.categories);
    const withTontine = r.kind === 'question' ? null : applyTontine(r.kind === 'entries' ? r.items : [], {
      text,
      tontines: data.tontines,
      entries: data.tontineEntries,
      today: now,
      defaultAccountId,
      payoutCategory: has('inc_tontine') ? 'inc_tontine' : 'inc_other',
      // Cotisation : catégorie retrouvée par identifiant (parent actuel de la sous-catégorie « Tontine »).
      contributionCategory: tontineCat.categoryId,
      contributionSubcategory: tontineCat.subcategoryId,
    });
    if (withTontine) {
      analytics.track('mic_routed', { to: 'entry', method });
      converse(text, withTontine, method);
      return true;
    }
    if (r.kind === 'empty') {
      setVoice(method === 'voice' ? 'nothing' : 'idle');
      return false;
    }
    if (r.kind === 'savings') {
      // « J'ai épargné 20 000 » : un VERSEMENT d'épargne, jamais une dépense. L'écran de
      // versement (prérempli) fait confirmer le compte, la source et l'objectif éventuel.
      analytics.track('mic_routed', { to: 'savings', method });
      onClose();
      const d = r.deposit;
      router.push({
        pathname: '/savings/move',
        params: { mode: 'deposit', ask: '1', ...(d.amount ? { amount: String(d.amount) } : {}), ...(d.savingsAccountId ? { accountId: d.savingsAccountId } : {}), ...(d.goalId ? { goalId: d.goalId } : {}), ...(d.fromAccountId ? { fromId: d.fromAccountId } : {}), date: d.date },
      });
      return true;
    }
    if (r.kind === 'entries') {
      analytics.track('mic_routed', { to: 'entry', method });
      if (aiAllowed && needsAi(r, text)) askAi(text, r.items, method, () => converse(text, r.items, method));
      else {
        analytics.track('voice_understood', { source: 'local' });
        converse(text, r.items, method);
      }
      return true;
    }
    if (r.kind === 'question' && r.intent.topic === 'contribution_sim') {
      // « Si je donne 30 000… » : le simulateur calcule l'effet (rien n'est enregistré).
      analytics.track('mic_routed', { to: 'assistant', method });
      onClose();
      const category = r.intent.categoryId === 'cat_family' || r.intent.categoryId === 'cat_social' ? r.intent.categoryId : undefined;
      router.push({ pathname: '/simulate', params: { ...(r.intent.amount ? { amount: String(toMinor(r.intent.amount, currency)) } : {}), ...(category ? { category } : {}) } });
      return true;
    }
    if (r.kind === 'question') {
      analytics.track('mic_routed', { to: 'assistant', method });
      if (!hasFeature(plan, 'ai_assistant') && !FREE_TOPICS.has(r.intent.topic)) {
        setView({ kind: 'answer', text: t('ai.locked'), bullets: [], question: text });
        return true;
      }
      const a = answerFor(r.intent);
      setView({ kind: 'answer', text: a.text, bullets: a.bullets, question: text });
      if (method === 'voice') conv.speakNow([a.text, ...a.bullets]);
      return true;
    }
    if (r.kind === 'assistant') {
      analytics.track('mic_routed', { to: 'assistant', method });
      onClose();
      router.push({ pathname: '/assistant', params: { q: text } });
      return true;
    }
    analytics.track('mic_routed', { to: 'ambiguous', method });
    // Rien compris localement : l'IA peut proposer des lignes (revérifiées), sinon « opération ou question ? ».
    if (aiAllowed && needsAi(r, text)) askAi(text, [], method, () => setView({ kind: 'ambiguous', text }));
    else setView({ kind: 'ambiguous', text });
    return true;
  };

  /** Réponse dite ou écrite pendant la conversation. */
  const replyInConversation = (text: string, aloud: boolean) => {
    const next = conv.reply(text, aloud);
    if (next === 'confirm') validateConversation(aloud);
    else if (next === 'cancel') {
      toast.show(t('conv.cancelled'), 'info');
      onClose();
    } else if (next === 'question') {
      // Question dans la conversation : même réponse calculée que l'assistant.
      const q = parseEntryText(text, entryCtx);
      if (q.kind === 'question') {
        const a = answerFor(q.intent);
        conv.sayText(a.text, a.bullets, aloud);
      } else {
        // Question ouverte : l'assistant (analyse détaillée par financeAssistant, avec consentement).
        conv.sayText(t('conv.openQuestion'), [], aloud, text);
      }
    }
  };

  // ─── Voix : enregistrement « comme WhatsApp » ─────────────────────
  // Toucher = démarrer ; toucher ■ = arrêter. Un silence n'arrête JAMAIS l'enregistrement
  // (le moteur du téléphone est relancé et les morceaux raccordés : core/entry/recorder).
  const recorder = useVoiceRecorder(
    { language: ePrefs.voiceLanguage ?? (lang === 'en' ? 'en' : 'fr'), onDeviceOnly: ePrefs.onDeviceOnly, contextualStrings: entryVocabularyWords() },
    {
      onDeliver: (text) => {
        // Pendant la conversation, la note vocale est une RÉPONSE (« oui », « le loyer c'est 120 000 »).
        if (talking.current) {
          replyInConversation(text, true);
          recorder.processed(true);
          return;
        }
        setPartial(text);
        const understood = analyze(text, 'voice');
        if (!understood) analytics.track('voice_entry_failed', { reason: 'no_speech' });
        recorder.processed(understood);
      },
      onWarn: () => toast.show(t('entry.voice.limitSoon')),
      // Fin sans texte : message clair, la phrase écrite reste disponible.
      onNotice: (n, code) => {
        setVoice(n);
        analytics.track('voice_entry_failed', { reason: n === 'nothing' ? 'no_speech' : n === 'denied' ? 'permission' : (code ?? 'unavailable') });
      },
    },
  );
  const rec = recorder.state;
  const recording = rec.status === 'recording';
  // Pendant l'enregistrement : le texte en direct (morceaux raccordés).
  const shownText = recording ? liveTranscript(rec) : partial;

  const listen = async () => {
    // La voix du coach se tait quand le micro s'ouvre (jamais les deux à la fois).
    await stopVoice().catch(() => undefined);
    setPartial('');
    setVoice('idle');
    // Réponse dans la conversation : l'enregistreur sort de l'état « livré » de la note précédente.
    if (rec.status === 'confirm') recorder.reset();
    recorder.tap();
  };

  /** `reply` : réponse dans une conversation déjà commencée (même saisie : le compteur n'est pas reconsulté). */
  const startVoice = async (reply = false) => {
    // Compteur relu à la source : l'écoute peut démarrer avant que les compteurs ne soient chargés.
    const fresh = user && !reply ? await readEntryStats(user.uid).catch(() => null) : null;
    const used = fresh ? voiceToday(fresh) : stats ? voiceToday(stats) : 0;
    if (!reply && !withinLimit(plan, 'voiceEntriesPerDay', used)) {
      setVoice('limit');
      analytics.track('voice_entry_failed', { reason: 'limit' });
      return;
    }
    const provider = speechInput();
    if (!(await provider.isAvailable())) {
      setVoice('unavailable');
      analytics.track('voice_entry_failed', { reason: 'unavailable' });
      return;
    }
    const p: SpeechPermission = await provider.permission().catch(() => 'denied' as const);
    if (p === 'granted') return void listen();
    // Première fois : une phrase d'explication AVANT la demande du système.
    setVoice(p === 'undetermined' ? 'explain' : 'denied');
  };

  const allowMic = async () => {
    const p = await speechInput()
      .requestPermission()
      .catch(() => 'denied' as const);
    if (p === 'granted') return void listen();
    analytics.track('voice_entry_failed', { reason: 'permission' });
    recorder.denied();
    setVoice('denied');
  };

  // Ouverture en mode voix : l'écoute démarre directement (un appui = parler).
  useEffect(() => {
    if (mode !== 'voice' || started.current) return;
    started.current = true;
    void Promise.resolve().then(() => startVoice());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ─── Saisie rapide ─────────────────────────────────────────────────
  const decimals = currencyInfo(currency).decimals;
  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals ? ',' : '000', '0', '⌫'];
  const press = (k: string) =>
    setAmountText((cur) => {
      if (k === '⌫') return cur.slice(0, -1);
      if (k === ',' && cur.includes(',')) return cur;
      const next = (cur === '0' && k !== ',' ? '' : cur) + k;
      return next.replace(/\D/g, '').length > 12 ? cur : next;
    });
  const quickAmount = parseAmountInput(amountText.replace(/^,/, '0,'), currency);
  const amountLabel = quickAmount ? money(quickAmount) : money(0);
  const saveQuick = (categoryId: string) => {
    if (!quickAmount || quickAmount <= 0) {
      toast.show(t('entry.quick.needAmount'), 'warning');
      return;
    }
    const cat = data.categories.find((c) => c.id === categoryId);
    const draft: EntryDraft = { type, amount: quickAmount, categoryId: cat?.parentId ?? categoryId, subcategoryId: cat?.parentId ? categoryId : null, accountId: defaultAccountId, date: now, payee: null, uncertain: [], source: '' };
    // Dépense famille ou cérémonie avec une réserve non vide : la carte de confirmation
    // propose « Prendre sur la réserve ? » (sinon, enregistrement direct comme avant).
    const offerReserve = type === 'expense' && reserveEligible(draft.categoryId, draft.subcategoryId) && canUseReserve(role) && activeReserves(data.goals, currency as CurrencyCode).some((g) => reserveBalance(g, data.goalContributions) > 0);
    if (offerReserve) {
      setView({ kind: 'confirm', drafts: [draft], method: 'quick_manual', text: '', edited: false });
      return;
    }
    try {
      saveDrafts([draft], 'quick_manual');
      onClose();
    } catch (e) {
      toast.show(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.generic'), 'error');
    }
  };

  // ─── Confirmation ──────────────────────────────────────────────────
  /**
   * « Oui » ou « Tout valider » dans la conversation : enregistrement GROUPÉ
   * (tout ou rien, un seul « Annuler »), puis bilan calculé, lu et affiché.
   */
  const validateConversation = (aloud: boolean) => {
    if (view.kind !== 'conversation' || !conv.state) return;
    const drafts = conv.state.drafts;
    if (!drafts.length || drafts.some((d) => !d.amount || d.amount <= 0 || (d.type === 'savings' && !d.savings?.savingsAccountId))) {
      conv.sayText(t('conv.toCheck', { count: drafts.filter((d) => !d.amount || (d.type === 'savings' && !d.savings?.savingsAccountId)).length }), [], aloud);
      return;
    }
    setBusy(true);
    try {
      const before = conv.statusesNow();
      const ids = saveDrafts(drafts, view.method, view.edited, true);
      conv.saved(drafts, before, aloud);
      setUndoIds(ids);
    } catch (e) {
      toast.show(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const validate = () => {
    if (view.kind !== 'confirm') return;
    setBusy(true);
    try {
      saveDrafts(view.drafts, view.method, view.edited);
      onClose();
    } catch (e) {
      toast.show(e instanceof ActionError && e.code === 'permission' ? t('error.permission') : t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // ─── Rendu ─────────────────────────────────────────────────────────
  if (view.kind === 'conversation') {
    return (
      <ConversationView
        conv={conv}
        accounts={accounts}
        currency={currency as CurrencyCode}
        busy={busy}
        thinking={!!view.thinking}
        aiNote={aiNote}
        mic={{
          recording,
          processing: rec.status === 'processing',
          live: recording ? liveTranscript(rec) : '',
          elapsed: rec.elapsed,
          levels: recorder.levels,
          hasVolume: recorder.hasVolume,
          bars: recorder.bars,
          start: () => void startVoice(true),
          stop: recorder.tap,
          cancel: recorder.cancel,
        }}
        onValidate={() => validateConversation(false)}
        onCancel={onClose}
        onReply={(text) => replyInConversation(text, false)}
        onRestart={(text) => {
          setAiNote(null);
          setView({ kind: 'input' });
          analyze(text, view.method === 'voice' ? 'voice' : 'text_phrase');
        }}
        onClose={onClose}
        envelopeName={(id) => data.envelopes.find((e) => e.id === id)?.name ?? ''}
        onUndo={
          undoIds
            ? () => {
                if (undo(undoIds)) conv.undone();
                setUndoIds(null);
              }
            : null
        }
      />
    );
  }
  if (view.kind === 'confirm') {
    return (
      <ConfirmCard
        drafts={view.drafts}
        onChange={(drafts) => setView({ ...view, drafts, edited: true })}
        onValidate={validate}
        onCorrect={() => {
          setPhrase(view.text);
          setView({ kind: 'input' });
          onModeChange('keyboard');
        }}
        onCancel={onClose}
        accounts={accounts}
        currency={currency as CurrencyCode}
        busy={busy}
      />
    );
  }
  if (view.kind === 'answer') {
    return (
      <View style={{ gap: 8 }}>
        <Text variant="caption" tone="subtle">
          « {view.question} »
        </Text>
        <Text variant="bodyStrong">{view.text}</Text>
        {view.bullets.map((b) => (
          <Text key={b} variant="small">
            • {b}
          </Text>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Button
            variant="secondary"
            icon="chatbubble-ellipses-outline"
            label={t('entry.answer.open')}
            onPress={() => {
              onClose();
              router.push({ pathname: '/assistant', params: { q: view.question } });
            }}
          />
          <Button variant="ghost" label={t('common.close')} onPress={onClose} />
        </View>
      </View>
    );
  }
  if (view.kind === 'ambiguous') {
    return (
      <View style={{ gap: 10 }}>
        <Text variant="caption" tone="subtle">
          « {view.text} »
        </Text>
        <Text variant="bodyStrong">{t('entry.ambiguous')}</Text>
        <Button
          icon="create-outline"
          label={t('entry.ambiguous.entry')}
          onPress={() => {
            setPhrase(view.text);
            setView({ kind: 'input' });
            onModeChange('keyboard');
          }}
        />
        <Button
          variant="secondary"
          icon="help-circle-outline"
          label={t('entry.ambiguous.question')}
          onPress={() => {
            onClose();
            router.push({ pathname: '/assistant', params: { q: view.text } });
          }}
        />
      </View>
    );
  }

  const voiceBlock = (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      {recording ? (
        <>
          <Text variant="small" tone="muted" align="center">
            {t('entry.voice.stopHint')}
          </Text>
          {shownText ? (
            <Text variant="body" align="center" style={{ fontStyle: 'italic' }}>
              « {shownText} »
            </Text>
          ) : (
            <Text variant="bodyStrong" align="center">
              {t('entry.voice.listening')}
            </Text>
          )}
          <RecorderBar elapsed={rec.elapsed} levels={recorder.levels} hasVolume={recorder.hasVolume} bars={recorder.bars} onCancel={recorder.cancel} onStop={recorder.tap} />
        </>
      ) : rec.status === 'processing' ? (
        <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
          {t('entry.voice.processing')}
        </Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('entry.voice.start')}
            onPress={() => void startVoice()}
            style={({ pressed }) => ({
              width: 84,
              height: 84,
              borderRadius: 42,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="mic" size={38} color={colors.onPrimary} />
          </Pressable>
          <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
            {t('entry.voice.tap')}
          </Text>
          {partial ? (
            <Text variant="body" align="center" style={{ fontStyle: 'italic' }} accessibilityLiveRegion="polite">
              « {partial} »
            </Text>
          ) : (
            <Text variant="small" tone="muted" align="center">
              {t('entry.voice.hint')}
            </Text>
          )}
        </>
      )}
      {voice === 'explain' ? (
        <View style={{ backgroundColor: colors.infoBg, borderRadius: radius.md, padding: 12, gap: 8, alignSelf: 'stretch' }}>
          <Text variant="small">{t('entry.voice.why')}</Text>
          <Button small icon="mic-outline" label={t('entry.voice.allow')} onPress={() => void allowMic()} />
        </View>
      ) : null}
      {voice === 'denied' || voice === 'unavailable' || voice === 'nothing' || voice === 'limit' ? (
        <View style={{ backgroundColor: colors.warningBg, borderRadius: radius.md, padding: 12, gap: 6, alignSelf: 'stretch' }} accessibilityRole="alert">
          <Text variant="small">{voice === 'limit' ? t('entry.voice.limit', { count: FREE_VOICE_ENTRIES_PER_DAY }) : t(`entry.voice.${voice}` as TKey)}</Text>
          {voice === 'limit' ? <Button small variant="secondary" label={t('entry.voice.upgrade')} onPress={() => (onClose(), router.push('/subscription'))} /> : null}
        </View>
      ) : null}
      {stats && !hasFeature(plan, 'voice_entry_unlimited') && voice !== 'limit' ? (
        <Text variant="caption" tone="subtle">
          {t('entry.voice.quota', { left: Math.max(0, FREE_VOICE_ENTRIES_PER_DAY - voiceToday(stats)), count: FREE_VOICE_ENTRIES_PER_DAY })}
        </Text>
      ) : null}
      <Text variant="caption" tone="subtle" align="center">
        {speechInput().supportsOnDevice() ? t('entry.voice.privacyDevice') : t('entry.voice.privacyOnline')}
      </Text>
    </View>
  );

  const keyboardBlock = (
    <View style={{ gap: 10 }}>
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: t('entry.type.expense'), icon: 'arrow-up' },
          { value: 'income', label: t('entry.type.income'), icon: 'arrow-down' },
        ]}
      />
      <Text variant="display" align="center" accessibilityLabel={t('entry.quick.amount', { amount: amountLabel })} style={{ color: type === 'expense' ? colors.expense : colors.income }} numberOfLines={1} adjustsFontSizeToFit>
        {amountText ? amountLabel : money(0)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
        {keypad.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? t('entry.quick.erase') : k}
            onPress={() => press(k)}
            style={({ pressed }) => ({ width: '31.5%', height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.border : colors.surfaceAlt })}
          >
            <Text variant="h3">{k}</Text>
          </Pressable>
        ))}
      </View>
      <Text variant="small" weight="700">
        {t('entry.quick.pickCategory')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {recent.map((id) => {
          const m = cats.meta(id);
          return <Chip key={id} label={cats.byId(id)} icon={m.icon} color={m.color} onPress={() => saveQuick(id)} />;
        })}
      </View>
      <Button
        small
        variant="ghost"
        icon="calculator-outline"
        label={t('sim.fromEntry')}
        onPress={() => {
          onClose();
          router.push({ pathname: '/simulate', params: quickAmount ? { amount: String(quickAmount) } : {} });
        }}
      />
      <Button
        small
        variant="ghost"
        icon="create-outline"
        label={t('entry.quick.more')}
        onPress={() => {
          onClose();
          router.push({ pathname: '/transaction/new', params: { type, ...(quickAmount ? { amount: String(quickAmount) } : {}) } });
        }}
      />
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      <Segmented
        value={mode}
        onChange={(m) => {
          if (m === 'keyboard') recorder.cancel();
          onModeChange(m);
        }}
        options={[
          { value: 'voice', label: t('entry.mode.voice'), icon: 'mic-outline' },
          { value: 'keyboard', label: t('entry.mode.keyboard'), icon: 'keypad-outline' },
        ]}
      />
      {mode === 'voice' ? voiceBlock : keyboardBlock}
      {/* Phrase écrite : même parseur que la voix, pour ceux qui ne veulent pas parler en public. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('entry.phrase.label')}
            placeholder={t('entry.phrase.placeholder')}
            value={phrase}
            onChangeText={setPhrase}
            returnKeyType="send"
            onSubmitEditing={() => phrase.trim() && analyze(phrase, 'text_phrase')}
          />
        </View>
        <Button icon="arrow-forward" label={t('entry.phrase.go')} onPress={() => phrase.trim() && analyze(phrase, 'text_phrase')} disabled={!phrase.trim()} style={{ marginBottom: 14 }} />
      </View>
      <Button
        small
        variant="ghost"
        icon="ellipsis-horizontal"
        label={t('entry.otherActions')}
        onPress={() => {
          onClose();
          quick.open();
        }}
      />
    </View>
  );
}
