/**
 * Carte discrète « Inviter des amis » de l'accueil : apparaît après la 5e
 * saisie réussie de l'utilisateur, masquable (choix gardé sur l'appareil, par
 * compte). L'accès permanent reste dans « Plus ».
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Text } from '@/components/ui';
import { REFERRAL } from '@/core/referral';
import { readJSON, storageKey, writeJSON } from '@/services/storage';

export function InviteCard({ entries }: { entries: number }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { user, mode } = useApp();
  const uid = user?.uid;
  // `null` tant que la préférence n'est pas lue : rien ne s'affiche puis ne disparaît.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void readJSON<boolean>(storageKey(uid, 'inviteCardHidden')).then((v) => alive && setHidden(v === true));
    return () => {
      alive = false;
    };
  }, [uid]);
  if (mode !== 'firebase' || !uid || hidden !== false || entries < REFERRAL.HOME_CARD_AFTER_ENTRIES) return null;
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="gift-outline" size={22} color={colors.onPrimaryContainer} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{t('ref.title')}</Text>
          <Text variant="small" tone="muted">
            {t('ref.home.text', { n: REFERRAL.FILLEULS_PER_REWARD })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button
          variant="tertiary"
          small
          label={t('ref.home.hide')}
          onPress={() => {
            setHidden(true);
            void writeJSON(storageKey(uid, 'inviteCardHidden'), true);
          }}
        />
        <Button variant="secondary" small icon="person-add-outline" label={t('ref.home.cta')} onPress={() => router.push('/invite')} />
      </View>
    </Card>
  );
}
