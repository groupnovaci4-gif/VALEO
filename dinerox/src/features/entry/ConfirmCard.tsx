/**
 * Carte de confirmation (obligatoire avant tout enregistrement d'une saisie
 * vocale ou en phrase) : une ligne par opération comprise, chaque champ
 * modifiable d'un toucher ; un champ incertain est SURLIGNÉ, jamais deviné en
 * silence ; sans montant, l'enregistrement est impossible.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useCategoryLabels, useFinance, useMoney } from '@/hooks/useFinance';
import { ReserveUseToggle } from '@/features/reserve/ReserveUseToggle';
import { reserveBalance } from '@/core/reserve';
import { buildSchedule } from '@/core/tontine';
import { AmountField, Button, Chip, ChipGroup, DateField, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { EntryDraft, EntryField } from '@/core/entry/parse';
import type { Account } from '@/core/types';
import type { CurrencyCode } from '@/core/money';
import { CategoryPicker } from '@/features/categories/CategoryPicker';

type Editing = { index: number; field: EntryField | 'date' | 'savingsTo' } | null;

export function ConfirmCard({
  drafts,
  onChange,
  onValidate,
  onCorrect,
  onCancel,
  accounts,
  currency,
  busy,
}: {
  drafts: EntryDraft[];
  onChange: (next: EntryDraft[]) => void;
  onValidate: () => void;
  onCorrect: () => void;
  onCancel: () => void;
  accounts: Account[];
  currency: CurrencyCode;
  busy?: boolean;
}) {
  const { t, date } = useI18n();
  const { colors, radius } = useTheme();
  const money = useMoney();
  const cats = useCategoryLabels();
  const [editing, setEditing] = useState<Editing>(null);
  const missingAmount = drafts.some((d) => !d.amount || d.amount <= 0);
  // Versement d'épargne : le compte d'épargne visé doit être choisi (jamais deviné).
  const missingSavings = drafts.some((d) => d.type === 'savings' && !d.savings?.savingsAccountId);
  const { data } = useFinance();
  // Plusieurs lignes sur la même réserve : chacune voit le solde laissé par les précédentes.
  const taken: Record<string, number> = {};
  const takenBefore = drafts.map((d) => {
    const prev = d.reserveId ? (taken[d.reserveId] ?? 0) : 0;
    const g = d.reserveId ? data.goals.find((x) => x.id === d.reserveId) : undefined;
    if (g && d.reserveId && d.amount) taken[d.reserveId] = prev + Math.min(d.amount, Math.max(0, reserveBalance(g, data.goalContributions) - prev));
    return prev;
  });

  /** Modification d'un champ : il est alors confirmé (n'est plus surligné). */
  const patch = (i: number, p: Partial<EntryDraft>, confirmed: EntryField[]) =>
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...p, uncertain: d.uncertain.filter((f) => !confirmed.includes(f)) } : d)));

  return (
    <View accessibilityLabel={t('entry.confirm.title')}>
      <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
        {drafts.length > 1 ? t('entry.confirm.many', { count: drafts.length }) : t('entry.confirm.one')}
      </Text>
      <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
        {t('entry.confirm.hint')}
      </Text>
      {drafts.map((d, i) => {
        const unsure = (f: EntryField) => d.uncertain.includes(f);
        const meta = cats.meta(d.categoryId);
        const acc = accounts.find((a) => a.id === d.accountId);
        const savingsTo = d.type === 'savings' ? accounts.find((a) => a.id === d.savings?.savingsAccountId) : undefined;
        const field = (f: EntryField | 'date' | 'savingsTo', label: string, value: string, icon?: string) => {
          const hl = f === 'savingsTo' ? !savingsTo : f !== 'date' && unsure(f);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label} : ${value}${hl ? `, ${t('entry.confirm.toCheck')}` : ''}`}
              onPress={() => setEditing(editing?.index === i && editing.field === f ? null : { index: i, field: f })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 40,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: hl ? colors.warning : colors.border,
                backgroundColor: hl ? colors.warningBg : colors.surface,
              }}
            >
              {icon ? <Icon name={icon} size={16} color={hl ? colors.warning : colors.textMuted} /> : null}
              <Text variant="small" weight={hl ? '700' : '600'} style={{ color: hl ? colors.warning : colors.text }}>
                {value}
              </Text>
            </Pressable>
          );
        };
        return (
          <View key={i} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 10, marginBottom: 8, gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {field('type', t('entry.field.type'), d.type === 'expense' ? t('entry.type.expense') : d.type === 'savings' ? t('entry.type.savings') : t('entry.type.income'), d.type === 'expense' ? 'arrow-up' : d.type === 'savings' ? 'shield-checkmark-outline' : 'arrow-down')}
              {field('amount', t('entry.field.amount'), d.amount ? money(d.amount) : t('entry.confirm.amountMissing'), 'cash-outline')}
              {d.type === 'savings'
                ? field('savingsTo', t('entry.field.savingsTo'), savingsTo?.name ?? t('entry.confirm.savingsMissing'), 'shield-checkmark-outline')
                : field('category', t('entry.field.category'), d.categoryId ? cats.byId(d.subcategoryId ?? d.categoryId) : t('entry.confirm.categoryMissing'), meta.icon)}
              {field('account', d.type === 'savings' ? t('entry.field.savingsFrom') : t('entry.field.account'), acc?.name ?? t('entry.confirm.accountAuto'), acc?.icon ?? 'wallet-outline')}
              {field('date', t('entry.field.date'), date(d.date), 'calendar-outline')}
            </View>
            {d.tontine
              ? (() => {
                  const tt = data.tontines.find((x) => x.id === d.tontine?.id);
                  const item = tt ? buildSchedule(tt, { until: d.date > tt.startDate ? d.date : undefined }).find((x) => x.period === d.tontine?.period) : undefined;
                  if (!tt) return null;
                  const line = d.tontine.kind === 'payout' ? t('entry.tontine.payout', { name: tt.name, turn: item?.turn ?? d.tontine.period }) : t('entry.tontine.contribution', { name: tt.name, date: item ? date(item.date) : '' });
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} accessibilityLabel={line}>
                      <Icon name="people" size={16} color={colors.primary} />
                      <Text variant="small" weight="600" style={{ flexShrink: 1 }}>
                        {line}
                      </Text>
                      <Chip label={t('entry.tontine.unlink')} onPress={() => patch(i, { tontine: null }, [])} />
                    </View>
                  );
                })()
              : null}
            <ReserveUseToggle type={d.type === 'savings' ? 'income' : d.type} categoryId={d.categoryId} amount={d.amount} value={d.reserveId ?? null} alreadyTaken={takenBefore[i]} onChange={(reserveId) => patch(i, { reserveId }, [])} />
            {d.uncertain.length ? (
              <Text variant="caption" tone="warning">
                {t('entry.confirm.check', { fields: d.uncertain.map((f) => t(`entry.field.${f}`)).join(', ') })}
              </Text>
            ) : null}
            {editing?.index === i && editing.field === 'type' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['expense', 'income'] as const).map((ty) => (
                  <Chip key={ty} label={ty === 'expense' ? t('entry.type.expense') : t('entry.type.income')} selected={d.type === ty} onPress={() => (patch(i, { type: ty, savings: null, ...(ty !== d.type ? { categoryId: null, subcategoryId: null } : {}) }, ['type']), setEditing(null))} />
                ))}
              </View>
            ) : null}
            {editing?.index === i && editing.field === 'amount' ? <AmountField label={t('entry.field.amount')} value={d.amount} onChange={(amount) => patch(i, { amount }, amount && amount > 0 ? ['amount'] : [])} currency={currency} autoFocus /> : null}
            {editing?.index === i && editing.field === 'savingsTo' ? (
              <ChipGroup
                scroll
                value={d.savings?.savingsAccountId ?? null}
                onChange={(savingsAccountId) => (patch(i, { savings: { savingsAccountId, goalId: d.savings?.goalId ?? null } }, ['account']), setEditing(null))}
                options={accounts.filter((a) => a.isSavings).map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))}
              />
            ) : null}
            {editing?.index === i && editing.field === 'category' && d.type !== 'savings' ? (
              <CategoryPicker
                scroll
                kind={d.type}
                value={d.categoryId}
                subValue={d.subcategoryId}
                onChange={(categoryId) => {
                  patch(i, { categoryId, subcategoryId: null }, ['category', 'type']);
                  // Pas de sous-catégorie à préciser : la ligne se referme.
                  if (!data.categories.some((c) => c.parentId === categoryId && !c.deleted && c.disabled !== true)) setEditing(null);
                }}
                onSubChange={(subcategoryId) => (patch(i, { subcategoryId }, ['category', 'type']), setEditing(null))}
              />
            ) : null}
            {editing?.index === i && editing.field === 'account' ? (
              <ChipGroup scroll value={d.accountId} onChange={(accountId) => (patch(i, { accountId }, ['account']), setEditing(null))} options={accounts.map((a) => ({ value: a.id, label: a.name, icon: a.icon, color: a.color }))} />
            ) : null}
            {editing?.index === i && editing.field === 'date' ? <DateField label={t('entry.field.date')} value={d.date} onChange={(v) => v && (patch(i, { date: v }, []), setEditing(null))} /> : null}
            {drafts.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('entry.confirm.removeLine')} onPress={() => onChange(drafts.filter((_, j) => j !== i))} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                <Text variant="caption" tone="danger" weight="600">
                  {t('entry.confirm.removeLine')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {missingSavings ? (
        <Text variant="small" tone="danger" style={{ marginBottom: 8 }} accessibilityRole="alert">
          {t('entry.confirm.needSavings')}
        </Text>
      ) : null}
      {missingAmount ? (
        <Text variant="small" tone="danger" style={{ marginBottom: 8 }} accessibilityRole="alert">
          {t('entry.confirm.needAmount')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="checkmark" label={t('entry.confirm.validate')} onPress={onValidate} disabled={missingAmount || missingSavings || !drafts.length || busy} loading={busy} style={{ flexGrow: 1 }} />
        <Button variant="secondary" label={t('entry.confirm.correct')} onPress={onCorrect} />
        <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}
