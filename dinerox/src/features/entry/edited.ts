/**
 * Saisie « corrigée » : l'utilisateur a modifié la carte de confirmation, que ce soit
 * dans la vue « confirm » ou dans la carte de la conversation (1.9). Le drapeau est
 * transmis à `saveDrafts` (`corrected`), qui émet l'événement `voice_entry_corrected`.
 * Les vues sans carte sont rendues telles quelles.
 */
export function markEdited<V extends { kind: string; edited?: boolean }>(view: V): V {
  if (!('edited' in view) || view.edited) return view;
  return { ...view, edited: true };
}
