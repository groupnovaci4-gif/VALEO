/**
 * Étapes du profil financier : utilisées à l'inscription (une par écran) et
 * dans Paramètres → Mon profil financier. Aucune étape n'est bloquante.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { AmountField, Card, Chip, ChipGroup, Field, Row, Stepper, SwitchRow, Text } from '@/components/ui';
import { COUNTRY_PROFILES, OTHER_COUNTRY, countryProfile, localAccountName, type Zone } from '@/core/countries';
import { CURRENCIES, type CurrencyCode } from '@/core/money';
import { ACCOUNT_TEMPLATES, INCOME_CATEGORIES } from '@/core/defaults';
import { findSubcategory, subcategoryLabel } from '@/core/catalog';
import { DEFAULT_GOAL_CATEGORIES } from '@/core/goalCategories';
import { isBankMethod, toggle, withCountry, withNoBank, type FinancialDraft } from '@/core/financialProfile';
import type { EmploymentStatus, FamilySituation, HousingStatus, IncomeNature } from '@/core/types';

export type StepProps = { draft: FinancialDraft; onChange: (d: FinancialDraft) => void };

function Label({ children }: { children: string }) {
  return (
    <Text variant="bodyStrong" style={{ marginTop: 6, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function Multi() {
  const { t } = useI18n();
  return (
    <Text variant="caption" tone="subtle" style={{ marginTop: -4, marginBottom: 8 }}>
      {t('fp.multi')}
    </Text>
  );
}

/** Nom affiché d'une source d'argent dans le pays de l'utilisateur. */
export function useAccountName() {
  const { t, lang } = useI18n();
  return (key: string, country: string) => localAccountName(key, country, lang) ?? t(key as TKey);
}

// ─── 1. Pays et devise ────────────────────────────────────────────────

export function CountryStep({ draft, onChange, currencyTouched, onCurrencyTouched }: StepProps & { currencyTouched: boolean; onCurrencyTouched: () => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (n: { fr: string; en: string }) => !q || n.fr.toLowerCase().includes(q) || n.en.toLowerCase().includes(q);
    const by = (z: Zone) => COUNTRY_PROFILES.filter((p) => p.zone === z && match(p.name));
    return [
      { zone: 'africa' as const, items: by('africa') },
      { zone: 'europe' as const, items: by('europe') },
      { zone: 'other' as const, items: match(OTHER_COUNTRY.name) ? [OTHER_COUNTRY] : [] },
    ].filter((g) => g.items.length);
  }, [query]);
  const suggested = countryProfile(draft.country).currency;
  const currencies = [suggested, ...(Object.keys(CURRENCIES) as CurrencyCode[]).filter((c) => c !== suggested)];
  return (
    <>
      <Field label={t('fp.country.search')} value={query} onChangeText={setQuery} autoCorrect={false} />
      {groups.map((g) => (
        <View key={g.zone}>
          <Label>{t(`fp.zone.${g.zone}`)}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {g.items.map((p) => (
              <Chip key={p.code} emoji={p.flag} label={p.name[lang]} selected={draft.country === p.code} onPress={() => onChange(withCountry(draft, p.code, currencyTouched))} />
            ))}
          </View>
        </View>
      ))}
      <Label>{t('fp.currency.title')}</Label>
      <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
        {t('fp.currency.hint')}
      </Text>
      <ChipGroup
        scroll
        value={draft.currency}
        onChange={(currency) => {
          onCurrencyTouched();
          onChange({ ...draft, currency });
        }}
        options={currencies.map((c) => ({ value: c, label: `${c} · ${CURRENCIES[c].name[lang]}` }))}
      />
    </>
  );
}

// ─── 2. Situation ─────────────────────────────────────────────────────

