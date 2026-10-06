import React from 'react';
import { RefreshControl, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { goBack } from '@/hooks/goBack';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { IconButton } from './Button';
import { useI18n } from '@/i18n';
import { SyncBanner } from '@/components/SyncBanner';
import { AppHeader } from '@/components/AppHeader';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Bouton retour (écrans empilés). */
  back?: boolean;
  /** Action(s) à droite de l'en-tête. */
  right?: React.ReactNode;
  /** Élément avant le titre. */
  leading?: React.ReactNode;
  /** En-tête de marque (logo, DINEROX, nom de l'écran, cloche, avatar) au lieu du titre. */
  brandSection?: string;
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

/** Largeur maximale du contenu (tablettes, web). */
export const MAX_CONTENT_WIDTH = 680;

/** Conteneur d'écran standard : zone sûre, en-tête, défilement, clavier. */
export function Screen({ title, subtitle, back, right, leading, brandSection, children, scroll = true, edges = ['top'], contentStyle, onRefresh, refreshing, footer, syncBanner = true }: ScreenProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const header = brandSection ? (
    <AppHeader section={brandSection} />
  ) : title || back || right ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: back ? 4 : 16, paddingTop: 4, paddingBottom: 8, minHeight: 52 }}>
        {back ? <IconButton icon="chevron-back" label={t('common.back')} onPress={goBack} /> : null}
        {leading ? <View style={{ marginRight: 10 }}>{leading}</View> : null}
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
  // Clavier : Android affiche l'application « bord à bord » (SDK 57) — la fenêtre ne se
  // redimensionne plus à l'ouverture du clavier. Sans gestion explicite, le clavier
  // recouvre les champs du bas (ils « disparaissent » et la saisie devient invisible).
  // KeyboardAwareScrollView fait défiler jusqu'au champ actif ; KeyboardStickyView garde
  // le pied d'écran (bouton principal) au-dessus du clavier. Même comportement iOS/Android.
  const body = scroll ? (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      bottomOffset={footer ? 110 : 32}
      contentContainerStyle={[{ padding: 16, paddingBottom: 120 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
    >
      {/* Largeur de lecture bornée : sur tablette, le contenu reste centré et lisible. */}
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>
        {syncBanner ? <SyncBanner /> : null}
        {children}
      </View>
    </KeyboardAwareScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: MAX_CONTENT_WIDTH + 32, alignSelf: 'center' }, contentStyle]}>
      {syncBanner ? <SyncBanner /> : null}
      {children}
    </View>
  );
  const footerView = footer ? (
    <KeyboardStickyView>
      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>{footer}</View>
      </View>
    </KeyboardStickyView>
  ) : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <>
          {header}
          {body}
          {footerView}
        </>
      ) : (
        // Écrans sans défilement (listes, assistant) : la zone se réduit au-dessus du clavier.
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {header}
          {body}
          {footer ? (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
              <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>{footer}</View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
