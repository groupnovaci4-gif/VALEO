import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { brand } from '@/config/brand';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Logo } from './Logo';
import { Sheet } from '@/components/ui/Sheet';
import { Row } from '@/components/ui/Row';
import { finalPalette } from '@/theme/finalPalette';
import { useToReadCount } from '@/features/notifications/useToRead';

/**
 * « Démo ▾ » (refonte finale A2, `.space`) : nom de l'espace actif en TEXTE SIMPLE (15/20, 600),
 * sans cadre ; avec plusieurs espaces, un toucher ouvre le choix (mêmes libellés et même action
 * que l'ancien sélecteur `SpaceSwitcher`). Le nom passe à la ligne s'il est long (A8).
 */
function SpaceMenu() {
  const { spaces, activeSpace, setActiveSpace } = useApp();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  if (!activeSpace) return <View style={{ flex: 1 }} />;
  const label = (id: string, kind: string, name: string) => (kind === 'personal' && !id.startsWith('demo_') ? t('fam.private') : name);
  const iconOf = (id: string, kind: string) => (id.startsWith('demo_') ? 'flask-outline' : kind === 'personal' ? 'person-outline' : 'people-outline');
  const current = label(activeSpace.id, activeSpace.kind, activeSpace.name);
  const several = spaces.length > 1;
  const text = (
    <Text variant="label" weight="600" style={{ fontSize: 15, lineHeight: 20, flexShrink: 1 }}>
      {current}
    </Text>
  );
  if (!several) return <View style={{ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center' }}>{text}</View>;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('fam.switch')} : ${current}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, paddingRight: 8, opacity: pressed ? 0.6 : 1 })}
      >
        {text}
        <Icon name="chevron-down" size={16} color={colors.text} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('fam.switch')}>
        {spaces.map((s) => (
          <Row
            key={s.id}
            title={label(s.id, s.kind, s.name)}
            left={<Icon name={iconOf(s.id, s.kind)} size={22} color={colors.primary} />}
            right={s.id === activeSpace.id ? <Icon name="checkmark-circle" size={22} color={colors.success} /> : undefined}
            onPress={() => {
              setActiveSpace(s.id);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** Initiales pour l'avatar (« Awa Koffi » → « AK »). */
export function initials(first?: string, last?: string): string {
  return `${(first ?? '').trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase();
}

/**
 * En-tête de marque des écrans principaux : logo D, « DINEROX » et le nom de
 * l'écran, cloche des notifications et avatar (accès au profil / réglages).
 */
export function AppHeader({ section }: { section: string }) {
  const { colors, v2, dark } = useTheme();
  const { t } = useI18n();
  const { profile, activeSpace } = useApp();
  const toRead = useToReadCount();
  const ini = initials(profile?.firstName, profile?.lastName);
  if (v2) {
    // Refonte finale A2 (ecrans/*.html, `.topbar`) : le MÊME en-tête sur les quatre onglets —
    // « Démo ▾ » (choix de l'espace) en texte simple, la cloche (le mot « Notifications » reste
    // le libellé lu par le lecteur d'écran) avec le nombre de messages à lire, un petit avatar
    // rond (réglages, zone de toucher 48 dp). Plus de bandeau « DineroX » ni de bouton encadré.
    const letter = ini || (activeSpace?.name ?? '').trim().charAt(0).toUpperCase();
    const avatar = (
      <Pressable accessibilityRole="button" accessibilityLabel={t('set.title')} onPress={() => router.push('/settings')} hitSlop={8} style={({ pressed }) => ({ width: 44, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          {letter ? (
            <Text variant="caption" weight="600" maxFontSizeMultiplier={1.2} style={{ fontSize: 14, lineHeight: 18 }}>
              {letter}
            </Text>
          ) : (
            <Icon name="person" size={16} color={colors.textMuted} />
          )}
        </View>
      </Pressable>
    );
    // Refonte finale A2 / E : pastille du nombre de messages « À lire » sur la cloche.
    const notifications = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toRead ? `${t('notif.title')}, ${t('toRead.title', { count: toRead })}` : t('notif.title')}
        onPress={() => router.push('/notifications')}
        style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        <Icon name="notifications-outline" size={24} color={colors.text} />
        {/* Pastille rouge du nombre de messages « À lire » (maquette `.dot`). */}
        {toRead ? (
          <View style={{ position: 'absolute', top: 9, right: 10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: finalPalette(dark).alertFg, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" weight="700" maxFontSizeMultiplier={1} style={{ fontSize: 10, lineHeight: 16, color: '#FFFFFF' }}>
              {toRead > 9 ? '9+' : String(toRead)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 56, paddingHorizontal: 16 }}>
        <SpaceMenu />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {notifications}
          {avatar}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, minHeight: 56 }}>
      <Logo size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h3" weight="800" style={{ color: colors.primary, letterSpacing: 0.2 }} numberOfLines={1}>
          {brand.name.toUpperCase()}
        </Text>
        <Text variant="overline" tone="muted" numberOfLines={1} style={{ fontWeight: '600' }}>
          {section.toUpperCase()}
        </Text>
      </View>
      <IconButton icon="notifications-outline" label={t('notif.title')} onPress={() => router.push('/notifications')} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('set.title')}
        onPress={() => router.push('/settings')}
        hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
      >
        {ini ? (
          <Text variant="small" weight="700" style={{ color: colors.onPrimary }}>
            {ini}
          </Text>
        ) : (
          <Icon name="person" size={20} color={colors.onPrimary} />
        )}
      </Pressable>
    </View>
  );
}
