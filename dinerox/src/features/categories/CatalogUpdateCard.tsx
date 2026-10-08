/**
 * « Nouvelles catégories disponibles » (1.8) : carte discrète proposée aux
 * utilisateurs EXISTANTS des pays du catalogue. Rien ne change sans leur
 * confirmation ; aperçu de ce qui sera ajouté, renommé et rattaché ailleurs ;
 * rien n'est supprimé (core/categoryCatalog : planCatalogUpdate).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp, useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { useRunAction } from '@/hooks/useRunAction';
import { Button, Card, Text, useToast } from '@/components/ui';
import { planCatalogUpdate } from '@/core/categoryCatalog';
import { can } from '@/core/permissions';
import { useCategoryCatalog } from '@/services/categoryCatalog';
import { readJSON, storageKey, writeJSON } from '@/services/storage';

export function useCatalogUpdate() {
  const { lang } = useI18n();
  const { profile, user, role } = useApp();
  const data = useData();
  const cats = useCategoryLabels();
  const catalog = useCategoryCatalog();
  // Horodatage des documents ajoutés : figé à l'ouverture (le moteur de synchro horodate l'écriture).
  const [now] = useState(() => Date.now());
  const plan = useMemo(
    () => planCatalogUpdate(data.categories, { country: profile?.country, lang: lang === 'en' ? 'en' : 'fr', now, uid: user?.uid ?? '', currentLabel: (c) => cats.label(c, c.id) }, catalog),
    [data.categories, profile?.country, lang, now, user?.uid, cats, catalog],
  );
  return { plan, allowed: can(role, 'update', 'categories') };
}

export function CatalogUpdateCard({ dismissible }: { dismissible?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const run = useRunAction();
  const actions = useActions();
  const cats = useCategoryLabels();
  const { user, activeSpace } = useApp();
  const { plan, allowed } = useCatalogUpdate();
  const [open, setOpen] = useState(false);
  // « Plus tard » sur l'accueil : mémorisé par compte et par espace (la carte reste dans Catégories).
  const key = user && activeSpace ? storageKey(user.uid, `catalogLater_${activeSpace.id}`) : null;
  const [later, setLater] = useState<boolean | null>(dismissible ? null : false);
  useEffect(() => {
    if (!dismissible || !key) return;
    let alive = true;
    void readJSON<boolean>(key).then((v) => alive && setLater(!!v));
    return () => {
      alive = false;
    };
  }, [dismissible, key]);
  if (!plan.needed || !allowed || later !== false) return null;
  const name = (id: string) => cats.byId(id);
  const apply = () =>
    Alert.alert(t('cat.update.confirm'), t('cat.update.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('cat.update.apply'),
        onPress: () => {
          if (run(() => actions.applyCatalogUpdate(plan))) toast.show(t('cat.update.done'));
        },
      },
    ]);
  const section = (title: string, lines: string[]) =>
    lines.length ? (
      <View style={{ gap: 2 }}>
        <Text variant="small" weight="600">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {lines.join(' · ')}
        </Text>
      </View>
    ) : null;
  return (
    <Card style={{ gap: 8, marginBottom: 12 }} accessibilityLabel={t('cat.update.title')}>
      <Text variant="bodyStrong">🆕 {t('cat.update.title')}</Text>
      <Text variant="small" tone="muted">
        {t('cat.update.body', { added: plan.added.length, renamed: plan.renamed.length, moved: plan.moved.length })}
      </Text>
      {open ? (
        <View style={{ gap: 8 }}>
          {section(t('cat.update.added'), plan.added.map((a) => (a.parentId ? `${labelOf(a.parentId)} › ${labelOf(a.id)}` : labelOf(a.id))))}
          {section(t('cat.update.renamed'), plan.renamed.map((r) => `${r.from} → ${r.to}`))}
          {section(t('cat.update.moved'), plan.moved.map((m) => `${labelOf(m.id)} → ${labelOf(m.to)}`))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button small icon="sparkles-outline" label={t('cat.update.apply')} onPress={apply} />
        <Button small variant="secondary" label={open ? t('cat.update.hide') : t('cat.update.details')} onPress={() => setOpen(!open)} />
        {dismissible ? (
          <Button
            small
            variant="ghost"
            label={t('cat.update.later')}
            onPress={() => {
              setLater(true);
              if (key) void writeJSON(key, true);
            }}
          />
        ) : null}
      </View>
    </Card>
  );

  /** Libellé du catalogue (la catégorie n'existe peut-être pas encore dans l'espace). */
  function labelOf(id: string): string {
    return catalogName(id) ?? name(id);
  }
  function catalogName(id: string): string | null {
    const c = plan.add.find((x) => x.id === id);
    return c ? cats.label(c, id) : null;
  }
}
