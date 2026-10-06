/**
 * Famille : créer une famille, inviter (par e-mail), gérer les rôles,
 * accepter une invitation, basculer entre finances personnelles et
 * familiales. Toute modification des membres passe par le serveur.
 */
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Badge, Banner, Button, Card, ChipGroup, EmptyState, Field, Row, Screen, SectionHeader, Sheet, Text, useToast } from '@/components/ui';
import { UpgradeCard } from '@/features/rows';
import { canManageMembers } from '@/core/permissions';
import { hasFeature } from '@/core/subscription';
import type { FamilyInvite, Role } from '@/core/types';
import { createFamily, inviteMember, listenMyInvites, listenSpaceInvites, removeMember, respondInvite, revokeInvite, setMemberRole } from '@/services/spaces';
import { analytics } from '@/services/analytics';

const ROLES: Role[] = ['admin', 'partner', 'child'];

export default function Family() {
  const { t } = useI18n();
  const toast = useToast();
  const { mode, user, profile, spaces, activeSpace, setActiveSpace, plan, engine } = useApp();
  const families = spaces.filter((s) => s.kind === 'family');
  const current = activeSpace?.kind === 'family' ? activeSpace : families[0];
  const myRole = current && user ? current.members[user.uid] : null;
  const [myInvites, setMyInvites] = useState<FamilyInvite[]>([]);
  const [sent, setSent] = useState<FamilyInvite[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('partner');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'firebase' || !user?.email) return;
    return listenMyInvites(user.email, setMyInvites);
  }, [mode, user?.email]);
  useEffect(() => {
    if (mode !== 'firebase' || !current || myRole !== 'admin') return;
    return listenSpaceInvites(current.id, setSent);
  }, [mode, current, myRole]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.show(ok);
    } catch (e) {
      const code = String((e as { code?: string })?.code ?? '');
      toast.show(code.includes('resource-exhausted') ? t('error.limit', { limit: '' }) : code.includes('permission') ? t('error.permission') : t('error.network'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (mode !== 'firebase') {
    return (
      <Screen back title={t('fam.title')}>
        <Banner tone="info" icon="cloud-offline-outline" text={t('auth.err.notConfigured')} />
        <Text tone="muted">{t('fam.intro')}</Text>
      </Screen>
    );
  }
  if (!hasFeature(plan, 'family') && families.length === 0) {
    return (
      <Screen back title={t('fam.title')}>
        <Text tone="muted" style={{ marginBottom: 12 }}>
          {t('fam.intro')}
        </Text>
        {myInvites.map((i) => (
          <InviteCard key={i.id} invite={i} busy={busy} onRespond={(accept) => run(() => respondInvite({ inviteId: i.id, accept }))} />
        ))}
        <UpgradeCard feature="family" text={t('fam.intro')} />
      </Screen>
    );
  }

  return (
    <Screen back title={t('fam.title')}>
      <Text tone="muted" style={{ marginBottom: 12 }}>
        {t('fam.intro')}
      </Text>
      {myInvites.length ? <SectionHeader title={t('fam.myInvites')} /> : null}
      {myInvites.map((i) => (
        <InviteCard
          key={i.id}
          invite={i}
          busy={busy}
          onRespond={(accept) =>
            run(async () => {
              const r = await respondInvite({ inviteId: i.id, accept });
              if (accept && r?.spaceId) setActiveSpace(r.spaceId);
            })
          }
        />
      ))}

      <SectionHeader title={t('fam.switch')} />
      <Card>
        {spaces
          .filter((s) => !s.id.startsWith('demo_'))
          .map((s) => (
            <Row
              key={s.id}
              title={s.kind === 'personal' ? t('fam.private') : s.name}
              subtitle={s.kind === 'family' ? t('fam.shared') : undefined}
              right={activeSpace?.id === s.id ? <Badge tone="success" label="✓" /> : undefined}
              onPress={() => setActiveSpace(s.id)}
            />
          ))}
      </Card>

      {current ? (
        <>
          <SectionHeader title={`${t('fam.members')} · ${current.name}`} action={canManageMembers(myRole) ? t('fam.invite') : undefined} onAction={() => setInviteOpen(true)} />
          <Card>
            {current.memberIds.map((uid) => {
              const r = current.members[uid];
              const isMe = uid === user?.uid;
              return (
                <Row
                  key={uid}
                  title={`${current.memberNames[uid] || '—'}${isMe ? ` (${t('fam.you')})` : ''}`}
                  subtitle={t(`fam.role.${r}.desc` as TKey)}
                  right={<Badge tone={r === 'admin' ? 'ai' : r === 'partner' ? 'info' : 'neutral'} label={t(`fam.role.${r}` as TKey)} />}
                  onPress={
                    canManageMembers(myRole) && !isMe
                      ? () =>
                          Alert.alert(current.memberNames[uid] || '—', undefined, [
                            ...ROLES.filter((x) => x !== r).map((x) => ({ text: t(`fam.role.${x}` as TKey), onPress: () => void run(() => setMemberRole({ spaceId: current.id, uid, role: x }), t('common.saved')) })),
                            { text: t('fam.removeMember'), style: 'destructive' as const, onPress: () => void run(() => removeMember({ spaceId: current.id, uid }), t('common.saved')) },
                            { text: t('common.cancel'), style: 'cancel' as const },
                          ])
                      : undefined
                  }
                />
              );
            })}
          </Card>
          {sent.length ? (
            <>
              <SectionHeader title={t('fam.invites')} />
              <Card>
                {sent.map((i) => (
                  <Row key={i.id} title={i.email} subtitle={t(`fam.role.${i.role}` as TKey)} right={<Button small variant="ghost" label={t('fam.revoke')} onPress={() => void run(() => revokeInvite({ inviteId: i.id }))} />} />
                ))}
              </Card>
            </>
          ) : null}
          <Button
            variant="ghost"
            label={t('fam.leave')}
            style={{ marginTop: 16 }}
            onPress={() =>
              Alert.alert(t('fam.leave'), t('fam.leaveConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('fam.leave'), style: 'destructive', onPress: () =>
                    void run(async () => {
                      await removeMember({ spaceId: current.id, uid: user!.uid });
                      // Plus membre : on efface le cache local de cet espace (données de la famille).
                      const personal = spaces.find((s) => s.kind === 'personal');
                      if (personal) setActiveSpace(personal.id);
                      await engine?.forget(current.id);
                    }),
                },
              ])
            }
          />
        </>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <EmptyState emoji="👨‍👩‍👧" title={t('fam.empty')} action={t('fam.create')} onAction={() => setCreateOpen(true)} />
        </Card>
      )}
      {current ? <Button variant="secondary" icon="add" label={t('fam.create')} style={{ marginTop: 8 }} onPress={() => setCreateOpen(true)} /> : null}

      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title={t('fam.create')}>
        <Field label={t('fam.name')} placeholder={t('fam.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} />
        <Button
          full
          loading={busy}
          disabled={!name.trim()}
          label={t('fam.create')}
          onPress={() =>
            void run(async () => {
              const s = await createFamily(user!.uid, profile?.firstName || user!.displayName, name, profile?.currency ?? 'XOF');
              analytics.track('family_created');
              setActiveSpace(s.id);
              setCreateOpen(false);
              setName('');
            }, t('common.saved'))
          }
        />
      </Sheet>
      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title={t('fam.invite')}>
        <Field label={t('fam.inviteEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
          {t('fam.inviteRole')}
        </Text>
        <ChipGroup value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: t(`fam.role.${r}` as TKey) }))} />
        <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
          {t(`fam.role.${role}.desc` as TKey)}
        </Text>
        <Button
          full
          loading={busy}
          disabled={!/^\S+@\S+\.\S+$/.test(email)}
          label={t('fam.inviteSend')}
          onPress={() =>
            void run(async () => {
              await inviteMember({ spaceId: current!.id, email: email.trim().toLowerCase(), role });
              setInviteOpen(false);
              setEmail('');
            }, t('fam.inviteSent'))
          }
        />
      </Sheet>
    </Screen>
  );
}

function InviteCard({ invite, onRespond, busy }: { invite: FamilyInvite; onRespond: (accept: boolean) => void; busy: boolean }) {
  const { t } = useI18n();
  return (
    <Card style={{ marginBottom: 10 }}>
      <Text variant="bodyStrong">👨‍👩‍👧 {invite.spaceName}</Text>
      <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
        {invite.invitedByName} · {t(`fam.role.${invite.role}` as TKey)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small label={t('fam.accept')} loading={busy} onPress={() => onRespond(true)} />
        <Button small variant="ghost" label={t('fam.decline')} onPress={() => onRespond(false)} />
      </View>
    </Card>
  );
}
