import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/theme';
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
  const { colors, radius } = useTheme();
  const { t, date } = useI18n();
  const [open, setOpen] = useState(false);
  const now = today();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
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
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <Icon name="calendar-outline" size={16} color={colors.textMuted} />
          <Text variant="small" weight="600">
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
