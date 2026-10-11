/** Saisie corrigée : une modification de la carte, dans la vue « confirm » OU dans la conversation (1.9), est signalée. */
import { describe, expect, it } from 'vitest';
import { markEdited } from '../src/features/entry/edited';

describe('markEdited', () => {
  it('conversation : la correction de la carte marque la saisie corrigée (voice_entry_corrected)', () => {
    const view = { kind: 'conversation' as const, method: 'voice' as const, text: 'taxi 1000', edited: false };
    expect(markEdited(view)).toEqual({ ...view, edited: true });
  });

  it('confirm : même règle', () => {
    const view = { kind: 'confirm' as const, drafts: [], method: 'text_phrase' as const, text: 'garba 500', edited: false };
    expect(markEdited(view).edited).toBe(true);
  });

  it('déjà corrigée ou vue sans carte : la vue est rendue telle quelle (aucun nouveau rendu)', () => {
    const edited = { kind: 'conversation' as const, edited: true };
    expect(markEdited(edited)).toBe(edited);
    const input = { kind: 'input' as const };
    expect(markEdited(input)).toBe(input);
  });
});
