import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { goBack } from '@/hooks/goBack';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { IconButton } from './Button';
import { useI18n } from '@/i18n';
import { SyncBanner } from '@/components/SyncBanner';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Bouton retour (écrans empilés). */
  back?: boolean;
  /** Action(s) à droite de l'en-tête. */
  right?: React.ReactNode;
  children: React.ReactNode;
  /** false : pas de ScrollView (listes virtualisées). */
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: React.ReactNode;
  /** Affiche la bannière hors-ligne / synchro. */
  syncBanner?: boolean;
}

/** Conteneur d'écran standard : zone sûre, en-tête, défilement, clavier. */
export function Screen({ title, subtitle, back, right, children, scroll = true, edges = ['top'], contentStyle, onRefresh, refreshing, footer, syncBanner = true }: ScreenProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const header =
    title || back || right ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: back ? 4 : 16, paddingTop: 4, paddingBottom: 8, minHeight: 52 }}>
        {back ? <IconButton icon="chevron-back" label={t('common.back')} onPress={goBack} /> : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <Text variant="h2" accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" tone="subtle">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ padding: 16, paddingBottom: 120 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
    >
      {syncBanner ? <SyncBanner /> : null}
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: 16 }, contentStyle]}>
      {syncBanner ? <SyncBanner /> : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header}
        {body}
        {footer ? <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
