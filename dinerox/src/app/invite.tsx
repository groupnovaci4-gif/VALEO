/**
 * « Inviter des amis » (croissance, étape 1) — design system v2.
 *  1. la règle en une phrase ;
 *  2. mon code (6 caractères) et mon lien, « Partager » (feuille du téléphone)
 *     et « Copier » ;
 *  3. avancement « n/5 filleuls validés avant votre prochain mois offert »,
 *     période « Plus offert » en cours ;
 *  4. mes parrainages : statut de chaque filleul, SANS aucun montant.
 * Tout vient du serveur (code, compteurs, statuts) : l'écran ne calcule rien.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, EmptyState, Icon, Loading, ProgressBar, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { inviteLink, REFERRAL } from '@/core/referral';
import { analytics } from '@/services/analytics';
import { fetchMyCode, listenReferrals, listenReferralState, type ReferralChild, type ReferralState } from '@/services/referral';
import { WeekCard } from '@/features/referral/WeekCard';

export default function Invite() {
  return (
    <DesignV2>
      <InviteScreen />
    </DesignV2>
  );
}

function InviteScreen() {
  const { t, date } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const { user, profile, mode, online } = useApp();
  const uid = mode === 'firebase' ? user?.uid : undefined;
  const [state, setState] = useState<ReferralState | null>(null);
  const [children, setChildren] = useState<ReferralChild[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const offState = listenReferralState(uid, setState);
    const offChildren = listenReferrals(uid, setChildren);
    return () => {
      offState();
      offChildren();
    };
  }, [uid]);

  const fetchCode = useCallback(
    () =>
      fetchMyCode()
        .then(setCode)
        .catch(() => setError(true)),
    [],
  );
  const load = () => {
    setError(false);
    void fetchCode();
  };
  useEffect(() => {
    if (uid) void fetchCode();
  }, [uid, fetchCode]);
  const [now] = useState(() => Date.now());

  const myCode = code ?? state?.code ?? null;
  const link = myCode ? inviteLink(brand.linkHost, myCode) : null;

  const share = async () => {
    if (!myCode) return;
    analytics.track('referral_shared', { kind: 'share' });
    await Share.share({ message: t('ref.shareMessage', { link: inviteLink(brand.linkHost, myCode, { src: 'share' }) }) }).catch(() => undefined);
  };
  const copy = async () => {
    if (!myCode) return;
    analytics.track('referral_shared', { kind: 'copy' });
    await Clipboard.setStringAsync(inviteLink(brand.linkHost, myCode, { src: 'copy' }));
    toast.show(t('ref.copied'));
  };

  const pending = Math.max(0, (state?.validated ?? 0) - (state?.converted ?? 0));
  const progress = Math.min(pending, REFERRAL.FILLEULS_PER_REWARD);
  const waiting = pending >= REFERRAL.FILLEULS_PER_REWARD;
  const plusUntil = profile?.grants?.plusUntil && profile.grants.plusUntil > now ? profile.grants.plusUntil : null;
  const banked = profile?.grants?.bankedMonths ?? 0;

  return (
    <Screen back title={t('ref.title')}>
      <Text style={{ marginBottom: 16 }}>{t('ref.rule', { n: REFERRAL.FILLEULS_PER_REWARD })}</Text>

      <WeekCard />

      {!uid ? null : !myCode ? (
        error || !online ? (
          <Banner tone="warning" icon="cloud-offline-outline" text={t('ref.err.load')} action={t('common.retry')} onAction={load} />
        ) : (
          <Loading />
        )
      ) : (
        <Card>
          <Text variant="small" tone="muted">
            {t('ref.myCode')}
          </Text>
          <Text variant="titleL" selectable accessibilityLabel={`${t('ref.myCode')} : ${myCode.split('').join(' ')}`} style={{ letterSpacing: 4, color: colors.primary, marginBottom: 8 }}>
            {myCode}
          </Text>
          <Text variant="small" tone="muted">
            {t('ref.myLink')}
          </Text>
          <Text selectable style={{ marginBottom: 12 }}>
            {link}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>
              <Button full icon="share-social-outline" label={t('ref.share')} onPress={() => void share()} />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>
              <Button full variant="secondary" icon="copy-outline" label={t('ref.copy')} onPress={() => void copy()} />
            </View>
          </View>
        </Card>
      )}

      {uid ? (
        <Card style={{ marginTop: 12 }}>
          <Text variant="bodyStrong">{t('ref.progress', { count: progress, of: REFERRAL.FILLEULS_PER_REWARD })}</Text>
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={Math.round((progress / REFERRAL.FILLEULS_PER_REWARD) * 100)} tone="success" label={t('ref.progress', { count: progress, of: REFERRAL.FILLEULS_PER_REWARD })} />
          </View>
          {waiting ? (
            <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
              {t('ref.waiting')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
            <Stat label={t('ref.stat.signups')} value={state?.signups ?? 0} />
            <Stat label={t('ref.stat.validated')} value={state?.validated ?? 0} />
            <Stat label={t('ref.stat.months')} value={state?.monthsEarned ?? 0} />
          </View>
          {plusUntil ? (
            <Text variant="small" weight="600" tone="success" style={{ marginTop: 8 }}>
              {t('ref.plusUntil', { date: date(new Date(plusUntil).toISOString().slice(0, 10), { year: true }) })}
            </Text>
          ) : null}
          {banked > 0 ? (
            <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
              {t('ref.banked', { n: banked })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {uid ? (
        <>
          <SectionHeader title={t('ref.list.title')} />
          {children.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {children.map((c) => (
                <ChildRow key={c.id} child={c} />
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState icon="people-outline" title={t('ref.list.empty')} />
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`} style={{ minWidth: 72 }}>
      <Text variant="titleM">{String(value)}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** Une ligne par filleul : prénom et statut écrit + icône (jamais la couleur seule), aucun montant. */
function ChildRow({ child }: { child: ReferralChild }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const look = {
    signed_up: { icon: 'time-outline', color: colors.textMuted, text: child.progress?.day ? t('ref.status.inProgress', { day: child.progress.day, of: REFERRAL.WEEK_DAYS }) : t('ref.status.notStarted') },
    validated: { icon: 'checkmark-circle', color: colors.success, text: t('ref.status.validated') },
    rewarded: { icon: 'gift', color: colors.success, text: t('ref.status.rewarded') },
    expired: { icon: 'hourglass-outline', color: colors.textSubtle, text: t('ref.status.expired') },
    rejected: { icon: 'close-circle-outline', color: colors.textSubtle, text: t('ref.status.rejected') },
  }[child.status] ?? { icon: 'time-outline', color: colors.textMuted, text: t('ref.status.notStarted') };
  const name = child.firstName || t('ref.anonymous');
  return (
    <View accessible accessibilityLabel={`${name}, ${look.text}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 }}>
      <Icon name={look.icon} size={22} color={look.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="small" tone="muted">
          {look.text}
        </Text>
      </View>
    </View>
  );
}