export function SituationStep({ draft, onChange }: StepProps) {
  const { t } = useI18n();
  const one = <T extends string>(cur: T | null, v: T): T | null => (cur === v ? null : v);
  return (
    <>
      <Label>{t('fp.family')}</Label>
      <ChipGroup
        options={(['single', 'couple', 'couple_children', 'single_parent', 'extended'] as FamilySituation[]).map((f) => ({ value: f, label: t(`fp.family.${f}` as TKey) }))}
        value={draft.familyStatus}
        onChange={(v) => onChange({ ...draft, familyStatus: one(draft.familyStatus, v) })}
      />
      <Card style={{ marginBottom: 14 }}>
        <Stepper label={t('fp.children')} value={draft.children} onChange={(children) => onChange({ ...draft, children })} />
        <Stepper label={t('fp.dependents')} value={draft.dependents} onChange={(dependents) => onChange({ ...draft, dependents })} />
      </Card>
      <Label>{t('fp.employment')}</Label>
      <ChipGroup
        options={(['employee', 'civil_servant', 'self_employed', 'trader', 'farmer', 'student', 'unemployed', 'retired', 'other'] as EmploymentStatus[]).map((e) => ({ value: e, label: t(`fp.employment.${e}` as TKey) }))}
        value={draft.employmentStatus}
        onChange={(v) => onChange({ ...draft, employmentStatus: one(draft.employmentStatus, v) })}
      />
      <Label>{t('fp.housing')}</Label>
      <ChipGroup
        options={(['tenant', 'owner', 'family', 'hosted', 'other'] as HousingStatus[]).map((h) => ({ value: h, label: t(`fp.housing.${h}` as TKey) }))}
        value={draft.housingStatus}
        onChange={(v) => onChange({ ...draft, housingStatus: one(draft.housingStatus, v) })}
      />
    </>
  );
}

// ─── 3. Revenus ───────────────────────────────────────────────────────

