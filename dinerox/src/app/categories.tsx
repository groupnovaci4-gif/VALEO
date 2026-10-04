import React, { useState } from 'react';
import { useI18n } from '@/i18n';
import { useData } from '@/store/app';
import { useActions } from '@/store/actions';
import { useCategoryLabels } from '@/hooks/useFinance';
import { Button, Card, ChipGroup, Field, IconCircle, Row, Screen, Segmented, Sheet, useToast } from '@/components/ui';
import { pickableColors } from '@/theme';
import { withSpaceReady } from '@/components/SpaceReady';

const ICONS = ['pricetag', 'cart', 'gift', 'paw', 'construct', 'barbell', 'bus', 'cafe', 'beer', 'book', 'briefcase', 'flower', 'hammer', 'medkit'];

/** Catégories : système (renommables) et personnalisées. */
function Categories() {
  const { t } = useI18n();
  const toast = useToast();
  const data = useData();
  const actions = useActions();
  const cats = useCategoryLabels();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(pickableColors[0]);
  const open = (id: string | 'new') => {
    const c = data.categories.find((x) => x.id === id);
    setName(c ? cats.byId(c.id) : '');
    setIcon(c?.icon ?? ICONS[0]);
    setColor(c?.color ?? pickableColors[0]);
    setEditing(id);
  };
  const save = () => {
    if (!name.trim()) return;
    const c = data.categories.find((x) => x.id === editing);
    actions.saveCategory({ ...(c ?? {}), id: c?.id, kind: c?.kind ?? kind, name: name.trim(), icon, color, order: c?.order ?? data.categories.length, system: c?.system, labelKey: c?.labelKey });
    toast.show(t('common.saved'));
    setEditing(null);
  };
  const editingCat = data.categories.find((x) => x.id === editing);
  return (
    <Screen back title={t('cat.title')}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: t('cat.expense') }, { value: 'income', label: t('cat.incomeTab') }]} />
      <Card>
        {cats.list(kind).map((c) => (
          <Row key={c.id} title={c.name} left={<IconCircle icon={c.icon} color={c.color} size={36} />} chevron onPress={() => open(c.id)} />
        ))}
      </Card>
      <Button icon="add" label={t('cat.new')} style={{ marginTop: 14 }} onPress={() => open('new')} />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('cat.new') : t('common.edit')}>
        <Field label={t('common.name')} value={name} onChangeText={setName} />
        <ChipGroup scroll value={icon} onChange={setIcon} options={ICONS.map((i) => ({ value: i, label: '', icon: i }))} />
        <ChipGroup scroll value={color} onChange={setColor} options={pickableColors.map((c) => ({ value: c, label: ' ', icon: 'ellipse', color: c }))} />
        <Button full label={t('common.save')} onPress={save} />
        {editingCat && !editingCat.system ? <Button full variant="ghost" label={t('common.delete')} onPress={() => (actions.remove('categories', editingCat.id), setEditing(null))} /> : null}
      </Sheet>
    </Screen>
  );
}

export default withSpaceReady(Categories);
