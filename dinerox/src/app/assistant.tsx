/**
 * « Parler à DineroX » : interface conversationnelle.
 *
 * Règle d'or : AUCUNE opération financière n'est enregistrée sans
 * confirmation explicite (bouton Confirmer). Les réponses chiffrées sont
 * calculées sur les données réelles ; l'analyse détaillée distante est
 * facultative, soumise au consentement et à la formule Plus.
 * La conversation reste sur l'appareil (non stockée sur le serveur).
 */
import { useVoiceRoute } from '@/features/entry/useVoiceRoute';
import { VoiceConsentCard } from '@/features/entry/VoiceConsentCard';
import { micOffered, packLanguageKey, type VoiceRoute } from '@/core/entry/voicePrivacy';
import { withConsent } from '@/core/aiConsent';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useMoneyGuard } from '@/features/money/MoneyGuard';
import { useCategoryLabels, useFinance, useMoney } from '@/hooks/useFinance';
import { Button, Card, Chip, Icon, IconButton, Text } from '@/components/ui';
import { buildFinanceSummary } from '@/core/ai/summary';
import { hasFeature } from '@/core/subscription';
import { askRemoteAssistant } from '@/services/ai';
import { analytics } from '@/services/analytics';
import { brand } from '@/config/brand';
import { ListenButton } from '@/features/coach/ListenButton';
import { goBack } from '@/hooks/goBack';
import { stopVoice } from '@/services/voice';
import { speechInput } from '@/services/speechInput';
import { useEntrySave } from '@/features/entry/useEntrySave';
import { useIntentEngine } from '@/features/ai/useIntentEngine';
import { IntentResult } from '@/features/ai/IntentResult';
import type { Intent } from '@/core/ai/intent';
import type { EntryDraft } from '@/core/entry/parse';

interface Message {
  id: string;
  from: 'user' | 'assistant';
  text?: string;
  bullets?: string[];
  /** Ce que le moteur a compris (docs/ia-comprend-tout.md) : réponse, carte, question, écran… */
  intent?: Intent;
  /** Quota de compréhension avancée épuisé (compréhension sur le téléphone seule). */
  quota?: boolean;
  /** Dépenses et revenus compris : une carte, « Tout valider ». */
  drafts?: EntryDraft[];
  status?: 'pending' | 'done' | 'cancelled';
  question?: string;
  remote?: boolean;
}

let seq = 0;
const mid = () => `m${Date.now()}${++seq}`;

