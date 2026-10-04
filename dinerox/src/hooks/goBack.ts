import { router } from 'expo-router';

/**
 * Retour à l'écran précédent. Si l'écran a été ouvert directement (lien,
 * notification, rechargement web), il n'y a pas d'historique : on revient
 * alors à l'accueil au lieu de laisser l'utilisateur bloqué sur le formulaire.
 */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
