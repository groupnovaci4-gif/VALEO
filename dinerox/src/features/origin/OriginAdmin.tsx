/**
 * Administration — origine des inscriptions (étape 5) : chiffres REGROUPÉS
 * renvoyés par `adminOriginStats` (droit `admin`). Les groupes de moins de 5
 * ne quittent jamais le serveur : ils arrivent réunis, sans nom, dans
 * « Autres ». Aucune liste de personnes. Générateur de liens de campagne.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { httpsCallable } from 'firebase/functions';
import { useI18n, type TKey } from '@/i18n';
import { Button, Card, ChipGroup, ErrorState, Field, Loading, Row, SectionHeader, Text, useToast } from '@/components/ui';
import { firebase } from '@/services/firebase';
import { brand } from '@/config/brand';
import {
  campaignLinks,
  isValidTagInput,
  ORIGIN_PERIODS,
  ORIGIN_SOURCES,
  originKeyParts,
  share,
  type OriginPeriod,
  type OriginRow,
  type OriginSource,
  type OriginStats,
  type OthersCount,
} from '@/core/installOrigin';

export function OriginAdmin() {
  const { t, date } = useI18n();
  const [stats, setStats] = useState<OriginStats | null>(null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<OriginPeriod>('month');

  const fetchStats = useCallback(
    () =>
      httpsCallable<unknown, OriginStats>(firebase().functions, 'adminOriginStats')({})
        .then((r) => setStats(r.data))
        .catch(() => setError(true)),
    [],
  );
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const srcLabel = (s: string) => t(`admin.origin.src.${(ORIGIN_SOURCES as readonly string[]).includes(s) ? s : 'other'}` as TKey);
  // `src`, `src~cmp`, `src~cmp~cnt` → « Facebook › lancement › video1 ».
  const label = (key: string) => {
    const [src, ...rest] = originKeyParts(key);
    return [srcLabel(src), ...rest].join(' › ');
  };
  const small = t('admin.origin.small');
  const count = (n: number | 'few' | null) => (typeof n === 'number' ? String(n) : small);
  const p = stats?.periods[period];

  const section = (title: TKey, rows: OriginRow[], others: OthersCount) =>
    rows.length || others !== null ? (
      <>
        <SectionHeader title={t(title)} />
        <Card>
          {rows.map((r) => (
            <Row key={r.key} title={label(r.key)} right={<Text weight="700">{`${r.count} · ${t('admin.origin.share', { percent: share(r.count, p?.total ?? 0) })}`}</Text>} />
          ))}
          {others !== null ? <Row title={t('admin.origin.others')} right={<Text weight="700">{count(others)}</Text>} /> : null}
        </Card>
      </>
    ) : null;

  return (
    <>
      <SectionHeader title={t('admin.origin.title')} />
      <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
        {t('admin.origin.notice')}
      </Text>
      {error ? (
        <ErrorState
          onRetry={() => {
            setError(false);
            void fetchStats();
          }}
        />
      ) : !stats || !p ? (
        <Loading />
      ) : (
        <>
          {stats.since ? (
            <Text variant="caption" tone="subtle" style={{ marginBottom: 8 }}>
              {t('admin.origin.since', { date: date(stats.since, { year: true }) })}
            </Text>
          ) : null}
          <ChipGroup scroll value={period} onChange={setPeriod} options={ORIGIN_PERIODS.map((x) => ({ value: x, label: t(`admin.origin.period.${x}` as TKey) }))} />
          {p.total === 0 ? (
            <Card>
              <Text tone="muted">{t('admin.origin.empty')}</Text>
            </Card>
          ) : (
            <>
              <Card>
                <Row title={t('admin.origin.total')} right={<Text weight="700">{p.total}</Text>} />
                <Row title={t('admin.origin.invited')} right={<Text weight="700">{count(p.invited)}</Text>} />
                <Row title={t('admin.origin.unknown')} right={<Text weight="700">{count(p.unknown)}</Text>} />
                {/* Explication en entier (un sous-titre de ligne serait coupé). */}
                <Text variant="caption" tone="subtle" style={{ marginTop: -4, marginBottom: 8 }}>
                  {t('admin.origin.unknownHint')}
                </Text>
              </Card>
              {section('admin.origin.bySource', p.bySource, p.others.source)}
              {section('admin.origin.byCampaign', p.byCampaign, p.others.campaign)}
              {section('admin.origin.byContent', p.byContent, p.others.content)}
            </>
          )}
        </>
      )}
      <CampaignLinkBuilder srcLabel={srcLabel} />
    </>
  );
}

/** « Créer un lien de campagne » : deux liens à copier, rien n'est enregistré. */
function CampaignLinkBuilder({ srcLabel }: { srcLabel: (s: string) => string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [src, setSrc] = useState<OriginSource>('whatsapp');
  const [cmp, setCmp] = useState('');
  const [cnt, setCnt] = useState('');
  const links = useMemo(() => campaignLinks({ host: brand.linkHost, androidPackage: brand.bundleId, src, cmp, cnt }), [src, cmp, cnt]);
  const invalid = !isValidTagInput(cmp) || !isValidTagInput(cnt);
  const copy = (url: string) =>
    void Clipboard.setStringAsync(url)
      .then(() => toast.show(t('admin.origin.builder.copied')))
      .catch(() => undefined);

  return (
    <>
      <SectionHeader title={t('admin.origin.builder.title')} />
      <Card>
        <Text variant="label" style={{ marginBottom: 8 }}>
          {t('admin.origin.builder.source')}
        </Text>
        <ChipGroup scroll value={src} onChange={setSrc} options={ORIGIN_SOURCES.map((s) => ({ value: s, label: srcLabel(s) }))} />
        <Field label={t('admin.origin.builder.campaign')} value={cmp} onChangeText={setCmp} autoCapitalize="none" autoCorrect={false} maxLength={40} error={!isValidTagInput(cmp) ? t('admin.origin.builder.invalid') : null} />
        <Field label={t('admin.origin.builder.content')} value={cnt} onChangeText={setCnt} autoCapitalize="none" autoCorrect={false} maxLength={40} error={!isValidTagInput(cnt) ? t('admin.origin.builder.invalid') : null} />
        <Text variant="caption" tone="subtle" style={{ marginBottom: 12 }}>
          {t('admin.origin.builder.hint')}
        </Text>
        {links && !invalid ? (
          <View style={{ gap: 12 }}>
            {[
              { title: t('admin.origin.builder.play'), url: links.play },
              { title: t('admin.origin.builder.domain', { host: brand.linkHost }), url: links.domain },
            ].map((l) => (
              <View key={l.url} style={{ gap: 6 }}>
                <Text variant="small" weight="600">
                  {l.title}
                </Text>
                <Text variant="small" tone="muted" selectable>
                  {l.url}
                </Text>
                <Button small variant="secondary" icon="copy-outline" label={t('admin.origin.builder.copy')} onPress={() => copy(l.url)} style={{ alignSelf: 'flex-start' }} />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </>
  );
}
