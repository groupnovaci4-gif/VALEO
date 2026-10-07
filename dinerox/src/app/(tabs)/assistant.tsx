/**
 * « Parler à DineroX » : interface conversationnelle.
 *
 * Règle d'or : AUCUNE opération financière n'est enregistrée sans
 * confirmation explicite (bouton Confirmer). Les réponses chiffrées sont
 * calculées sur les données réelles ; l'analyse détaillée distante est
 * facultative, soumise au consentement et à la formule Plus.
 * La conversation reste sur l'appareil (non stockée sur le serveur).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useI18n, hasKey, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels, useFinance, useMoney } from '@/hooks/useFinance';
import { useFormatParams } from '@/hooks/useInsightText';
import { Button, Card, Chip, Icon, IconButton, Text } from '@/components/ui';
import { parseIntent, type ParsedIntent } from '@/core/ai/parser';
import { answerQuestion, type Answer } from '@/core/ai/answers';
import { buildFinanceSummary } from '@/core/ai/summary';
import { proposeIncomeAllocation } from '@/core/budget';
import { computeGoalPlan } from '@/core/goals';
import { suggestGoalCategory } from '@/core/goalCategories';
import { addMonths } from '@/core/dates';
import { toMinor } from '@/core/money';
import { hasFeature } from '@/core/subscription';
import { askRemoteAssistant, resolveAccountHint } from '@/services/ai';
import { analytics } from '@/services/analytics';
import { brand } from '@/config/brand';
import { ListenButton } from '@/features/coach/ListenButton';
import { speechInput } from '@/services/speechInput';

type Proposal =
  | { kind: 'tx'; type: 'expense' | 'income'; amount: number; categoryId: string | null; payee: string | null; date: string; accountId: string | null; allocation?: { envelopeId: string | null; amount: number }[] }
  | { kind: 'transfer'; amount: number; from: string | null; to: string | null; date: string }
  | { kind: 'goal'; name: string; amount: number | null; months: number | null; targetDate: string | null; categoryId: string; icon: string };

interface Message {
  id: string;
  from: 'user' | 'assistant';
  text?: string;
  bullets?: string[];
  proposal?: Proposal;
  status?: 'pending' | 'done' | 'cancelled';
  question?: string;
  remote?: boolean;
}

/** Thèmes de question accessibles en formule gratuite. */
const FREE_TOPICS = new Set(['spent_month', 'income_month', 'remaining_category', 'balance', 'spent_category']);

let seq = 0;
const mid = () => `m${Date.now()}${++seq}`;

