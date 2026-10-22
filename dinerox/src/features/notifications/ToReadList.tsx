/**
 * « À lire » (refonte finale B5, C2, E1 à E4 ; ecrans/accueil-*.html `.ban`, budget-*.html `.inbox`).
 *  - Accueil : « À lire · N » + « Disparaît une fois lu ou écouté » ; une carte par message :
 *    pastille colorée (36 dp, rayon 10), ÉTIQUETTE (« Alerte budget », « Conseil du jour »,
 *    « Votre coach », « Votre analyse »), texte, « Écouter », × (marquer comme lu).
 *  - Budget (`budgetOnly`) : « Notifications » + « Tout marquer comme lu », une ligne par message
 *    du budget (point, pastille 32 dp, texte, haut-parleur) ; un toucher ouvre l'enveloppe et lit
 *    le message.
 * Un message disparaît au × (ou au toucher dans le Budget) ET quand « Écouter » arrive à la fin.
 * « Écouter » reste À CÔTÉ de la zone touchable, jamais dedans (règle 17).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { shadowB, useTheme } from '@/theme';
import { finalPalette, type FinalPalette } from '@/theme/finalPalette';
import { Icon, SectionHeader, Text } from '@/components/ui';
import { ListenButton } from '@/features/coach/ListenButton';
import { AdviceAi } from '@/features/coach/AdviceOfDay';
import { SourceTag } from '@/features/Recommendation';
import { useToRead } from './useToRead';
import type { ToReadItem } from './toRead';

type Shown = ToReadItem & { reminder: boolean };

/** Pastille : fond, couleur (icône et étiquette), icône — selon le ton et la sorte du message. */
function look(x: ToReadItem, p: FinalPalette): { bg: string; fg: string; icon: string } {
  if (x.tone === 'danger') return { bg: p.alertBg, fg: p.alertFg, icon: 'alert-circle' };
  if (x.tone === 'warning') return { bg: p.goldBg, fg: p.goldFg, icon: 'warning' };
  if (x.kind === 'advice' || x.tone === 'advice') return { bg: p.violetBg, fg: p.violetFg, icon: 'bulb' };
  if (x.kind === 'analysis') return { bg: p.blueBg, fg: p.blueFg, icon: 'analytics' };
  return { bg: p.blueBg, fg: p.blueFg, icon: 'calendar' };
}

export function ToReadList({ budgetOnly }: { budgetOnly?: boolean }) {
  const { t } = useI18n();
  const { colors, dark } = useTheme();
  const p = finalPalette(dark);
  const { items: all, dismiss, dismissAll, advice } = useToRead();
  const items = budgetOnly ? all.filter((x) => x.kind === 'budget') : all;
  if (!items.length) return null;
  const open = (x: Shown) => (x.link ? () => router.push(x.link as never) : undefined);

  if (budgetOnly) {
    return (
      <View>
        <SectionHeader title={t('notif.title')} action={t('toRead.markAllRead')} onAction={() => dismissAll(items)} />
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden', ...(dark ? null : shadowB) }}>
          {items.map((x, i) => {
            const l = look(x, p);
            const go = open(x);
            return (
              <View key={x.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingRight: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={x.reminder ? `${t('toRead.reminder')}, ${x.text}` : x.text}
                  onPress={() => {
                    dismiss(x);
                    go?.();
                  }}
                  style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingLeft: 14, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 12 }} />
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: l.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={l.icon} size={17} color={l.fg} />
                  </View>
                  <Text variant="small" weight="500" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                    {x.text}
                  </Text>
                </Pressable>
                <View style={{ paddingTop: 4 }}>
                  <ListenButton text={x.text} onEnd={() => dismiss(x)} iconOnly />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title={t('toRead.title', { count: items.length })} action={t('toRead.hint')} />
      {items.map((x) => {
        const l = look(x, p);
        const go = open(x);
        const label = t(`toRead.label.${x.kind}` as TKey);
        return (
          <View key={x.id} testID={`toread-${x.origin ?? x.kind}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 12, paddingBottom: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 8, ...(dark ? null : shadowB) }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: l.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={l.icon} size={18} color={l.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Pressable accessibilityRole={go ? 'button' : 'text'} accessibilityLabel={`${label}${x.reminder ? `, ${t('toRead.reminder')}` : ''}, ${x.text}`} onPress={go} style={({ pressed }) => ({ borderRadius: 8, backgroundColor: pressed && go ? colors.surfaceAlt : 'transparent' })}>
                <Text variant="caption" weight="600" style={{ fontSize: 11, lineHeight: 14, letterSpacing: 0.4, textTransform: 'uppercase', color: l.fg, marginBottom: 2 }}>
                  {x.reminder ? `${label} · ${t('toRead.reminder')}` : label}
                </Text>
                <Text variant="small" weight="500" style={{ fontSize: 14, lineHeight: 20 }}>
                  {x.text}
                </Text>
              </Pressable>
              {x.kind === 'advice' && advice ? (
                <View style={{ marginTop: 6 }}>
                  <SourceTag source={advice.source} />
                  <AdviceAi adviceId={advice.id} text={x.text} />
                </View>
              ) : null}
              {/* À la taille du bouton : une View étirée avec une marge négative dépasserait la carte. */}
              <View style={{ alignSelf: 'flex-start', marginLeft: -8 }}>
                <ListenButton text={x.text} onEnd={() => dismiss(x)} />
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('toRead.dismiss')} onPress={() => dismiss(x)} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -4, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
              <Icon name="close" size={18} color={colors.textSubtle} />
            </Pressable>
          </View>
        );
      })}
      {items.some((x) => x.kind === 'coach') ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 2, marginBottom: 4 }}>
          {t('coach.disclaimer')}
        </Text>
      ) : null}
    </View>
  );
}
