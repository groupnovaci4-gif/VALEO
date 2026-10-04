/**
 * Graphiques simples (react-native-svg), règles de lisibilité :
 * un seul axe, marques fines aux extrémités arrondies ancrées sur la ligne
 * de base, espace de 2 px entre barres, légende pour 2 séries, valeurs au
 * toucher, et toujours une alternative textuelle (accessibilityLabel).
 * Couleurs : jetons chartIncome/chartExpense validés pour le daltonisme.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';
import { Text } from '@/components/ui';

/** Barre aux coins supérieurs arrondis (4 px), base droite sur l'axe. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export interface FlowPoint {
  label: string;
  income: number;
  expense: number;
}

/**
 * Barres groupées revenus / dépenses par période. Toucher un groupe affiche
 * ses valeurs exactes. `format` formate les montants.
 */
export function FlowBars({
  points,
  format,
  incomeLabel,
  expenseLabel,
  height = 160,
  summary,
}: {
  points: FlowPoint[];
  format: (n: number) => string;
  incomeLabel: string;
  expenseLabel: string;
  height?: number;
  summary: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)));
  const n = Math.max(1, points.length);
  const groupW = width / n;
  // Deux barres par groupe + 2 px d'écart ; au moins 3 px pour rester visibles.
  const barW = Math.max(3, Math.min(14, (groupW - 4) / 2.4));
  const scale = (v: number) => (v / max) * (height - 8);
  // Libellés d'axe sélectifs : au plus ~7 repères.
  const every = Math.ceil(n / 7);
  const sel = active !== null ? points[active] : null;
  return (
    <View accessible accessibilityLabel={summary}>
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
        <LegendItem color={colors.chartIncome} label={incomeLabel} />
        <LegendItem color={colors.chartExpense} label={expenseLabel} />
      </View>
      <View style={{ minHeight: 40, marginBottom: 6 }}>
        {sel ? (
          <Text variant="small">
            <Text variant="small" weight="700">
              {sel.label}
            </Text>
            {`  ·  ${incomeLabel} ${format(sel.income)}  ·  ${expenseLabel} ${format(sel.expense)}`}
          </Text>
        ) : null}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0.5, 1].map((f) => (
              <Line key={f} x1={0} x2={width} y1={height - (height - 8) * f} y2={height - (height - 8) * f} stroke={colors.grid} strokeWidth={1} />
            ))}
            {points.map((p, i) => {
              const x0 = i * groupW + (groupW - (barW * 2 + 2)) / 2;
              const hi = scale(p.income);
              const he = scale(p.expense);
              const dim = active !== null && active !== i ? 0.35 : 1;
              return (
                <React.Fragment key={i}>
                  <Path d={barPath(x0, height - hi, barW, hi)} fill={colors.chartIncome} opacity={dim} />
                  <Path d={barPath(x0 + barW + 2, height - he, barW, he)} fill={colors.chartExpense} opacity={dim} />
                </React.Fragment>
              );
            })}
            <Line x1={0} x2={width} y1={height} y2={height} stroke={colors.textSubtle} strokeWidth={1} />
          </Svg>
        ) : null}
        {/* Zones de toucher plus larges que les barres. */}
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {points.map((p, i) => (
            <Pressable key={i} accessibilityLabel={`${p.label} : ${incomeLabel} ${format(p.income)}, ${expenseLabel} ${format(p.expense)}`} onPress={() => setActive(active === i ? null : i)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      {/* Libellés d'axe sélectifs, centrés sous leur groupe (jamais tronqués). */}
      <View style={{ height: 16, marginTop: 4 }}>
        {points.map((p, i) =>
          i % every === 0 ? (
            <Text key={i} variant="caption" tone="subtle" style={{ position: 'absolute', left: i * groupW + groupW / 2 - 20, width: 40, textAlign: 'center', fontSize: 10 }}>
              {p.label}
            </Text>
          ) : null,
        )}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/**
 * Répartition classée (remplace un camembert : les longueurs se comparent
 * mieux que les angles). Une seule teinte, valeurs et parts en clair.
 */
export function RankedBars({ items, format, max: maxItems = 6 }: { items: { label: string; value: number; percent: number }[]; format: (n: number) => string; max?: number }) {
  const { colors } = useTheme();
  const shown = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    if (sorted.length <= maxItems) return sorted;
    const head = sorted.slice(0, maxItems - 1);
    const rest = sorted.slice(maxItems - 1);
    return [...head, { label: '…', value: rest.reduce((s, x) => s + x.value, 0), percent: rest.reduce((s, x) => s + x.percent, 0) }];
  }, [items, maxItems]);
  const top = Math.max(1, ...shown.map((i) => i.value));
  return (
    <View style={{ gap: 12 }}>
      {shown.map((i) => (
        <View key={i.label} accessible accessibilityLabel={`${i.label} : ${format(i.value)}, ${i.percent} %`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text variant="small" weight="600" numberOfLines={1} style={{ flex: 1 }}>
              {i.label}
            </Text>
            <Text variant="small" tone="muted">
              {format(i.value)} · {i.percent} %
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.track }}>
            <View style={{ width: `${(i.value / top) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.chartIncome }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Historique d'une enveloppe : dépensé par mois + repère du budget. */
export function BudgetHistoryBars({ points, format, summary }: { points: { label: string; budget: number; spent: number }[]; format: (n: number) => string; summary: string }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const height = 120;
  const max = Math.max(1, ...points.map((p) => Math.max(p.budget, p.spent)));
  const n = Math.max(1, points.length);
  const groupW = width / n;
  const barW = Math.min(28, groupW - 10);
  const y = (v: number) => height - (v / max) * (height - 8);
  const sel = active !== null ? points[active] : null;
  return (
    <View accessible accessibilityLabel={summary}>
      <View style={{ minHeight: 22, marginBottom: 4 }}>
        {sel ? <Text variant="small">{`${sel.label} · ${format(sel.spent)} / ${format(sel.budget)}`}</Text> : null}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {points.map((p, i) => {
              const x = i * groupW + (groupW - barW) / 2;
              const over = p.budget > 0 && p.spent > p.budget;
              return (
                <React.Fragment key={i}>
                  <Path d={barPath(x, y(p.spent), barW, height - y(p.spent))} fill={over ? colors.chartExpense : colors.chartIncome} opacity={active !== null && active !== i ? 0.35 : 1} />
                  {p.budget > 0 ? <Rect x={x - 3} y={y(p.budget) - 1} width={barW + 6} height={2} fill={colors.text} /> : null}
                </React.Fragment>
              );
            })}
            <Line x1={0} x2={width} y1={height} y2={height} stroke={colors.textSubtle} strokeWidth={1} />
          </Svg>
        ) : null}
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
          {points.map((p, i) => (
            <Pressable key={i} accessibilityLabel={`${p.label} : ${format(p.spent)} / ${format(p.budget)}`} onPress={() => setActive(active === i ? null : i)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {points.map((p, i) => (
          <Text key={i} variant="caption" tone="subtle" style={{ flex: 1, textAlign: 'center' }}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
