/**
 * Accueil, « À lire » (refonte finale B5, E1 à E4) : TOUS les messages du coach au même endroit —
 * alertes, conseil du jour, points de « Votre coach » et « Votre analyse » (qui n'est plus une
 * carte à part, B9). Liste et règles : `features/notifications`.
 */
import React from 'react';
import { ToReadList } from '@/features/notifications/ToReadList';

export function ToRead() {
  return <ToReadList />;
}
