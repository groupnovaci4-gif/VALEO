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
import { parseEntryText, type EntryDraft, type EntryParse } from '@/core/entry/parse';
import { entryVocabularyWords } from '@/core/entry/vocabularyWords';
import { recentCategories } from '@/core/entry/recent';
import { entryPrefs } from '@/core/entry/prefs';
import { answerQuestion } from '@/core/ai/answers';
import { FREE_VOICE_ENTRIES_PER_DAY, hasFeature, withinLimit } from '@/core/subscription';
import { currencyInfo, parseAmountInput, toMinor, type CurrencyCode } from '@/core/money';
import { speechInput, SpeechInputError, type SpeechPermission } from '@/services/speechInput';
import { readEntryStats, voiceToday } from '@/services/entryStats';
import { stopVoice } from '@/services/voice';
import { analytics } from '@/services/analytics';
import { ActionError } from '@/store/actions';
import { activeReserves, reserveBalance, reserveEligible } from '@/core/reserve';
import { canUseReserve } from '@/core/permissions';
import { ConfirmCard } from './ConfirmCard';
import { useEntrySave, type EntryMethod } from './useEntrySave';
import { useEntryStats } from './useEntryStats';
import type { EntryMode } from './EntryProvider';

type View_ =
  | { kind: 'input' }
  | { kind: 'confirm'; drafts: EntryDraft[]; method: EntryMethod; text: string; edited: boolean }
  | { kind: 'answer'; text: string; bullets: string[]; question: string }
  | { kind: 'ambiguous'; text: string };

type VoiceState = 'idle' | 'explain' | 'listening' | 'denied' | 'unavailable' | 'limit' | 'nothing';

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
  const { plan, profile, user, role } = useApp();
  const { data, currency, now } = useFinance();
  const stats = useEntryStats();
  const { saveDrafts } = useEntrySave();
  const [view, setView] = useState<View_>({ kind: 'input' });
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amountText, setAmountText] = useState('');
  const [phrase, setPhrase] = useState('');
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [partial, setPartial] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const ePrefs = entryPrefs(profile?.preferences);

  const accounts = useMemo(() => data.accounts.filter((a) => a.active && !a.deleted), [data.accounts]);
  // Compte par défaut : le dernier utilisé (s'il existe encore), sinon le premier compte courant.
  const defaultAccountId = useMemo(() => {
    const last = accounts.find((a) => a.id === stats?.lastAccountId && a.currency === currency);
    return last?.id ?? accounts.find((a) => !a.isSavings && a.currency === currency)?.id ?? accounts.find((a) => a.currency === currency)?.id ?? null;
  }, [accounts, stats?.lastAccountId, currency]);
  const recent = useMemo(() => recentCategories(stats?.recent[type] ?? [], cats.list(type).map((c) => c.id), data.categories, 6), [stats?.recent, type, cats, data.categories]);

  // ─── Analyse d'un texte (voix ou phrase) ───────────────────────────
  const analyze = (text: string, method: 'voice' | 'text_phrase') => {
    const r: EntryParse = parseEntryText(text, { today: now, currency: currency as CurrencyCode, accounts, categories: data.categories, defaultAccountId });
    if (r.kind === 'empty') {
      setVoice(method === 'voice' ? 'nothing' : 'idle');
      return;
    }
    if (r.kind === 'entries') {
      analytics.track('mic_routed', { to: 'entry', method });
      setView({ kind: 'confirm', drafts: r.items, method, text, edited: false });
      return;
    }
    if (r.kind === 'question') {
      analytics.track('mic_routed', { to: 'assistant', method });
      if (!hasFeature(plan, 'ai_assistant') && !FREE_TOPICS.has(r.intent.topic)) {
        setView({ kind: 'answer', text: t('ai.locked'), bullets: [], question: text });
        return;
      }
      const a = answerQuestion({ ...r.intent, amount: r.intent.amount === null ? null : toMinor(r.intent.amount, currency) }, { data, currency: currency as CurrencyCode, now, categoryName: cats.byId });
      setView({
        kind: 'answer',
        text: hasKey(a.key) ? t(a.key, fmt(a.params, { monthDates: true })) : '',
        bullets: (a.bullets ?? []).map((b) => (hasKey(b.key) ? t(b.key as TKey, fmt(b.params, { monthDates: true })) : '')).filter(Boolean),
        question: text,
      });
      return;
    }
    if (r.kind === 'assistant') {
      analytics.track('mic_routed', { to: 'assistant', method });
      onClose();
      router.push({ pathname: '/assistant', params: { q: text } });
      return;
    }
    analytics.track('mic_routed', { to: 'ambiguous', method });
    setView({ kind: 'ambiguous', text });
  };

  // ─── Voix ──────────────────────────────────────────────────────────
  const listen = async () => {
    // La voix du coach se tait quand le micro s'ouvre (jamais les deux à la fois).
    await stopVoice().catch(() => undefined);
    setPartial('');
    setVoice('listening');
    try {
      const text = await speechInput().listen({
        language: ePrefs.voiceLanguage ?? (lang === 'en' ? 'en' : 'fr'),
        onPartial: setPartial,
        onDeviceOnly: ePrefs.onDeviceOnly,
        contextualStrings: entryVocabularyWords(),
      });
      setPartial(text);
      setVoice('idle');
      if (!text.trim()) {
        setVoice('nothing');
        analytics.track('voice_entry_failed', { reason: 'no_speech' });
        return;
      }
      analyze(text, 'voice');
    } catch (e) {
      const code = e instanceof SpeechInputError ? e.code : 'unavailable';
      analytics.track('voice_entry_failed', { reason: code });
      setVoice(code === 'not-allowed' ? 'denied' : 'unavailable');
    }
  };

  const startVoice = async () => {
    // Compteur relu à la source : l'écoute peut démarrer avant que les compteurs ne soient chargés.
    const fresh = user ? await readEntryStats(user.uid).catch(() => null) : null;
    const used = fresh ? voiceToday(fresh) : stats ? voiceToday(stats) : 0;
    if (!withinLimit(plan, 'voiceEntriesPerDay', used)) {
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
    setVoice('denied');
  };

  // Ouverture en mode voix : l'écoute démarre directement (un appui = parler).
  useEffect(() => {
    if (mode !== 'voice' || started.current) return;
    started.current = true;
    void Promise.resolve().then(startVoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  useEffect(
    () => () => {
      void speechInput().stop();
    },
    [],
  );

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
    const offerReserve = type === 'expense' && reserveEligible(draft.categoryId) && canUseReserve(role) && activeReserves(data.goals, currency as CurrencyCode).some((g) => reserveBalance(g, data.goalContributions) > 0);
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={voice === 'listening' ? t('entry.voice.stop') : t('entry.voice.start')}
        onPress={() => (voice === 'listening' ? void speechInput().stop() : void startVoice())}
        style={({ pressed }) => ({
          width: 84,
          height: 84,
          borderRadius: 42,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: voice === 'listening' ? colors.danger : colors.primary,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon name={voice === 'listening' ? 'stop' : 'mic'} size={38} color={colors.onPrimary} />
      </Pressable>
      <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
        {voice === 'listening' ? t('entry.voice.listening') : t('entry.voice.tap')}
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
          if (m === 'keyboard') void speechInput().stop();
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
