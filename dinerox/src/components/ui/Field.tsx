import React, { useState } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, MIN_TOUCH } from '@/theme';
import { fontFor } from '@/theme/fonts';
import { Text } from './Text';
import { Icon } from './Icon';
import { fieldBoxProps } from './fieldStyle';
import { currencyInfo, formatMoney, parseAmountInput, toMajor } from '@/core/money';

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
  /** Référence vers le champ natif (enchaînement « Suivant » au clavier). */
  inputRef?: React.Ref<TextInput>;
  /** Aperçu de la valeur (montant formaté) : en v2, lisible au contraste plein (§8.6). */
  preview?: string;
}

export function Field({ label, hint, error, suffix, preview, style, inputRef, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors, radius, v2 } = useTheme();
  const [focused, setFocused] = useState(false);
  // v2 (§8.6) : contour des contrôles `borderStrong` (≥ 3:1), boîte de 52 dp. Seule la
  // COULEUR du contour change selon l'état : la structure native reste fixe (règle 13).
  const boxColors = v2 ? { ...colors, border: colors.borderStrong } : colors;
  return (
    <View style={{ marginBottom: v2 ? 16 : 14 }}>
      {label ? (
        v2 ? (
          <Text variant="label" style={{ marginBottom: 8 }}>
            {label}
          </Text>
        ) : (
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {label}
          </Text>
        )
      ) : null}
      {/* Structure native fixe au focus : voir fieldStyle.ts (cause du clignotement Android). */}
      <View {...fieldBoxProps({ focused, error: !!error }, boxColors, radius.md, v2 ? 52 : MIN_TOUCH)}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          maxFontSizeMultiplier={v2 ? 1.6 : 1.3}
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
      {error && v2 ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 }} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={16} color={colors.danger} />
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 4 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : preview && v2 ? (
        // v2 : l'aperçu du montant n'efface plus l'aide (ex. « Basé sur vos dépenses réelles »).
        <View style={{ marginTop: 4, gap: 2 }}>
          <Text variant="small">{preview}</Text>
          {hint ? (
            <Text variant="caption" tone="subtle">
              {hint}
            </Text>
          ) : null}
        </View>
      ) : preview || hint ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
          {preview || hint}
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
  const { colors, v2 } = useTheme();
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
      preview={value ? formatMoney(value, currency) : undefined}
      hint={hint}
      // v2 (§8.6) : le nombre en `amountL`, chiffres alignés ; v1 : grand seulement si `big`.
      style={v2 ? { fontSize: 28, lineHeight: 34, fontFamily: fontFor('heading', 700), fontVariant: ['tabular-nums'], color: colors.text } : big ? { fontSize: 30, fontFamily: fontFor('heading', 800), color: colors.text } : undefined}
      onChangeText={(s) => {
        setText(s);
        onChange(parseAmountInput(s, currency));
      }}
    />
  );
}
