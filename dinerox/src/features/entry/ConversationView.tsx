/**
 * Feuille de conversation (1.9) : bulle de l'utilisateur (sa transcription,
 * modifiable d'un toucher), bulles de DineroX (reformulation lue à voix haute),
 * carte de confirmation existante (les lignes, modifiables), question avec
 * boutons, réponse à la voix ou par écrit, puis bilan après « oui ».
 *
 * Un toucher sur une bulle de DineroX ou sur le micro coupe la voix tout de
 * suite. Le bouton « Arrêter la voix » est À CÔTÉ des zones cliquables.
 *
 * Design v2 (docs/ui-audit.md §10.2 et §10.6) : « Tout valider » seul bouton principal
 * pendant l'échange, « Fermer » après ; l'emplacement d'« Arrêter la voix » est réservé
 * tant qu'une lecture est possible (la carte ne remonte pas sous le doigt) ; bilan marqué
 * d'une icône de succès ; consentement : phrase rappelée, accord et refus de même poids.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useCategoryLabels, useMoney } from '@/hooks/useFinance';
import { brand } from '@/config/brand';
import { Amount, Banner, Button, Card, Field, Icon, Text } from '@/components/ui';
import { BIG_TEXT, MIN_TOUCH, useTheme } from '@/theme';
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
  voiceSlot,
  mic,
  onValidate,
  onCancel,
  onReply,
  onRestart,
  onEdit,
  onClose,
  envelopeName,
  onUndo,
  aiNote,
  consent,
}: {
  conv: Conv;
  accounts: Account[];
  currency: CurrencyCode;
  busy: boolean;
  /** Compréhension par l'IA en cours (quelques secondes au plus). */
  thinking: boolean;
  /** Lecture à voix haute possible dès le début (saisie vocale, voix non coupée) : emplacement d'« Arrêter la voix » réservé. */
  voiceSlot: boolean;
  mic: ReplyMic;
  onValidate: () => void;
  onCancel: () => void;
  onReply: (text: string) => void;
  /** Transcription modifiée : nouvelle analyse complète. */
  onRestart: (text: string) => void;
  /** La carte a été modifiée par l'utilisateur (saisie « corrigée »). */
  onEdit: () => void;
  onClose: () => void;
  envelopeName: (id: string) => string;
  /** « Annuler » tout le groupe enregistré (5 secondes après « oui »), sinon null. */
  onUndo: (() => void) | null;
  /** Note discrète après un appel à l'IA (usage du jour, ou quota atteint). */
  aiNote?: { text: string; reached: boolean } | null;
  /** Accord donné avant la 1.9 : le NOUVEAU texte de consentement, à accepter une fois avant tout envoi. `phrase` : ce que l'utilisateur a dit ou écrit. */
  consent?: { text: string; phrase: string; onAccept: () => void; onDecline: () => void } | null;
}) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  // Texte système agrandi (≥ 130 %) : lu une fois, fixe pendant la frappe (règle 13).
  const big = useWindowDimensions().fontScale >= BIG_TEXT;
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

  // Une lecture a eu lieu (réponse dite dans une conversation écrite) : l'emplacement reste réservé ensuite.
  // (état dérivé ajusté pendant le rendu, sans effet : React refait le rendu aussitôt.)
  const [spokeOnce, setSpokeOnce] = useState(false);
  if (conv.speaking && !spokeOnce) setSpokeOnce(true);
  const reserveStop = voiceSlot || spokeOnce;
  // Bulle du bilan : la dernière bulle de DineroX au moment de l'enregistrement (pas « Enregistrement annulé » ensuite).
  const [doneId, setDoneId] = useState<string | null>(null);
  if (!talking && !doneId) {
    const last = [...conv.bubbles].reverse().find((b) => b.from === 'app');
    if (last) setDoneId(last.id);
  }

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
              <Button small variant="secondary" icon="refresh" label={t('conv.reanalyze')} disabled={!editing.trim()} onPress={() => (onRestart(editing), setEditing(null))} />
              <Button small variant="tertiary" label={t('common.cancel')} onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <>
            <View
              accessible
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
            {i === firstUser && talking ? <Button small variant="tertiary" icon="create-outline" label={t('conv.edit')} onPress={() => setEditing(b.text)} /> : null}
          </>
        )}
      </View>
    ) : (
      <Pressable
        key={b.id}
        // Rôle « bouton » pendant la lecture seulement : c'est alors qu'un toucher a un effet (couper la voix).
        accessibilityRole={conv.speaking ? 'button' : undefined}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Bilan après « oui » : c'est enregistré (D-3). */}
          {b.id === doneId ? <Icon name="checkmark-circle" size={18} color={colors.success} /> : null}
          <Text variant="caption" tone="muted" weight="700">
            {brand.name}
          </Text>
        </View>
        <Text variant="body" accessibilityLiveRegion="polite">
          {b.text}
        </Text>
        {(b.bullets ?? []).map((x) => (
          <Text key={x} variant="body">
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

  if (consent) {
    // Pas une erreur : annonce polie, le texte est lu en entier à la navigation. Accord et refus :
    // deux vrais boutons de même largeur, empilés (D-2) ; la phrase concernée est rappelée au-dessus (D-4).
    return (
      <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
        {consent.phrase ? (
          <View
            accessible
            accessibilityLabel={`${t('conv.you')} : ${consent.phrase}`}
            style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Text variant="body">{consent.phrase}</Text>
          </View>
        ) : null}
        <Card style={{ gap: 12 }}>
          <View style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="shield-checkmark-outline" size={24} color={colors.primary} />
          </View>
          <Text variant="body">{consent.text}</Text>
        </Card>
        <Button full icon="checkmark" label={t('ai.remoteConsentYes')} onPress={consent.onAccept} />
        <Button full variant="secondary" label={t('conv.offer.no')} onPress={consent.onDecline} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Premier échange (transcription + reformulation), puis la carte, puis la suite de la conversation. */}
      {conv.bubbles.slice(0, firstApp < 0 ? conv.bubbles.length : firstApp + 1).map((b, i) => bubble(b, i))}

      {thinking ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
            {t('conv.thinking')}
          </Text>
        </View>
      ) : null}

      {/* Quota de compréhension avancée : usage du jour en note discrète ; quota atteint en message (rien n'est bloqué). */}
      {aiNote && aiNote.reached ? <Banner tone="info" icon="sparkles-outline" text={aiNote.text} /> : null}
      {aiNote && !aiNote.reached ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLiveRegion="polite">
          <Icon name="sparkles-outline" size={16} color={colors.textSubtle} />
          <Text variant="caption" tone="subtle" style={{ flexShrink: 1 }}>
            {aiNote.text}
          </Text>
        </View>
      ) : null}

      {/* « Arrêter la voix » : emplacement réservé tant qu'une lecture est possible, pour que la carte
          ne remonte pas sous le doigt à la fin de la lecture. À côté des bulles, jamais dedans (règle 17). */}
      {reserveStop || conv.speaking ? (
        <View style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          {conv.speaking ? <Button small variant="secondary" icon="stop-circle-outline" label={t('conv.stopVoice')} onPress={conv.hush} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      ) : null}

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
          onChange={(drafts) => {
            conv.setDrafts(drafts);
            onEdit();
          }}
          onValidate={onValidate}
          onCorrect={() => setEditing(conv.bubbles[firstUser]?.text ?? '')}
          onCancel={onCancel}
          accounts={accounts}
          currency={currency}
          busy={busy}
        />
      ) : null}
      {talking && s && !s.drafts.length ? <Button variant="tertiary" label={t('common.close')} onPress={onCancel} /> : null}

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
          <View style={{ gap: 8 }}>
            {/* « Tout valider » (carte) reste le seul bouton principal : répondre est secondaire. */}
            <Button variant="secondary" icon="mic-outline" label={t('conv.reply.voice')} onPress={() => (conv.hush(), mic.start())} disabled={mic.processing} />
            {/* Texte agrandi : « Envoyer » sous le champ, pleine largeur ; sinon à droite, centré sur le champ (52 dp + marge 16). */}
            <View style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'stretch' : 'flex-end', gap: big ? 0 : 8 }}>
              <View style={{ flex: big ? undefined : 1 }}>
                <Field label={t('conv.reply.label')} placeholder={t('conv.reply.placeholder')} value={answer} onChangeText={setAnswer} returnKeyType="send" onSubmitEditing={send} />
              </View>
              <Button variant="secondary" icon="arrow-forward" label={t('conv.reply.send')} onPress={send} disabled={!answer.trim()} full={big} style={big ? { marginBottom: 8 } : { marginBottom: 18 }} />
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
              variant="secondary"
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
            <Button small variant="tertiary" label={t('conv.offer.no')} onPress={() => setOffersClosed((o) => ({ ...o, envelope: true }))} />
          </View>
        </View>
      ) : null}
      {!talking && conv.offers.salary && !offersClosed.salary ? (
        <View style={{ gap: 6 }}>
          <Text variant="body">{t('conv.offer.salary')}</Text>
          {showSplit ? (
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              {conv.offers.salary.split.map((a, i) => (
                // Une ligne par enveloppe : nom à gauche, montant à droite ; deux étages à ≥ 130 %.
                <View
                  key={i}
                  accessible
                  style={{
                    flexDirection: big ? 'column' : 'row',
                    alignItems: big ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: big ? 2 : 8,
                    minHeight: MIN_TOUCH,
                    paddingVertical: 8,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text variant="body" style={{ flexShrink: 1 }}>
                    {a.envelopeId ? envelopeName(a.envelopeId) : t('env.allocate.free')}
                  </Text>
                  <Amount text={money(a.amount)} size="S" />
                </View>
              ))}
              <Text variant="caption" tone="subtle" style={{ paddingVertical: 8 }}>
                {t('conv.offer.salary.hint')}
              </Text>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small variant="secondary" icon="pie-chart-outline" label={t('conv.offer.salary.yes')} onPress={() => setShowSplit(true)} />
              <Button small variant="tertiary" label={t('conv.offer.no')} onPress={() => setOffersClosed((o) => ({ ...o, salary: true }))} />
            </View>
          )}
        </View>
      ) : null}
      {!talking ? <Button full icon="checkmark" label={t('common.close')} onPress={onClose} /> : null}
    </View>
  );
}
