import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n, type TKey } from '@/i18n';
import { useApp } from '@/store/app';
import { Amount, CircleGrid, CircleTile, GradientCard, ListCard, MenuRow, Screen, SectionHeader, Text } from '@/components/ui';
import { can } from '@/core/permissions';
import { hasFeature } from '@/core/subscription';
import { today } from '@/core/dates';
import { netWorth } from '@/core/networth';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { DesignV2, useTheme } from '@/theme';
import { MORE_FAMILY } from '@/features/more/menuFamilies';
import { loadAppLinks } from '@/services/appLinks';
import { loadStoreConfig, openStorePage, readReviewState, writeReviewState } from '@/services/storeReview';
import { storePageUrls, withMenuUsed } from '@/core/storeReview';
import { analytics } from '@/services/analytics';
import { brand } from '@/config/brand';

interface Item {
  key: TKey;
  sub: TKey;
  icon: string;
  color: string;
  path: string;
  /** Lien externe (ouvert hors de l'application) au lieu d'un écran. */
  url?: string;
  /** Geste propre à la ligne (au lieu d'un écran ou d'un lien). */
  onPress?: () => void;
  show?: boolean;
  locked?: boolean;
}

export default function More() {
  return (
    <DesignV2>
      <MoreScreen />
    </DesignV2>
  );
}

/** Rayon des cartes de rubriques (maquette de Plus : 20). */
const GROUP_RADIUS = 20;

