/**
 * Une tontine partagée (étape 3), vue par un membre.
 *  - tours : date, qui reçoit la cagnotte, statut de chaque place SELON LA
 *    PERSONNE (tous : « payé » / « pas encore » ; « en retard », « déclaré »,
 *    « contesté » : organisateur, trésorier et personne concernée) ;
 *  - « J'ai payé » sur ses propres places, puis, si la personne l'accepte,
 *    l'opération réelle dans SON espace (même catégorie que le carnet) ;
 *  - organisateur : demandes, invitation (WhatsApp), ordre / tirage, trésorier,
 *    surnoms privés (sur ce téléphone), paramètres, nouveau cycle ;
 *  - organisateur et trésorier : confirmer / contester, retards, rappel préparé ;
 *  - historique, quitter la tontine.
 * Aucun argent ne transite : DineroX suit la tontine.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DesignV2 } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useActions } from '@/store/actions';
import { useMoney } from '@/hooks/useFinance';
import { AmountField, Badge, Banner, Button, Card, Chip, EmptyState, Field, IconButton, Loading, Screen, SectionHeader, SwitchRow, Text, useToast, type BadgeTone } from '@/components/ui';
import { brand } from '@/config/brand';
import { today } from '@/core/dates';
import { cycleFinished, cycleSummary, groupSchedule, isGroupManager, nextPeriod, paidKey, reminderParams, slotStatusFor, type GroupPayment, type SlotStatus, type TontineGroup } from '@/core/tontineGroup';
import { analytics } from '@/services/analytics';
import { listenHistory, listenPayments, listenRequests, readNicknames, tgRefusal, tontineGroupCall, writeNickname, type HistoryLine, type JoinRequest } from '@/services/tontineGroups';
import { useMyGroups, slotName } from '@/features/tontineGroup/useMyGroups';
import { ShareWhatsAppButton } from '@/features/share/ShareWhatsAppButton';

const STATUS: Record<SlotStatus, { key: TKey; tone: BadgeTone }> = {
  paid: { key: 'tg.status.paid', tone: 'success' },
  not_yet: { key: 'tg.status.notYet', tone: 'neutral' },
  late: { key: 'tg.status.late', tone: 'danger' },
  declared: { key: 'tg.status.declared', tone: 'warning' },
  disputed: { key: 'tg.status.disputed', tone: 'danger' },
};

export default function TontineGroupScreen() {
  return (
    <DesignV2>
      <GroupLoader />
    </DesignV2>
  );
}

function GroupLoader() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, uid } = useMyGroups();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(h);
  }, []);
  const g = groups.find((x) => x.id === id);
  if (!uid || !g) {
    return waited ? (
      <Screen back title={t('tg.section')}>
        <EmptyState icon="people-outline" title={t('tg.err.generic')} />
      </Screen>
    ) : (
      <Loading />
    );
  }
  return <GroupView g={g} uid={uid} />;
}

function GroupView({ g, uid }: { g: TontineGroup; uid: string }) {
  const { t, date } = useI18n();
  const toast = useToast();
  const actions = useActions();
  const money = useMoney();
  const organizer = g.organizerUid === uid;
  const manager = isGroupManager(g, uid);
  const active = g.status === 'active';
  const [now] = useState(() => today());
  const [payments, setPayments] = useState<(GroupPayment & { id: string })[]>([]);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [nicks, setNicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => listenPayments(g.id, uid, manager, setPayments), [g.id, uid, manager]);
  useEffect(() => listenHistory(g.id, uid, manager, setHistory), [g.id, uid, manager]);
  useEffect(() => (organizer ? listenRequests(g.id, setRequests) : undefined), [g.id, organizer]);
  useEffect(() => {
    if (!organizer) return;
    let alive = true;
    void readNicknames(uid, g.id).then((n) => alive && setNicks(n));
    return () => {
      alive = false;
    };
  }, [organizer, uid, g.id]);

  const schedule = useMemo(() => groupSchedule(g), [g]);
  const current = nextPeriod(g, now) ?? { period: g.slots.length, date: schedule[schedule.length - 1].date };
  const [period, setPeriod] = useState(current.period);
  const indexOf = (slotId: string) => g.slots.findIndex((s) => s.slotId === slotId);
  const nameOf = (slotId: string | null) => {
    const s = g.slots.find((x) => x.slotId === slotId);
    return s ? slotName(t, s, indexOf(s.slotId), organizer ? nicks : {}) : '';
  };
  const paymentOf = (p: number, slotId: string) => payments.find((x) => x.id === paidKey(g.cycle, p, slotId)) ?? null;
  const statusOf = (p: number, slotId: string) => slotStatusFor(g, paymentOf(p, slotId), g.slots[indexOf(slotId)], p, uid, now);

  /** Une action sur le serveur ; le message d'erreur reste dans l'écran (jamais d'exception non gérée). */
  const act = useCallback(
    async (key: string, action: Parameters<typeof tontineGroupCall>[0], data: Record<string, unknown>, after?: () => void) => {
      setBusy(key);
      try {
        await tontineGroupCall(action, { groupId: g.id, ...data });
        after?.();
      } catch (e) {
        toast.show(t(tgRefusal(e) === 'tg/orphaned' ? 'tg.orphaned' : 'tg.err.generic'), 'error');
      } finally {
        setBusy(null);
      }
    },
    [g.id, t, toast],
  );

  /** « J'ai payé » : déclaration, puis, avec l'accord de la personne, l'opération réelle dans son espace. */
  const declare = (p: number, slotId: string) =>
    act(`declare-${p}-${slotId}`, 'declare', { period: p, slotId }, () => {
      analytics.track('tontine_payment_declared', {});
      Alert.alert(t('tg.iPaid'), t('tg.iPaid.record'), [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          onPress: () => {
            try {
              actions.recordTontineGroupContribution({ groupName: g.name, amount: g.amountPerShare, currency: g.currency, date: now });
              toast.show(t('common.saved'));
            } catch {
              toast.show(t('tg.err.generic'), 'error');
            }
          },
        },
      ]);
    });

  const lateItems = manager
    ? schedule.filter((x) => x.period <= current.period).flatMap((x) => g.slots.filter((s) => ['late', 'declared', 'disputed'].includes(statusOf(x.period, s.slotId))).map((s) => ({ period: x.period, slotId: s.slotId })))
    : [];

  return (
    <Screen back title={g.name}>
      <Text tone="muted">{t('tg.summary', { frequency: t(`tontine.freq.${g.frequency}` as TKey), slots: g.slots.length })}</Text>
      <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
        {t('tg.cycle', { n: g.cycle })}
      </Text>
      {!active ? <Banner tone="warning" icon="lock-closed-outline" text={t('tg.orphaned')} /> : null}

      {/* ── Tours ── */}
      <SectionHeader title={t('tg.turns')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {schedule.map((x) => (
          <Chip key={x.period} label={String(x.period)} selected={x.period === period} onPress={() => setPeriod(x.period)} />
        ))}
      </View>
      <Card style={{ gap: 8 }}>
        <Text variant="bodyStrong">{t('tg.turn', { n: period, date: date(schedule[period - 1].date) })}</Text>
        <Text variant="small" tone="muted">
          {t('tg.turn.receives', { name: nameOf(schedule[period - 1].beneficiarySlotId) })}
        </Text>
        {g.slots.map((s, i) => {
          const st = statusOf(period, s.slotId);
          const mine = s.uid === uid;
          return (
            <View key={s.slotId} style={{ gap: 6, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ flexGrow: 1, flexShrink: 1 }}>{slotName(t, s, i, organizer ? nicks : {})}</Text>
                <Badge label={t(STATUS[st].key)} tone={STATUS[st].tone} />
              </View>
              {active && mine && (st === 'not_yet' || st === 'late' || st === 'disputed') ? (
                <Button small variant="secondary" icon="checkmark-circle-outline" label={t('tg.iPaid')} loading={busy === `declare-${period}-${s.slotId}`} onPress={() => void declare(period, s.slotId)} style={{ alignSelf: 'flex-start' }} />
              ) : null}
              {active && manager && st !== 'paid' ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button small icon="checkmark-done-outline" label={t('tg.confirm')} accessibilityLabel={`${t('tg.confirm')}, ${slotName(t, s, i, organizer ? nicks : {})}`} loading={busy === `confirm-${period}-${s.slotId}`} onPress={() => void act(`confirm-${period}-${s.slotId}`, 'confirm', { period, slotId: s.slotId }, () => analytics.track('tontine_payment_confirmed', {}))} />
                  {st === 'declared' ? <Button small variant="tertiary" label={t('tg.dispute')} accessibilityLabel={`${t('tg.dispute')}, ${slotName(t, s, i, organizer ? nicks : {})}`} onPress={() => void act(`dispute-${period}-${s.slotId}`, 'dispute', { period, slotId: s.slotId })} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {/* ── Retards et rappel préparé (organisateur, trésorier) ── */}
      {manager ? <ManagerTools g={g} lateItems={lateItems} nameOf={nameOf} current={current} /> : null}

      {/* ── Fin de cycle ── */}
      {cycleFinished(g, now) ? (
        <Card style={{ marginTop: 12, gap: 8 }}>
          <Text variant="bodyStrong">{t('tg.cycle.end')}</Text>
          {manager ? (
            <Text variant="small" tone="muted">
              {(() => {
                const s = cycleSummary(g);
                return t('tg.cycle.summary', { turns: s.turns, confirmed: s.confirmed, missing: s.missing, total: money(s.total) });
              })()}
            </Text>
          ) : null}
          {organizer && active ? <Button label={t('tg.cycle.restart')} loading={busy === 'cycle'} onPress={() => void act('cycle', 'newCycle', {})} /> : null}
        </Card>
      ) : null}

      {/* ── Organisateur ── */}
      {organizer && active ? <OrganizerTools g={g} requests={requests} nicks={nicks} setNicks={setNicks} uid={uid} /> : null}

      {/* ── Membres ── */}
      <SectionHeader title={t('tg.members')} />
      <Card>
        {g.slots.map((s, i) => (
          <View key={s.slotId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, flexWrap: 'wrap' }}>
            <Text style={{ flexGrow: 1, flexShrink: 1 }}>{slotName(t, s, i, organizer ? nicks : {})}</Text>
            {s.uid && s.uid === g.organizerUid ? <Badge label={t('tg.organizer')} tone="info" /> : null}
            {s.uid && s.uid === g.treasurerUid ? <Badge label={t('tg.treasurer')} tone="info" /> : null}
          </View>
        ))}
      </Card>

      {/* ── Historique ── */}
      <SectionHeader title={t('history.title')} />
      <Card>
        {history.slice(0, 30).map((h) => (
          <View key={h.id} style={{ paddingVertical: 6 }}>
            <Text variant="small">{t(`tg.h.${h.action}` as TKey, { name: nameOf(g.slots.find((s) => s.uid === h.by)?.slotId ?? null) })}</Text>
            <Text variant="caption" tone="subtle">
              {date(new Date(h.at).toISOString().slice(0, 10))}
              {h.period ? ` · ${t('tg.turn', { n: h.period, date: date(schedule[h.period - 1]?.date ?? now) })}` : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Text variant="caption" tone="subtle" style={{ marginTop: 12 }}>
        {t('tontine.legal')}
      </Text>

      {!organizer ? (
        <Button
          variant="destructive"
          icon="exit-outline"
          label={t('tg.leave')}
          style={{ marginTop: 16 }}
          onPress={() =>
            Alert.alert(t('tg.leave'), t('tg.leave.confirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('tg.leave'), style: 'destructive', onPress: () => void act('leave', 'leave', {}, () => router.replace('/tontines')) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}

/** Organisateur et trésorier : retards et rappel à partager soi-même (l'application n'envoie rien). */
function ManagerTools({ g, lateItems, nameOf, current }: { g: TontineGroup; lateItems: { period: number; slotId: string }[]; nameOf: (slotId: string | null) => string; current: { period: number; date: string } }) {
  const { t, date } = useI18n();
  const money = useMoney();
  const [showAmount, setShowAmount] = useState(false);
  const r = reminderParams(g, current, showAmount);
  const message = [t('tg.reminder.message', { turn: r.turn, name: r.name, date: date(r.date) }), showAmount ? t('tg.invite.messageAmount', { amount: money(g.amountPerShare) }) : null].filter(Boolean).join(' ');
  return (
    <>
      <SectionHeader title={t('tg.late.title')} />
      <Card style={{ gap: 6 }}>
        {lateItems.length ? (
          lateItems.map((x) => (
            <Text key={`${x.period}-${x.slotId}`} variant="small">
              {`${t('tg.turn', { n: x.period, date: date(groupSchedule(g)[x.period - 1].date) })} · ${nameOf(x.slotId)}`}
            </Text>
          ))
        ) : (
          <Text variant="small" tone="muted">
            —
          </Text>
        )}
        <Text variant="bodyStrong" style={{ marginTop: 8 }}>
          {t('tg.reminder')}
        </Text>
        <SwitchRow title={t('tg.reminder.showAmount')} value={showAmount} onChange={setShowAmount} />
        <Text variant="small" tone="muted" selectable>
          {message}
        </Text>
        <ShareWhatsAppButton context="tontine" message={message} />
      </Card>
    </>
  );
}

/** Organisateur seul : demandes, invitation, ordre des tours, trésorier, surnoms privés, paramètres. */
function OrganizerTools({ g, requests, nicks, setNicks, uid }: { g: TontineGroup; requests: JoinRequest[]; nicks: Record<string, string>; setNicks: (n: Record<string, string>) => void; uid: string }) {
  const { t, date } = useI18n();
  const toast = useToast();
  const money = useMoney();
  const free = g.slots.filter((s) => !s.uid);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [days, setDays] = useState('7');
  const [showAmount, setShowAmount] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  // Ordre affiché = ordre RÉEL du groupe (après un tirage, une validation…) tant que l'organisateur
  // n'a rien déplacé ; sinon « Enregistrer l'ordre » écraserait le tirage avec un ordre périmé.
  const serverOrder = useMemo(() => [...g.slots].sort((a, b) => a.turnOrder - b.turnOrder).map((s) => s.slotId), [g.slots]);
  const [edited, setEdited] = useState<string[] | null>(null);
  const order = edited ?? serverOrder;
  const [name, setName] = useState(g.name);
  const [amount, setAmount] = useState<number | null>(g.amountPerShare);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: Parameters<typeof tontineGroupCall>[0], data: Record<string, unknown>) => {
    setBusy(key);
    try {
      return await tontineGroupCall<{ code?: string }>(action, { groupId: g.id, ...data });
    } catch {
      toast.show(t('tg.err.generic'), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };
  const label = (slotId: string) => slotName(t, g.slots.find((s) => s.slotId === slotId)!, g.slots.findIndex((s) => s.slotId === slotId), nicks);
  const move = (k: number, dir: -1 | 1) => {
    const next = [...order];
    [next[k], next[k + dir]] = [next[k + dir], next[k]];
    setEdited(next);
  };
  const inviteMessage = invite
    ? [t('tg.invite.message', { name: g.name, link: `https://${brand.linkHost}/t/${invite}?src=whatsapp`, code: invite }), showAmount ? t('tg.invite.messageAmount', { amount: money(g.amountPerShare) }) : null].filter(Boolean).join(' ')
    : null;

  return (
    <>
      {/* Demandes à valider : la personne a demandé ; l'organisateur choisit sa place. */}
      {requests.length ? (
        <>
          <SectionHeader title={t('tg.requests')} />
          {requests.map((r) => (
            <Card key={r.uid} style={{ gap: 8, marginBottom: 8 }}>
              <Text variant="bodyStrong">{r.label}</Text>
              <Text variant="small" tone="muted">
                {t('tg.request.place')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {free.map((s) => (
                  <Chip key={s.slotId} label={label(s.slotId)} selected={pick[r.uid] === s.slotId} onPress={() => setPick((p) => ({ ...p, [r.uid]: s.slotId }))} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label={t('tg.request.approve')} accessibilityLabel={`${t('tg.request.approve')}, ${r.label}`} disabled={!pick[r.uid]} loading={busy === `approve-${r.uid}`} onPress={() => void run(`approve-${r.uid}`, 'approve', { uid: r.uid, slotIds: [pick[r.uid]] })} />
                <Button variant="tertiary" label={t('tg.request.reject')} accessibilityLabel={`${t('tg.request.reject')}, ${r.label}`} onPress={() => void run(`reject-${r.uid}`, 'reject', { uid: r.uid })} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {/* Inviter : code + lien, partagés par l'organisateur lui-même ; jamais la liste des membres. */}
      {free.length ? (
        <>
          <SectionHeader title={t('tg.invite')} />
          <Card style={{ gap: 8 }}>
            <Field label={t('tg.invite.days')} value={days} onChangeText={setDays} keyboardType="number-pad" inputMode="numeric" maxLength={2} />
            <SwitchRow title={t('tg.invite.showAmount')} value={showAmount} onChange={setShowAmount} />
            {inviteMessage ? (
              <>
                <Text variant="small" tone="muted" selectable>
                  {inviteMessage}
                </Text>
                <ShareWhatsAppButton context="tontine" message={inviteMessage} />
              </>
            ) : (
              <Button
                icon="person-add-outline"
                label={t('tg.invite')}
                loading={busy === 'invite'}
                onPress={() =>
                  void run('invite', 'invite', { days: Number(days) || 7, showAmount }).then((r) => {
                    if (r?.code) {
                      setInvite(r.code);
                      analytics.track('tontine_group_invite_shared', {});
                    }
                  })
                }
              />
            )}
          </Card>
        </>
      ) : null}

      {/* Ordre des tours : tirage au sort unique, ou ordre fixé (inscrit à l'historique). */}
      <SectionHeader title={t('tg.order')} />
      <Card style={{ gap: 8 }}>
        {g.drawnAt ? (
          <Text variant="small" tone="muted">
            {t('tg.order.drawn', { date: date(new Date(g.drawnAt).toISOString().slice(0, 10)) })}
          </Text>
        ) : (
          <>
            <Text variant="small" tone="muted">
              {t('tg.order.drawInfo')}
            </Text>
            <Button variant="secondary" icon="shuffle-outline" label={t('tg.order.draw')} loading={busy === 'draw'} onPress={() => void run('draw', 'draw', {})} />
          </>
        )}
        {order.map((slotId, k) => (
          <View key={slotId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ flex: 1 }}>{`${k + 1}. ${label(slotId)}`}</Text>
            <IconButton icon="arrow-up" label={t('cat.moveUp', { name: label(slotId) })} disabled={k === 0} onPress={() => move(k, -1)} />
            <IconButton icon="arrow-down" label={t('cat.moveDown', { name: label(slotId) })} disabled={k === order.length - 1} onPress={() => move(k, 1)} />
          </View>
        ))}
        <Button variant="secondary" label={t('tg.order.save')} loading={busy === 'order'} disabled={!edited} onPress={() => void run('order', 'setOrder', { order }).then((r) => r && setEdited(null))} />
      </Card>

      {/* Trésorier : un seul, parmi les membres qui ont accepté. */}
      <SectionHeader title={t('tg.treasurer.choose')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('tg.treasurer.none')} selected={!g.treasurerUid} onPress={() => void run('treasurer', 'setTreasurer', { uid: null })} />
        {[...new Set(g.slots.filter((s) => s.uid && s.uid !== g.organizerUid).map((s) => s.uid as string))].map((u) => {
          const s = g.slots.find((x) => x.uid === u)!;
          return <Chip key={u} label={label(s.slotId)} selected={g.treasurerUid === u} onPress={() => void run('treasurer', 'setTreasurer', { uid: u })} />;
        })}
      </View>

      {/* Surnoms privés des places libres : sur ce téléphone seulement (décision 1). */}
      {free.length ? (
        <Card style={{ marginTop: 12 }}>
          {free.map((s) => (
            <Field
              key={s.slotId}
              label={`${t('tg.slot', { n: g.slots.findIndex((x) => x.slotId === s.slotId) + 1 })} — ${t('tg.nickname')}`}
              value={nicks[s.slotId] ?? ''}
              onChangeText={(v) => setNicks({ ...nicks, [s.slotId]: v })}
              onBlur={() => void writeNickname(uid, g.id, s.slotId, nicks[s.slotId] ?? '').then(setNicks)}
              maxLength={40}
            />
          ))}
        </Card>
      ) : null}

      {/* Paramètres : nom et cotisation (inscrits à l'historique). */}
      <SectionHeader title={t('tg.settings')} />
      <Card>
        <Field label={t('tg.field.name')} value={name} onChangeText={setName} maxLength={60} />
        <AmountField label={t('tg.field.amount')} value={amount} onChange={setAmount} currency={g.currency} />
        <Button variant="secondary" label={t('common.save')} loading={busy === 'settings'} disabled={!name.trim() || !amount} onPress={() => void run('settings', 'settings', { name, amountPerShare: amount })} />
      </Card>
    </>
  );
}
