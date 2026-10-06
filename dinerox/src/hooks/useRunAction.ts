import { useCallback } from 'react';
import { useI18n, hasKey, type TKey } from '@/i18n';
import { useToast } from '@/components/ui';
import { ActionError } from '@/store/actions';

/**
 * Message humain pour une erreur d'action (règle unique pour tous les écrans).
 * `fallback` : message d'une validation sans détail (ex. « nom obligatoire »).
 */
export function useActionErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (e: unknown, fallback: TKey = 'error.generic'): string => {
      if (e instanceof ActionError) {
        if (e.code === 'permission') return t('error.permission');
        if (e.code === 'limit') return t('error.limit', { limit: e.details.limit ?? '' });
        if (e.code === 'notReady') return t('error.network');
        const first = e.details.errors?.[0];
        if (first && hasKey(`error.${first}`)) return t(`error.${first}` as TKey);
        return t(fallback);
      }
      return t('error.generic');
    },
    [t],
  );
}

/**
 * Exécute une action depuis un geste (onPress) : une erreur n'est JAMAIS levée
 * hors du gestionnaire (elle ferait planter l'application) — elle est affichée.
 * Renvoie true si l'action a réussi.
 */
export function useRunAction() {
  const toast = useToast();
  const message = useActionErrorMessage();
  return useCallback(
    (fn: () => unknown, fallback?: TKey): boolean => {
      try {
        fn();
        return true;
      } catch (e) {
        toast.show(message(e, fallback), 'error');
        return false;
      }
    },
    [toast, message],
  );
}
