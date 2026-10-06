/**
 * Inscription. Formulaire STABLE : état local uniquement (aucun contexte global
 * modifié pendant la saisie), aucune redirection tant que le compte n'est pas
 * créé, erreurs affichées sous chaque champ après la première tentative.
 * Après création, la session change et la navigation racine ouvre l'application.
 */
import React, { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { Banner, Button, Field, Screen, SwitchRow, Text } from '@/components/ui';
import { GoogleButton } from '@/components/GoogleButton';
import { Logo } from '@/components/Logo';
import { authErrorKey, signUp } from '@/services/auth';
import { analytics } from '@/services/analytics';
import { TERMS_VERSION } from '@/config/legal';
import { ensureProfile, saveProfile } from '@/services/profile';
import { cleanName, normalizePhone, validateSignUp, type SignUpInput } from '@/core/validation';

const EMPTY: SignUpInput = { lastName: '', firstName: '', email: '', phone: '', password: '', confirm: '', terms: false };

export default function SignUp() {
  const { t } = useI18n();
  const [form, setForm] = useState<SignUpInput>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const errors = validateSignUp(form);
  // Erreurs visibles seulement après une première tentative (pas de rouge pendant la saisie).
  const err = (k: keyof SignUpInput) => (submitted && errors[k] ? t(errors[k] as TKey) : null);
  const set = <K extends keyof SignUpInput>(k: K) => (v: SignUpInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSubmitted(true);
    setError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const firstName = cleanName(form.firstName);
      const lastName = cleanName(form.lastName);
      const user = await signUp(form.email.trim(), form.password, firstName, lastName);
      await ensureProfile(user.uid, user.email ?? form.email.trim(), firstName, TERMS_VERSION, lastName);
      // Le profil a pu être créé juste avant (sans nom) par la session qui démarre : on écrit
      // toujours les informations saisies ici.
      await saveProfile(user.uid, { firstName, lastName, phone: normalizePhone(form.phone) || null, termsAcceptedVersion: TERMS_VERSION });
      analytics.track('sign_up', { method: 'email' });
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('auth.signup.title')} syncBanner={false}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Logo size={72} />
      </View>
      {error ? <Banner tone="danger" icon="alert-circle-outline" text={error} /> : null}
      <Field
        label={t('auth.lastName')}
        value={form.lastName}
        onChangeText={set('lastName')}
        error={err('lastName')}
        autoComplete="family-name"
        textContentType="familyName"
        autoCapitalize="words"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => firstNameRef.current?.focus()}
        maxLength={80}
      />
      <Field
        inputRef={firstNameRef}
        label={t('auth.firstName')}
        value={form.firstName}
        onChangeText={set('firstName')}
        error={err('firstName')}
        autoComplete="given-name"
        textContentType="givenName"
        autoCapitalize="words"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
        maxLength={80}
      />
      <Field
        inputRef={emailRef}
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        error={err('email')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => phoneRef.current?.focus()}
        maxLength={254}
      />
      <Field
        inputRef={phoneRef}
        label={t('auth.phoneOptional')}
        value={form.phone}
        onChangeText={set('phone')}
        error={err('phone')}
        hint={t('auth.phoneHint')}
        autoComplete="tel"
        keyboardType="phone-pad"
        inputMode="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        maxLength={24}
      />
      <Field
        inputRef={passwordRef}
        label={t('auth.password')}
        value={form.password}
        onChangeText={set('password')}
        error={err('password')}
        hint={t('auth.passwordHint')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
        maxLength={128}
      />
      <Field
        inputRef={confirmRef}
        label={t('auth.passwordConfirm')}
        value={form.confirm}
        onChangeText={set('confirm')}
        error={err('confirm')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        maxLength={128}
      />
      <SwitchRow title={t('auth.signup.terms')} value={form.terms} onChange={set('terms')} />
      {err('terms') ? (
        <Text variant="caption" tone="danger" style={{ marginBottom: 8 }} accessibilityLiveRegion="polite">
          {err('terms')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Button small variant="ghost" label={t('set.terms')} onPress={() => router.push('/legal/terms')} />
        <Button small variant="ghost" label={t('set.privacy')} onPress={() => router.push('/legal/privacy')} />
      </View>
      {submitted && Object.keys(errors).length ? (
        <Text tone="danger" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
          {t('auth.err.fixFields')}
        </Text>
      ) : null}
      <Button full label={t('auth.signup.submit')} loading={busy} onPress={() => void submit()} />
      <Text tone="subtle" align="center" style={{ marginVertical: 12 }}>
        {t('common.or')}
      </Text>
      <GoogleButton />
      <Button variant="ghost" full label={t('auth.signup.hasAccount')} onPress={() => router.replace('/sign-in')} style={{ marginTop: 12 }} />
    </Screen>
  );
}
