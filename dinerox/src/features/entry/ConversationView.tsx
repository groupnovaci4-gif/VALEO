/**
 * Feuille de conversation (1.9) : bulle de l'utilisateur (sa transcription,
 * modifiable d'un toucher), bulles de DineroX (reformulation lue à voix haute),
 * carte de confirmation existante (les lignes, modifiables), question avec
 * boutons, réponse à la voix ou par écrit, puis bilan après « oui ».
 *
 * Un toucher sur une bulle de DineroX ou sur le micro coupe la voix tout de
 * suite. Le bouton « Arrêter la voix » est À CÔTÉ des zones cliquables.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { brand } from '@/config/brand';
import { Button, Field, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { Account } from '@/core/types';
import type { CurrencyCode } from '@/core/money';
import { ConfirmCard } from './ConfirmCard';
import { RecorderBar } from './RecorderBar';
import type { useConversation } from './useConversation';

type Conv = ReturnType<typeof useConversation>;

export interface ReplyMic {
  recording: boolean;
  processing: boolean;
  live: string;
  elapsed: number;
  levels: number[];
  hasVolume: boolean;
  bars: number;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function ConversationView({
  conv,
  accounts,
  currency,
  busy,
  thinking,
  mic,
  onValidate,
  onCancel,
  onReply,
  onRestart,
  onClose,
  envelopeName,
  onUndo,
}: {
  conv: Conv;
  accounts: Account[];
  currency: CurrencyCode;
  busy: boolean;
  /** Compréhension par l'IA en cours (quelques secondes au plus). */
  thinking: boolean;
  mic: ReplyMic;
  onValidate: () => void;
  onCancel: () => void;
  onReply: (text: string) => void;
  /** Transcription modifiée : nouvelle analyse complète. */
  onRestart: (text: string) => void;
  onClose: () => void;
  envelopeName: (id: string) => string;
  /** « Annuler » tout le groupe enregistré (5 secondes après « oui »), sinon null. */
  onUndo: (() => void) | null;
}) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const cats = useCategoryLabels();
  const [editing, setEditing] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [showSplit, setShowSplit] = useState(false);
  const [offersClosed, setOffersClosed] = useState<{
    envelope?: boolean;
    salary?: boolean;
  }>({});
  const s = conv.state;
  const talking = conv.phase === 'talking';
  const firstUser = conv.bubbles.findIndex((b) => b.from === 'user');

  // La carte des opérations suit la première reformulation ; les échanges suivants
  // viennent dessous, près de la zone de réponse.
  const firstApp = conv.bubbles.findIndex((b) => b.from === 'app');
  const bubbleOnly = (b: (typeof conv.bubbles)[number], i: number) =>
    b.from === 'user' ? (
      <View key={b.id} style={{ alignItems: 'flex-end', gap: 4 }}>
        {i === firstUser && editing !== null ? (
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <Field label={t('conv.edit')} value={editing} onChangeText={setEditing} multiline />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small icon="refresh" label={t('conv.reanalyze')} disabled={!editing.trim()} onPress={() => (onRestart(editing), setEditing(null))} />
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <>
            <View
              accessibilityLabel={`${t('conv.you')} : ${b.text}`}
              style={{
                maxWidth: '88%',
                backgroundColor: colors.surfaceAlt,
                borderRadius: radius.lg,
                borderBottomRightRadius: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text variant="body">{b.text}</Text>
            </View>
            {i === firstUser && talking ? <Button small variant="ghost" icon="create-outline" label={t('conv.edit')} onPress={() => setEditing(b.text)} /> : null}
          </>
        )}
      </View>
    ) : (
      <Pressable
        key={b.id}
        accessibilityLabel={`${brand.name} : ${[b.text, ...(b.bullets ?? []), b.footer ?? ''].join(' ')}`}
        accessibilityHint={conv.speaking ? t('conv.stopVoice') : undefined}
        onPress={conv.hush}
        style={{
          alignSelf: 'flex-start',
          maxWidth: '94%',
          backgroundColor: colors.infoBg,
          borderRadius: radius.lg,
          borderBottomLeftRadius: 4,
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 4,
        }}
      >
        <Text variant="caption" tone="subtle" weight="700">
          {brand.name}
        </Text>
        <Text variant="body" accessibilityLiveRegion="polite">
          {b.text}
        </Text>
        {(b.bullets ?? []).map((x) => (
          <Text key={x} variant="small">
            • {x}
          </Text>
        ))}
        {b.footer ? <Text variant="body">{b.footer}</Text> : null}
      </Pressable>
    );

  /** Bulle de DineroX, et, pour une question ouverte, le bouton vers l'assistant (À CÔTÉ de la bulle). */
  const appBubble = (b: (typeof conv.bubbles)[number], i: number) =>
    b.assistantQuestion ? (
      <View key={b.id} style={{ gap: 6, alignItems: 'flex-start' }}>
        {bubbleOnly(b, i)}
        <Button
          small
          variant="secondary"
          icon="chatbubble-ellipses-outline"
          label={t('entry.answer.open')}
          onPress={() => {
            onClose();
            router.push({ pathname: '/assistant', params: { q: b.assistantQuestion! } });
          }}
        />
      </View>
    ) : (
      bubbleOnly(b, i)
    );
  const bubble = (b: (typeof conv.bubbles)[number], i: number) => (b.from === 'user' ? bubbleOnly(b, i) : appBubble(b, i));

  const send = () => {
    const text = answer.trim();
    if (!text) return;
    setAnswer('');
    onReply(text);
  };

  return (
    <View style={{ gap: 10 }}>
      {/* Premier échange (transcription + reformulation), puis la carte, puis la suite de la conversation. */}
      {conv.bubbles.slice(0, firstApp < 0 ? conv.bubbles.length : firstApp + 1).map((b, i) => bubble(b, i))}

      {thinking ? (
        <Text variant="bodyStrong" accessibilityLiveRegion="polite">
          {t('conv.thinking')}
        </Text>
      ) : null}

      {conv.speaking ? <Button small variant="secondary" icon="stop-circle-outline" label={t('conv.stopVoice')} onPress={conv.hush} style={{ alignSelf: 'flex-start' }} /> : null}

      {/* Question en attente : réponses en boutons (la voix aussi est comprise). */}
      {talking && s?.pending ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {s.pending.question.options.map((o) => (
            <Button key={o.id} variant="secondary" label={t(`conv.option.${s.pending!.question.id}.${o.id}` as TKey, { word: s.pending!.question.word })} onPress={() => conv.answer(o.id, false)} />
          ))}
        </View>
      ) : null}

      {/* Les opérations : la carte de confirmation existante, modifiable d'un toucher. */}
      {talking && s && s.drafts.length ? (
        <ConfirmCard
          drafts={s.drafts}
          onChange={conv.setDrafts}
          onValidate={onValidate}
          onCorrect={() => setEditing(conv.bubbles[firstUser]?.text ?? '')}
          onCancel={onCancel}
          accounts={accounts}
          currency={currency}
          busy={busy}
        />
      ) : null}
      {talking && s && !s.drafts.length ? <Button variant="ghost" label={t('common.close')} onPress={onCancel} /> : null}

      {firstApp >= 0 ? conv.bubbles.slice(firstApp + 1).map((b, i) => bubble(b, firstApp + 1 + i)) : null}

      {/* Répondre : à la voix (même enregistreur) ou par écrit. */}
      {talking ? (
        mic.recording ? (
          <View style={{ gap: 6 }}>
            {mic.live ? (
              <Text variant="body" style={{ fontStyle: 'italic' }}>
                « {mic.live} »
              </Text>
            ) : null}
            <RecorderBar elapsed={mic.elapsed} levels={mic.levels} hasVolume={mic.hasVolume} bars={mic.bars} onCancel={mic.cancel} onStop={mic.stop} />
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Button icon="mic-outline" label={t('conv.reply.voice')} onPress={() => (conv.hush(), mic.start())} disabled={mic.processing} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('conv.reply.label')} placeholder={t('conv.reply.placeholder')} value={answer} onChangeText={setAnswer} returnKeyType="send" onSubmitEditing={send} />
              </View>
              <Button icon="arrow-forward" label={t('conv.reply.send')} onPress={send} disabled={!answer.trim()} style={{ marginBottom: 14 }} />
            </View>
          </View>
        )
      ) : null}

      {!talking && onUndo ? <Button variant="secondary" icon="arrow-undo-outline" label={t('entry.toast.undo')} onPress={onUndo} /> : null}

      {/* Après l'enregistrement : propositions (jamais appliquées d'office). */}
      {!talking && conv.offers.envelopeFor && !offersClosed.envelope ? (
        <View style={{ gap: 6 }}>
          <Text variant="body">
            {t('conv.offer.envelope', {
              category: cats.byId(conv.offers.envelopeFor),
            })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              small
              icon="add"
              label={t('conv.offer.envelope.yes')}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/envelopes/edit',
                  params: { categoryId: conv.offers.envelopeFor! },
                });
              }}
            />
            <Button small variant="ghost" label={t('conv.offer.no')} onPress={() => setOffersClosed((o) => ({ ...o, envelope: true }))} />
          </View>
        </View>
      ) : null}
      {!talking && conv.offers.salary && !offersClosed.salary ? (
        <View style={{ gap: 6 }}>
          <Text variant="body">{t('conv.offer.salary')}</Text>
          {showSplit ? (
            <View
              style={{
                gap: 4,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                padding: 10,
              }}
            >
              {conv.offers.salary.split.map((a, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <Text variant="small" style={{ flexShrink: 1 }}>
                    {a.envelopeId ? envelopeName(a.envelopeId) : t('env.allocate.free')}
                  </Text>
                  <Text variant="small" weight="700">
                    {money(a.amount)}
                  </Text>
                </View>
              ))}
              <Text variant="caption" tone="subtle">
                {t('conv.offer.salary.hint')}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small icon="pie-chart-outline" label={t('conv.offer.salary.yes')} onPress={() => setShowSplit(true)} />
              <Button small variant="ghost" label={t('conv.offer.no')} onPress={() => setOffersClosed((o) => ({ ...o, salary: true }))} />
            </View>
          )}
        </View>
      ) : null}
      {!talking ? <Button full icon="checkmark" label={t('common.close')} onPress={onClose} /> : null}
    </View>
  );
}
