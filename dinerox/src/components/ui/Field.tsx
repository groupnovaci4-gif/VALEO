import React, { useState } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
import { fontFor } from '@/theme/fonts';
import { Text } from './Text';
import { fieldBoxProps } from './fieldStyle';
import { currencyInfo, formatMoney, parseAmountInput, toMajor } from '@/core/money';

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
  /** Référence vers le champ natif (enchaînement « Suivant » au clavier). */
  inputRef?: React.Ref<TextInput>;
}

export function Field({ label, hint, error, suffix, style, inputRef, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      {/* Structure native fixe au focus : voir fieldStyle.ts (cause du clignotement Android). */}
      <View {...fieldBoxProps({ focused, error: !!error }, colors, radius.md, MIN_TOUCH)}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.3}
          placeholderTextColor={colors.textSubtle}
          {...rest}
          // Après {...rest} : le suivi du focus ne peut pas être écrasé par l'écran appelant.
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[{ flex: 1, minWidth: 0, color: colors.text, fontSize: 16, fontFamily: fontFor('body', 400), paddingVertical: 10 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null, style]}
        />
        {suffix ? <Text tone="muted">{suffix}</Text> : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 4 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Saisie d'un montant. Valeur en unités MINEURES (null si vide/invalide).
 * Affiche le montant formaté sous le champ pour éviter les erreurs de zéros.
 */
export function AmountField({
  label,
  value,
  onChange,
  currency,
  hint,
  error,
  big,
  autoFocus,
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  currency: string;
  hint?: string;
  error?: string | null;
  big?: boolean;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const info = currencyInfo(currency);
  const toText = (v: number | null) => (v === null ? '' : info.decimals ? String(toMajor(v, currency)).replace('.', ',') : String(v));
  const [text, setText] = useState(toText(value));
  const [prev, setPrev] = useState<{ value: number | null; currency: string }>({ value, currency });
  // Synchronise si la valeur change de l'extérieur (proposition IA, édition).
  if (prev.value !== value || prev.currency !== currency) {
    setPrev({ value, currency });
    if (parseAmountInput(text, currency) !== value) setText(toText(value));
  }
  return (
    <Field
      label={label}
      value={text}
      autoFocus={autoFocus}
      keyboardType={info.decimals ? 'decimal-pad' : 'number-pad'}
      inputMode={info.decimals ? 'decimal' : 'numeric'}
      placeholder="0"
      suffix={info.symbol}
      error={error}
      hint={value ? formatMoney(value, currency) : hint}
      style={big ? { fontSize: 30, fontFamily: fontFor('heading', 800), color: colors.text } : undefined}
      onChangeText={(s) => {
        setText(s);
        onChange(parseAmountInput(s, currency));
      }}
    />
  );
}
