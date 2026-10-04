import React, { useState } from 'react';
import { useI18n } from '@/i18n';
import { Banner, Button, Field, Screen, Text } from '@/components/ui';
import { authErrorKey, resetPassword } from '@/services/auth';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (e) {
      const key = authErrorKey(e);
      // Ne jamais révéler si un compte existe : même message de succès.
      if (key === 'auth.err.invalid-credential') setSent(true);
      else setError(t(key));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen back title={t('auth.forgot.title')} syncBanner={false}>
      <Text tone="muted" style={{ marginBottom: 16 }}>
        {t('auth.forgot.body')}
      </Text>
      {sent ? <Banner tone="success" icon="mail-outline" text={t('auth.forgot.sent')} /> : null}
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={error} />
      <Button full label={t('auth.forgot.submit')} loading={busy} disabled={!email} onPress={() => void submit()} />
    </Screen>
  );
}
