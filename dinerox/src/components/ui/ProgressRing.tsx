/**
 * Anneau de progression autour d'une icône (refonte finale : B7 enveloppes, B9 et D2 objectifs,
 * C1 carte du Budget). Décoratif : le texte voisin (ou `label`) porte le sens.
 * Valeur bornée à 0–100 % pour le dessin (un dépassement remplit l'anneau, le texte dit de combien).
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ringDash } from './ringDash';

export function ProgressRing({ size, stroke, percent, color, track, children }: { size: number; stroke: number; percent: number; color: string; track: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const dash = ringDash(r, percent);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {dash ? <Circle cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={dash} transform={`rotate(-90 ${c} ${c})`} /> : null}
      </Svg>
      {children}
    </View>
  );
}
