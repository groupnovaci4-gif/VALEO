/**
 * Carte principale de l'accueil — carte COMPACTE de l'étape 4 (maquette validée du fondateur,
 * 2026-10-21, points 2, 3 et 8) : « Votre plafond de dépenses par jour », le montant, l'étiquette
 * du mois en cours, l'œil seul (« Masquer les montants » en libellé d'accessibilité), puis Argent
 * disponible, « Mis de côté » (touchable : se déplie en « Dans vos comptes » / « Gardé ailleurs »)
 * et Total de vos comptes. Carte flottante (CSS f4). Sous la carte : la part prise sur une réserve
 * et le détail du calcul, replié derrière « Comment c'est calculé ? ».
 * Chiffres calculés par core/allowance (`dailyAllowanceV2` : argent disponible D − engagements E,
 * horizon de paie) et core/position ; aucun calcul ici (détail : `setAsideDetail`).
 * Membre enfant (audit B6) : reste par jour masqué, « Demandez à un parent ».
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useI18n } from '@/i18n';
import { useApp } from '@/store/app';
import { useFinance, useMoney } from '@/hooks/useFinance';
import { Amount, Card, GradientCard, Icon, Text } from '@/components/ui';
import { dailyAllowanceV2, type Commitment } from '@/core/allowance';
import { OpeningCard } from '@/features/money/HomeMoneyCards';
import { setAsideDetail, type SetAsideLine } from '@/features/money/setAsideDetail';
import { setAsideOutsideAccounts, type Position } from '@/core/position';
import { BIG_TEXT, useTheme } from '@/theme';

/** Étiquette du mois sur la carte verte (maquette : blanc à 16 %). */
const MONTH_PILL_BG = 'rgba(255,255,255,0.16)';
const HIDDEN = '••••••';

