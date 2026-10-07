/**
 * Création du profil financier, étape par étape. Rien n'est bloquant : pays et
 * devise sont préremplis, chaque autre étape peut être passée (« Passer »), et
 * « Plus tard » crée l'environnement immédiatement. La fin écrit tout en local
 * (synchronisé ensuite) puis ouvre le tableau de bord — aucune attente réseau.
 *
 * Démarrage rapide (≈ 60 s, proposé dès la première étape) : revenu, jour de
 * paie, jusqu'à trois charges fixes (créées comme récurrences), puis le
 * « reste par jour » s'affiche. Le parcours complet reste disponible.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { AmountField, Button, Card, ChipGroup, Field, ProgressBar, Screen, Text, useToast } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/theme';
import { ChargesStep, CountryStep, GoalsStep, IncomeStep, MoneyStep, STEP_IDS, SituationStep, useAccountName, type StepId } from '@/features/FinancialProfileSteps';
import { emptyDraft, toFinancialProfile, toOnboardingAnswers, type FinancialDraft } from '@/core/financialProfile';
import { countryProfile } from '@/core/countries';
import { starterStructure } from '@/core/defaults';
import type { CollectionName, SyncedDoc } from '@/core/types';
import { ensurePersonalSpace, updateSpaceInfo } from '@/services/spaces';
import { analytics } from '@/services/analytics';
import { findSubcategory, subcategoryLabel } from '@/core/catalog';
import { QUICK_MAX_CHARGES, QUICK_RESERVE_MONTHS, quickChargeRules, quickPreview, quickReserveGoal, type QuickCharge } from '@/core/onboardingQuick';
import { today } from '@/core/dates';
import { formatMoney } from '@/core/money';

type QuickStep = 'income' | 'charges' | 'result';
const QUICK_STEPS: QuickStep[] = ['income', 'charges', 'result'];
type IncomeKind = 'inc_salary' | 'inc_business' | 'inc_other';

const TITLES: Record<StepId, [TKey, TKey]> = {
  country: ['fp.country.title', 'fp.country.hint'],
  situation: ['fp.situation.title', 'fp.situation.hint'],
  income: ['fp.income.title', 'fp.income.hint'],
  money: ['fp.money.title', 'fp.money.hint'],
  charges: ['fp.charges.title', 'fp.charges.hint'],
  goals: ['fp.goals.title', 'fp.goals.hint'],
};

/** Ouvre l'espace dans le moteur sans jamais attendre plus de 3 s. */
const withTimeout = (p: Promise<unknown>, ms = 3000) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

