/**
 * Politique de confidentialité — section « Dictée vocale » (I1, validée par le fondateur le
 * 2026-10-15) : textes exacts, placée après « Assistant IA », date 2026-10-15, conditions
 * d'utilisation et leur version d'acceptation inchangées.
 */
import { describe, expect, it } from 'vitest';
import { LEGAL } from '../src/content/legal';
import { TERMS_VERSION } from '../src/config/legal';

const FR = {
  title: 'Dictée vocale',
  body: "Le son de votre voix n'est jamais enregistré ni envoyé à {app} : il passe directement du micro au service de reconnaissance, sans être écrit dans un fichier. Quand votre téléphone le permet, la reconnaissance se fait sur le téléphone : aucun son ne le quitte. Sinon, et seulement après votre accord (demandé une fois avant la première dictée), le téléphone envoie le son à son propre service de reconnaissance (Google ou Apple), selon les conditions de ce service ; {app} ne reçoit que le texte reconnu. Vous pouvez refuser (« Non, je tape ») : la saisie au clavier et la phrase écrite restent disponibles, et ce choix se change dans Paramètres › Notifications. Si vous avez accepté l'analyse par l'IA, le texte écrit d'une dictée peut lui être transmis pour être compris, jamais le son.",
};
const EN = {
  title: 'Voice dictation',
  body: "The sound of your voice is never recorded or sent to {app}: it goes straight from the microphone to the recognition service, without being written to a file. When your phone allows it, recognition happens on the phone: no sound leaves it. Otherwise, and only with your agreement (asked once before your first dictation), the phone sends the sound to its own recognition service (Google or Apple), under that service's terms; {app} only receives the recognised text. You can refuse (\"No, I'll type\"): typing and written sentences remain available, and you can change this in Settings › Notifications. If you have accepted the AI analysis, the written text of a dictation may be sent to it to be understood — never the sound.",
};

describe('politique de confidentialité — « Dictée vocale »', () => {
  it('français : juste après « Assistant IA », texte validé', () => {
    const s = LEGAL.privacy.fr.sections;
    expect(s[s.findIndex((x) => x.title === 'Assistant IA') + 1]).toEqual(FR);
  });
  it('anglais : juste après « AI assistant », texte validé', () => {
    const s = LEGAL.privacy.en.sections;
    expect(s[s.findIndex((x) => x.title === 'AI assistant') + 1]).toEqual(EN);
  });
  it('date de la politique : 2026-10-15 (FR et EN) ; conditions et version d’acceptation inchangées', () => {
    expect([LEGAL.privacy.fr.updated, LEGAL.privacy.en.updated]).toEqual(['2026-10-15', '2026-10-15']);
    expect([LEGAL.terms.fr.updated, LEGAL.terms.en.updated]).toEqual(['2026-10-01', '2026-10-01']);
    expect(TERMS_VERSION).toBe('2026-10-01');
  });
});