export function DailyAllowanceCard({ hidden, onToggleHidden, position }: { hidden?: boolean; onToggleHidden: () => void; position: Position }) {
  const available = position.available;
  const { t, date, monthYear } = useI18n();
  const { colors } = useTheme();
  const { profile, role } = useApp();
  const money = useMoney();
  const { fontScale } = useWindowDimensions();
  const { data, currency, now } = useFinance();
  const payDay = profile?.financial?.payDay ?? null;
  const r = useMemo(() => dailyAllowanceV2({ data, currency, today: now, payDay }), [data, currency, now, payDay]);
  const [open, setOpen] = useState(false);
  const [setAsideOpen, setSetAsideOpen] = useState(false);
  const detailLines = useMemo(() => (setAsideOpen ? setAsideDetail(data, position, now) : null), [setAsideOpen, data, position, now]);
  const show = (n: number) => (hidden ? HIDDEN : money(n));
  const big = fontScale >= BIG_TEXT;
  // Mois en cours, en étiquette à droite du montant (« Octobre 2026 »).
  const month = monthYear(now);
  const monthLabel = month.charAt(0).toUpperCase() + month.slice(1);

  /** Une ligne « libellé + montant » : sur une ligne, ou deux étages si le texte est agrandi. */
  const line = (onHero: boolean, label: string, value: number, size: 'M' | 'S' = 'S') => (
    <View key={label} style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', justifyContent: 'space-between', gap: big ? 0 : 8, flexWrap: 'wrap' }}>
      <Text variant="small" tone={onHero ? 'heroMuted' : 'muted'}>
        {label}
      </Text>
      <Amount text={money(value)} hidden={hidden} size={size} tone={onHero ? 'onHero' : 'default'} />
    </View>
  );
  /** Une ligne du détail de « Mis de côté ». */
  const detailText = (l: SetAsideLine) => {
    if (l.kind === 'savings') return l.goals.length ? t('home.setAside.withGoals', { account: l.account, goals: l.goals.join(', ') }) : l.account;
    if (l.kind === 'onAccount') return t('home.setAside.onAccount', { goal: l.goal, account: l.account });
    if (l.kind === 'declared') return t('home.setAside.declared', { goal: l.goal });
    return t('home.setAside.tontine', { name: l.name });
  };
  // Refonte finale B3 (`.sadet`) : titres blancs 12/16, lignes 13/18, montants blancs en 600.
  const detailGroup = (onHero: boolean, title: string, lines: SetAsideLine[]) =>
    lines.length ? (
      <View key={title}>
        <Text variant="caption" tone={onHero ? 'onHero' : 'default'} weight="600" style={{ fontSize: 12, lineHeight: 16, marginTop: 4, marginBottom: 2 }}>
          {title}
        </Text>
        {lines.map((l) => (
          <View key={l.id} style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'flex-start', justifyContent: 'space-between', gap: big ? 0 : 10, paddingVertical: 3 }}>
            <Text variant="caption" weight="400" tone={onHero ? 'heroMuted' : 'muted'} style={{ flexShrink: 1, fontSize: 13, lineHeight: 18 }}>
              {detailText(l)}
            </Text>
            <Text variant="caption" weight="600" numeric tone={onHero ? 'onHero' : 'default'} style={{ fontSize: 13, lineHeight: 18 }}>
              {hidden ? HIDDEN : money(l.amount)}
            </Text>
          </View>
        ))}
      </View>
    ) : null;
  /** Argent disponible v2 (§4) : trois montants, jamais additionnés par erreur ; autres devises côte à côte. */
  const others = Object.entries(position.otherCurrencies);
  // Ancienne ligne « dont X hors de vos comptes » : plus affichée, gardée pour le lecteur d'écran.
  const outsideAccounts = setAsideOutsideAccounts(position);
  const availableRow = (onHero: boolean) => (
    <View style={{ gap: 4 }}>
      {line(onHero, t('home.available'), available, 'M')}
      {/* « Mis de côté » : touchable, se déplie dessous (fondateur, 2026-10-21, point 8). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[t('home.setAside'), hidden ? t('common.amountHidden') : money(position.setAside), outsideAccounts !== null ? t('home.setAsideOutside', { amount: show(outsideAccounts) }) : null].filter(Boolean).join(', ')}
        accessibilityState={{ expanded: setAsideOpen }}
        aria-expanded={setAsideOpen}
        onPress={() => setSetAsideOpen((o) => !o)}
        hitSlop={{ top: 10, bottom: 10 }}
        style={({ pressed }) => ({ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', justifyContent: 'space-between', gap: big ? 0 : 8, flexWrap: 'wrap', minHeight: 28, borderRadius: 8, backgroundColor: pressed ? (onHero ? colors.heroTrack : colors.surfaceAlt) : 'transparent' })}
      >
        <Text variant="small" tone={onHero ? 'heroMuted' : 'muted'}>
          {t('home.setAside')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Amount text={money(position.setAside)} hidden={hidden} size="S" tone={onHero ? 'onHero' : 'default'} />
          <Icon name={setAsideOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={onHero ? colors.onHero : colors.textMuted} />
        </View>
      </Pressable>
      {detailLines ? (
        <View style={{ marginTop: 2, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12 }}>
          {detailGroup(onHero, t('home.setAside.inAccounts'), detailLines.inAccounts)}
          {detailGroup(onHero, t('home.setAside.elsewhere'), detailLines.elsewhere)}
        </View>
      ) : null}
      {line(onHero, t('home.totalAccounts'), position.totalAccounts)}
      {others.map(([cur, v]) => (
        <Text key={cur} variant="caption" tone={onHero ? 'heroMuted' : 'subtle'}>
          {hidden ? HIDDEN : `${money(v!.available, { currency: cur })} · ${money(v!.totalAccounts, { currency: cur })}`}
        </Text>
      ))}
    </View>
  );
  /** « Comment c'est calculé ? » : D, chaque engagement, le nombre de jours (§7.3). */
  const itemText = (c: Commitment) => {
    const amount = show(c.amount);
    const day = date(c.date);
    if (c.kind === 'recurring') return t('daily.item.recurring', { label: data.recurring.find((x) => x.id === c.id)?.label ?? '', date: day, amount });
    if (c.kind === 'tontine') return t('daily.item.tontine', { label: data.tontines.find((x) => x.id === c.id)?.name ?? '', date: day, amount });
    if (c.kind === 'debt') return t('daily.item.debt', { label: data.debts.find((x) => x.id === c.id)?.counterparty ?? '', date: day, amount });
    if (c.kind === 'future') return t('daily.item.future', { date: day, amount });
    return t('daily.item.goal', { label: data.goals.find((x) => x.id === c.id)?.name ?? '', amount });
  };

  // §7.3 : argent disponible D − engagements E, sur les jours jusqu'au prochain revenu (les dépenses
  // sont déjà sorties de D). Le détail explique toujours le chiffre.
  const detail = r.status === 'needs_money' ? null : t('daily.detail', { available: show(r.available), commitments: show(r.commitments), days: r.daysLeft });
  const items = r.status === 'needs_money' ? [] : r.items;
  // Sous la carte : réserve et source TOUJOURS visibles ; détail du calcul replié.
  const below = (
    <View style={{ marginTop: 8, marginBottom: 12, gap: 6 }}>
      {/* Règle 19 : la part prise sur une réserve reste visible (elle n'a pas fait baisser le reste par jour). */}
      {r.status !== 'needs_money' && r.reserveCovered > 0 ? (
        <Text variant="small" tone="muted">
          {t('daily.reserveCovered', { amount: show(r.reserveCovered) })}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('daily.howCalculated')}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, alignSelf: 'flex-start', paddingHorizontal: 8, marginLeft: -8, borderRadius: 12, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
        <Text variant="label" tone="primary" style={{ flexShrink: 1 }}>
          {t('daily.howCalculated')}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingLeft: 4 }}>
          {detail ? <Text variant="small">{detail}</Text> : null}
          {items.map((c, i) => (
            <Text key={`${c.kind}_${c.id}_${i}`} variant="caption" tone="subtle">
              {itemText(c)}
            </Text>
          ))}
          <Text variant="small" tone="muted">
            {t('home.availableHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
  // Carte flottante (CSS f4) : marges 8 dp autour, rayon 22 ; contenu resserré (≈ 200 dp).
  // L'œil, posé en absolu, est rendu EN DERNIER : sinon le titre, rendu après, le recouvre.
  const cardStyle = { marginTop: 6, marginBottom: 14, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10, gap: 0 } as const;
  const eye = (
    <View style={{ position: 'absolute', top: 2, right: 4 }}>
      <EyeButton hidden={!!hidden} onPress={onToggleHidden} onHero />
    </View>
  );
  const separator = <View style={{ height: 1, backgroundColor: colors.heroTrack, marginVertical: 8 }} />;

  // Audit B6 (b) : un membre enfant ne voit ni les dettes, ni les tontines, ni les charges de
  // l'espace — un reste par jour serait faux. Il est masqué : « Demandez à un parent ».
  if (role === 'child') {
    return (
      <GradientCard float style={cardStyle}>
        <Text variant="caption" tone="heroMuted" style={{ paddingRight: 48, paddingTop: 2 }}>
          {t('daily.limitLabel')}
        </Text>
        <Text variant="titleS" tone="onHero">
          {t('child.askParent')}
        </Text>
        <Text variant="small" tone="heroMuted">
          {t('child.askParent.why')}
        </Text>
        {separator}
        {availableRow(true)}
        {eye}
      </GradientCard>
    );
  }
  // Argent jamais renseigné (§4, §12.1) : la carte « Votre argent disponible aujourd'hui », à la place de tout montant.
  if (r.status === 'needs_money') return <OpeningCard />;
  if (r.status === 'deficit') {
    const sentence = t('daily.deficit', { amount: show(r.deficit), date: date(r.until) });
    return (
      <>
        <Card tone="danger" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="alert-circle" size={24} color={colors.danger} />
            <Text variant="titleS" style={{ flex: 1 }} accessibilityRole="alert">
              {sentence}
            </Text>
            <View style={{ marginTop: -12, marginRight: -12 }}>
              <EyeButton hidden={!!hidden} onPress={onToggleHidden} />
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          {availableRow(false)}
        </Card>
        {below}
      </>
    );
  }
  return (
    <>
      <GradientCard float style={cardStyle}>
        <Text variant="caption" tone="heroMuted" style={{ paddingRight: 48, paddingTop: 2 }}>
          {t('daily.limitLabel')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <Amount text={money(r.perDay)} hidden={hidden} size="hero" tone="onHero" style={{ flexShrink: 1 }} />
          <View style={{ backgroundColor: MONTH_PILL_BG, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text variant="caption" tone="onHero" weight="600" style={{ fontSize: 12, lineHeight: 16 }}>
              {monthLabel}
            </Text>
          </View>
        </View>
        {separator}
        {availableRow(true)}
        {eye}
      </GradientCard>
      {below}
    </>
  );
}

/** Œil seul, 48 dp : « Masquer les montants » / « Afficher les montants » en libellé d'accessibilité. */
function EyeButton({ hidden, onPress, onHero }: { hidden: boolean; onPress: () => void; onHero?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const label = hidden ? t('home.showAmounts') : t('home.hideAmounts');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? (onHero ? colors.heroTrack : colors.surfaceAlt) : 'transparent' })}
    >
      <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color={onHero ? colors.onHero : colors.primary} />
    </Pressable>
  );
}
