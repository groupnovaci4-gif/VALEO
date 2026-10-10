/** 1.9 — Consentement à l'IA : un accord antérieur doit être renouvelé avant l'envoi d'une transcription. */
import { describe, expect, it } from 'vitest';
import { AI_CONSENT_VERSION, needsConsentRenewal, transcriptConsent, withConsent } from '../src/core/aiConsent';

describe('consentement à l’IA (texte de la 1.9)', () => {
  it('accord donné AVANT la 1.9 : rien n’est envoyé, le nouveau texte est montré', () => {
    for (const old of [{ aiConsent: true }, { aiConsent: true, aiConsentVersion: 1 }]) {
      expect(transcriptConsent(old)).toBe(false);
      expect(needsConsentRenewal(old)).toBe(true);
    }
  });
  it('nouveau texte accepté une fois : envoi possible, plus de demande', () => {
    const accepted = withConsent({ aiConsent: true, aiConsentVersion: undefined, theme: 'light' as const });
    expect(accepted).toEqual({ aiConsent: true, aiConsentVersion: AI_CONSENT_VERSION, theme: 'light' });
    expect(transcriptConsent(accepted)).toBe(true);
    expect(needsConsentRenewal(accepted)).toBe(false);
  });
  it('jamais accepté (ou retiré) : ni envoi ni demande (parseur local seul)', () => {
    for (const p of [{ aiConsent: false }, { aiConsent: false, aiConsentVersion: 2 }, null, undefined]) {
      expect(transcriptConsent(p)).toBe(false);
      expect(needsConsentRenewal(p)).toBe(false);
    }
  });
});