function MoreScreen() {
  const { t } = useI18n();
  const { role, plan, user, mode, online } = useApp();
  const money = useMoney();
  const { data, position, currency, activeAccounts } = useFinance();
  // Couleur des ronds : `MORE_FAMILY` (palette du fondateur) ; `color` reste la couleur de marque d'origine.
  const { colors, radius } = useTheme();
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
  // Étape 4 : pages du store pour « Donner mon avis » (vide = ligne cachée, tant que config/app/items/store ne l'active pas).
  const [storeUrls, setStoreUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadAppLinks().then((l) => alive && setChannelUrl(l.whatsappChannelUrl));
    void loadStoreConfig().then((c) => alive && setStoreUrls(storePageUrls(Platform.OS, brand.bundleId, c)));
    return () => {
      alive = false;
    };
  }, []);
  // Ouvre DIRECTEMENT la page du store (jamais la fenêtre de Google, qui peut ne rien afficher).
  // Après ce passage, plus aucune demande automatique pour ce compte.
  const openReview = () => {
    analytics.track('review_requested', { context: 'manual' });
    const uid = mode === 'firebase' ? user?.uid : undefined;
    if (uid) void readReviewState(uid).then((s) => writeReviewState(uid, withMenuUsed(s))).catch(() => undefined);
    void openStorePage(storeUrls);
  };
  const showNetWorth = hasFeature(plan, 'net_worth') && can(role, 'read', 'assets');
  // Chiffre réel : patrimoine net (formule qui l'inclut) sinon total des comptes.
  const headline = useMemo(
    () => (showNetWorth ? netWorth(data, currency, today()).net : position.available + position.savings),
    [showNetWorth, data, currency, position.available, position.savings],
  );
  const groups: { title: TKey; aside: string; items: Item[] }[] = [
    {
      title: 'more.money',
      aside: '',
      items: [
        { key: 'history.menu', sub: 'more.sub.history', icon: 'list', color: colors.primary, path: '/transactions?from=more' },
        { key: 'acc.title', sub: 'more.sub.accounts', icon: 'wallet', color: colors.primary, path: '/accounts' },
        { key: 'sav.title', sub: 'more.sub.savings', icon: 'cash', color: colors.primary, path: '/savings' },
        { key: 'tontine.title', sub: 'more.sub.tontines', icon: 'people', color: colors.secondary, path: '/tontines', show: can(role, 'read', 'tontines') },
        { key: 'obl.title', sub: 'more.sub.obligations', icon: 'heart', color: colors.danger, path: '/obligations', show: can(role, 'read', 'recurring') },
        { key: 'season.title', sub: 'more.sub.seasons', icon: 'calendar-number', color: colors.secondary, path: '/seasons' },
        { key: 'sim.title', sub: 'more.sub.simulate', icon: 'calculator', color: colors.info, path: '/simulate' },
        { key: 'debt.title', sub: 'more.sub.debts', icon: 'receipt', color: colors.danger, path: '/debts', show: can(role, 'read', 'debts') },
        { key: 'nw.title', sub: 'more.sub.assets', icon: 'business', color: colors.secondary, path: '/assets', show: can(role, 'read', 'assets'), locked: !hasFeature(plan, 'net_worth') },
        { key: 'rec.title', sub: 'more.sub.recurring', icon: 'repeat', color: colors.info, path: '/recurring', show: can(role, 'read', 'recurring') },
      ],
    },
    {
      title: 'more.intelligence',
      aside: '',
      items: [
        { key: 'ai.title', sub: 'more.sub.assistant', icon: 'chatbubble-ellipses', color: colors.secondary, path: '/assistant' },
        { key: 'intel.title', sub: 'intel.sub', icon: 'analytics', color: colors.primary, path: '/analysis' },
        { key: 'cal.title', sub: 'cal.sub', icon: 'calendar', color: colors.info, path: '/calendar' },
        { key: 'fi.title', sub: 'fi.sub', icon: 'trending-up', color: colors.secondary, path: '/independence' },
        { key: 'reward.title', sub: 'reward.subtitle', icon: 'trophy', color: colors.warning, path: '/rewards' },
        { key: 'score.cta', sub: 'score.ctaSub', icon: 'speedometer', color: colors.primary, path: '/score' },
      ],
    },
    {
      title: 'more.plan',
      aside: t('more.pilot'),
      items: [
        { key: 'fam.title', sub: 'more.sub.family', icon: 'people', color: colors.primary, path: '/family' },
        { key: 'rep.title', sub: 'more.sub.reports', icon: 'bar-chart', color: colors.info, path: '/reports' },
        { key: 'notif.title', sub: 'more.sub.notifications', icon: 'notifications', color: colors.secondary, path: '/notifications' },
        { key: 'cat.title', sub: 'more.sub.categories', icon: 'pricetags', color: colors.primary, path: '/categories', show: can(role, 'create', 'categories') },
      ],
    },
    {
      title: 'more.app',
      aside: t('more.system'),
      items: [
        { key: 'ref.title', sub: 'more.sub.invite', icon: 'gift', color: colors.primary, path: '/invite', show: mode === 'firebase' },
        // Étape 2 : chaîne WhatsApp DineroX — cachée tant que l'admin n'a pas publié d'adresse valide.
        { key: 'more.whatsappChannel', sub: 'more.sub.whatsappChannel', icon: 'logo-whatsapp', color: colors.primary, path: '', url: channelUrl ?? undefined, show: !!channelUrl },
        { key: 'more.review', sub: 'more.sub.review', icon: 'star', color: colors.secondary, path: '', onPress: openReview, show: storeUrls.length > 0 },
        { key: 'sub.title', sub: 'more.sub.subscription', icon: 'sparkles', color: colors.secondary, path: '/subscription' },
        { key: 'set.title', sub: 'more.sub.settings', icon: 'settings', color: colors.info, path: '/settings' },
        { key: 'admin.title', sub: 'more.sub.admin', icon: 'shield-checkmark', color: colors.textMuted, path: '/admin', show: !!user?.isAdmin },
      ],
    },
  ];
  groups[0].aside = t('more.modules', { count: groups[0].items.filter((i) => i.show !== false).length });
  const status = mode === 'local' ? t('home.status.local') : online ? t('home.status.synced') : t('home.status.offline');
  return (
    <Screen brandSection={t('tab.more')}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="overline" style={{ color: colors.primary }}>
            {t('more.overview').toUpperCase()}
          </Text>
          <Text variant="h1">{t('more.title')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.infoBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mode === 'local' || online ? colors.primary : colors.warning }} />
          <Text variant="caption" weight="600">
            {status}
          </Text>
        </View>
      </View>

      {/* Carte verte flottante (étape 4, CSS f4). */}
      <GradientCard float style={{ marginTop: 6, marginBottom: 8, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16 }}>
        <Text variant="small" tone="heroMuted" style={{ fontSize: 13, lineHeight: 18, paddingRight: 64 }}>
          {showNetWorth ? t('more.netWorth') : t('more.totalAccounts')}
        </Text>
        <View style={{ marginTop: 4 }}>
          <Amount text={money(headline)} size="L" tone="onHero" style={{ fontSize: 30, lineHeight: 36 }} />
        </View>
        <Text variant="caption" tone="heroMuted" style={{ fontSize: 12, lineHeight: 16, marginTop: 6 }}>
          {t(activeAccounts.length === 1 ? 'more.accountsCount.one' : 'more.accountsCount', { count: activeAccounts.length })}
        </Text>
      </GradientCard>

      {groups.map((g) => {
        const items = g.items.filter((i) => i.show !== false);
        const open = (i: Item) => (i.onPress ? i.onPress() : i.url ? void Linking.openURL(i.url).catch(() => undefined) : router.push(i.path as never));
        return (
          <React.Fragment key={g.title}>
            <SectionHeader overline title={t(g.title).toUpperCase()} action={g.aside || undefined} />
            {g.title === 'more.app' ? (
              // « Application » en liste : rond, titre, description (2 lignes au plus), chevron.
              <ListCard radius={GROUP_RADIUS}>
                {items.map((i) => (
                  <MenuRow key={i.key} family={MORE_FAMILY[i.key] ?? 'vert'} icon={i.icon} title={t(i.key)} sub={t(i.sub)} badge={i.locked ? 'PRO' : undefined} accessibilityLabel={`${t(i.key)}, ${t(i.sub)}`} onPress={() => open(i)} />
                ))}
              </ListCard>
            ) : (
              // Rubriques en ronds de couleur pleine dans une carte ; description pour le lecteur d'écran.
              <CircleGrid radius={GROUP_RADIUS}>
                {items.map((i) => (
                  <CircleTile
                    key={i.key}
                    dense
                    family={MORE_FAMILY[i.key] ?? 'vert'}
                    icon={i.icon}
                    label={t(i.key)}
                    badge={i.locked ? 'PRO' : undefined}
                    accessibilityLabel={`${t(i.key)}, ${t(i.sub)}`}
                    onPress={() => open(i)}
                  />
                ))}
              </CircleGrid>
            )}
          </React.Fragment>
        );
      })}
    </Screen>
  );
}
