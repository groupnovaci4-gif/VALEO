import React, { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, ChipGroup, Field, Screen, SectionHeader, Sheet, SwitchRow, Text, useToast } from '@/components/ui';
import { PinPad } from '@/components/PinPad';
import { biometricAvailable, clearPin, hasPin, setPin } from '@/services/security';
import { authErrorKey, changePassword, isPasswordStrong } from '@/services/auth';

export default function Security() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile, updateProfile, mode } = useApp();
  const [pinExists, setPinExists] = useState(false);
  const [bio, setBio] = useState(false);
  const [pinFlow, setPinFlow] = useState<'new' | 'confirm' | null>(null);
  const [first, setFirst] = useState('');
  const [pin, setPinValue] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hasPin().then(setPinExists).catch(() => setPinExists(false));
    biometricAvailable().then(setBio).catch(() => setBio(false));
  }, []);

  const onPin = (value: string) => {
    if (value.length < 4 || !pinFlow) return setPinValue(value);
    setPinValue('');
    if (pinFlow === 'new') {
      setFirst(value);
      setPinFlow('confirm');
    } else if (value === first) {
      setPin(value)
        .then(async () => {
          setPinExists(true);
          setPinFlow(null);
          await updateProfile({ preferences: { ...profile!.preferences, appLock: true } });
          toast.show(t('common.saved'));
        })
        .catch(() => {
          setPinFlow(null);
          toast.show(t('error.generic'), 'error');
        });
    } else {
      setPinError(t('set.pin.mismatch'));
      setPinFlow('new');
    }
  };

  if (!profile) return null;
  const prefs = profile.preferences;
  const toggleLock = async (on: boolean) => {
    if (on && !pinExists) {
      setPinError(null);
      setPinFlow('new');
      return;
    }
    if (!on) await clearPin().then(() => setPinExists(false));
    await updateProfile({ preferences: { ...prefs, appLock: on } });
  };
  const submitPassword = async () => {
    setPwError(null);
    if (!isPasswordStrong(next)) return setPwError(t('auth.err.weak-password'));
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.show(t('set.passwordChanged'));
    } catch (e) {
      setPwError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen back title={t('set.security')}>
      <Card>
        <SwitchRow title={t('set.appLock')} subtitle={t('set.appLockHint')} value={prefs.appLock && pinExists} onChange={(v) => void toggleLock(v)} />
        {prefs.appLock && pinExists ? (
          <>
            <Button small variant="ghost" label={t('set.pin.change')} onPress={() => (setPinError(null), setPinFlow('new'))} />
            {bio ? (
              <Text variant="caption" tone="success" style={{ marginBottom: 8 }}>
                ✓ {t('set.biometric')}
              </Text>
            ) : null}
            <Text variant="small" weight="600" style={{ marginVertical: 6 }}>
              {t('set.autoLock')}
            </Text>
            <ChipGroup
              value={String(prefs.autoLockMinutes)}
              onChange={(v) => void updateProfile({ preferences: { ...prefs, autoLockMinutes: Number(v) } })}
              options={(['0', '1', '5', '15'] as const).map((v) => ({ value: v, label: t(`set.autoLock.${v}`) }))}
            />
          </>
        ) : null}
      </Card>
      {mode === 'firebase' ? (
        <>
          <SectionHeader title={t('set.changePassword')} />
          <Card>
            {pwError ? <Banner tone="danger" icon="alert-circle" text={pwError} /> : null}
            <Field label={t('set.currentPassword')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
            <Field label={t('set.newPassword')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint={t('auth.err.weak-password')} />
            <Button label={t('set.changePassword')} loading={busy} disabled={!current || !next} onPress={() => void submitPassword()} />
          </Card>
        </>
      ) : null}
      <Sheet visible={pinFlow !== null} onClose={() => (setPinFlow(null), setPinValue(''))} title={pinFlow === 'confirm' ? t('set.pin.confirm') : t('set.pin.new')}>
        {pinError ? <Banner tone="danger" text={pinError} /> : null}
        <PinPad value={pin} onChange={onPin} />
      </Sheet>
    </Screen>
  );
}
