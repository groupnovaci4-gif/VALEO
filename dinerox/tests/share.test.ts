/**
 * Croissance, étape 2 — partage : liens WhatsApp, repli sur la feuille de
 * partage, aucun montant ni nom dans les modèles et la carte trophée,
 * événement sans contenu, déclarations WhatsApp précises (Android, iPhone).
 */
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import * as share from '../src/core/share';
import { sanitize } from '../src/core/analyticsProps';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { REWARDS } from '../src/core/coach/rewards';

const require = createRequire(import.meta.url);
const plugin = require('../plugins/withWhatsAppQueries.js') as {
  applyWhatsAppQueries: (m: unknown) => { manifest: { queries: { package?: { $: Record<string, string> }[]; intent?: { data?: { $: Record<string, string> }[] }[] }[] } };
  PACKAGES: string[];
};

describe('liens WhatsApp', () => {
  it('message encodé une fois : accents, émoji, &, ?, #, retour à la ligne', () => {
    const text = 'Rejoins notre tontine « Économie & Co » 🏆 ?#\nhttps://dinerox.app/i/ABC234?src=whatsapp';
    const url = share.whatsappAppUrl(text);
    expect(url.startsWith('whatsapp://send?text=')).toBe(true);
    // Partie message : aucun caractère brut qui casserait le lien.
    expect(url.slice('whatsapp://send?text='.length)).not.toMatch(/[ «»🏆#\n&?]/u);
    expect(decodeURIComponent(url.slice('whatsapp://send?text='.length))).toBe(text);
    expect(decodeURIComponent(share.whatsappWebUrl(text).slice('https://wa.me/?text='.length))).toBe(text);
  });
  it('lien d’invitation partagé : code et source `src=whatsapp`', () => {
    const link = share.shareInviteLink('dinerox.app', 'ABC234', 'whatsapp');
    expect(link).toBe('https://dinerox.app/i/ABC234?src=whatsapp');
    expect(share.whatsappAppUrl(`Essaie : ${link}`)).toContain(encodeURIComponent('https://dinerox.app/i/ABC234?src=whatsapp'));
  });
  it('lien court écrit sur l’image ; sans code : le domaine seul', () => {
    expect(share.shortLink('dinerox.app', 'ABC234')).toBe('dinerox.app/i/ABC234');
    expect(share.shortLink('dinerox.app', null)).toBe('dinerox.app');
  });
});

describe('WhatsApp absent → feuille de partage', () => {
  it('téléphone avec WhatsApp → WhatsApp ; sans WhatsApp → feuille de partage ; navigateur → WhatsApp Web', () => {
    expect(share.pickShareRoute({ platform: 'android', whatsappInstalled: true })).toBe('whatsapp_app');
    expect(share.pickShareRoute({ platform: 'android', whatsappInstalled: false })).toBe('system');
    expect(share.pickShareRoute({ platform: 'ios', whatsappInstalled: false })).toBe('system');
    expect(share.pickShareRoute({ platform: 'web', whatsappInstalled: false })).toBe('whatsapp_web');
  });

  it('composant : WhatsApp absent ou refusant de s’ouvrir → Share.share avec le même message, événement « system »', async () => {
    const calls: { linking: string[]; shared: string[]; events: unknown[] } = { linking: [], shared: [], events: [] };
    let installed = false;
    let openFails = false;
    vi.resetModules();
    vi.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      Linking: {
        canOpenURL: async () => installed,
        openURL: async (u: string) => {
          if (openFails) throw new Error('refus');
          calls.linking.push(u);
        },
      },
      Share: { share: async (c: { message: string }) => void calls.shared.push(c.message) },
    }));
    vi.doMock('@/services/analytics', () => ({ analytics: { track: (e: string, p: unknown) => calls.events.push([e, p]) } }));
    vi.doMock('@/i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
    vi.doMock('@/components/ui', () => ({ Button: () => null, useToast: () => ({ show: () => undefined }) }));
    const { shareTextViaWhatsApp } = await import('../src/features/share/ShareWhatsAppButton');

    expect(await shareTextViaWhatsApp('Bonjour 🏆', 'invite')).toBe('system');
    expect(calls.shared).toEqual(['Bonjour 🏆']);
    installed = true;
    expect(await shareTextViaWhatsApp('Bonjour 🏆', 'invite')).toBe('whatsapp');
    expect(calls.linking).toEqual([share.whatsappAppUrl('Bonjour 🏆')]);
    openFails = true;
    expect(await shareTextViaWhatsApp('Encore', 'trophy')).toBe('system');
    expect(calls.shared).toEqual(['Bonjour 🏆', 'Encore']);
    expect(calls.events).toEqual([
      ['share_clicked', { context: 'invite', channel: 'system' }],
      ['share_clicked', { context: 'invite', channel: 'whatsapp' }],
      ['share_clicked', { context: 'trophy', channel: 'system' }],
    ]);
    vi.doUnmock('react-native');
    vi.doUnmock('@/services/analytics');
    vi.doUnmock('@/i18n');
    vi.doUnmock('@/components/ui');
  });
});

