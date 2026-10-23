/**
 * Connexion par téléphone — écrans (docs/connexion-telephone/maquettes, validés ; textes de
 * maquettes/TEXTES.md tels quels). Un seul parcours, étape par étape (le retour revient à l'étape
 * précédente) :
 *   numéro (2, ou 8 « Ajouter mon numéro ») → code reçu (3) → code secret (4) → confirmation (4 bis)
 *   connexion (5) → code secret oublié (6) · nouveau téléphone (7)
 * Erreurs visibles : mauvais code, trop d'essais, code expiré, pas de réseau (9 à 12).
 * Tout le sensible est fait par le serveur (`services/phoneAuth`) ; le code secret ne fait que
 * passer en mémoire le temps de l'appel, jamais rangé sur le téléphone (§5bis.3).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { DesignV2, useTheme } from '@/theme';
import { useI18n } from '@/i18n';
import { Button, Field, Icon, IconButton, Row, Screen, Sheet, Text, useToast } from '@/components/ui';
import { COUNTRY_PROFILES } from '@/core/countries';
import { DEFAULT_DIAL, DIAL_CODES, dialCodeOf, formatLocal, maskPhone, normalizePhone, secretProblem, smsAllowed } from '@/core/phone';
import { TERMS_VERSION } from '@/config/legal';
import { ensureProfile, saveProfile } from '@/services/profile';
import {
  lastPhone,
  openSession,
  phoneErrorOf,
  phoneSetSecret,
  phoneSignIn,
  phoneStart,
  phoneVerify,
  rememberPhone,
  type PhoneChannel,
  type PhoneError,
  type PhonePurpose,
  type StartResult,
} from '@/services/phoneAuth';

export type PhoneStart = 'number' | 'signin' | 'forgot' | 'link';

type Step =
  | { name: 'number'; mode: 'signup' | 'signin' | 'link' }
  | { name: 'code'; purpose: PhonePurpose; req: StartResult }
  | { name: 'secret'; purpose: PhonePurpose; ticket: string }
  | { name: 'confirm'; purpose: PhonePurpose; ticket: string; first: string }
  | { name: 'signin' }
  | { name: 'forgot' }
  | { name: 'device' };

/** Heure courante, rafraîchie chaque seconde (comptes à rebours ; jamais lue pendant le rendu). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Espaces insécables : un numéro affiché ne se coupe jamais entre deux groupes de chiffres. */
const NBSP = String.fromCharCode(160);
const oneLine = (s: string) => s.replace(/ /g, NBSP);

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function PhoneFlow({ start }: { start: PhoneStart }) {
  return (
    <DesignV2>
      <Flow start={start} />
    </DesignV2>
  );
}

