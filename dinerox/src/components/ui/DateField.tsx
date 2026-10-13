import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme, MIN_TOUCH } from '@/theme';
import { Text } from './Text';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { useI18n } from '@/i18n';
import { addDays, parseISODate, toISODate, today, type ISODate } from '@/core/dates';

/** Choix de date : raccourcis (aujourd'hui / hier) + calendrier natif. */
export function DateField({
  label,
  value,
  onChange,
  allowClear,
  shortcuts = true,
  minimumDate,
}: {
  label?: string;
  value: ISODate | null;
  onChange: (d: ISODate | null) => void;
  allowClear?: boolean;
  shortcuts?: boolean;
  minimumDate?: ISODate;
}) {
  const { colors, radius, v2 } = useTheme();
  const { t, date } = useI18n();
  const [open, setOpen] = useState(false);
  const now = today();
  return (
    <View style={{ marginBottom: v2 ? 16 : 14 }}>
      {label ? (
        <Text variant={v2 ? 'label' : 'small'} weight={v2 ? undefined : '600'} style={{ marginBottom: v2 ? 8 : 6 }}>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {shortcuts ? (
          <>
            <Chip label={t('common.today')} selected={value === now} onPress={() => onChange(now)} />
            <Chip label={t('common.yesterday')} selected={value === addDays(now, -1)} onPress={() => onChange(addDays(now, -1))} />
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ?? t('common.date')}
          onPress={() => setOpen(true)}
          // v2 (§8.6–8.7) : même gabarit qu'une puce (48 dp, rayon 12, contour `borderStrong`).
          style={({ pressed }) =>
            v2
              ? { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: MIN_TOUCH, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceAlt : colors.surface }
              : { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }
          }
        >
          <Icon name="calendar-outline" size={v2 ? 18 : 16} color={colors.textMuted} />
          <Text variant={v2 ? 'label' : 'small'} weight={v2 ? undefined : '600'}>
            {value ? date(value, { year: true }) : t('goal.noDate')}
          </Text>
        </Pressable>
        {allowClear && value ? <Chip label={t('goal.noDate')} onPress={() => onChange(null)} /> : null}
      </View>
      {open ? (
        <DateTimePicker
          value={value ? parseISODate(value) : new Date()}
          mode="date"
          minimumDate={minimumDate ? parseISODate(minimumDate) : undefined}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, d) => {
            setOpen(Platform.OS === 'ios');
            if (event.type === 'set' && d) {
              onChange(toISODate(d));
              setOpen(false);
            } else if (event.type === 'dismissed') setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
