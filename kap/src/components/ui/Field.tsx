import React, { useEffect, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { currencyInfo, formatMoney, parseAmountInput, toMajor } from '@/core/money';

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
}

export function Field({ label, hint, error, suffix, style, ...rest }: FieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          minHeight: MIN_TOUCH,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textSubtle}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 }, style]}
          {...rest}
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
  useEffect(() => {
    // Synchronise si la valeur change de l'extérieur (proposition IA, édition).
    const parsed = parseAmountInput(text, currency);
    if (parsed !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency]);
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
      style={big ? { fontSize: 30, fontWeight: '800', color: colors.text } : undefined}
      onChangeText={(s) => {
        setText(s);
        onChange(parseAmountInput(s, currency));
      }}
    />
  );
}
