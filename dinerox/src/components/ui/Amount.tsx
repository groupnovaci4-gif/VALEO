import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { useI18n } from '@/i18n';
import { Text, type TextTone } from './Text';
import { splitAmount } from './amountText';

export type AmountSize = 'hero' | 'L' | 'M' | 'S';

const VARIANT = { hero: 'amountHero', L: 'amountL', M: 'amountM', S: 'amountS' } as const;
/** Devise d'un grand montant : plus petite que le nombre (§2.3). */
const CURRENCY_VARIANT = { hero: 'titleS', L: 'titleS', M: 'amountM', S: 'amountS' } as const;
const HIDDEN = '••••••';

/**
 * Montant du design system v2. Le texte vient TOUJOURS de `useMoney()` / `formatMoney`
 * (règle 5) : ce composant ne calcule ni n'arrondit rien.
 *  - `hidden` : « •••••• », lu « Montant masqué » par le lecteur d'écran ;
 *  - `hero` / `L` : jamais tronqué, réduit au plus à 85 % en dernier recours.
 */
export function Amount({
  text,
  size = 'S',
  tone = 'default',
  hidden,
  style,
  align,
}: {
  text: string;
  size?: AmountSize;
  tone?: TextTone;
  hidden?: boolean;
  style?: StyleProp<TextStyle>;
  align?: TextStyle['textAlign'];
}) {
  const { t } = useI18n();
  const big = size === 'hero' || size === 'L';
  if (hidden) {
    return (
      <Text variant={VARIANT[size]} tone={tone} align={align} style={style} accessibilityLabel={t('common.amountHidden')}>
        {HIDDEN}
      </Text>
    );
  }
  const { number, currency } = splitAmount(text);
  return (
    <Text
      variant={VARIANT[size]}
      tone={tone}
      align={align}
      style={style}
      accessibilityLabel={text}
      {...(big ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 } : null)}
    >
      {number}
      {currency && big ? (
        <Text variant={CURRENCY_VARIANT[size]} tone={tone}>
          {` ${currency}`}
        </Text>
      ) : currency ? (
        ` ${currency}`
      ) : null}
    </Text>
  );
}
