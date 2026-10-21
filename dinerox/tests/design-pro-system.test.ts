/**
 * Design-pro, étape 3 (docs/design-system.md) : jetons de la direction B, icônes de contenu
 * (Fluent Emoji 3D + icônes composées), logos des opérateurs, et les corrections du fondateur
 * du 2026-10-21 (Canal+ en 📺, moto rouge, cloche seule, alertes sans emoji).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { darkColorsV2, lightColorsV2, radiusV2 } from '../src/theme/tokens';
import { contrastRatio } from '../src/theme/contrast';
import { CONTENT_ICON_SLUGS, accountMark, iconSlugFor, transactionIconIds, withOperatorOverrides } from '../src/components/ui/contentIconMap';
import operators from '../src/config/operators.json';
import { buildDemoData } from '../src/core/demo';
import catalog from '../src/core/categoryCatalog.v2.json';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';

const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('jetons de la direction B', () => {
  it('palette claire et sombre (sable, vert profond, encre)', () => {
    expect([lightColorsV2.background, lightColorsV2.surface, lightColorsV2.surfaceAlt, lightColorsV2.text, lightColorsV2.primary]).toEqual(['#F4F1EA', '#FFFCF7', '#EDE7DC', '#1F1C17', '#0F4A3A']);
    expect([darkColorsV2.background, darkColorsV2.surface, darkColorsV2.surfaceAlt, darkColorsV2.text, darkColorsV2.primary]).toEqual(['#13120F', '#1D1B17', '#29261F', '#F3EFE7', '#4FB08F']);
  });
  it('carte d’accueil (b) : vert UNI, aucun dégradé', () => {
    expect(lightColorsV2.heroFrom).toBe('#0F4A3A');
    expect(lightColorsV2.heroTo).toBe(lightColorsV2.heroFrom);
    expect(darkColorsV2.heroFrom).toBe('#123A2F');
    expect(darkColorsV2.heroTo).toBe(darkColorsV2.heroFrom);
  });
  it('textes sur le vert : AA (≥ 4,5:1) en clair et en sombre', () => {
    for (const c of [lightColorsV2, darkColorsV2]) {
      expect(c.onHeroMuted).toBe('#C9DED6');
      expect(contrastRatio(c.onHero, c.heroFrom)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.onHeroMuted, c.heroFrom)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('une dépense est à l’encre, pas en rouge ; le rouge reste l’alerte', () => {
    expect(lightColorsV2.expense).toBe(lightColorsV2.text);
    expect(darkColorsV2.expense).toBe(darkColorsV2.text);
    expect(lightColorsV2.danger).toBe('#B3261E');
  });
  it('rond clair derrière les icônes de contenu : en sombre seulement', () => {
    expect(lightColorsV2.iconHalo).toBe('transparent');
    expect(darkColorsV2.iconHalo).toBe('#3A362F');
  });
  it('rayons : cartes 16, contrôles 12, feuilles 20, icônes 12', () => {
    expect([radiusV2.card, radiusV2.control, radiusV2.sheet, radiusV2.icon]).toEqual([16, 12, 20, 12]);
  });
});

describe('icônes de contenu', () => {
  it('Canal+ : la SOUS-catégorie « Abonnements streaming » prend 📺 ; sans sous-catégorie, la catégorie', () => {
    expect(iconSlugFor({ ids: transactionIconIds({ subcategoryId: 'sub_leisure_subscriptions', categoryId: 'cat_leisure' }) })).toBe('television');
    expect(iconSlugFor({ ids: transactionIconIds({ categoryId: 'cat_leisure' }) })).toBe('party-popper');
    expect(transactionIconIds({ subcategoryId: null, categoryId: 'cat_food' })).toEqual(['cat_food']);
  });
  it('toutes les motos : moto rouge composée (identifiant ou emoji 🏍️)', () => {
    expect(iconSlugFor({ ids: ['sub_transport_mototaxi'] })).toBe('moto_rouge_3d');
    expect(iconSlugFor({ ids: ['buy_moto'] })).toBe('moto_rouge_3d');
    expect(iconSlugFor({ emoji: '🏍️' })).toBe('moto_rouge_3d');
    expect(iconSlugFor({ emoji: '🏍' })).toBe('moto_rouge_3d');
  });
  it('famille : icône composée (catégorie, enveloppe Famille)', () => {
    expect(iconSlugFor({ ids: ['cat_family'] })).toBe('famille_3d_medium-dark');
  });
  it('l’emoji choisi par la personne passe avant l’identifiant ; inconnu = aucune icône 3D', () => {
    expect(iconSlugFor({ emoji: '🛡️', ids: ['finance'] })).toBe('shield');
    expect(iconSlugFor({ ids: ['inconnu'], emoji: '🦄' })).toBeNull();
  });
  it('chaque icône existe en 1x, 2x et 3x ; poids total ≤ 1,5 Mo', () => {
    let total = 0;
    for (const slug of CONTENT_ICON_SLUGS) {
      for (const s of ['', '@2x', '@3x']) {
        const f = path.join(root, 'assets/icons3d', `${slug}${s}.webp`);
        expect(fs.existsSync(f), f).toBe(true);
        total += fs.statSync(f).size;
      }
    }
    for (const o of operators.operateurs) {
      if (!o.logo) continue;
      for (const s of ['', '@2x', '@3x']) total += fs.statSync(path.join(root, 'assets/operators', `${o.id}${s}.webp`)).size;
    }
    expect(total).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
});

describe('opérateurs : logo ou pastille, un réglage par opérateur (donnée)', () => {
  it('Orange, MTN, Moov, Wave, Airtel : logo ; Free : pastille', () => {
    expect(accountMark({ type: 'mobile_money', provider: 'orange_money' })).toEqual({ kind: 'logo', operator: 'orange' });
    expect(accountMark({ type: 'mobile_money', provider: 'wave' })).toEqual({ kind: 'logo', operator: 'wave' });
    expect(accountMark({ type: 'mobile_money', provider: 'free_money' })).toMatchObject({ kind: 'pill', operator: 'free', initials: 'FM' });
  });
  it('passer un opérateur à « pastille » dans la donnée retire son logo, sans code', () => {
    const data = { operateurs: operators.operateurs.map((o) => (o.id === 'orange' ? { ...o, affichage: 'pastille' } : o)) };
    expect(accountMark({ type: 'mobile_money', provider: 'orange_money' }, data)).toMatchObject({ kind: 'pill', operator: 'orange', initials: 'OM' });
  });
  it('réglage publié à distance : seul « logo » / « pastille » change, le reste est ignoré', () => {
    const d = withOperatorOverrides(operators, { affichage: { mtn: 'pastille', wave: 'rouge', free: 'logo', inconnu: 'pastille' } });
    expect(accountMark({ type: 'mobile_money', provider: 'mtn_momo' }, d)).toMatchObject({ kind: 'pill', initials: 'MTN' });
    expect(accountMark({ type: 'mobile_money', provider: 'wave' }, d)).toEqual({ kind: 'logo', operator: 'wave' });
    // Free n'a aucun fichier de logo : il reste en pastille.
    expect(accountMark({ type: 'mobile_money', provider: 'free_money' }, d)).toMatchObject({ kind: 'pill' });
    expect(withOperatorOverrides(operators, null)).toBe(operators);
  });
  it('les autres comptes : icône 3D de leur type', () => {
    expect(accountMark({ type: 'bank', provider: 'bank' })).toEqual({ kind: '3d', slug: 'bank' });
    expect(accountMark({ type: 'savings', provider: 'none' })).toEqual({ kind: '3d', slug: 'pig-face' });
    expect(accountMark({ type: 'savings', provider: 'tontine' })).toEqual({ kind: '3d', slug: 'tontine_all_3d' });
  });
});

describe('corrections du fondateur (2026-10-21)', () => {
  const emojiStart = /^\p{Extended_Pictographic}/u;
  it('alertes : aucun emoji qui double l’icône (fr et en)', () => {
    for (const dict of [fr, en] as Record<string, string>[]) {
      const bad = Object.entries(dict).filter(([k, v]) => k.startsWith('ins.') && emojiStart.test(v));
      expect(bad.map(([k]) => k)).toEqual([]);
    }
  });
  it('en-tête de l’accueil : la cloche seule (48 dp), « Notifications » lu par le lecteur d’écran', () => {
    const src = read('src/components/AppHeader.tsx');
    const v2 = src.slice(src.indexOf('if (v2)'), src.indexOf('return (\n    <View style={{ flexDirection'));
    expect(v2).toContain("accessibilityLabel={t('notif.title')}");
    expect(v2).not.toMatch(/<Text[^>]*>\{t\('notif\.title'\)\}<\/Text>/);
    expect(v2).toMatch(/minWidth: 48/);
  });
  it('démonstration : « Canal+ » rangée dans « Abonnements streaming » (donnée de démonstration seulement)', () => {
    const d = buildDemoData({ now: 1, uid: 'u', today: '2026-10-21', label: (k) => k });
    const canal = d.transactions.filter((x) => x.payee === 'Canal+');
    expect(canal.length).toBeGreaterThan(0);
    for (const x of canal) expect([x.categoryId, x.subcategoryId]).toEqual(['cat_leisure', 'sub_leisure_subscriptions']);
    expect((catalog.entries as { id: string; parentId: string | null }[]).find((c) => c.id === 'sub_leisure_subscriptions')?.parentId).toBe('cat_leisure');
  });
  it('listes d’opérations : l’icône vient de la sous-catégorie, sinon de la catégorie', () => {
    expect(read('src/features/rows.tsx')).toMatch(/transactionIconIds\(tx\)/);
  });
});
