import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PhoneFlow, type PhoneStart } from '@/features/phoneAuth/PhoneFlow';

/**
 * Connexion par téléphone (docs/connexion-telephone) : inscription (numéro), connexion
 * (`?start=signin`, numéro + code secret) ou code secret oublié (`?start=forgot`).
 */
export default function Phone() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const s: PhoneStart = start === 'signin' || start === 'forgot' ? start : 'number';
  return <PhoneFlow start={s} />;
}
