/**
 * Saisie d'un code d'invitation après l'inscription (réglages), jusqu'à 7
 * jours après la création du compte, une seule fois. Le serveur vérifie tout
 * (code connu, pas le sien, appareil, délai) ; l'écran ne fait qu'afficher sa réponse.
 */
import React, { useState } from 'react';
import { DesignV2 } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Field, Loading, Screen, Text, useToast } from '@/components/ui';
import { goBack } from '@/hooks/goBack';
import { canEnterCode, isValidCode, normalizeCode, REFERRAL, refusalKey } from '@/core/referral';
import { analytics } from '@/services/analytics';
import { applyReferralCode, refusalOf } from '@/services/referral';

export default function InviteCode() {
  return (
    <DesignV2>
      <InviteCodeScreen />
    </DesignV2>
  );
}

function InviteCodeScreen() {
  const { user, profile, mode } = useApp();
  // Session et profil d'abord : au démarrage à froid, la date d'inscription n'est pas encore connue.
  if (mode === 'firebase' && (!user || !profile)) return <Loading />;
  return <InviteCodeForm key={user?.uid ?? 'local'} />;
}

function InviteCodeForm() {
  const { t, date } = useI18n();
  const toast = useToast();
  const { user, profile, mode, online } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Décision figée au premier rendu du formulaire : le champ ne disparaît jamais pendant la saisie.
  const [since] = useState(() => user?.signupAt ?? null);
  const [now] = useState(() => Date.now());
  const by = profile?.referredBy;
  const open = mode === 'firebase' && canEnterCode(since, !!by, now);

  const submit = async () => {
    const c = normalizeCode(code);
    if (!isValidCode(c)) {
      setError(t('ref.err.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await applyReferralCode(c, 'manual');
      analytics.track('referral_applied', { source: 'manual' });
      toast.show(r.parrainFirstName ? t('ref.welcome', { name: r.parrainFirstName }) : t('common.saved'));
      goBack();
    } catch (e) {
      setError(t(refusalKey(refusalOf(e))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('ref.code.title')} footer={open ? <Button full label={t('ref.code.apply')} loading={busy} disabled={!online} onPress={() => void submit()} /> : undefined}>
      {by ? (
        <Banner tone="success" icon="checkmark-circle" text={t('ref.code.invitedBy', { name: by.firstName || t('ref.anonymous') })} />
      ) : !open ? (
        <Banner tone="info" icon="information-circle-outline" text={t('ref.code.closed')} />
      ) : (
        <>
          <Field
            label={t('ref.code.question')}
            hint={t('ref.code.hint')}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(null);
            }}
            error={error}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={12}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {since ? (
            <Text variant="small" tone="muted">
              {t('ref.code.until', { date: date(new Date(since + REFERRAL.APPLY_WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10), { year: true }) })}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
