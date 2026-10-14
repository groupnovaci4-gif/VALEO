/**
 * Bouton UNIQUE « Partager sur WhatsApp » (croissance, étape 2).
 * Ouvre WhatsApp (ou WhatsApp Business) avec un message PRÉREMPLI que la
 * personne peut modifier avant d'envoyer ; si WhatsApp est absent, la feuille
 * de partage du téléphone s'ouvre. L'application n'envoie jamais rien d'elle-même.
 * Événement `share_clicked` : contexte et canal seulement, jamais le contenu.
 */
import React, { useState } from 'react';
import { Linking, Platform, Share } from 'react-native';
import { useI18n } from '@/i18n';
import { Button, useToast } from '@/components/ui';
import { pickShareRoute, whatsappAppUrl, whatsappWebUrl, type ShareContext } from '@/core/share';
import { analytics } from '@/services/analytics';

/** WhatsApp présent ? (Android 11+ : visibilité déclarée par plugins/withWhatsAppQueries.js.) */
async function whatsappInstalled(): Promise<boolean> {
  try {
    return await Linking.canOpenURL(whatsappAppUrl(''));
  } catch {
    // Détection impossible : on passe par la feuille de partage, qui propose WhatsApp s'il est là.
    return false;
  }
}

/** Partage un texte : WhatsApp si possible, sinon la feuille de partage. Renvoie le canal utilisé. */
export async function shareTextViaWhatsApp(message: string, context: ShareContext): Promise<'whatsapp' | 'system'> {
  const route = pickShareRoute({ platform: Platform.OS, whatsappInstalled: Platform.OS === 'web' ? false : await whatsappInstalled() });
  if (route !== 'system') {
    try {
      await Linking.openURL(route === 'whatsapp_app' ? whatsappAppUrl(message) : whatsappWebUrl(message));
      analytics.track('share_clicked', { context, channel: 'whatsapp' });
      return 'whatsapp';
    } catch {
      // WhatsApp refuse de s'ouvrir : repli sur la feuille de partage (jamais un échec muet).
    }
  }
  analytics.track('share_clicked', { context, channel: 'system' });
  await Share.share({ message });
  return 'system';
}

export function ShareWhatsAppButton({ message, context, disabled }: { message: string | null; context: ShareContext; disabled?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      full
      icon="logo-whatsapp"
      label={t('share.whatsapp')}
      loading={busy}
      disabled={disabled || !message}
      onPress={() => {
        if (!message) return;
        setBusy(true);
        shareTextViaWhatsApp(message, context)
          .catch(() => toast.show(t('error.generic'), 'error'))
          .finally(() => setBusy(false));
      }}
    />
  );
}
