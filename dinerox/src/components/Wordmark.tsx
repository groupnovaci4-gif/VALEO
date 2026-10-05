import React from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme';
import { fontFor } from '@/theme/fonts';
import { useI18n } from '@/i18n';
import { brand } from '@/config/brand';

/**
 * Logotype DineroX, fidèle au logo complet (assets/brand/logo-complet-source.png) :
 * « DINERO » en blanc, « X » en or surmonté de la flèche montante, et le slogan
 * « Mieux gérer. · Mieux prévoir. · Mieux vivre. » (le dernier en or).
 * Dessiné en vectoriel : le fichier fourni (200 px) serait flou à l'écran.
 */
export function Wordmark({ size = 34, slogan = false, onDark, center }: { size?: number; slogan?: boolean; onDark?: boolean; center?: boolean }) {
  const { colors, dark } = useTheme();
  const { t } = useI18n();
  const night = onDark ?? dark;
  // Sur fond clair, le blanc devient nuit et l'or est assombri pour rester lisible.
  const ink = night ? '#F8FAFC' : brand.colors.night;
  const gold = night ? brand.colors.yellow : '#D97706';
  const letter = { fontFamily: fontFor('heading', 800), fontSize: size, lineHeight: size * 1.15, letterSpacing: size * 0.04 };
  const arrow = size * 0.42;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={brand.name} style={{ alignItems: center ? 'center' : 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <RNText style={[letter, { color: ink }]}>DINERO</RNText>
        <View style={{ marginLeft: size * 0.38 }}>
          <RNText style={[letter, { color: gold }]}>X</RNText>
          {/* Flèche montante qui prolonge la branche droite du X. */}
          <Svg width={arrow} height={arrow} viewBox="0 0 24 24" style={{ position: 'absolute', right: -arrow * 0.45, top: -arrow * 0.35 }}>
            <Path d="M5 19 L18 6" stroke={gold} strokeWidth={4} strokeLinecap="round" />
            <Path d="M10 5 H19 V14" stroke={gold} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      </View>
      {slogan ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', marginTop: size * 0.3, gap: 6 }}>
          <RNText style={{ fontFamily: fontFor('body', 600), fontSize: 13, color: ink }}>{t('brand.slogan1')}</RNText>
          <RNText style={{ color: colors.primary, fontSize: 13 }}>·</RNText>
          <RNText style={{ fontFamily: fontFor('body', 600), fontSize: 13, color: ink }}>{t('brand.slogan2')}</RNText>
          <RNText style={{ color: gold, fontSize: 13 }}>·</RNText>
          <RNText style={{ fontFamily: fontFor('body', 600), fontSize: 13, color: gold }}>{t('brand.slogan3')}</RNText>
        </View>
      ) : null}
    </View>
  );
}
