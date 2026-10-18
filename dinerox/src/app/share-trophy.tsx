/**
 * « Partager mon trophée » (croissance, étape 2).
 * La personne VOIT la carte qui sera partagée, puis choisit elle-même où
 * l'envoyer (feuille de partage : WhatsApp, statut, discussion…). La carte
 * porte le badge, le nom du trophée, « Nouveau trophée sur {app} 🏆 », un lien
 * court et le code d'invitation — JAMAIS de nom, de prénom ni de montant.
 * Seul un trophée réellement obtenu peut être partagé.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { DesignV2, useTheme } from '@/theme';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Button, EmptyState, Icon, Screen, Text, useToast } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { brand } from '@/config/brand';
import { REWARDS } from '@/core/coach/rewards';
import { trophyCard } from '@/core/share';
import { useCoach } from '@/features/coach/CoachProvider';
import { fetchMyCode } from '@/services/referral';
import { analytics } from '@/services/analytics';

const TIER: Record<string, string> = { gold: '#F5B301', silver: '#9AA5B1', bronze: '#C27C46' };

export default function ShareTrophy() {
  return (
    <DesignV2>
      <ShareTrophyScreen />
    </DesignV2>
  );
}

function ShareTrophyScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const { mode } = useApp();
  const { rewards } = useCoach();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const def = REWARDS.find((r) => r.id === id);
  const earned = !!def && rewards.some((r) => r.rewardId === def.id);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);

  // Code d'invitation (créé par le serveur) : sans connexion, la carte porte le domaine seul.
  useEffect(() => {
    if (mode !== 'firebase') return;
    let alive = true;
    fetchMyCode()
      .then((c) => alive && setCode(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode]);

  if (!def || !earned) {
    return (
      <Screen back title={t('share.trophy.cta')}>
        <EmptyState icon="trophy-outline" title={t('reward.notYet')} />
      </Screen>
    );
  }
  const card = trophyCard({ rewardNameKey: def.nameKey, code, host: brand.linkHost });
  const tier = TIER[def.tier] ?? colors.primary;

  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' });
      analytics.track('share_clicked', { context: 'trophy', channel: 'system' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('share.trophy.cta') });
    } catch {
      toast.show(t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('share.trophy.cta')} footer={<Button full icon="share-social-outline" label={t('share.trophy.cta')} loading={busy} onPress={() => void share()} />}>
      {/* La carte partagée, telle qu'elle sera envoyée (couleurs fixes : identique en mode clair ou sombre). */}
      <View
        ref={cardRef}
        collapsable={false}
        accessible
        accessibilityLabel={`${t(card.titleKey)} ${t(card.rewardNameKey as TKey)}. ${card.link}${card.code ? `. ${t('ref.code.title')} : ${card.code}` : ''}`}
        style={{ alignSelf: 'center', width: '100%', maxWidth: 320, borderRadius: 24, padding: 24, gap: 12, alignItems: 'center', backgroundColor: brand.colors.night }}
      >
        <Logo size={48} />
        <Text variant="titleM" align="center" style={{ color: '#F8FAFC' }}>
          {t(card.titleKey)}
        </Text>
        <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: tier, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={def.icon} size={52} color={tier} />
        </View>
        <Text variant="h3" align="center" style={{ color: '#F8FAFC' }}>
          {t(card.rewardNameKey as TKey)}
        </Text>
        <Text align="center" style={{ color: brand.colors.green, fontWeight: '700' }}>
          {card.link}
        </Text>
        {card.code ? (
          <Text align="center" style={{ color: '#CBD5E1' }}>
            {`${t('ref.code.title')} : ${card.code}`}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