export default function Assistant() {
  const { colors, radius } = useTheme();
  const { t, lang, monthYear } = useI18n();
  const { plan, profile, updateProfile, role } = useApp();
  const money = useMoney();
  const fmt = useFormatParams();
  const cats = useCategoryLabels();
  const actions = useActions();
  const f = useFinance();
  const { data, currency, now, envelopes } = f;
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
  /** La transcription n'est qu'un texte placé dans la zone de message : jamais envoyé ni enregistré sans l'utilisateur. */
  const dictate = () => {
    if (listening) {
      void speechInput().stop();
      return;
    }
    setListening(true);
    speechInput()
      .listen({ language: lang === 'en' ? 'en' : 'fr', onPartial: setInput })
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
  const renderAnswer = (a: Answer) => ({
    text: hasKey(a.key) ? t(a.key, fmt(a.params, { monthDates: true })) : '',
    bullets: a.bullets?.map((b) => (hasKey(b.key) ? t(b.key as TKey, fmt(b.params, { monthDates: true })) : '')).filter(Boolean),
  });
  const defaultAccount = data.accounts.find((a) => a.active && !a.isSavings)?.id ?? data.accounts.find((a) => a.active)?.id ?? null;
  const minor = (n: number | null) => (n === null ? null : toMinor(n, currency));

  const handle = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');
    push({ id: mid(), from: 'user', text });
    analytics.track('ai_used', { source: 'assistant' });
    const intent: ParsedIntent = parseIntent(text, now);
    switch (intent.kind) {
      case 'expense':
      case 'income': {
        // Sans compte : un compte « Espèces » sera créé à la confirmation (aucun blocage).
        if (intent.amount === null) return push({ id: mid(), from: 'assistant', text: t('ai.incomeNoAmount') });
        const amount = minor(intent.amount)!;
        const accountId = resolveAccountHint(intent.accountHint, data.accounts)?.id ?? defaultAccount;
        const p: Proposal = { kind: 'tx', type: intent.kind, amount, categoryId: intent.categoryId, payee: intent.payee, date: intent.date, accountId };
        if (intent.kind === 'income') {
          p.allocation = proposeIncomeAllocation(amount, envelopes, currency);
          return push({ id: mid(), from: 'assistant', text: t('ai.incomeAsk', { amount: money(amount) }), proposal: p, status: 'pending' });
        }
        return push({ id: mid(), from: 'assistant', proposal: p, status: 'pending' });
      }
      case 'transfer': {
        const from = resolveAccountHint(intent.from, data.accounts)?.id ?? null;
        const to = resolveAccountHint(intent.to, data.accounts)?.id ?? null;
        return push({ id: mid(), from: 'assistant', proposal: { kind: 'transfer', amount: minor(intent.amount)!, from, to, date: intent.date }, status: 'pending' });
      }
      case 'goal': {
        const s = suggestGoalCategory(intent.name);
        return push({
          id: mid(),
          from: 'assistant',
          text: intent.amount === null ? t('ai.propose.goalNoAmount') : undefined,
          proposal: { kind: 'goal', name: intent.name, amount: minor(intent.amount), months: intent.months, targetDate: intent.targetDate, categoryId: s?.category.id ?? 'custom', icon: s?.template?.icon ?? s?.category.icon ?? '🎯' },
          status: 'pending',
        });
      }
      case 'question': {
        if (!aiPlan && !FREE_TOPICS.has(intent.topic)) return push({ id: mid(), from: 'assistant', text: t('ai.locked') });
        const a = answerQuestion({ ...intent, amount: minor(intent.amount) }, { data, currency, now, categoryName: cats.byId });
        const r = renderAnswer(a);
        // Complément « dans N mois » pour un achat hors de portée.
        if (a.key === 'ai.a.affordNo' && a.params?.hasMonths) r.bullets = [...(r.bullets ?? []), t('ai.a.affordNoMonths', { months: a.params.months })];
        return push({ id: mid(), from: 'assistant', ...r, question: text });
      }
      default:
        return push({ id: mid(), from: 'assistant', text: t('ai.unknown'), question: aiPlan ? text : undefined });
    }
  };

  const confirm = (m: Message) => {
    const p = m.proposal!;
    try {
      if (p.kind === 'tx') {
        actions.saveTransaction({ type: p.type, amount: p.amount, currency, date: p.date, accountId: p.accountId ?? '', categoryId: p.categoryId, payee: p.payee, note: null });
      } else if (p.kind === 'transfer') {
        if (!p.from || !p.to) throw new Error('account');
        actions.saveTransaction({ type: 'transfer', amount: p.amount, currency, date: p.date, accountId: p.from, toAccountId: p.to });
      } else {
        if (!p.amount) return router.push({ pathname: '/goals/new', params: { name: p.name, ai: '1', targetDate: p.targetDate ?? undefined } });
        actions.createGoal({
          name: p.name,
          categoryId: p.categoryId,
          templateId: null,
          type: 'custom',
          icon: p.icon,
          currency,
          targetAmount: p.amount,
          initialAmount: 0,
          targetDate: p.targetDate,
          priority: 'normal',
          rank: 0,
          accountId: null,
          monthlyContribution: null,
          scope: 'personal',
          status: 'active',
          history: [],
        });
      }
      update(m.id, { status: 'done' });
      push({ id: mid(), from: 'assistant', text: t('ai.recorded') });
    } catch {
      // Information manquante : on ouvre le formulaire prérempli.
      edit(m);
    }
  };

  const edit = (m: Message) => {
    const p = m.proposal!;
    update(m.id, { status: 'cancelled' });
    if (p.kind === 'tx') router.push({ pathname: '/transaction/new', params: { type: p.type, amount: String(p.amount), categoryId: p.categoryId ?? undefined, payee: p.payee ?? undefined, accountId: p.accountId ?? undefined, date: p.date } });
    else if (p.kind === 'transfer') router.push({ pathname: '/transaction/new', params: { type: 'transfer', amount: String(p.amount), accountId: p.from ?? undefined, toAccountId: p.to ?? undefined } });
    else router.push({ pathname: '/goals/new', params: { name: p.name, amount: p.amount ? String(p.amount) : undefined, targetDate: p.targetDate ?? undefined, ai: '1' } });
  };

  // `consented` : consentement donné à l'instant (le profil de cette closure
  // n'est pas encore à jour — sinon la demande de consentement réapparaît).
  const askRemote = async (m: Message, consented = false) => {
    if (!m.question) return;
    if (!consented && !profile?.preferences.aiConsent) {
      push({ id: mid(), from: 'assistant', text: t('ai.remoteConsent'), question: m.question, proposal: undefined, status: 'pending', remote: true });
      return;
    }
    setBusy(true);
    let answer: string | null = null;
    try {
      const summary = buildFinanceSummary(data, currency, now, cats.byId);
      answer = await askRemoteAssistant(m.question, summary, lang);
    } catch {
      answer = null;
    } finally {
      setBusy(false);
    }
    push({ id: mid(), from: 'assistant', text: answer ?? t('ai.remoteUnavailable') });
  };

  const examples = useMemo(() => (['ai.ex1', 'ai.ex2', 'ai.ex3', 'ai.ex4', 'ai.ex5', 'ai.ex6'] as TKey[]).map((k) => t(k)), [t]);

  const renderProposal = (m: Message) => {
    const p = m.proposal!;
    let title = '';
    let detail: string | null = null;
    if (p.kind === 'tx') {
      title = p.type === 'expense' ? t('ai.propose.expense', { amount: money(p.amount), category: cats.byId(p.categoryId ?? '') }) : t('ai.propose.income', { amount: money(p.amount) });
      detail = [p.payee, data.accounts.find((a) => a.id === p.accountId)?.name, p.date !== now ? p.date : null].filter(Boolean).join(' · ') || null;
    } else if (p.kind === 'transfer') {
      title = t('ai.propose.transfer', { amount: money(p.amount), from: data.accounts.find((a) => a.id === p.from)?.name ?? '?', to: data.accounts.find((a) => a.id === p.to)?.name ?? '?' });
    } else {
      title = t('ai.propose.goal', { name: `${p.icon} ${p.name}` });
      if (p.amount) {
        const months = p.months ?? null;
        const target = p.targetDate ?? (months ? addMonths(now, months) : null);
        const gp = computeGoalPlan({ targetAmount: p.amount, saved: 0, targetDate: target }, now);
        detail = months || gp.monthsToTarget ? t('ai.propose.goalPlan', { amount: money(p.amount), months: months ?? gp.monthsToTarget ?? 0, monthly: money(gp.requiredMonthly ?? 0) }) : money(p.amount);
        if (target && !months) detail += ` · ${monthYear(target)}`;
      }
    }
    return (
      <Card style={{ marginTop: 8, gap: 8 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="small" tone="muted">
            {detail}
          </Text>
        ) : null}
        {p.kind === 'tx' && p.allocation?.length ? (
          <View style={{ gap: 4 }}>
            {p.allocation.map((a, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small">{a.envelopeId ? (data.envelopes.find((e) => e.id === a.envelopeId)?.name ?? '') : t('env.allocate.free')}</Text>
                <Text variant="small" weight="700">
                  {money(a.amount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {m.status === 'pending' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small variant="success" icon="checkmark" label={t('common.confirm')} onPress={() => confirm(m)} />
              <Button small variant="secondary" label={t('common.edit')} onPress={() => edit(m)} />
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
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text variant="h2" accessibilityRole="header">
            {t('ai.title')}
          </Text>
          <Text variant="caption" tone="subtle">
            {t('ai.disclaimer')}
          </Text>
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
              {m.proposal ? <View style={{ width: '88%' }}>{renderProposal(m)}</View> : null}
              {m.remote && m.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button
                    small
                    label={t('ai.remoteConsentYes')}
                    onPress={() => {
                      update(m.id, { status: 'done' });
                      void updateProfile({ preferences: { ...profile!.preferences, aiConsent: true } })
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
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, paddingBottom: 90, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
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
          <IconButton
            icon={listening ? 'stop-circle-outline' : 'mic-outline'}
            label={!micReady ? t('ai.mic.soon') : listening ? t('ai.mic.stop') : t('ai.mic.start')}
            disabled={!micReady}
            onPress={dictate}
          />
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