describe('aucun montant ni nom dans les textes et l’image partagés', () => {
  it('détection des montants : chiffres groupés, unités monétaires ; compteurs admis', () => {
    for (const s of ['5 000 FCFA', '25000', '1 500', '1 500', '12 €', '30 $', '45 francs']) expect(share.containsAmount(s), s).toBe(true);
    for (const s of ['1 mois de Plus', '5 personnes', 'jour 3/7', 'Essaie avec mon lien : {link}', 'Nouveau trophée sur {app} 🏆']) expect(share.containsAmount(s), s).toBe(false);
  });
  it('modèles FR et EN : aucun montant, et le lien est bien dans le message d’invitation', () => {
    const keys = ['ref.shareMessage', 'share.whatsapp', 'share.trophy.cta', 'share.trophy.title', 'more.whatsappChannel', 'more.sub.whatsappChannel'] as const;
    for (const dict of [fr, en]) {
      for (const k of keys) expect(share.containsAmount(dict[k]), k).toBe(false);
      expect(dict['ref.shareMessage']).toContain('{link}');
      expect(dict['ref.shareMessage']).not.toMatch(/chacun|each of us/i);
    }
  });
  it('carte trophée : titre, nom du trophée, lien court, code — rien d’autre (ni nom, ni prénom, ni montant)', () => {
    const card = share.trophyCard({ rewardNameKey: 'reward.regular_entry.name', code: 'ABC234', host: 'dinerox.app' });
    expect(Object.keys(card).sort()).toEqual(['code', 'link', 'rewardNameKey', 'titleKey']);
    expect(card).toEqual({ titleKey: 'share.trophy.title', rewardNameKey: 'reward.regular_entry.name', link: 'dinerox.app/i/ABC234', code: 'ABC234' });
    // Chaque trophée partageable : nom sans montant, en français et en anglais.
    for (const r of REWARDS) {
      for (const dict of [fr, en]) expect(share.containsAmount((dict as Record<string, string>)[r.nameKey]), r.nameKey).toBe(false);
    }
  });
});

describe('événement share_clicked', () => {
  it('contexte et canal seulement : jamais le message, le code, un nom ni un montant', () => {
    expect(sanitize({ context: 'invite', channel: 'whatsapp', message: 'J’utilise…', code: 'ABC234', name: 'Awa', amount: 5000 })).toEqual({ context: 'invite', channel: 'whatsapp' });
  });
});

describe('chaîne WhatsApp (adresse publiée par l’admin)', () => {
  it('seule une adresse https de chaîne WhatsApp est acceptée ; sinon la ligne reste cachée', () => {
    expect(share.isWhatsAppChannelUrl('https://whatsapp.com/channel/0029VaAbCdEf12')).toBe(true);
    expect(share.isWhatsAppChannelUrl('https://www.whatsapp.com/channel/0029VaAbCdEf12/')).toBe(true);
    for (const bad of ['', null, 'http://whatsapp.com/channel/0029VaAbCdEf12', 'https://evil.com/channel/0029VaAbCdEf12', 'javascript:alert(1)', 'https://whatsapp.com/channel/']) {
      expect(share.isWhatsAppChannelUrl(bad), String(bad)).toBe(false);
    }
  });
});

describe('déclarations WhatsApp (visibilité des applications)', () => {
  it('Android : exactement WhatsApp, WhatsApp Business et le schéma whatsapp — sans doublon, jamais « toutes les applis »', () => {
    const base = { manifest: { queries: [{ intent: [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': 'https' } }] }] }] } };
    const once = plugin.applyWhatsAppQueries(JSON.parse(JSON.stringify(base)));
    const twice = plugin.applyWhatsAppQueries(JSON.parse(JSON.stringify(once)));
    const q = twice.manifest.queries[0];
    expect((q.package ?? []).map((p) => p.$['android:name'])).toEqual(['com.whatsapp', 'com.whatsapp.w4b']);
    const schemes = (q.intent ?? []).flatMap((i) => (i.data ?? []).map((d) => d.$['android:scheme']));
    expect(schemes).toEqual(['https', 'whatsapp']);
    expect(JSON.stringify(twice)).not.toContain('QUERY_ALL_PACKAGES');
  });
  it('iPhone : seul le schéma whatsapp est déclaré', async () => {
    const { default: config } = await import('../app.config');
    const ios = config({ config: {} } as never).ios as { infoPlist?: { LSApplicationQueriesSchemes?: string[] } };
    expect(ios.infoPlist?.LSApplicationQueriesSchemes).toEqual(['whatsapp']);
  });
});
