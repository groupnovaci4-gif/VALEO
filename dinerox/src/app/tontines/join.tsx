/**
 * « Rejoindre une tontine » (étape 3). La personne saisit le code reçu, voit
 * un APERÇU (jamais la liste des membres ; la cotisation seulement si
 * l'organisateur l'a choisi), lit la mention, choisit le nom que les membres
 * verront, puis DEMANDE à rejoindre. Elle ne devient membre qu'après la
 * validation de l'organisateur. Rejoindre est toujours gratuit.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DesignV2 } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, Field, Loading, Screen, Text } from '@/components/ui';
import { canEnterCode, normalizeCode } from '@/core/referral';
import { formatMoney, type CurrencyCode } from '@/core/money';
import { analytics } from '@/services/analytics';
import { tgRefusal, tontineGroupCall } from '@/services/tontineGroups';

interface Preview {
  name: string;
  frequency: string;
  slots: number;
  full: boolean;
  expired: boolean;
  alreadyMember: boolean;
  currency?: string;
  amountPerShare?: number;
}

const ERR: Record<string, TKey> = {
  'tg/unknown-invite': 'tg.err.unknown',
  'tg/invite-expired': 'tg.err.expired',
  'tg/full': 'tg.err.full',
  'tg/already-member': 'tg.err.already',
};

export default function JoinTontine() {
  return (
    <DesignV2>
      <JoinScreen />
    </DesignV2>
  );
}

function JoinScreen() {
  const { user, profile, mode } = useApp();
  if (mode === 'firebase' && (!user || !profile)) return <Loading />;
  return <JoinForm key={user?.uid ?? 'local'} />;
}

function JoinForm() {
  const { t } = useI18n();
  const { user, profile, online } = useApp();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalizeCode(params.code));
  const [label, setLabel] = useState(profile?.firstName ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Décision figée à l'ouverture : un nouveau compte sans parrain sera parrainé par l'organisateur.
  const [now] = useState(() => Date.now());
  const mayBeReferred = canEnterCode(user?.signupAt, !!profile?.referredBy, now);

  const see = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await tontineGroupCall<Preview>('preview', { code: normalizeCode(code) });
      setPreview(p);
      if (p.alreadyMember) setError(t('tg.err.already'));
      else if (p.expired) setError(t('tg.err.expired'));
      else if (p.full) setError(t('tg.err.full'));
    } catch (e) {
      setPreview(null);
      setError(t(ERR[tgRefusal(e) ?? ''] ?? 'tg.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      await tontineGroupCall('requestJoin', { code: normalizeCode(code), label });
      analytics.track('tontine_group_joined', { step: 'request' });
      setSent(true);
    } catch (e) {
      setError(t(ERR[tgRefusal(e) ?? ''] ?? 'tg.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!preview && !preview.full && !preview.expired && !preview.alreadyMember;
  const footer = sent ? undefined : ready ? (
    <Button full label={t('tg.join.submit')} loading={busy} disabled={!online || !label.trim()} onPress={() => void ask()} />
  ) : (
    <Button full label={t('tg.join.see')} loading={busy} disabled={!online || normalizeCode(code).length !== 6} onPress={() => void see()} />
  );

  return (
    <Screen back title={t('tg.join.title')} footer={footer}>
      {sent ? (
        <Banner tone="success" icon="time-outline" text={t('tg.join.sent')} />
      ) : (
        <>
          <Field
            label={t('tg.join.code')}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setPreview(null);
              setError(null);
            }}
            error={error}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={12}
          />
          {preview ? (
            <Card style={{ marginBottom: 12, gap: 4 }}>
              <Text variant="bodyStrong">{t('tg.join.preview', { name: preview.name, frequency: t(`tontine.freq.${preview.frequency}` as TKey), slots: preview.slots })}</Text>
              {preview.amountPerShare && preview.currency ? (
                <Text variant="small" tone="muted">
                  {t('tg.join.amount', { amount: formatMoney(preview.amountPerShare, preview.currency as CurrencyCode) })}
                </Text>
              ) : null}
            </Card>
          ) : null}
          {ready ? (
            <>
              <Field label={t('tg.field.myLabel')} hint={t('tg.field.myLabel.hint')} value={label} onChangeText={setLabel} maxLength={40} />
              {/* Mention obligatoire AVANT de rejoindre (décision 8). */}
              <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
                {t('tontine.legal')}
              </Text>
              {mayBeReferred ? (
                <View style={{ gap: 4 }}>
                  <Text variant="small">{t('tg.join.referral')}</Text>
                  <Text variant="small" tone="muted">
                    {t('ref.transparency')}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