export default function Assistant() {
  const { colors, radius } = useTheme();
  const { t, lang } = useI18n();
  const { plan, profile, updateProfile, role } = useApp();
  const money = useMoney();
  const cats = useCategoryLabels();
  const f = useFinance();
  const { data, currency, now } = f;
  const [input, setInput] = useState('');
  // Saisie vocale préparée, non activée : le micro reste désactivé tant
  // qu'aucun fournisseur n'est branché (services/speechInput.ts).
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    let alive = true;
    void speechInput()
      .isAvailable()
      .then((ok) => alive && setMicReady(ok))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // I1 : sur l'appareil par défaut quand c'est possible, sinon accord demandé une fois.
  const voiceRoute = useVoiceRoute(lang === 'en' ? 'en' : 'fr');
  const [voiceAsk, setVoiceAsk] = useState<'consent' | 'pack' | null>(null);
  /** La transcription n'est qu'un texte placé dans la zone de message : jamais envoyé ni enregistré sans l'utilisateur. */
  const dictate = async () => {
    if (listening) {
      void speechInput().stop();
      return;
    }
    const route = await voiceRoute.resolve();
    if (route === 'refused') return;
    if (route === 'ask' || route === 'pack') return void setVoiceAsk(route === 'ask' ? 'consent' : 'pack');
    await startDictation(route);
  };
  const answerVoice = (answer: 'service' | 'refused' | 'later') => {
    setVoiceAsk(null);
    if (answer === 'later') return;
    const route = voiceRoute.answer(answer);
    if (answer === 'service') void startDictation(route);
  };
  const startDictation = async (route: VoiceRoute) => {
    const provider = speechInput();
    const allowed = (await provider.permission()) === 'granted' || (await provider.requestPermission()) === 'granted';
    if (!allowed) return;
    // La voix du coach se tait quand le micro s'ouvre.
    await stopVoice().catch(() => undefined);
    setListening(true);
    speechInput()
      .listen({ language: lang === 'en' ? 'en' : 'fr', onPartial: setInput, onDeviceOnly: route === 'device' })
      .then((text) => setInput(text))
      .catch(() => undefined)
      .finally(() => setListening(false));
  };
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 'intro', from: 'assistant', text: t('ai.intro') }]);
  const listRef = useRef<FlatList<Message>>(null);
  const aiPlan = hasFeature(plan, 'ai_assistant');

  const push = (...m: Message[]) => {
    setMessages((cur) => [...cur, ...m]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };
  const update = (id: string, patch: Partial<Message>) => setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const { saveDrafts } = useEntrySave();
  const { guard } = useMoneyGuard();

  // docs/ia-comprend-tout.md §1 : le MÊME moteur que la feuille de saisie (local d'abord, repli Haiku).
  const engine = useIntentEngine('assistant');
  const handle = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');
    push({ id: mid(), from: 'user', text });
    analytics.track('ai_used', { source: 'assistant' });
    setBusy(true);
    void engine
      .understandText(text)
      .then((r) => {
        if (r.intent.kind === 'entry') return push({ id: mid(), from: 'assistant', drafts: r.intent.drafts, status: 'pending' });
        // Questions et phrases non comprises : l'analyse détaillée reste proposée (résumé agrégé, §5).
        push({ id: mid(), from: 'assistant', intent: r.intent, quota: r.quota, question: r.intent.kind === 'question' || r.intent.kind === 'unknown' ? text : undefined });
      })
      .finally(() => setBusy(false));
  };

  /** Dépenses et revenus : le chemin de la saisie (useEntrySave), complément du §6 avant d'écrire. */
  const confirmDrafts = (m: Message) =>
    guard((choices) => saveDrafts(m.drafts!, 'text_phrase', false, false, choices), {
      onDone: () => {
        update(m.id, { status: 'done' });
        push({ id: mid(), from: 'assistant', text: t('ai.recorded') });
      },
    });
  const editDrafts = (m: Message) => {
    const d = m.drafts![0];
    update(m.id, { status: 'cancelled' });
    router.push({ pathname: '/transaction/new', params: { type: d.type === 'income' ? 'income' : 'expense', ...(d.amount ? { amount: String(d.amount) } : {}), ...(d.categoryId ? { categoryId: d.categoryId } : {}), ...(d.accountId ? { accountId: d.accountId } : {}), date: d.date } });
  };

  // `consented` : consentement donné à l'instant (le profil de cette closure
  // n'est pas encore à jour — sinon la demande de consentement réapparaît).
  const askRemote = async (m: Message, consented = false) => {
    if (!m.question) return;
    if (!consented && !profile?.preferences.aiConsent) {
      push({ id: mid(), from: 'assistant', text: t('ai.remoteConsent'), question: m.question, status: 'pending', remote: true });
      return;
    }
    setBusy(true);
    let answer: string | null = null;
    try {
      const summary = buildFinanceSummary(data, currency, now, cats.byId, { reserve: t('ai.summary.reserve'), season: t('ai.summary.season'), country: profile?.country ?? null });
      answer = await askRemoteAssistant(m.question, summary, lang);
    } catch {
      answer = null;
    } finally {
      setBusy(false);
    }
    push({ id: mid(), from: 'assistant', text: answer ?? t('ai.remoteUnavailable') });
  };

  const params = useLocalSearchParams<{ q?: string }>();
  const handledQ = useRef<string | null>(null);
  useEffect(() => {
    const q = typeof params.q === 'string' ? params.q.trim() : '';
    if (!q || handledQ.current === q) return;
    handledQ.current = q;
    void Promise.resolve().then(() => handle(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const examples = useMemo(() => (['ai.ex1', 'ai.ex2', 'ai.ex3', 'ai.ex4', 'ai.ex5', 'ai.ex6'] as TKey[]).map((k) => t(k)), [t]);

  const renderDrafts = (m: Message) => (
    <Card style={{ marginTop: 8, gap: 8 }}>
      {m.drafts!.map((d, i) => (
        <Text key={i} variant="bodyStrong">
          {d.type === 'income' ? t('ai.propose.income', { amount: d.amount ? money(d.amount) : '…' }) : t('ai.propose.expense', { amount: d.amount ? money(d.amount) : '…', category: cats.byId(d.subcategoryId ?? d.categoryId ?? '') })}
          {d.accountId ? ` · ${data.accounts.find((a) => a.id === d.accountId)?.name ?? ''}` : ''}
        </Text>
      ))}
      {m.status === 'pending' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant="success" icon="checkmark" label={m.drafts!.length > 1 ? t('entry.confirm.validate') : t('ia.card.validate')} disabled={m.drafts!.some((d) => d.amount === null)} onPress={() => confirmDrafts(m)} />
            <Button small variant="secondary" label={t('common.edit')} onPress={() => editDrafts(m)} />
            <Button small variant="ghost" label={t('common.cancel')} onPress={() => (update(m.id, { status: 'cancelled' }), push({ id: mid(), from: 'assistant', text: t('ai.cancelled') }))} />
          </View>
          <Text variant="caption" tone="subtle">
            {t('ai.confirmHint')}
          </Text>
        </>
      ) : (
        <Text variant="caption" tone={m.status === 'done' ? 'success' : 'subtle'}>
          {m.status === 'done' ? t('ai.recorded') : t('ai.cancelled')}
        </Text>
      )}
    </Card>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 16, paddingVertical: 6 }}>
          <IconButton icon="chevron-back" label={t('common.back')} onPress={goBack} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h2" accessibilityRole="header">
              {t('ai.title')}
            </Text>
            <Text variant="caption" tone="subtle">
              {t('ai.disclaimer')}
            </Text>
          </View>
        </View>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
          ListFooterComponent={
            messages.length <= 1 ? (
              <View style={{ marginTop: 8 }}>
                <Text variant="small" weight="700" tone="muted" style={{ marginBottom: 8 }}>
                  {t('ai.examples')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {examples.map((e) => (
                    <Chip key={e} label={e} onPress={() => handle(e)} />
                  ))}
                </View>
              </View>
            ) : busy ? (
              <Text variant="small" tone="ai">
                {t('ai.remoteThinking')}
              </Text>
            ) : null
          }
          renderItem={({ item: m }) => (
            <View style={{ alignItems: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={{ maxWidth: '88%', backgroundColor: m.from === 'user' ? colors.primary : colors.surface, borderRadius: radius.lg, padding: m.text || m.bullets ? 12 : 0, borderWidth: m.from === 'assistant' && (m.text || m.bullets) ? 1 : 0, borderColor: colors.border }}>
                {m.from === 'assistant' && (m.text || m.bullets) ? (
                  <Text variant="caption" tone="ai" weight="700" style={{ marginBottom: 4 }}>
                    {brand.name}
                  </Text>
                ) : null}
                {m.text ? <Text style={{ color: m.from === 'user' ? colors.onPrimary : colors.text }}>{m.text}</Text> : null}
                {m.bullets?.map((b) => (
                  <Text key={b} variant="small" style={{ marginTop: 4 }}>
                    • {b}
                  </Text>
                ))}
                {m.from === 'assistant' && (m.text || m.bullets?.length) ? (
                  <View style={{ alignItems: 'flex-end', marginTop: 2, marginBottom: -6 }}>
                    <ListenButton text={[m.text ?? '', ...(m.bullets ?? [])]} />
                  </View>
                ) : null}
              </View>
              {m.drafts ? <View style={{ width: '88%' }}>{renderDrafts(m)}</View> : null}
              {m.intent ? (
                <View style={{ width: '88%' }}>
                  <IntentResult intent={m.intent} engine={engine} quota={m.quota} onIntent={(next) => update(m.id, { intent: next })} onExample={handle} onManual={() => router.push('/transaction/new')} />
                </View>
              ) : null}
              {m.remote && m.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button
                    small
                    label={t('ai.remoteConsentYes')}
                    onPress={() => {
                      update(m.id, { status: 'done' });
                      void updateProfile({ preferences: withConsent(profile!.preferences) })
                        .then(() => askRemote(m, true))
                        .catch(() => push({ id: mid(), from: 'assistant', text: t('ai.remoteUnavailable') }));
                    }}
                  />
                  <Button small variant="ghost" label={t('common.no')} onPress={() => update(m.id, { status: 'cancelled' })} />
                </View>
              ) : null}
              {m.from === 'assistant' && m.question && !m.remote && aiPlan ? (
                <Pressable accessibilityRole="button" onPress={() => void askRemote(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, minHeight: 36 }}>
                  <Icon name="sparkles" size={14} color={colors.ai} />
                  <Text variant="caption" tone="ai" weight="700">
                    {t('ai.askRemote')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
        {voiceAsk ? (
          <View style={{ paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <VoiceConsentCard
              title={voiceAsk === 'consent' ? t('entry.voice.consentTitle') : undefined}
              text={voiceAsk === 'consent' ? t('entry.voice.consentText') : t('entry.voice.packText', { language: t(packLanguageKey(voiceRoute.language)) })}
              yes={voiceAsk === 'consent' ? t('entry.voice.consentYes') : t('entry.voice.packUseService')}
              no={voiceAsk === 'consent' ? t('entry.voice.consentNo') : t('entry.voice.packLater')}
              onYes={() => answerVoice('service')}
              onNo={() => answerVoice(voiceAsk === 'consent' ? 'refused' : 'later')}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TextInput
            maxFontSizeMultiplier={1.3}
            value={input}
            onChangeText={setInput}
            placeholder={t('ai.placeholder')}
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t('ai.placeholder')}
            multiline
            onSubmitEditing={() => handle(input)}
            style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 16 }}
          />
          {/* I1 : après « Non, je tape », le micro n'est plus proposé. */}
          {!voiceRoute.route || micOffered(voiceRoute.route) ? (
            <IconButton
              icon={listening ? 'stop-circle-outline' : 'mic-outline'}
              label={!micReady ? t('ai.mic.soon') : listening ? t('ai.mic.stop') : t('ai.mic.start')}
              disabled={!micReady}
              onPress={() => void dictate()}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.confirm')}
            disabled={!input.trim() || role === null}
            onPress={() => handle(input)}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: input.trim() ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="send" size={20} color={input.trim() ? colors.onPrimary : colors.textSubtle} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
