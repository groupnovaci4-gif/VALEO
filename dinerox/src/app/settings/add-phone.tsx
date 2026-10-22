import React from 'react';
import { PhoneFlow } from '@/features/phoneAuth/PhoneFlow';

/**
 * Compte e-mail existant : « Ajouter mon numéro » (maquette 8). Même compte (même uid), mêmes
 * données, même abonnement ; la connexion par e-mail reste possible.
 */
export default function AddPhone() {
  return <PhoneFlow start="link" />;
}