export default function Onboarding() {
  const { t, lang, date } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const accountName = useAccountName();
  const { profile, user, engine, activeSpace, role, mode, updateProfile } = useApp();
  const [draft, setDraft] = useState<FinancialDraft>(() => emptyDraft(profile?.country && profile.country !== 'OTHER' ? profile.country : 'CI'));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  // Prénom demandé seulement s'il est inconnu (usage sans compte en ligne) ; facultatif.
  // Décision FIGÉE au premier profil reçu : juste après l'inscription, le profil
  // arrive parfois en deux temps (sans prénom, puis avec). Recalculée à chaque
  // rendu, elle faisait disparaître le champ pendant que l'utilisateur y tapait.
  const [name, setName] = useState('');
  const [askNameLatched, setAskNameLatched] = useState<boolean | null>(profile ? !profile.firstName : null);
  if (askNameLatched === null && profile) setAskNameLatched(!profile.firstName);
  // Un champ commencé n'est jamais retiré.
  const askName = !!askNameLatched || name !== '';
  const step = STEP_IDS[index];
  const last = index === STEP_IDS.length - 1;
  // Démarrage rapide : null = parcours complet.
  const [quick, setQuick] = useState<number | null>(null);
  const [incomeKind, setIncomeKind] = useState<IncomeKind>('inc_salary');
  const [charges, setCharges] = useState<QuickCharge[]>([]);
  // Question facultative du démarrage rapide : mise de côté mensuelle pour la réserve famille.
  const [reserveMonthly, setReserveMonthly] = useState<number | null>(null);

  const finish = async (quickDraft?: FinancialDraft, quickCharges?: QuickCharge[], quickReserve?: number | null) => {
    const d = quickDraft ?? draft;
    if (!engine || !activeSpace || !user) {
      toast.show(t('error.network'), 'error');
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const firstName = profile?.firstName || name.trim();
      if (mode === 'firebase' && activeSpace.kind === 'personal') void ensurePersonalSpace(user.uid, firstName, d.currency).catch(() => undefined);
      await withTimeout(engine.open(activeSpace.id, role ?? 'admin'));
      // Données existantes (réinstallation, 2e appareil) : rien n'est recréé.
      if (engine.getData(activeSpace.id).accounts.length === 0) {
        const answers = { ...toOnboardingAnswers(d, firstName), accountLabel: (k: string) => accountName(k, d.country) };
        const structure = starterStructure(answers, { now, uid: user.uid, lang, label: (k) => t(k as TKey) });
        const items: { col: CollectionName; doc: SyncedDoc }[] = [];
        for (const [col, docs] of Object.entries(structure)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
        // Démarrage rapide : les charges fixes deviennent des récurrences (compte courant de départ).
        const account = structure.accounts?.find((a) => !a.isSavings) ?? structure.accounts?.[0];
        if (quickCharges?.length && account) {
          const rules = quickChargeRules(quickCharges, {
            accountId: account.id,
            currency: d.currency,
            today: today(),
            now,
            uid: user.uid,
            label: (id) => {
              const sc = findSubcategory(id);
              return sc ? subcategoryLabel(sc, lang, d.country) : id;
            },
            id: (i) => `rec_quick${i + 1}`,
          });
          for (const doc of rules) items.push({ col: 'recurring', doc });
        }
        const reserve = quickReserveGoal(quickReserve, { currency: d.currency, now, uid: user.uid, name: t('reserve.defaultName'), id: 'goal_reserve_quick' });
        if (reserve) items.push({ col: 'goals', doc: reserve });
        engine.writeMany(activeSpace.id, items);
      }
      // Les données sont sauvegardées AVANT de marquer le profil comme terminé :
      // si l'application est fermée juste après, rien n'est perdu.
      await withTimeout(engine.persistNow());
      if (mode === 'firebase' && activeSpace.kind === 'personal') void updateSpaceInfo(activeSpace.id, { currency: d.currency }).catch(() => undefined);
      await updateProfile({
        country: d.country,
        currency: d.currency,
        financial: toFinancialProfile(d, now),
        ...(askName && name.trim() ? { firstName: name.trim() } : {}),
        onboarding: { ...(profile?.onboarding ?? {}), completed: true },
      });
      analytics.track('onboarding_completed', { method: countryProfile(d.country).zone });
      router.replace('/');
    } catch {
      toast.show(t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const next = () => (last ? void finish() : setIndex((i) => i + 1));
  // Le brouillon d'état n'est pas encore à jour à cet instant : la version finale est passée explicitement.
  const finishQuick = (final: FinancialDraft) => void finish(final, charges, reserveMonthly);
  const [title, hint] = TITLES[step];

  if (quick !== null) {
    const qStep = QUICK_STEPS[quick];
    const quickDraft = (): FinancialDraft => ({
      ...draft,
      incomeNature: incomeKind === 'inc_salary' ? 'fixed' : 'variable',
      incomeSources: [incomeKind],
      charges: Object.fromEntries(charges.map((c) => [c.subcategoryId, c.amount])),
    });
    const preview = quickPreview({ monthlyIncome: draft.monthlyIncome, charges, currency: draft.currency, today: today(), reserveMonthly });
    const fmt = (n: number) => formatMoney(n, draft.currency);
    const commonCharges = countryProfile(draft.country).commonCharges.map((id) => findSubcategory(id)).filter((x): x is NonNullable<typeof x> => !!x);
    const qTitle: Record<QuickStep, [TKey, TKey]> = { income: ['quick.ob.income.title', 'quick.ob.income.hint'], charges: ['quick.ob.charges.title', 'quick.ob.charges.hint'], result: ['quick.ob.result.title', 'quick.ob.result.hint'] };
    return (
      <Screen
        syncBanner={false}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button variant="secondary" icon="arrow-back" label={t('common.back')} onPress={() => setQuick((i) => (i ? i - 1 : null))} />
            <Button
              style={{ flex: 1 }}
              label={qStep === 'result' ? t('quick.ob.start') : t('common.continue')}
              loading={busy}
              onPress={() => {
                if (qStep !== 'result') return setQuick((i) => (i ?? 0) + 1);
                setDraft(quickDraft());
                finishQuick(quickDraft());
              }}
            />
          </View>
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Logo size={40} />
          <Text variant="caption" tone="subtle" style={{ flex: 1 }}>
            {t('quick.ob.step', { current: quick + 1, total: QUICK_STEPS.length })}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setQuick(null)} hitSlop={10} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }} disabled={busy}>
            <Text variant="small" weight="700" style={{ color: colors.primary }}>
              {t('quick.ob.full')}
            </Text>
          </Pressable>
        </View>
        <ProgressBar value={((quick + 1) / QUICK_STEPS.length) * 100} tone="success" />
        <Text variant="h1" style={{ marginTop: 20, marginBottom: 6 }} accessibilityRole="header">
          {t(qTitle[qStep][0])}
        </Text>
        <Text tone="muted" style={{ marginBottom: 16 }}>
          {t(qTitle[qStep][1])}
        </Text>
        {qStep === 'income' ? (
          <>
            <ChipGroup
              value={incomeKind}
              onChange={setIncomeKind}
              options={(['inc_salary', 'inc_business', 'inc_other'] as IncomeKind[]).map((k) => ({ value: k, label: t(`quick.ob.kind.${k}` as TKey) }))}
            />
            <AmountField label={t('fp.income.amount')} value={draft.monthlyIncome} onChange={(monthlyIncome) => setDraft({ ...draft, monthlyIncome })} currency={draft.currency} />
            <Field
              label={t('quick.ob.payDay')}
              value={draft.payDay ? String(draft.payDay) : ''}
              onChangeText={(s) => {
                const n = Number(s.replace(/\D/g, '').slice(0, 2));
                setDraft({ ...draft, payDay: n ? Math.min(31, n) : null });
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={2}
            />
          </>
        ) : null}
        {qStep === 'charges' ? (
          <>
            <ChipGroup
              multiple
              value={charges.map((c) => c.subcategoryId)}
              onChange={(id) =>
                setCharges((cur) => (cur.some((c) => c.subcategoryId === id) ? cur.filter((c) => c.subcategoryId !== id) : cur.length >= QUICK_MAX_CHARGES ? cur : [...cur, { subcategoryId: id, amount: null, day: null }]))
              }
              options={commonCharges.map((sc) => ({ value: sc.id, label: subcategoryLabel(sc, lang, draft.country) }))}
            />
            <Text variant="caption" tone="subtle" style={{ marginBottom: 10 }}>
              {t('quick.ob.charges.max', { count: QUICK_MAX_CHARGES })}
            </Text>
            {charges.map((c) => {
              const sc = findSubcategory(c.subcategoryId);
              const label = sc ? subcategoryLabel(sc, lang, draft.country) : c.subcategoryId;
              const patch = (p: Partial<QuickCharge>) => setCharges((cur) => cur.map((x) => (x.subcategoryId === c.subcategoryId ? { ...x, ...p } : x)));
              return (
                <Card key={c.subcategoryId} style={{ marginBottom: 10 }}>
                  <Text variant="bodyStrong" style={{ marginBottom: 6 }}>
                    {label}
                  </Text>
                  <AmountField label={t('fp.charges.amount', { name: label })} value={c.amount} onChange={(amount) => patch({ amount })} currency={draft.currency} />
                  <Field
                    label={t('quick.ob.chargeDay')}
                    value={c.day ? String(c.day) : ''}
                    onChangeText={(s) => {
                      const n = Number(s.replace(/\D/g, '').slice(0, 2));
                      patch({ day: n ? Math.min(31, n) : null });
                    }}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={2}
                  />
                </Card>
              );
            })}
            <Card style={{ marginTop: 6, gap: 6 }}>
              <Text variant="bodyStrong">🤝 {t('quick.reserve.title')}</Text>
              <Text variant="small" tone="muted">
                {t('quick.reserve.body')}
              </Text>
              <AmountField label={t('quick.reserve.monthly')} value={reserveMonthly} onChange={setReserveMonthly} currency={draft.currency} />
              {reserveMonthly && reserveMonthly > 0 ? (
                <Text variant="caption" tone="subtle">
                  {t('quick.reserve.ceilingNote', { months: QUICK_RESERVE_MONTHS, amount: fmt(reserveMonthly * QUICK_RESERVE_MONTHS) })}
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}
        {qStep === 'result' ? (
          <Card accessibilityLabel={t('quick.ob.result.title')}>
            {preview.status === 'ok' ? (
              <>
                <Text variant="h1" style={{ color: colors.primary }}>
                  {fmt(preview.perDay)}
                </Text>
                <Text variant="bodyStrong">{t('daily.perDay', { amount: fmt(preview.perDay), date: date(preview.until) })}</Text>
                <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>
                  {t('daily.detail', { income: fmt(preview.income), expenses: fmt(preview.expenses), upcoming: fmt(preview.upcomingRecurring + preview.goalsRemaining) })}
                </Text>
              </>
            ) : preview.status === 'deficit' ? (
              <Text variant="bodyStrong" tone="danger">
                {t('daily.deficit', { amount: fmt(preview.deficit) })}
              </Text>
            ) : (
              <Text variant="bodyStrong">{t('daily.needsIncome')}</Text>
            )}
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      syncBanner={false}
      footer={
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {index > 0 ? <Button variant="secondary" icon="arrow-back" label={t('common.back')} onPress={() => setIndex((i) => i - 1)} /> : null}
            <Button style={{ flex: 1 }} label={last ? t('fp.finish') : t('common.continue')} loading={busy} onPress={next} />
          </View>
          {!last && index > 0 ? <Button variant="ghost" full label={t('fp.skip')} onPress={() => setIndex((i) => i + 1)} /> : null}
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Logo size={40} />
        <Text variant="caption" tone="subtle" style={{ flex: 1 }}>
          {t('fp.step', { current: index + 1, total: STEP_IDS.length })}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={10} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }} disabled={busy}>
          <Text variant="small" weight="700" style={{ color: colors.primary }}>
            {t('fp.later')}
          </Text>
        </Pressable>
      </View>
      <ProgressBar value={((index + 1) / STEP_IDS.length) * 100} tone="success" />
      <Text variant="h1" style={{ marginTop: 20, marginBottom: 6 }} accessibilityRole="header">
        {t(title)}
      </Text>
      <Text tone="muted" style={{ marginBottom: 16 }}>
        {t(hint)}
      </Text>
      {step === 'country' ? (
        <Card style={{ marginBottom: 14, borderColor: colors.primary, borderWidth: 1 }}>
          <Text variant="bodyStrong">{t('quick.ob.offer.title')}</Text>
          <Text variant="small" tone="muted" style={{ marginVertical: 6 }}>
            {t('quick.ob.offer.body')}
          </Text>
          <Button small icon="flash-outline" label={t('quick.ob.offer.cta')} onPress={() => setQuick(0)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}
      {step === 'country' && askName ? <Field label={t('fp.name')} value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" maxLength={80} /> : null}
      {step === 'country' ? <CountryStep draft={draft} onChange={setDraft} currencyTouched={currencyTouched} onCurrencyTouched={() => setCurrencyTouched(true)} /> : null}
      {step === 'situation' ? <SituationStep draft={draft} onChange={setDraft} /> : null}
      {step === 'income' ? <IncomeStep draft={draft} onChange={setDraft} /> : null}
      {step === 'money' ? <MoneyStep draft={draft} onChange={setDraft} /> : null}
      {step === 'charges' ? <ChargesStep draft={draft} onChange={setDraft} /> : null}
      {step === 'goals' ? <GoalsStep draft={draft} onChange={setDraft} /> : null}
    </Screen>
  );
}
