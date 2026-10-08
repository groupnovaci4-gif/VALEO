/**
 * Liste de choix d'une catégorie (1.8), commune au formulaire de saisie, à la
 * carte de confirmation et aux récurrences : recherche, catégories récentes en
 * premier, catégories masquées par défaut accessibles via « Afficher toutes
 * les catégories », et « Nouvelle catégorie… » toujours visible en bas.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { useCategoryLabels } from '@/hooks/useFinance';
import { Chip, ChipGroup, Field, Text } from '@/components/ui';
import { pickCategories, pickSubcategories } from '@/core/categoryOps';
import { usedCategoryIds } from '@/core/categoryCatalog';
import { can } from '@/core/permissions';
import { useEntryStats } from '@/features/entry/useEntryStats';
import { CategoryEditSheet, type CategoryEditTarget } from './CategoryEditSheet';

/** Contexte commun des listes de choix (récents, catégories qui servent, profil). */
export function useCategoryPick(kind: 'income' | 'expense') {
  const data = useData();
  const { profile } = useApp();
  const cats = useCategoryLabels();
  const stats = useEntryStats();
  const used = useMemo(() => usedCategoryIds(data), [data]);
  const spaceOnCatalog = useMemo(() => data.categories.some((c) => (c.catalogVersion ?? 0) >= 2), [data.categories]);
  return {
    categories: data.categories,
    base: { label: cats.byId, used, spaceOnCatalog, profile: profile?.financial ?? null },
    recent: stats?.recent[kind] ?? [],
    cats,
  };
}

export function CategoryPicker({
  kind,
  value,
  onChange,
  subValue,
  onSubChange,
  scroll,
  allowCreate = true,
}: {
  kind: 'income' | 'expense';
  value: string | null;
  onChange: (id: string) => void;
  subValue?: string | null;
  onSubChange?: (id: string | null) => void;
  scroll?: boolean;
  allowCreate?: boolean;
}) {
  const { t } = useI18n();
  const { role } = useApp();
  const { categories, base, recent, cats } = useCategoryPick(kind);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState<CategoryEditTarget | null>(null);
  const opts = { ...base, kind, showAll, query, recent, keep: value };
  const list = pickCategories(categories, opts);
  const hiddenCount = pickCategories(categories, { ...opts, showAll: true, query: '' }).length - pickCategories(categories, { ...opts, query: '' }).length;
  const subs = value && onSubChange ? pickSubcategories(categories, value, { ...base, showAll, query: '', keep: subValue ?? null }) : [];
  const canCreate = allowCreate && can(role, 'create', 'categories');
  return (
    <View>
      <Field label={t('cat.search')} value={query} onChangeText={setQuery} maxLength={40} autoCapitalize="none" />
      {list.length ? (
        <ChipGroup
          scroll={scroll}
          options={list.map((c) => {
            const m = cats.meta(c.id);
            return { value: c.id, label: m.name, icon: m.icon, emoji: m.emoji, color: m.color };
          })}
          value={value}
          onChange={onChange}
        />
      ) : (
        <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
          {t('cat.noMatch')}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {hiddenCount > 0 || showAll ? <Chip label={showAll ? t('cat.showLess') : t('cat.showAll')} icon={showAll ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowAll(!showAll)} /> : null}
        {canCreate ? <Chip label={t('cat.newEllipsis')} icon="add" onPress={() => setCreating({ id: 'new', kind })} /> : null}
      </View>
      {subs.length ? (
        <>
          <Text variant="small" weight="600" style={{ marginBottom: 8 }}>
            {t('tx.subcategory')}
          </Text>
          <ChipGroup scroll options={subs.map((c) => ({ value: c.id, label: cats.byId(c.id) }))} value={subValue ?? null} onChange={(v) => onSubChange?.(subValue === v ? null : v)} />
        </>
      ) : null}
      <CategoryEditSheet
        target={creating}
        onClose={() => setCreating(null)}
        onSaved={(c) => {
          // Nouvelle sous-catégorie : sa catégorie principale est choisie avec elle.
          const parent = c.parentId ?? null;
          if (parent && onSubChange) {
            onChange(parent);
            onSubChange(c.id);
          } else onChange(parent ?? c.id);
        }}
      />
    </View>
  );
}
