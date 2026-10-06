import React, { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { Button, Field, Screen, Text } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';
import { Logo } from '@/components/Logo';
import { authErrorKey, signIn } from '@/services/auth';

export default function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen back title={t('auth.signin.title')} syncBanner={false}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Logo size={72} />
      </View>
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        maxLength={254}
      />
      <Field
        inputRef={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        error={error}
        onSubmitEditing={() => void submit()}
        maxLength={128}
      />
      <Button full label={t('auth.signin.submit')} loading={busy} disabled={!email || !password} onPress={() => void submit()} />
      <Button variant="ghost" full label={t('auth.signin.forgot')} onPress={() => router.push('/forgot-password')} style={{ marginTop: 8 }} />
      <Text tone="subtle" align="center" style={{ marginVertical: 12 }}>
        {t('common.or')}
      </Text>
      <GoogleButton />
      <Button variant="ghost" full label={t('auth.signin.noAccount')} onPress={() => router.replace('/sign-up')} style={{ marginTop: 12 }} />
    </Screen>
  );
}
