import React from 'react';
import { PhoneFlow } from '@/features/phoneAuth/PhoneFlow';

/**
 * Réglages › Sécurité › « Changer mon code secret » (audit 23/10, C2 / décision D2) : le parcours
 * « code oublié » existant, sur le numéro du compte connecté ; la session reste ouverte.
 */
export default function ChangeSecret() {
  return <PhoneFlow start="change" />;
}
