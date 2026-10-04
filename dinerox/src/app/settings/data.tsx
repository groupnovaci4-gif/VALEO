/**
 * Mes données : export complet, consentements, données de démonstration
 * (développement), suppression du compte.
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { Banner, Button, Card, Field, Screen, SectionHeader, Sheet, SwitchRow, Text, useToast } from '@/components/ui';
import { shareFullExport } from '@/services/export';
import { deleteAccount } from '@/services/auth';
import { analytics } from '@/services/analytics';
import { demoAllowed } from '@/config/env';
import { buildDemoData } from '@/core/demo';
import { today } from '@/core/dates';
import type { CollectionName, SyncedDoc } from '@/core/types';
import { removeKeys } from '@/services/storage';
import { clearPin } from '@/services/security';

export default function DataSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const { profile, updateProfile, engine, spaces, user, mode, addLocalSpace, removeLocalSpace, setActiveSpace, signOutLocal } = useApp();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  if (!profile || !user) return null;
  const prefs = profile.preferences;
  const demo = spaces.find((s) => s.id.startsWith('demo_'));

  const exportAll = async () => {
    if (!engine) return;
    const all = [];
    for (const s of spaces) {
      await engine.open(s.id, s.members[user.uid] ?? 'admin');
      all.push({ id: s.id, name: s.name, data: engine.getData(s.id) });
    }
    await shareFullExport(profile, all).catch(() => toast.show(t('error.generic'), 'error'));
    analytics.track('export_data', { kind: 'json' });
  };

  const createDemo = async () => {
    if (!engine) return;
    const id = `demo_${user.uid}`;
    const now = Date.now();
    await addLocalSpace({ id, kind: 'personal', name: t('demo.space'), ownerId: user.uid, members: { [user.uid]: 'admin' }, memberIds: [user.uid], memberNames: {}, currency: 'XOF', createdAt: now, updatedAt: now });
    await engine.open(id, 'admin');
    const d = buildDemoData({ now, uid: user.uid, today: today(), label: (k) => t(k as never) });
    const items: { col: CollectionName; doc: SyncedDoc }[] = [];
    for (const [col, docs] of Object.entries(d)) for (const doc of docs as SyncedDoc[]) items.push({ col: col as CollectionName, doc });
    engine.writeMany(id, items);
    setActiveSpace(id);
    toast.show(t('set.demoDone'));
    router.replace('/');
  };

  const destroy = async () => {
    setBusy(true);
    try {
      await clearPin();
      if (mode === 'local') {
        await removeKeys(`dinerox:v1:${user.uid}:`);
        await signOutLocal();
      } else {
        await deleteAccount();
        await removeKeys(`dinerox:v1:${user.uid}:`);
      }
    } catch (e) {
      const code = String((e as { code?: string })?.code ?? '');
      toast.show(code.includes('requires-recent-login') ? t('auth.err.requires-recent-login') : t('error.network'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title={t('set.data')}>
      <Card>
        <Button variant="secondary" icon="download-outline" label={t('set.export')} onPress={() => void exportAll()} />
      </Card>
      <SectionHeader title={t('set.preferences')} />
      <Card>
        <SwitchRow title={t('set.aiConsent')} subtitle={t('set.aiConsentHint')} value={prefs.aiConsent} onChange={(v) => void updateProfile({ preferences: { ...prefs, aiConsent: v } })} />
        <SwitchRow title={t('set.analyticsConsent')} subtitle={t('set.analyticsConsentHint')} value={prefs.analyticsConsent} onChange={(v) => void updateProfile({ preferences: { ...prefs, analyticsConsent: v } })} />
      </Card>
      {demoAllowed ? (
        <>
          <SectionHeader title={t('set.demo')} />
          <Card>
            <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
              {t('set.demoHint')}
            </Text>
            {demo ? <Button variant="secondary" label={t('set.demoRemove')} onPress={() => void removeLocalSpace(demo.id)} /> : <Button variant="secondary" icon="flask-outline" label={t('set.demo')} onPress={() => void createDemo()} />}
          </Card>
        </>
      ) : null}
      <Card style={{ marginTop: 22 }}>
        <Button variant="danger" icon="trash-outline" label={t('set.deleteAccount')} onPress={() => setConfirmOpen(true)} />
      </Card>
      <Sheet visible={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('set.deleteAccount')}>
        <Banner tone="danger" icon="warning" text={t('set.deleteAccountBody')} />
        <Field label={t('set.deleteAccountConfirm')} value={word} onChangeText={setWord} autoCapitalize="characters" />
        <Button full variant="danger" loading={busy} disabled={word.trim() !== t('set.deleteWord')} label={t('set.deleteAccount')} onPress={() => void destroy()} />
      </Sheet>
    </Screen>
  );
}
