import React from 'react';
import { useSpaceReady } from '@/store/app';
import { Loading } from '@/components/ui';

/**
 * N'affiche l'écran qu'une fois le cache local de l'espace chargé : un
 * formulaire ouvert par lien direct (notification, URL) initialise ainsi son
 * état avec les vraies données au lieu de se croire « nouveau ».
 */
export function withSpaceReady<P extends object>(Screen: React.ComponentType<P>) {
  function Ready(props: P) {
    return useSpaceReady() ? <Screen {...props} /> : <Loading />;
  }
  Ready.displayName = `withSpaceReady(${Screen.displayName ?? Screen.name})`;
  return Ready;
}