export function IncomeStep({ draft, onChange }: StepProps) {
  const { t } = useI18n();
  const country = countryProfile(draft.country);
  const sources = [...country.incomeSources, ...INCOME_CATEGORIES.map((c) => c.id).filter((id) => !country.incomeSources.includes(id))];
  const meta = new Map(INCOME_CATEGORIES.map((c) => [c.id, c]));
  return (
    <>
      <Label>{t('fp.income.nature')}</Label>
      <ChipGroup
        options={(['fixed', 'variable', 'irregular', 'none'] as IncomeNature[]).map((n) => ({ value: n, label: t(`fp.income.nature.${n}` as TKey) }))}
        value={draft.incomeNature}
        onChange={(v) => onChange({ ...draft, incomeNature: draft.incomeNature === v ? null : v })}
      />
      {draft.incomeNature === 'none' ? (
        <Text variant="small" tone="muted" style={{ marginBottom: 12 }}>
          {t('fp.income.noneHint')}
        </Text>
      ) : (
        <>
          <Label>{t('fp.income.sources')}</Label>
          <Multi />
          <ChipGroup
            multiple
            options={sources.filter((id) => meta.has(id)).map((id) => ({ value: id, label: t(meta.get(id)!.key as TKey), icon: meta.get(id)!.icon, color: meta.get(id)!.color }))}
            value={draft.incomeSources}
            onChange={(v) => onChange({ ...draft, incomeSources: toggle(draft.incomeSources, v) })}
          />
          <AmountField label={t('fp.income.amount')} hint={t('fp.income.amountHint')} value={draft.monthlyIncome} onChange={(monthlyIncome) => onChange({ ...draft, monthlyIncome })} currency={draft.currency} />
          {draft.incomeNature === 'fixed' ? (
            <Field
              label={t('fp.income.payDay')}
              value={draft.payDay ? String(draft.payDay) : ''}
              onChangeText={(s) => {
                const n = Number(s.replace(/\D/g, '').slice(0, 2));
                onChange({ ...draft, payDay: n ? Math.min(31, n) : null });
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={2}
            />
          ) : null}
        </>
      )}
    </>
  );
}

// ─── 4. Sources d'argent ──────────────────────────────────────────────

export function MoneyStep({ draft, onChange }: StepProps) {
  const { t } = useI18n();
  const name = useAccountName();
  const country = countryProfile(draft.country);
  const tpl = new Map(ACCOUNT_TEMPLATES.map((a) => [a.key, a]));
  const options = country.paymentMethods.filter((k) => tpl.has(k) && !(draft.noBankAccount && isBankMethod(k)));
  return (
    <>
      <Multi />
      <ChipGroup
        multiple
        options={options.map((k) => ({ value: k, label: name(k, draft.country), icon: tpl.get(k)!.icon, color: tpl.get(k)!.color }))}
        value={draft.paymentMethods}
        onChange={(v) => onChange({ ...draft, paymentMethods: toggle(draft.paymentMethods, v) })}
      />
      <Card style={{ marginBottom: 14 }}>
        <SwitchRow title={t('fp.money.noBank')} value={draft.noBankAccount} onChange={(v) => onChange(withNoBank(draft, v))} />
      </Card>
      {draft.paymentMethods.length === 0 ? (
        <Text variant="small" tone="muted" style={{ marginBottom: 12 }}>
          {t('fp.money.none')}
        </Text>
      ) : (
        draft.paymentMethods.map((k) => (
          <AmountField
            key={k}
            label={t('fp.money.balance', { name: name(k, draft.country) })}
            value={draft.balances[k] ?? null}
            onChange={(v) => onChange({ ...draft, balances: { ...draft.balances, [k]: v } })}
            currency={draft.currency}
          />
        ))
      )}
    </>
  );
}

// ─── 5. Charges principales ───────────────────────────────────────────

export function ChargesStep({ draft, onChange }: StepProps) {
  const { t, lang } = useI18n();
  const country = countryProfile(draft.country);
  const items = country.commonCharges.map((id) => findSubcategory(id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <Multi />
      <Card padded={false} style={{ paddingHorizontal: 14, marginBottom: 14 }}>
        {items.map((sc) => {
          const on = sc.id in draft.charges;
          const label = subcategoryLabel(sc, lang, draft.country);
          return (
            <View key={sc.id}>
              <SwitchRow
                title={label}
                value={on}
                onChange={(v) => {
                  const charges = { ...draft.charges };
                  if (v) charges[sc.id] = null;
                  else delete charges[sc.id];
                  onChange({ ...draft, charges });
                }}
              />
              {on ? (
                <AmountField
                  label={t('fp.charges.amount', { name: label })}
                  value={draft.charges[sc.id] ?? null}
                  onChange={(v) => onChange({ ...draft, charges: { ...draft.charges, [sc.id]: v } })}
                  currency={draft.currency}
                />
              ) : null}
            </View>
          );
        })}
      </Card>
    </>
  );
}

// ─── 6. Projets ───────────────────────────────────────────────────────

export function GoalsStep({ draft, onChange }: StepProps) {
  const { t, lang } = useI18n();
  const [all, setAll] = useState(false);
  const templates = DEFAULT_GOAL_CATEGORIES.flatMap((c) => c.templates);
  const featured = countryProfile(draft.country).featuredGoals;
  const shown = all ? [...featured.map((id) => templates.find((x) => x.id === id)!).filter(Boolean), ...templates.filter((x) => !featured.includes(x.id))] : featured.map((id) => templates.find((x) => x.id === id)!).filter(Boolean);
  return (
    <>
      <Multi />
      <ChipGroup multiple options={shown.map((tpl) => ({ value: tpl.id, label: tpl.label[lang], emoji: tpl.icon }))} value={draft.goals} onChange={(v) => onChange({ ...draft, goals: toggle(draft.goals, v) })} />
      <Row title={all ? t('fp.goals.less') : t('fp.goals.more')} chevron onPress={() => setAll((a) => !a)} />
      <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
        {t('fp.goals.later')}
      </Text>
    </>
  );
}

export const STEP_IDS = ['country', 'situation', 'income', 'money', 'charges', 'goals'] as const;
export type StepId = (typeof STEP_IDS)[number];
