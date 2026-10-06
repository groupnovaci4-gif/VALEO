import React, { useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { Button, Card, ChipGroup, Field, Icon, IconCircle, Row, Screen, Segmented, Sheet, Text, useToast } from '@/components/ui';
import { pickableColors, useTheme } from '@/theme';
import { useRunAction } from '@/hooks/useRunAction';
import { withSpaceReady } from '@/components/SpaceReady';

const ICONS = ['pricetag', 'cart', 'gift', 'paw', 'construct', 'barbell', 'bus', 'cafe', 'beer', 'book', 'briefcase', 'flower', 'hammer', 'medkit'];

/** Catégories : système (renommables) et personnalisées. */
function Categories() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const run = useRunAction();
  const cats = useCategoryLabels();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(pickableColors[0]);
  const [parentId, setParentId] = useState<string | null>(null);
  const open = (id: string | 'new', parent: string | null = null) => {
    const c = data.categories.find((x) => x.id === id);
    setName(c ? cats.byId(c.id) : '');
    setParentId(c ? (c.parentId ?? null) : parent);
    setIcon(c?.icon ?? ICONS[0]);
    setColor(c?.color ?? pickableColors[0]);
    setEditing(id);
  };
  const save = () => {
    if (!name.trim()) return toast.show(t('error.name.required'), 'error');
    const c = data.categories.find((x) => x.id === editing);
    const ok = run(() => actions.saveCategory({ ...(c ?? {}), id: c?.id, kind: c?.kind ?? kind, name: name.trim(), icon, color, order: c?.order ?? data.categories.length, system: c?.system, labelKey: c?.labelKey, parentId: c?.system ? null : parentId }));
    if (!ok) return;
    toast.show(t('common.saved'));
    setEditing(null);
  };
  const editingCat = data.categories.find((x) => x.id === editing);
  return (
    <Screen back title={t('cat.title')}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: t('cat.expense') }, { value: 'income', label: t('cat.incomeTab') }]} />
      <Card>
        {cats.list(kind).map((c) => (
          <React.Fragment key={c.id}>
            <Row title={c.name} left={<IconCircle icon={c.icon} color={c.color} size={36} />} chevron onPress={() => open(c.id)} />
            {cats.children(c.id).map((sc) => (
              <View key={sc.id} style={{ paddingLeft: 48 }}>
                <Row title={sc.name} subtitle={sc.fixed ? t('cat.fixed') : undefined} chevron onPress={() => open(sc.id)} />
              </View>
            ))}
            {kind === 'expense' ? (
              <View style={{ paddingLeft: 48 }}>
                <Row title={t('cat.newSub')} left={<Icon name="add" size={18} color={colors.primary} />} onPress={() => open('new', c.id)} />
              </View>
            ) : null}
          </React.Fragment>
        ))}
      </Card>
      <Button icon="add" label={t('cat.new')} style={{ marginTop: 14 }} onPress={() => open('new')} />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('cat.new') : t('common.edit')}>
        <Field label={t('common.name')} value={name} onChangeText={setName} maxLength={60} />
        {kind === 'expense' && !editingCat?.system ? (
          <>
            <Text variant="small" weight="600" style={{ marginBottom: 6 }}>
              {t('cat.parent')}
            </Text>
            <ChipGroup scroll value={parentId} onChange={(v) => setParentId(parentId === v ? null : v)} options={cats.list('expense').map((p) => ({ value: p.id, label: p.name, icon: p.icon, color: p.color }))} />
          </>
        ) : null}
        <ChipGroup scroll value={icon} onChange={setIcon} options={ICONS.map((i) => ({ value: i, label: '', icon: i, a11yLabel: `${t('common.icon')} ${i}` }))} />
        <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c, i) => ({ value: c, label: ' ', icon: 'ellipse', color: c, a11yLabel: `${t('acc.color')} ${i + 1}` }))} />
        <Button full label={t('common.save')} onPress={save} />
        {editingCat && !editingCat.system ? <Button full variant="ghost" label={t('common.delete')} onPress={() => run(() => actions.remove('categories', editingCat.id)) && setEditing(null)} /> : null}
      </Sheet>
    </Screen>
  );
}

export default withSpaceReady(Categories);