function Flow({ start }: { start: PhoneStart }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const l = lang === 'en' ? 'en' : 'fr';
  const initial: Step = start === 'signin' ? { name: 'signin' } : start === 'forgot' ? { name: 'forgot' } : { name: 'number', mode: start === 'link' ? 'link' : 'signup' };
  const [history, setHistory] = useState<Step[]>([initial]);
  const step = history[history.length - 1];
  const go = (s: Step) => setHistory((h) => [...h, s]);
  const back = () => (history.length > 1 ? setHistory((h) => h.slice(0, -1)) : router.back());
  const replace = (s: Step) => setHistory((h) => [...h.slice(0, -1), s]);

  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [local, setLocal] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  // Numéro retenu sur CE téléphone : « Bon retour ! » seulement pour lui, sinon « Se connecter » (§5ter).
  const [remembered, setRemembered] = useState<string | null>(null);
  const [error, setError] = useState<PhoneError | null>(null);
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState('');
  // Code secret saisi pour « nouveau téléphone » : en mémoire, le temps de vérifier le code reçu.
  const pendingSecret = useRef<string | null>(null);

  // Dernier numéro utilisé sur ce téléphone : « Bon retour ! » le montre masqué (connexion, oubli) ;
  // depuis l'inscription, il sert seulement à reconnaître ce numéro s'il est retapé.
  useEffect(() => {
    let alive = true;
    void lastPhone().then((p) => {
      if (!alive) return;
      if (p?.e164) setRemembered(p.e164);
      if (start !== 'signin' && start !== 'forgot') return;
      if (p?.e164) {
        setE164(p.e164);
        setDial(p.dial || DEFAULT_DIAL);
      } else setHistory([{ name: 'number', mode: 'signin' }]);
    });
    return () => {
      alive = false;
    };
  }, [start]);

  const reset = () => {
    setError(null);
    setDigits('');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(phoneErrorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const send = (purpose: PhonePurpose, channel: PhoneChannel, phone = e164) =>
    run(async () => {
      if (!phone) return;
      const req = await phoneStart({ phone, dial, purpose, channel, lang: l });
      reset();
      if (step.name === 'code') replace({ name: 'code', purpose, req });
      else go({ name: 'code', purpose, req });
    });

  /** Session ouverte : profil créé au besoin (CGU acceptées en continuant), numéro retenu. */
  const opened = async (token: string, phone: string) => {
    const uid = await openSession(token);
    await rememberPhone(phone, dial);
    const p = await ensureProfile(uid, '', '', TERMS_VERSION);
    if (!p.termsAcceptedVersion || !p.phone) await saveProfile(uid, { termsAcceptedVersion: p.termsAcceptedVersion ?? TERMS_VERSION, phone: p.phone ?? phone });
  };

  const submitNumber = (mode: 'signup' | 'signin' | 'link') => {
    const phone = normalizePhone(local, dial);
    if (!phone) return setError({ key: 'phone.err.invalidNumber', code: 'phone/invalid-number' });
    setE164(phone);
    setError(null);
    if (mode === 'signin') return go({ name: 'signin' });
    void send(mode === 'link' ? 'link' : 'signup', 'whatsapp', phone);
  };

  const verify = (code: string) =>
    run(async () => {
      if (step.name !== 'code') return;
      try {
        const v = await phoneVerify({ requestId: step.req.requestId, code });
        setDigits('');
        if (step.purpose === 'device') {
          const secret = pendingSecret.current ?? '';
          const r = await phoneSignIn({ phone: e164 ?? '', dial, secret, ticket: v.ticket });
          pendingSecret.current = null;
          if (r.token) await opened(r.token, e164 ?? '');
          return;
        }
        go({ name: 'secret', purpose: step.purpose, ticket: v.ticket });
      } catch (e) {
        setDigits('');
        throw e;
      }
    });

  const chooseSecret = (code: string) => {
    if (step.name !== 'secret') return;
    if (secretProblem(code)) {
      setDigits('');
      return setError({ key: 'phone.secret.tooSimple', code: 'phone/weak-secret' });
    }
    setError(null);
    setDigits('');
    go({ name: 'confirm', purpose: step.purpose, ticket: step.ticket, first: code });
  };

  const confirmSecret = (code: string) =>
    run(async () => {
      if (step.name !== 'confirm') return;
      setDigits('');
      if (code !== step.first) {
        setHistory((h) => h.slice(0, -1));
        setError({ key: 'phone.secret.mismatch', code: 'mismatch' });
        return;
      }
      const r = await phoneSetSecret({ ticket: step.ticket, secret: code, lang: l });
      if (r.linked) {
        toast.show(t('phone.link.done'), 'success');
        router.back();
        return;
      }
      if (r.token) await opened(r.token, e164 ?? '');
    });

  const signIn = (code: string) =>
    run(async () => {
      setDigits('');
      const r = await phoneSignIn({ phone: e164 ?? '', dial, secret: code });
      if (r.needsDevice) {
        pendingSecret.current = code;
        go({ name: 'device' });
        return;
      }
      if (r.token) await opened(r.token, e164 ?? '');
    });

  const onDigits = (v: string) => {
    setDigits(v);
    if (v.length < 6) return;
    if (step.name === 'code') void verify(v);
    else if (step.name === 'secret') chooseSecret(v);
    else if (step.name === 'confirm') void confirmSecret(v);
    else if (step.name === 'signin') void signIn(v);
  };

  const shared = { t, back, error, busy };
  switch (step.name) {
    case 'number':
      return <NumberStep {...shared} mode={step.mode} dial={dial} setDial={setDial} local={local} setLocal={setLocal} onSubmit={() => submitNumber(step.mode)} onSignIn={() => go({ name: 'number', mode: 'signin' })} />;
    case 'code':
      return <CodeStep {...shared} req={step.req} e164={e164 ?? ''} digits={digits} onDigits={onDigits} onEdit={() => setHistory((h) => h.slice(0, h.findIndex((s) => s.name === 'code')))} onResend={(c) => void send(step.purpose, c)} />;
    case 'secret':
    case 'confirm':
      return <SecretStep {...shared} confirm={step.name === 'confirm'} digits={digits} onDigits={onDigits} />;
    case 'signin':
      return <SignInStep {...shared} e164={e164 ?? ''} known={!!remembered && remembered === e164} digits={digits} onDigits={onDigits} onChange={() => go({ name: 'number', mode: 'signin' })} onForgot={() => go({ name: 'forgot' })} />;
    case 'forgot':
      return <InfoStep {...shared} kind="forgot" e164={e164 ?? ''} onSend={() => void send('reset', 'whatsapp')} />;
    case 'device':
      return <InfoStep {...shared} kind="device" e164={e164 ?? ''} onSend={() => void send('device', 'whatsapp')} />;
  }
}

// ─── Morceaux d'écran ────────────────────────────────────────────────

type T = ReturnType<typeof useI18n>['t'];
interface Shared {
  t: T;
  back: () => void;
  error: PhoneError | null;
  busy: boolean;
}

function Top({ back, t, title }: { back: () => void; t: T; title?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, marginHorizontal: -12, marginBottom: 4 }}>
      <IconButton icon="chevron-back" label={t('common.back')} onPress={back} size={24} />
      {title ? (
        <Text variant="titleM" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

function Title({ text }: { text: string }) {
  return (
    <Text variant="titleM" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, marginBottom: 10 }}>
      {text}
    </Text>
  );
}

/** Bandeau d'erreur ou d'information (maquettes 9 à 12) : couleur ET texte, jamais la couleur seule. */
function Notice({ tone, icon, text, strong }: { tone: 'danger' | 'warning' | 'info'; icon: string; text: string; strong?: string }) {
  const { colors } = useTheme();
  const bg = tone === 'danger' ? colors.dangerBg : tone === 'warning' ? colors.warningBg : colors.infoBg;
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.info;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: bg, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginVertical: 8 }}>
      <Icon name={icon} size={20} color={fg} />
      <Text variant="small" weight="500" style={{ flex: 1, color: fg, fontSize: 14, lineHeight: 20 }}>
        {strong ? <Text variant="small" weight="700" style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{`${strong} `}</Text> : null}
        {text}
      </Text>
    </View>
  );
}

