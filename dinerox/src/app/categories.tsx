/**
 * Catégories (1.8) : tout est modifiable par l'utilisateur.
 *  - « Créer ma catégorie » ou une sous-catégorie (nom, emoji, parent, type de
 *    dépense, mots de la saisie vocale) ;
 *  - modifier, désactiver / réactiver, supprimer (jamais utilisée → supprimée ;
 *    utilisée → fusion ou désactivation ; système → masquée), rétablir par défaut ;
 *  - réordonner (glisser-déposer, ou flèches) ;
 *  - bibliothèque « Ajouter une catégorie du catalogue » ;
 *  - carte « Nouvelles catégories disponibles » (utilisateurs existants).
 */
import React, { useMemo, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { Button, Card, Icon, IconCircle, Row, Screen, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { useTheme } from '@/theme';
import { useRunAction } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';
import { CatalogUpdateCard } from '@/features/categories/CatalogUpdateCard';
import { CategoryEditSheet, type CategoryEditTarget } from '@/features/categories/CategoryEditSheet';
import { catalogEntry, maskedByProfile, shownByDefault, usedCategoryIds } from '@/core/categoryCatalog';
import { libraryItems, reorder } from '@/core/categoryOps';
import { zoneOf } from '@/core/countries';
import { can } from '@/core/permissions';
import { useCategoryCatalog } from '@/services/categoryCatalog';
import type { Category } from '@/core/types';

const ROW = 56;

function Categories() {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const run = useRunAction();
  const cats = useCategoryLabels();
  const catalog = useCategoryCatalog();
  const { profile, role, user } = useApp();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<CategoryEditTarget | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [library, setLibrary] = useState(false);
  const [now] = useState(() => Date.now());
  const editable = can(role, 'update', 'categories');
  const used = useMemo(() => usedCategoryIds(data), [data]);
  const spaceOnCatalog = useMemo(() => data.categories.some((c) => (c.catalogVersion ?? 0) >= 2), [data.categories]);
  const parents = useMemo(() => data.categories.filter((c) => !c.deleted && c.kind === kind && !c.parentId).sort((a, b) => a.order - b.order), [data.categories, kind]);
  const childrenOf = (id: string) => data.categories.filter((c) => !c.deleted && c.parentId === id).sort((a, b) => a.order - b.order);
  const country = profile?.country ?? null;
  const items = library ? libraryItems(data.categories, { country, zone: country ? zoneOf(country) : null, lang: lang === 'en' ? 'en' : 'fr', now, uid: user?.uid ?? '' }, catalog) : [];

  /** État affiché sous le nom (désactivée, masquée par le profil, ancienne non utilisée). */
  const state = (c: Category): string | undefined => {
    if (c.disabled === true) return t('cat.state.disabled');
    if (c.disabled === false) return undefined;
    if (maskedByProfile(catalogEntry(c.id, catalog), profile?.financial)) return t('cat.state.masked');
    if (!shownByDefault(c, { profile: profile?.financial, spaceOnCatalog, used }, catalog)) return t('cat.state.legacy');
    return c.fixed ? t('cat.fixed') : undefined;
  };
  const move = (list: Category[], c: Category, to: number) => run(() => actions.reorderCategories(reorder(list, c.id, to)));

  return (
    <Screen back title={t('cat.title')}>
      <CatalogUpdateCard />
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: t('cat.expense') }, { value: 'income', label: t('cat.incomeTab') }]} />
      {editable ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button small variant={ordering ? 'primary' : 'ghost'} icon={ordering ? 'checkmark' : 'swap-vertical'} label={ordering ? t('cat.reorderDone') : t('cat.reorder')} onPress={() => setOrdering(!ordering)} />
        </View>
      ) : null}
      {ordering ? (
        <>
          <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
            {t('cat.reorderHint')}
          </Text>
          <Card padded={false}>
            {parents.map((c, i) => (
              <React.Fragment key={c.id}>
                <DragRow name={cats.label(c, c.id)} meta={cats.meta(c.id)} index={i} count={parents.length} onMove={(to) => move(parents, c, to)} />
                {childrenOf(c.id).map((sc, j, list) => (
                  <View key={sc.id} style={{ paddingLeft: 40 }}>
                    <DragRow name={cats.label(sc, sc.id)} index={j} count={list.length} onMove={(to) => move(list, sc, to)} small />
                  </View>
                ))}
              </React.Fragment>
            ))}
          </Card>
        </>
      ) : (
        <Card>
          {parents.map((c) => {
            const m = cats.meta(c.id);
            return (
              <React.Fragment key={c.id}>
                <Row title={m.name} subtitle={state(c)} left={<IconCircle icon={m.icon} emoji={m.emoji} color={m.color} size={36} />} chevron={editable} onPress={editable ? () => setEditing({ id: c.id, kind }) : undefined} />
                {childrenOf(c.id).map((sc) => (
                  <View key={sc.id} style={{ paddingLeft: 48 }}>
                    <Row title={cats.label(sc, sc.id)} subtitle={state(sc)} chevron={editable} onPress={editable ? () => setEditing({ id: sc.id, kind }) : undefined} />
                  </View>
                ))}
                {kind === 'expense' && editable ? (
                  <View style={{ paddingLeft: 48 }}>
                    <Row title={t('cat.newSub')} left={<Icon name="add" size={18} color={colors.primary} />} onPress={() => setEditing({ id: 'new', kind, parentId: c.id })} />
                  </View>
                ) : null}
              </React.Fragment>
            );
          })}
        </Card>
      )}
      {editable ? (
        <View style={{ gap: 8, marginTop: 14 }}>
          <Button icon="add" label={`➕ ${t('cat.createMine')}`} onPress={() => setEditing({ id: 'new', kind })} />
          {kind === 'expense' ? <Button variant="secondary" icon="library-outline" label={t('cat.library')} onPress={() => setLibrary(true)} /> : null}
        </View>
      ) : null}
      <CategoryEditSheet target={editing} onClose={() => setEditing(null)} />
      <Sheet visible={library} onClose={() => setLibrary(false)} title={t('cat.library')}>
        {items.length ? (
          items.map((it) => (
            <Row
              key={it.id}
              title={it.parentId ? `${cats.byId(it.parentId)} › ${it.label || cats.label(it.doc, it.id)}` : it.label || cats.label(it.doc, it.id)}
              left={<Icon name="add-circle-outline" size={20} color={colors.primary} />}
              onPress={() => run(() => actions.saveCategory(it.doc)) && toast.show(t('cat.library.added'))}
            />
          ))
        ) : (
          <Text variant="small" tone="muted">
            {t('cat.library.empty')}
          </Text>
        )}
      </Sheet>
    </Screen>
  );
}

