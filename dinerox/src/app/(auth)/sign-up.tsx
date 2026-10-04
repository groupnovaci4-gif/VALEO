import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { Button, Field, Screen, SwitchRow, Text } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';
import { authErrorKey, isPasswordStrong, signUp } from '@/services/auth';
import { analytics } from '@/services/analytics';
import { TERMS_VERSION } from '@/config/legal';
import { ensureProfile, saveProfile } from '@/services/profile';

export default function SignUp() {
  const { t } = useI18n();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!isPasswordStrong(password)) return setError(t('auth.err.weak-password'));
    if (password !== confirm) return setError(t('auth.err.passwordMismatch'));
    if (!terms) return setError(t('auth.err.terms'));
    setBusy(true);
    try {
      const user = await signUp(email, password, firstName, lastName);
      await ensureProfile(user.uid, user.email ?? email, firstName.trim(), TERMS_VERSION, lastName.trim());
      // Le profil a pu être créé juste avant (sans nom) par la session qui démarre : on écrit
      // toujours le nom, le prénom et l'acceptation des conditions saisis ici.
      await saveProfile(user.uid, { firstName: firstName.trim(), lastName: lastName.trim(), termsAcceptedVersion: TERMS_VERSION });
      analytics.track('sign_up', { method: 'email' });
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen back title={t('auth.signup.title')} syncBanner={false}>
      <Field label={t('auth.lastName')} value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" />
      <Field label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint={t('auth.err.weak-password')} />
      <Field label={t('auth.passwordConfirm')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <SwitchRow title={t('auth.signup.terms')} value={terms} onChange={setTerms} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Button small variant="ghost" label={t('set.terms')} onPress={() => router.push('/legal/terms')} />
        <Button small variant="ghost" label={t('set.privacy')} onPress={() => router.push('/legal/privacy')} />
      </View>
      {error ? (
        <Text tone="danger" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button full label={t('auth.signup.submit')} loading={busy} disabled={!email || !password || !firstName.trim() || !lastName.trim()} onPress={() => void submit()} />
      <Text tone="subtle" align="center" style={{ marginVertical: 12 }}>
        {t('common.or')}
      </Text>
      <GoogleButton />
      <Button variant="ghost" full label={t('auth.signup.hasAccount')} onPress={() => router.replace('/sign-in')} style={{ marginTop: 12 }} />
    </Screen>
  );
}