/** Erreur rendue par le serveur : première phrase en gras (maquettes), le reste à la suite. */
function ErrorNotice({ error, t }: { error: PhoneError | null; t: T }) {
  if (!error) return null;
  const full = t(error.key, error.params as never);
  const dot = full.indexOf('. ');
  const strong = dot > 0 ? full.slice(0, dot + 1) : undefined;
  const rest = dot > 0 ? full.slice(dot + 2) : full;
  const tone = error.code === 'phone/expired' ? 'warning' : 'danger';
  const icon = error.code === 'network' ? 'cloud-offline-outline' : error.code === 'phone/locked' ? 'lock-closed-outline' : error.code === 'phone/expired' ? 'time-outline' : 'alert-circle-outline';
  return <Notice tone={tone} icon={icon} text={rest} strong={strong} />;
}

function Card({ children, sand }: { children: React.ReactNode; sand?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: sand ? colors.surfaceAlt : colors.surface, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 6 }}>{children}</View>;
}

function Round({ icon, tone }: { icon: string; tone: 'brand' | 'wa' }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'wa' ? colors.successBg : colors.primaryContainer }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name={icon} size={22} color={tone === 'wa' ? colors.success : colors.primary} />
    </View>
  );
}

/** Lien texte (maquettes : « Changer », « Code secret oublié ? ») : 48 dp de haut, jamais coupé (passe à la ligne si le texte est agrandi). */
function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ minHeight: 48, flexShrink: 1, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <Text variant="label" tone="primary" align="center" style={{ fontSize: 14, lineHeight: 20 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Pavé à 6 chiffres (codes) : grandes touches de 56 dp, comme la maquette. */
function Keypad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
      {keys.map((k, i) =>
        k ? (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? '⌫' : k}
            disabled={disabled}
            onPress={() => (k === 'del' ? onChange(value.slice(0, -1)) : value.length < 6 ? onChange(value + k) : undefined)}
            style={({ pressed }) => ({ flexBasis: '31%', flexGrow: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: k === 'del' ? 'transparent' : pressed ? colors.surfaceAlt : colors.surface })}
          >
            {k === 'del' ? <Icon name="backspace-outline" size={26} color={colors.text} /> : <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '600' }}>{k}</Text>}
          </Pressable>
        ) : (
          <View key={`nil${i}`} style={{ flexBasis: '31%', flexGrow: 1, height: 56 }} />
        ),
      )}
    </View>
  );
}