/** Ligne déplaçable : glisser la poignée ≡ (PanResponder) ou utiliser les flèches (accessibilité). */
function DragRow({ name, meta, index, count, onMove, small }: { name: string; meta?: { icon: string; emoji?: string; color: string }; index: number; count: number; onMove: (to: number) => void; small?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [dy, setDy] = useState(0);
  // Recréé seulement si la position ou l'action changent (jamais pendant un glissement :
  // l'état local `dy` ne change pas les propriétés reçues).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, g) => setDy(g.dy),
        onPanResponderRelease: (_e, g) => {
          setDy(0);
          const steps = Math.round(g.dy / ROW);
          if (steps) onMove(index + steps);
        },
        onPanResponderTerminate: () => setDy(0),
      }),
    [index, onMove],
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: small ? 44 : ROW, paddingHorizontal: 12, gap: 10, transform: [{ translateY: dy }], backgroundColor: dy ? colors.surfaceAlt : 'transparent' }}>
      <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel={t('cat.drag', { name })} style={{ padding: 6 }}>
        <Icon name="reorder-three" size={22} color={colors.textMuted} />
      </View>
      {meta ? <IconCircle icon={meta.icon} emoji={meta.emoji} color={meta.color} size={30} /> : null}
      <Text variant={small ? 'small' : 'body'} style={{ flex: 1 }} numberOfLines={1}>
        {name}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('cat.moveUp', { name })} disabled={index === 0} onPress={() => onMove(index - 1)} hitSlop={6} style={{ padding: 6, opacity: index === 0 ? 0.3 : 1 }}>
        <Icon name="chevron-up" size={18} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('cat.moveDown', { name })} disabled={index === count - 1} onPress={() => onMove(index + 1)} hitSlop={6} style={{ padding: 6, opacity: index === count - 1 ? 0.3 : 1 }}>
        <Icon name="chevron-down" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

export default withSpaceReady(Categories);
