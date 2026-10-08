/**
 * Créer / modifier une catégorie (1.8) : nom, emoji ou icône, couleur,
 * catégorie parente, type de dépense (budget automatique), mots de la saisie
 * vocale (« quand je dis… »), mots appris (effaçables). Pour une catégorie
 * existante : désactiver / réactiver, supprimer (selon son cas : suppression,
 * masquage ou fusion), rétablir par défaut. Même feuille depuis l'écran
 * Catégories, la carte de confirmation et le formulaire de saisie.
 */
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useI18n, type TKey } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { Button, Chip, ChipGroup, Field, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { pickableColors } from '@/theme';
import { canRestore, categoryUsage, cleanKeywords, deleteMode, planMerge } from '@/core/categoryOps';
import { useCategoryCatalog } from '@/services/categoryCatalog';
import type { Category, SpendKind } from '@/core/types';

const ICONS = ['pricetag', 'cart', 'gift', 'paw', 'construct', 'barbell', 'bus', 'cafe', 'beer', 'book', 'briefcase', 'flower', 'hammer', 'medkit'];
const EMOJIS = ['🛒', '🍲', '🚌', '🏍️', '💊', '📚', '👶', '🎁', '🙏', '⛪', '🕌', '💇', '🔧', '🐐', '🌾', '📦'];
const SPEND: SpendKind[] = ['need', 'want', 'obligation', 'debt'];

export interface CategoryEditTarget {
  /** Catégorie modifiée, ou création. */
  id: string | 'new';
  kind: 'income' | 'expense';
  /** Création d'une sous-catégorie sous ce parent. */
  parentId?: string | null;
}

export function CategoryEditSheet({ target, onClose, onSaved }: { target: CategoryEditTarget | null; onClose: () => void; onSaved?: (c: Category) => void }) {
  const { t } = useI18n();
  return (
    <Sheet visible={target !== null} onClose={onClose} title={target?.id === 'new' ? t('cat.createMine') : t('common.edit')}>
      {target ? <Body key={`${target.id}_${target.parentId ?? ''}`} target={target} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function Body({ target, onClose, onSaved }: { target: CategoryEditTarget; onClose: () => void; onSaved?: (c: Category) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const run = useRunAction();
  const cats = useCategoryLabels();
  const catalog = useCategoryCatalog();
  const existing = target.id === 'new' ? undefined : data.categories.find((c) => c.id === target.id && !c.deleted);
  const kind = existing?.kind ?? target.kind;
  const [name, setName] = useState(existing ? cats.label(existing, existing.id) : '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0]);
  const [color, setColor] = useState(existing?.color ?? pickableColors[0]);
  const [parentId, setParentId] = useState<string | null>(existing ? (existing.parentId ?? null) : (target.parentId ?? null));
  const [spendKind, setSpendKind] = useState<SpendKind>(existing?.spendKind ?? 'need');
  const [keywords, setKeywords] = useState((existing?.keywords ?? []).join(', '));
  const [merging, setMerging] = useState(false);
  const [mergeTo, setMergeTo] = useState<string | null>(null);
  // Une catégorie principale qui a des sous-catégories ne devient pas sous-catégorie (un seul niveau).
  const hasChildren = !!existing && data.categories.some((c) => c.parentId === existing.id && !c.deleted);
  const canHaveParent = kind === 'expense' && !hasChildren && !(existing?.system && !existing.parentId);
  const parents = cats.list('expense').filter((p) => p.id !== existing?.id);

  const save = () => {
    const label = name.trim();
    if (!label) return toast.show(t('error.name.required'), 'error');
    // Nom inchangé d'une catégorie système : on garde le libellé traduit (pas de nom figé).
    const unchanged = !!existing?.labelKey && label === cats.label({ ...existing, name: '' }, existing.id);
    let saved: Category | undefined;
    const ok = run(() => {
      saved = actions.saveCategory({
        ...(existing ?? {}),
        id: existing?.id,
        kind,
        name: unchanged ? '' : label,
        icon,
        color,
        ...(emoji.trim() ? { emoji: emoji.trim() } : { emoji: undefined }),
        order: existing?.order ?? data.categories.filter((c) => c.kind === kind).length,
        system: existing?.system,
        labelKey: existing?.labelKey,
        parentId: canHaveParent ? parentId : (existing?.parentId ?? null),
        ...(kind === 'expense' ? { spendKind } : {}),
        keywords: cleanKeywords(keywords),
      });
    });
    if (!ok || !saved) return;
    toast.show(t('common.saved'));
    onSaved?.(saved);
    onClose();
  };

  const usage = useMemo(() => (existing ? categoryUsage(existing.id, data) : null), [existing, data]);
  const remove = () => {
    if (!existing) return;
    const mode = deleteMode(existing, data);
    const label = cats.label(existing, existing.id);
    if (mode === 'merge_or_disable') {
      Alert.alert(t('cat.delete.confirm', { name: label }), t('cat.delete.inUse', { name: label, count: usage?.transactions ?? 0 }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('cat.merge.disableInstead'), onPress: () => run(() => actions.setCategoryDisabled(existing.id, true)) && (toast.show(t('common.saved')), onClose()) },
        { text: t('cat.merge.title'), onPress: () => setMerging(true) },
      ]);
      return;
    }
    Alert.alert(t('cat.delete.confirm', { name: label }), mode === 'hide' ? t('cat.delete.system') : t('cat.delete.unused'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (run(() => actions.deleteCategory(existing.id))) {
            toast.show(mode === 'hide' ? t('cat.hidden') : t('common.deleted'));
            onClose();
          }
        },
      },
    ]);
  };

  if (existing && merging) {
    const options = data.categories.filter((c) => !c.deleted && c.kind === existing.kind && c.id !== existing.id && c.parentId !== existing.id && c.disabled !== true);
    const plan = mergeTo ? planMerge(existing.id, mergeTo, data) : null;
    return (
      <View>
        <Text variant="bodyStrong" style={{ marginBottom: 8 }}>
          {t('cat.merge.title')}
        </Text>
        <ChipGroup scroll value={mergeTo} onChange={setMergeTo} options={options.map((c) => ({ value: c.id, label: c.parentId ? `${cats.byId(c.parentId)} › ${cats.byId(c.id)}` : cats.byId(c.id) }))} />
        {plan ? (
          <Text variant="small" style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
            {t('cat.merge.preview', { count: plan.transactions.length, recurring: plan.recurring.length, envelopes: plan.envelopes.length, to: cats.byId(mergeTo!) })}
          </Text>
        ) : null}
        <Button
          full
          label={t('cat.merge.confirm')}
          disabled={!plan}
          onPress={() => {
            if (!mergeTo) return;
            if (run(() => actions.mergeCategories(existing.id, mergeTo))) {
              toast.show(t('cat.merge.done'));
              onClose();
            }
          }}
        />
        <Button full variant="ghost" label={t('common.cancel')} onPress={() => setMerging(false)} />
      </View>
    );
  }

  return (
    <View>
      <Field label={t('common.name')} value={name} onChangeText={setName} maxLength={60} />
      <Field label={t('cat.emoji')} hint={t('cat.emojiHint')} value={emoji} onChangeText={(v) => setEmoji(v.slice(0, 8))} maxLength={8} />
      <ChipGroup scroll value={emoji} onChange={(v) => setEmoji(emoji === v ? '' : v)} options={EMOJIS.map((e) => ({ value: e, label: '', emoji: e, a11yLabel: `${t('cat.emoji')} ${e}` }))} />
      {!emoji ? <ChipGroup scroll value={icon} onChange={setIcon} options={ICONS.map((i) => ({ value: i, label: '', icon: i, a11yLabel: `${t('common.icon')} ${i}` }))} /> : null}
      <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c, i) => ({ value: c, label: ' ', icon: 'ellipse', color: c, a11yLabel: `${t('acc.color')} ${i + 1}` }))} />
      {canHaveParent ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('cat.parent')}
          </Text>
          <ChipGroup scroll value={parentId} onChange={(v) => setParentId(parentId === v ? null : v)} options={parents.map((p) => ({ value: p.id, label: p.name, icon: p.icon, emoji: p.emoji, color: p.color }))} />
        </>
      ) : null}
      {kind === 'expense' ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
            {t('cat.spendKind')}
          </Text>
          <Segmented value={spendKind} onChange={setSpendKind} options={SPEND.map((k) => ({ value: k, label: t(`cat.spend.${k}` as TKey) }))} />
          <View style={{ height: 14 }} />
        </>
      ) : null}
      <Field label={t('cat.keywords')} hint={t('cat.keywordsHint')} value={keywords} onChangeText={setKeywords} maxLength={400} autoCapitalize="none" />
      {existing?.learnedWords?.length ? (
        <View style={{ marginBottom: 14, gap: 6 }}>
          <Text variant="small" weight="600">
            {t('cat.learned')}
          </Text>
          <Text variant="caption" tone="subtle">
            {t('cat.learnedHint')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {existing.learnedWords.map((w) => (
              <Chip
                key={w}
                label={`${w} ✕`}
                a11yLabel={t('cat.learned.remove', { word: w })}
                onPress={() => run(() => actions.saveCategory({ ...existing, learnedWords: (existing.learnedWords ?? []).filter((x) => x !== w) })) && toast.show(t('common.saved'))}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Button full label={t('common.save')} onPress={save} />
      {existing ? (
        <View style={{ gap: 4, marginTop: 6 }}>
          {existing.disabled === true ? (
            <Button full variant="secondary" icon="eye-outline" label={t('cat.enable')} onPress={() => run(() => actions.setCategoryDisabled(existing.id, false)) && (toast.show(t('common.saved')), onClose())} />
          ) : (
            <Button full variant="secondary" icon="eye-off-outline" label={t('cat.disable')} onPress={() => run(() => actions.setCategoryDisabled(existing.id, true)) && (toast.show(t('common.saved')), onClose())} />
          )}
          {canRestore(existing, catalog) ? <Button full variant="ghost" icon="refresh" label={t('cat.restore')} onPress={() => run(() => actions.restoreCategory(existing.id)) && (toast.show(t('cat.restored')), onClose())} /> : null}
          <Button full variant="ghost" icon="trash-outline" label={t('common.delete')} onPress={remove} />
        </View>
      ) : null}
    </View>
  );
}
