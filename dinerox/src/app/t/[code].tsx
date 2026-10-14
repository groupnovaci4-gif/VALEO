/**
 * Lien d'invitation de tontine ouvert dans l'application (`https://{domaine}/t/{code}`
 * ou `dinerox://t/{code}`) : ouvre « Rejoindre une tontine » avec le code
 * prérempli. Rien n'est demandé tant que la personne n'a pas lu l'aperçu et
 * appuyé sur « Demander à rejoindre ».
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { normalizeCode } from '@/core/referral';

export default function TontineInviteLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/tontines/join', params: { code: normalizeCode(code) } }} />;
}
