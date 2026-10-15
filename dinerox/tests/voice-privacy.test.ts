/**
 * I1 (audit 2026-10, décision du fondateur) : l'audio de la dictée reste sur le
 * téléphone par défaut ; sinon une demande d'accord claire, une seule fois.
 */
import { describe, expect, it } from 'vitest';
import { consentPatch, localeInstalled, methodPatch, micOffered, onDeviceStatusOf, onDeviceTogglePatch, onDeviceWanted, voiceRoute } from '../src/core/entry/voicePrivacy';
import { DEFAULT_ENTRY_PREFS, entryPrefs } from '../src/core/entry/prefs';

const prefs = (p: Record<string, unknown> = {}) => entryPrefs({ entry: p });

describe('I1 — par défaut, sur l’appareil seulement quand c’est possible', () => {
  it('téléphone capable et français installé : sur l’appareil, sans rien demander', () => {
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs() })).toBe('device');
  });
  it('profil d’avant la mise à jour (onDeviceOnly: false enregistré par défaut) : sur l’appareil aussi', () => {
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs({ onDeviceOnly: false }) })).toBe('device');
  });
  it('« sur l’appareil » désactivé par la personne : il faut son accord pour le service du téléphone', () => {
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs({ onDeviceChoice: false }) })).toBe('ask');
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs({ onDeviceChoice: false, voiceConsent: 'service' }) })).toBe('service');
  });
  it('par défaut, le réglage « sur l’appareil » est activé', () => {
    expect(onDeviceWanted(DEFAULT_ENTRY_PREFS)).toBe(true);
    expect(onDeviceWanted(prefs({ onDeviceChoice: false }))).toBe(false);
  });
});

describe('I1 — sinon, une demande d’accord, une seule fois', () => {
  it('téléphone sans reconnaissance sur l’appareil, jamais demandé : demander', () => {
    expect(voiceRoute({ onDevice: 'unsupported', prefs: prefs() })).toBe('ask');
  });
  it('« Oui, dicter » : le service du téléphone, sans redemander', () => {
    const after = prefs(consentPatch('service'));
    expect(voiceRoute({ onDevice: 'unsupported', prefs: after })).toBe('service');
  });
  it('« Non, je tape » : le micro n’est plus proposé, le clavier devient la méthode par défaut', () => {
    const patch = consentPatch('refused');
    expect(patch).toEqual({ voiceConsent: 'refused', defaultMethod: 'quick_manual' });
    const route = voiceRoute({ onDevice: 'unsupported', prefs: prefs(patch) });
    expect(route).toBe('refused');
    expect(micOffered(route)).toBe(false);
  });
  it('refus puis téléphone capable (français téléchargé) : sur l’appareil, le micro revient', () => {
    const route = voiceRoute({ onDevice: 'ready', prefs: prefs({ voiceConsent: 'refused' }) });
    expect(route).toBe('device');
    expect(micOffered(route)).toBe(true);
  });
  it('le choix se change dans les réglages : choisir « Voix » efface le refus (la question revient)', () => {
    const p = prefs({ voiceConsent: 'refused', defaultMethod: 'quick_manual' });
    const next = prefs({ ...p, ...methodPatch('voice', p) });
    expect(voiceRoute({ onDevice: 'unsupported', prefs: next })).toBe('ask');
    expect(methodPatch('quick_manual', p)).toEqual({ defaultMethod: 'quick_manual' });
  });
});

describe('I1 — interrupteur « Reconnaissance uniquement sur le téléphone » des réglages', () => {
  it('le désactiver est un choix explicite du service du téléphone (pas de demande en plus) ; l’ancien champ suit', () => {
    expect(onDeviceTogglePatch(false)).toEqual({ onDeviceChoice: false, onDeviceOnly: false, voiceConsent: 'service' });
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs(onDeviceTogglePatch(false)) })).toBe('service');
  });
  it('le réactiver : sur l’appareil quand c’est possible', () => {
    expect(onDeviceTogglePatch(true)).toEqual({ onDeviceChoice: true, onDeviceOnly: true });
    expect(voiceRoute({ onDevice: 'ready', prefs: prefs({ voiceConsent: 'service', ...onDeviceTogglePatch(true) }) })).toBe('device');
  });
});

describe('I1 — pack de langue manquant (Android 13 et plus)', () => {
  it('jamais demandé : le message du pack de langue', () => {
    expect(voiceRoute({ onDevice: 'missing', prefs: prefs() })).toBe('pack');
  });
  it('« Utiliser le service du téléphone » : le service, sans redemander', () => {
    expect(voiceRoute({ onDevice: 'missing', prefs: prefs(consentPatch('service')) })).toBe('service');
  });
  it('« sur l’appareil » désactivé : la demande d’accord ordinaire, pas le pack', () => {
    expect(voiceRoute({ onDevice: 'missing', prefs: prefs({ onDeviceChoice: false }) })).toBe('ask');
  });
});

describe('I1 — état de la reconnaissance sur l’appareil', () => {
  it('langue installée, quel que soit le format du téléphone', () => {
    expect(localeInstalled(['fr-FR'], 'fr')).toBe(true);
    expect(localeInstalled(['fr_FR'], 'fr')).toBe(true);
    expect(localeInstalled(['FR-ci'], 'fr')).toBe(true);
    expect(localeInstalled(['en-US', 'es-ES'], 'fr')).toBe(false);
    expect(localeInstalled(['en-GB'], 'en')).toBe(true);
    expect(localeInstalled(['french'], 'fr')).toBe(false);
  });
  it('pas de reconnaissance sur l’appareil, ou liste illisible : non disponible ; liste sans la langue : pack manquant', () => {
    expect(onDeviceStatusOf(false, ['fr-FR'], 'fr')).toBe('unsupported');
    expect(onDeviceStatusOf(true, null, 'fr')).toBe('unsupported');
    expect(onDeviceStatusOf(true, ['en-US'], 'fr')).toBe('missing');
    expect(onDeviceStatusOf(true, ['fr-FR'], 'fr')).toBe('ready');
  });
});