function Dots({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginVertical: 10 }} accessibilityLabel={`${n}/6`}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: i < n ? colors.text : colors.borderStrong, backgroundColor: i < n ? colors.text : 'transparent' }} />
      ))}
    </View>
  );
}

// ─── 2 · 8 — Numéro ──────────────────────────────────────────────────

function NumberStep({ t, back, error, busy, mode, dial, setDial, local, setLocal, onSubmit, onSignIn }: Shared & { mode: 'signup' | 'signin' | 'link'; dial: string; setDial: (d: string) => void; local: string; setLocal: (v: string) => void; onSubmit: () => void; onSignIn: () => void }) {
  const { colors } = useTheme();
  const { lang } = useI18n();
  const [choose, setChoose] = useState(false);
  const flag = COUNTRY_PROFILES.find((p) => DIAL_CODES[p.code] === dial)?.flag ?? '🌍';
  const label = mode === 'signin' ? t('phone.welcome.continue') : t('phone.number.send');
  return (
    <Screen syncBanner={false} footer={<Button full label={label} loading={busy} disabled={!local.trim()} onPress={onSubmit} />}>
      <Top back={back} t={t} title={mode === 'link' ? t('phone.link.title') : undefined} />
      {mode === 'link' ? (
        <Card sand>
          <Icon name="information-circle-outline" size={22} color={colors.textMuted} />
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {t('phone.link.sameAccount')}
          </Text>
        </Card>
      ) : (
        <>
          <Title text={mode === 'signin' ? t('phone.welcome.signin') : t('phone.number.title')} />
          <Text tone="muted" style={{ marginBottom: 14 }}>
            {t('phone.number.body')}
          </Text>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('phone.number.choose')} : +${dial}`}
          onPress={() => setChoose(true)}
          style={({ pressed }) => ({ marginTop: 32, minHeight: 52, minWidth: 96, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceAlt : colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 })}
        >
          <Text style={{ fontSize: 18 }}>{flag}</Text>
          <Text variant="label" style={{ fontSize: 16 }}>{`+${dial}`}</Text>
          <Icon name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field label={t('phone.number.label')} value={local} onChangeText={setLocal} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={20} returnKeyType="done" onSubmitEditing={onSubmit} />
        </View>
      </View>
      <Text variant="caption" tone="subtle" style={{ marginTop: -6, marginBottom: 8 }}>
        {t('phone.number.hint')}
      </Text>
      <ErrorNotice error={error} t={t} />
      {mode === 'signup' ? (
        <Card sand>
          <Round icon="logo-whatsapp" tone="wa" />
          <Text variant="small" tone="muted" style={{ flex: 1 }}>
            {t('phone.number.noWhatsapp')}
          </Text>
        </Card>
      ) : null}
      {mode === 'link' ? (
        <Text variant="small" tone="subtle" style={{ marginTop: 4 }}>
          {t('phone.link.how')}
        </Text>
      ) : null}
      {mode === 'signup' ? (
        <>
          <Button variant="ghost" full label={t('phone.welcome.signin')} onPress={onSignIn} style={{ marginTop: 8 }} />
          <Text variant="caption" tone="subtle" align="center" style={{ marginTop: 8 }}>
            {t('phone.number.terms')}
          </Text>
        </>
      ) : null}
      {/* Connexion (numéro pas encore connu sur ce téléphone) : la connexion e-mail reste à un toucher (§5ter). */}
      {mode === 'signin' ? <TextLink label={t('phone.signin.withEmail')} onPress={() => router.push('/sign-in')} /> : null}
      <Sheet visible={choose} onClose={() => setChoose(false)} title={t('phone.number.choose')} inline>
        {COUNTRY_PROFILES.map((p) => (
          <Row
            key={p.code}
            title={`${p.flag} ${p.name[lang === 'en' ? 'en' : 'fr']}`}
            right={<Text tone="muted">{`+${DIAL_CODES[p.code]}`}</Text>}
            onPress={() => {
              setDial(DIAL_CODES[p.code]);
              setChoose(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

// ─── 3 · 9 · 11 · 12 — Code reçu ─────────────────────────────────────

function CodeStep({ t, back, error, busy, req, e164, digits, onDigits, onEdit, onResend }: Shared & { req: StartResult; e164: string; digits: string; onDigits: (v: string) => void; onEdit: () => void; onResend: (c: PhoneChannel) => void }) {
  const { colors } = useTheme();
  const now = useNow(true);
  const expired = error?.code === 'phone/expired' || (now > 0 && now >= req.expiresAt);
  const canResend = now >= req.resendAt;
  const wrong = error?.code === 'phone/wrong-code' || error?.code === 'phone/too-many';
  const sms = req.channel === 'whatsapp' && smsAllowed(e164);
  const shown = wrong && digits.length === 0 ? '' : digits;
  return (
    <Screen syncBanner={false}>
      <Top back={back} t={t} />
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successBg, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 8 }}>
        <Icon name={req.channel === 'sms' ? 'chatbox-outline' : 'logo-whatsapp'} size={16} color={colors.success} />
        <Text variant="caption" weight="600" style={{ color: colors.success }}>
          {req.channel === 'sms' ? t('phone.code.sentSms') : t('phone.code.sentWhatsapp')}
        </Text>
      </View>
      <Title text={t('phone.code.title')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <Text tone="muted">{t('phone.code.sentTo', { phone: `+${dialCodeOf(e164) ?? ''} ${formatLocal(e164)}` })}</Text>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <Text variant="label" tone="primary">{`· ${t('phone.code.edit')}`}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessibilityLabel={`${t('phone.code.title')} : ${digits.length}/6`}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ width: 46, height: 58, borderRadius: 14, borderWidth: wrong || i === shown.length ? 2 : 1.5, borderColor: wrong ? colors.danger : i === shown.length ? colors.primary : colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '700', color: wrong ? colors.danger : colors.text }}>{shown[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      {error ? <ErrorNotice error={error} t={t} /> : null}
      {!expired && !error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <Icon name="time-outline" size={14} color={colors.textSubtle} />
          <Text variant="caption" tone="subtle">
            {t('phone.code.expiresIn', { time: mmss(req.expiresAt - now) })}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
        {canResend ? (
          <Button variant="ghost" small label={t('phone.code.resend')} disabled={busy} onPress={() => onResend(req.channel)} />
        ) : (
          <Text variant="small" tone="subtle">
            {t('phone.code.resendIn', { time: mmss(req.resendAt - now) })}
          </Text>
        )}
        {sms ? <Button variant="ghost" small icon="chatbox-outline" label={t('phone.code.bySms')} disabled={busy || !canResend} onPress={() => onResend('sms')} /> : null}
      </View>
      <Keypad value={digits} onChange={onDigits} disabled={busy || expired} />
      <View style={{ marginTop: 12 }}>
        {expired ? (
          <Button full label={t('phone.code.resend')} loading={busy} disabled={!canResend} onPress={() => onResend(req.channel)} />
        ) : (
          <Button full label={t('phone.code.verify')} loading={busy} disabled={digits.length < 6} onPress={() => onDigits(digits)} />
        )}
      </View>
    </Screen>
  );
}

// ─── 4 · 4 bis — Code secret ─────────────────────────────────────────

function SecretStep({ t, back, error, busy, confirm, digits, onDigits }: Shared & { confirm: boolean; digits: string; onDigits: (v: string) => void }) {
  return (
    <Screen syncBanner={false}>
      <Top back={back} t={t} />
      <Title text={confirm ? t('phone.secret.confirmTitle') : t('phone.secret.title')} />
      <Text tone="muted">{confirm ? t('phone.secret.confirmBody') : t('phone.secret.body')}</Text>
      <Dots n={digits.length} />
      <Text variant="caption" tone="subtle" align="center">
        {confirm ? t('phone.secret.step', { n: 2 }) : t('phone.secret.avoid')}
      </Text>
      <ErrorNotice error={error} t={t} />
      <Keypad value={digits} onChange={onDigits} disabled={busy} />
    </Screen>
  );
}

// ─── 5 · 10 — Connexion ──────────────────────────────────────────────

function SignInStep({ t, back, error, busy, e164, known, digits, onDigits, onChange, onForgot }: Shared & { e164: string; known: boolean; digits: string; onDigits: (v: string) => void; onChange: () => void; onForgot: () => void }) {
  return (
    <Screen syncBanner={false}>
      <Top back={back} t={t} />
      <Title text={known ? t('phone.signin.title') : t('phone.welcome.signin')} />
      <Card>
        <Round icon="phone-portrait-outline" tone="brand" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="subtle">
            {t('phone.signin.yourNumber')}
          </Text>
          {/* Maquette 5 : le numéro masqué tient sur UNE ligne (« +225 07 06 •• •• 41 »). */}
          <Text variant="label" style={{ fontSize: 15 }}>
            {e164 ? oneLine(maskPhone(e164)) : ''}
          </Text>
        </View>
        <TextLink label={t('phone.signin.change')} onPress={onChange} />
      </Card>
      <Text tone="muted" align="center" style={{ marginTop: 10 }}>
        {t('phone.signin.secret')}
      </Text>
      <Dots n={digits.length} />
      <ErrorNotice error={error} t={t} />
      {/* Maquette 5 : les deux liens CÔTE À CÔTE. */}
      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 8 }}>
        <TextLink label={t('phone.signin.forgot')} onPress={onForgot} />
        <TextLink label={t('phone.signin.withEmail')} onPress={() => router.push('/sign-in')} />
      </View>
      <Keypad value={digits} onChange={onDigits} disabled={busy || error?.code === 'phone/locked'} />
    </Screen>
  );
}

// ─── 6 · 7 — Code secret oublié, nouveau téléphone ───────────────────

function InfoStep({ t, back, error, busy, kind, e164, onSend }: Shared & { kind: 'forgot' | 'device'; e164: string; onSend: () => void }) {
  const { colors } = useTheme();
  return (
    <Screen syncBanner={false} footer={<View style={{ gap: 4 }}><Button full label={t('phone.number.send')} loading={busy} onPress={onSend} /><Button full variant="ghost" label={kind === 'forgot' ? t('common.cancel') : t('phone.device.notMine')} onPress={back} /></View>}>
      <Top back={back} t={t} />
      {kind === 'device' ? (
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="phone-portrait-outline" size={30} color={colors.primary} />
        </View>
      ) : null}
      <Title text={kind === 'forgot' ? t('phone.forgot.title') : t('phone.device.title')} />
      <Text tone="muted">{kind === 'forgot' ? t('phone.forgot.body') : t('phone.device.body')}</Text>
      <Card>
        <Round icon={kind === 'forgot' ? 'phone-portrait-outline' : 'logo-whatsapp'} tone={kind === 'forgot' ? 'brand' : 'wa'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" tone="subtle">
            {t('phone.forgot.sentTo')}
          </Text>
          <Text variant="label" style={{ fontSize: 16 }}>
            {e164 ? oneLine(maskPhone(e164)) : ''}
          </Text>
        </View>
      </Card>
      {kind === 'forgot' ? <Notice tone="info" icon="information-circle-outline" text={t('phone.forgot.safe')} /> : null}
      <ErrorNotice error={error} t={t} />
    </Screen>
  );
}
