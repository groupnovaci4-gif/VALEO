/**
 * Affichage d'une intention comprise (docs/ia-comprend-tout.md §1.3, §3, §4), le même dans la
 * feuille de saisie et dans « Parler à DineroX » :
 *  - question → réponse calculée (+ « Voir » vers l'écran, « Écouter » à côté) ;
 *  - action → carte de validation : « Valider » (seule écriture), « Modifier » (formulaire
 *    prérempli), « Annuler » ; montant, compte et date modifiables, champ incertain surligné ;
 *  - question « Lequel ? » → boutons tirés des données (au plus 2, puis « Ouvrir le formulaire ») ;
 *  - ouvrir → l'écran ; interdit → « Je ne peux pas faire ça ici » + lien ; introuvable → la liste ;
 *  - inconnu → « Je n'ai pas compris » + 3 exemples + « Saisir à la main ».
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { useActions } from '@/store/actions';
import { useFinance } from '@/hooks/useFinance';
import { HandledError, useMoneyGuard } from '@/features/money/MoneyGuard';
import { AmountField, Button, Card, ChipGroup, DateField, Icon, Text, useToast } from '@/components/ui';
import { ListenButton } from '@/features/coach/ListenButton';
import { useTheme } from '@/theme';
import { answerAsk, type ActionIntent, type Intent } from '@/core/ai/intent';
import { actionGate, buildActionCard, runAction, type ActionPort } from '@/core/ai/actionCard';
import { sectionById } from '@/core/ai/sections';
import { MAX_QUESTIONS } from '@/core/entry/conversation';
import { can } from '@/core/permissions';
import { hasFeature } from '@/core/subscription';
import { UNDO_MS } from '@/features/entry/useEntrySave';
import type { CurrencyCode } from '@/core/money';
import type { EntityRef } from '@/core/ai/vocabulary';
import type { useIntentEngine } from './useIntentEngine';

type Engine = ReturnType<typeof useIntentEngine>;

/** Exemples proposés quand une phrase n'est pas comprise (§1). */
export const IA_EXAMPLES: TKey[] = ['ia.ex.1', 'ia.ex.2', 'ia.ex.3'];

export function IntentResult({
  intent,
  engine,
  onIntent,
  onDone,
  onManual,
  onExample,
  quota,
}: {
  intent: Intent;
  engine: Engine;
  /** Une réponse à « Lequel ? » remplace l'intention. */
  onIntent: (next: Intent) => void;
  /** Après « Valider » ou « Annuler », ou à l'ouverture d'un écran. */
  onDone?: () => void;
  onManual?: () => void;
  onExample?: (text: string) => void;
  quota?: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { plan, role, user } = useApp();

  if (intent.kind === 'question') {
    const a = engine.answer(intent);
    const r = engine.render(a);
    return (
      <Card style={{ gap: 6 }}>
        <Text>{r.text}</Text>
        {r.bullets.map((b) => (
          <Text key={b} variant="small">
            • {b}
          </Text>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {a.link ? <Button small variant="secondary" icon="open-outline" label={t('ia.see')} onPress={() => (onDone?.(), router.push(sectionById(a.link!).path as never))} /> : null}
          <ListenButton text={[r.text, ...r.bullets]} />
        </View>
      </Card>
    );
  }

  if (intent.kind === 'ask') {
    const tooMany = intent.asked >= MAX_QUESTIONS;
    return (
      <Card style={{ gap: 10 }}>
        <Text variant="bodyStrong">{t(`ia.ask.${intent.field}` as TKey)}</Text>
        {tooMany ? (
          <Button small icon="create-outline" label={t('ia.ask.openForm')} onPress={() => (onDone?.(), openForm(intent.intent))} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {intent.options.map((o) => (
              <Button key={o.id} small variant="secondary" label={o.kind === 'section' ? t(o.label as TKey) : o.label} onPress={() => onIntent(answerAsk(intent, o.id, engine.ctx))} style={{ maxWidth: '100%' }} />
            ))}
          </View>
        )}
      </Card>
    );
  }

  if (intent.kind === 'action') return <ActionCardView intent={intent} engine={engine} onDone={onDone} />;

  if (intent.kind === 'open') return <OpenScreen section={intent.section} locked={sectionLocked(intent.section, plan, role, !!user?.isAdmin)} onDone={onDone} />;

  if (intent.kind === 'forbidden') {
    const s = intent.section ? sectionById(intent.section) : null;
    return (
      <Card tone="warning" style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="hand-left-outline" size={20} color={colors.warning} />
          <Text style={{ flex: 1 }}>{intent.reason === 'real_money' ? t('ia.forbidden.real_money') : t('ia.forbidden')}</Text>
        </View>
        {s ? <Button small variant="secondary" icon="open-outline" label={t('ia.forbidden.open', { name: t(s.labelKey as TKey) })} onPress={() => (onDone?.(), router.push(s.path as never))} /> : null}
      </Card>
    );
  }

  if (intent.kind === 'notFound') {
    const list = intent.options.map((o) => o.label).join(', ');
    const key = intent.entity === 'account' && intent.word === 'epargne' ? 'ia.none.savings' : list ? `ia.notFound.${intent.entity}` : `ia.none.${intent.entity}`;
    return (
      <Card style={{ gap: 8 }}>
        <Text>{t(key as TKey, { word: intent.word.charAt(0).toUpperCase() + intent.word.slice(1), list })}</Text>
        {intent.entity === 'account' && intent.word === 'epargne' ? <Button small variant="secondary" icon="add" label={t('sav.newAccount')} onPress={() => (onDone?.(), router.push('/accounts/edit?savings=1'))} /> : null}
      </Card>
    );
  }

  if (intent.kind === 'entry') return null;

  // Phrase non comprise : 3 exemples et la saisie à la main (§1).
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="bodyStrong">{t('ia.unknown')}</Text>
      {quota ? (
        <Text variant="small" tone="muted">
          {t('ia.quota')}
        </Text>
      ) : null}
      <Text variant="small" tone="muted">
        {t('ia.unknown.examples')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {IA_EXAMPLES.map((k) => (
          <Button key={k} small variant="secondary" label={t(k)} onPress={() => onExample?.(t(k))} style={{ maxWidth: '100%' }} />
        ))}
      </View>
      {onManual ? <Button small icon="create-outline" label={t('ia.unknown.manual')} onPress={onManual} /> : null}
    </Card>
  );
}

/** Une rubrique fermée par la formule, le rôle ou l'administration reste fermée (§2.3). */
function sectionLocked(id: Parameters<typeof sectionById>[0], plan: Parameters<typeof hasFeature>[0], role: Parameters<typeof can>[0], admin: boolean): boolean {
  const s = sectionById(id);
  if (s.admin && !admin) return true;
  if (s.can && !can(role, s.can[0], s.can[1])) return true;
  if (s.feature && !hasFeature(plan, s.feature)) return true;
  return false;
}

function OpenScreen({ section, locked, onDone }: { section: Parameters<typeof sectionById>[0]; locked: boolean; onDone?: () => void }) {
  const { t } = useI18n();
  const s = sectionById(section);
  const opened = useRef(false);
  useEffect(() => {
    if (locked || opened.current) return;
    opened.current = true;
    onDone?.();
    router.push(s.path as never);
  }, [locked, s.path, onDone]);
  return (
    <Card>
      <Text>{locked ? t('ia.a.roleLocked') : t('ia.opening', { name: t(s.labelKey as TKey) })}</Text>
    </Card>
  );
}

/** Formulaire prérempli (« Modifier », ou après 2 questions). */
export function openForm(i: Intent) {
  if (i.kind !== 'action') return;
  const amount = i.amount === null ? undefined : String(i.amount);
  const go = (pathname: string, params: Record<string, string | undefined>) => router.push({ pathname: pathname as never, params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string> });
  switch (i.action) {
    case 'save':
      return go('/savings/move', { mode: 'deposit', amount, accountId: i.to?.id, fromId: i.from?.id, date: i.date, ask: '1' });
    case 'withdraw_savings':
      return go('/savings/move', { mode: 'withdraw', amount, accountId: i.from?.id });
    case 'transfer':
      return go('/transaction/new', { type: 'transfer', amount, accountId: i.from?.id, toAccountId: i.to?.id });
    case 'goal_contribute':
      return i.ref ? go('/goals/contribute', { id: i.ref.id, amount }) : go('/goals', {});
    case 'goal_create':
      return go('/goals/new', { name: i.label ?? undefined, amount, ai: '1' });
    case 'debt_repayment':
      return i.ref ? go(`/debts/${i.ref.id}`, {}) : go('/debts', {});
    case 'debt_create':
      return go('/debts/edit', { direction: i.direction, amount, accountId: (i.direction === 'i_owe' ? i.to : i.from)?.id });
    case 'recurring_confirm':
      return i.ref ? go('/recurring/edit', { id: i.ref.id }) : go('/recurring', {});
    case 'reserve_use':
      return go('/transaction/new', { type: 'expense', amount, categoryId: i.categoryId ?? undefined, accountId: i.from?.id, reserveId: i.ref?.id });
    case 'envelope_budget':
      return i.ref ? go('/envelopes/edit', { id: i.ref.id }) : go('/budget', {});
    case 'recurring_create':
      return go('/recurring/edit', { type: i.type ?? 'expense', categoryId: i.categoryId ?? undefined });
  }
}

/** Carte de validation : rien n'est écrit avant « Valider » (§0.4, §3). */
function ActionCardView({ intent, engine, onDone }: { intent: ActionIntent; engine: Engine; onDone?: () => void }) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const { role, engine: sync, activeSpace } = useApp();
  const toast = useToast();
  const actions = useActions();
  const { guard } = useMoneyGuard();
  const { data, currency, now } = useFinance();
  const [amount, setAmount] = useState<number | null>(intent.amount);
  const [date, setDate] = useState(intent.date);
  const [from, setFrom] = useState<EntityRef | null>(intent.from ?? null);
  const [to, setTo] = useState<EntityRef | null>(intent.to ?? null);
  const [toAmount, setToAmount] = useState<number | null>(intent.toAmount ?? null);
  const [status, setStatus] = useState<'pending' | 'done' | 'cancelled'>('pending');
  /** Ce qui a été enregistré (titre de la carte et « Depuis … → vers … »), montré sous « C'est noté ✅ ». */
  const [summary, setSummary] = useState<string[]>([]);
  const edited: ActionIntent = useMemo(() => ({ ...intent, amount, date, from, to, toAmount }), [intent, amount, date, from, to, toAmount]);
  const cctx = { data, currency: currency as CurrencyCode, today: now };
  const card = buildActionCard(edited, cctx);
  const gate = actionGate(intent.action, role);
  const accounts = data.accounts.filter((a) => a.active && !a.deleted && a.currency === currency);
  // Audit I6 : un transfert peut arriver sur un compte dans une autre devise (le montant reçu est alors demandé).
  const anyCurrency = data.accounts.filter((a) => a.active && !a.deleted);
  const accountChips = (current: EntityRef | null, set: (r: EntityRef) => void, onlySavings: boolean | null, list = accounts) => (
    <ChipGroup
      scroll
      options={list.filter((a) => onlySavings === null || a.isSavings === onlySavings).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))}
      value={current?.id ?? null}
      onChange={(id) => set({ kind: 'account', id, label: list.find((a) => a.id === id)?.name ?? '' })}
    />
  );
  const fromSavings = intent.action === 'withdraw_savings' ? true : intent.action === 'goal_contribute' ? null : false;
  const toSavings = intent.action === 'save' ? true : intent.action === 'withdraw_savings' || intent.action === 'transfer' ? false : null;
  const showFrom = !['goal_create', 'envelope_budget', 'recurring_confirm'].includes(intent.action) && !(intent.action === 'debt_create' && intent.direction === 'i_owe');
  const showTo = ['save', 'withdraw_savings', 'transfer'].includes(intent.action) || (intent.action === 'debt_create' && intent.direction === 'i_owe');

  const validate = () => {
    if (gate) return;
    guard(
      (choices) => {
        try {
          const port = { ...(actions as unknown as ActionPort), currentTransactions: () => (sync && activeSpace ? sync.getData(activeSpace.id).transactions : []) };
          const r = runAction(edited, port, cctx, choices);
          const route = card.lines.find((l) => l.key === 'ia.card.fromTo' || l.key === 'ia.card.from' || l.key === 'ia.card.to');
          setSummary([engine.text(card.titleKey, card.titleParams), ...(route ? [engine.text(route.key, route.params)] : [])]);
          setStatus('done');
          toast.show(t('tx.saved'), 'success', { duration: UNDO_MS, actions: [{ label: t('entry.toast.undo'), onPress: () => (r.undo(), toast.show(t('entry.undone'), 'info')) }] });
          onDone?.();
        } catch (e) {
          if (e instanceof Error && (e.message === 'amount' || e.message === 'recurring' || e.message === 'toAmount')) {
            toast.show(t('ia.card.missing'), 'error');
            throw new HandledError();
          }
          throw e;
        }
      },
      {},
    );
  };

  if (status !== 'pending') {
    return (
      <Card style={{ gap: 4 }}>
        <Text tone={status === 'done' ? 'success' : 'subtle'}>{status === 'done' ? t('ai.recorded') : t('ai.cancelled')}</Text>
        {status === 'done'
          ? summary.map((line, i) => (
              <Text key={i} variant={i === 0 ? 'bodyStrong' : 'small'} tone={i === 0 ? 'default' : 'muted'}>
                {line}
              </Text>
            ))
          : null}
      </Card>
    );
  }
  const highlight = (on: boolean) => (on ? { borderWidth: 2, borderColor: colors.warning, borderRadius: radius.md, padding: 6 } : null);
  return (
    <Card style={{ gap: 10 }} accessibilityLabel={engine.text(card.titleKey, card.titleParams)}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {engine.text(card.titleKey, { ...card.titleParams, amount: amount ?? '…' })}
      </Text>
      {card.lines.map((l, i) => (
        <Text key={`${l.key}${i}`} variant="small" tone="muted">
          {engine.text(l.key, l.params)}
        </Text>
      ))}
      {gate ? (
        <Text tone="warning">{t(gate as TKey)}</Text>
      ) : (
        <>
          {intent.action !== 'recurring_confirm' ? (
            <View style={highlight(card.uncertain.includes('amount'))}>
              <AmountField label={t('common.amount')} value={amount} onChange={setAmount} currency={currency} />
            </View>
          ) : null}
          {showFrom ? (
            <View style={{ gap: 4 }}>
              <Text variant="label">{t(intent.action === 'save' ? 'ia.card.fromLabel' : 'tx.account')}</Text>
              {accountChips(from, setFrom, fromSavings)}
            </View>
          ) : null}
          {showTo ? (
            <View style={{ gap: 4 }}>
              <Text variant="label">{t('ia.card.toLabel')}</Text>
              {accountChips(to, setTo, toSavings, intent.action === 'transfer' ? anyCurrency : accounts)}
            </View>
          ) : null}
          {card.needsReceived ? (
            <View style={highlight(card.uncertain.includes('toAmount'))}>
              <AmountField label={t('tx.toAmount')} value={toAmount} onChange={setToAmount} currency={card.needsReceived} />
            </View>
          ) : null}
          {!['goal_create', 'envelope_budget', 'recurring_create'].includes(intent.action) ? <DateField label={t('common.date')} value={date} onChange={(d) => setDate(d ?? now)} /> : null}
          {card.shortfall ? (
            <Text variant="small" tone="warning">
              {t('ia.card.shortfall')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button small icon="checkmark" label={t('ia.card.validate')} onPress={validate} disabled={(amount === null && intent.action !== 'recurring_confirm') || (showFrom && !from && intent.action !== 'goal_create') || (showTo && !to) || card.uncertain.includes('toAmount')} />
            <Button small variant="secondary" label={t('common.edit')} onPress={() => (setStatus('cancelled'), onDone?.(), openForm(edited))} />
            <Button small variant="tertiary" label={t('common.cancel')} onPress={() => (setStatus('cancelled'), onDone?.())} />
          </View>
        </>
      )}
    </Card>
  );
}
