/** Gestion des catégories (1.8) : supprimer, fusionner, masquer, rétablir, listes de choix, ordre. */
import { describe, expect, it } from 'vitest';
import { canRestore, categoryUsage, cleanKeywords, deleteMode, isCategoryUsed, pickCategories, pickSubcategories, planMerge, reorder, restoreDefaults } from '../src/core/categoryOps';
import { catalogStarterDocs } from '../src/core/categoryCatalog';
import type { Category, RecurringRule } from '../src/core/types';
import { envelope, tx } from './helpers';

const cat = (p: Partial<Category> & { id: string }): Category => ({ createdAt: 1, updatedAt: 1, createdBy: 'u', kind: 'expense', name: p.id, icon: 'x', color: '#000', order: 0, ...p });
const rec = (p: Partial<RecurringRule> & { id: string }): RecurringRule => ({ createdAt: 1, updatedAt: 1, createdBy: 'u', type: 'expense', label: 'r', amount: 1_000, currency: 'XOF', accountId: 'a', frequency: 'monthly', startDate: '2026-10-01', active: true, ...p });

const base = () => {
  const categories = [
    ...catalogStarterDocs('CI', { now: 1, uid: 'u' }),
    cat({ id: 'cat_u_moto', name: 'Moto', order: 50 }),
    cat({ id: 'cat_u_moto_fuel', name: 'Essence moto', parentId: 'cat_u_moto' }),
    cat({ id: 'cat_u_empty', name: 'Jamais servie', order: 51 }),
  ];
  const transactions = [
    tx({ id: 'm1', type: 'expense', amount: 5_000, accountId: 'a', categoryId: 'cat_u_moto' }),
    tx({ id: 'm2', type: 'expense', amount: 2_000, accountId: 'a', categoryId: 'cat_u_moto', subcategoryId: 'cat_u_moto_fuel' }),
    tx({ id: 'f1', type: 'expense', amount: 1_000, accountId: 'a', categoryId: 'cat_food', subcategoryId: 'sub_food_market' }),
  ];
  const recurring = [rec({ id: 'r1', categoryId: 'cat_u_moto' })];
  const envelopes = [envelope({ id: 'e_moto', categoryIds: ['cat_u_moto', 'cat_leisure'] }), envelope({ id: 'e_tr', categoryIds: ['cat_transport'] })];
  return { categories, transactions, recurring, envelopes };
};

describe('supprimer : jamais utilisée / utilisée / système', () => {
  it('jamais utilisée → suppression ; utilisée → fusion ou désactivation ; système → masquage', () => {
    const d = base();
    expect(deleteMode(d.categories.find((c) => c.id === 'cat_u_empty')!, d)).toBe('delete');
    expect(deleteMode(d.categories.find((c) => c.id === 'cat_u_moto')!, d)).toBe('merge_or_disable');
    expect(deleteMode(d.categories.find((c) => c.id === 'cat_food')!, d)).toBe('hide');
    expect(categoryUsage('cat_u_moto', d)).toEqual({ transactions: 2, recurring: 1, envelopes: 1, children: 1 });
    // Une sous-catégorie utilisée rend sa catégorie principale utilisée.
    const only = { ...d, transactions: [d.transactions[1]], recurring: [] };
    expect(isCategoryUsed('cat_u_moto', only)).toBe(true);
  });
});

describe('fusion : « Déplacer ses opérations vers… »', () => {
  it('catégorie principale → autre principale : opérations, récurrences, enveloppes et sous-catégories suivent ; aucune orpheline', () => {
    const d = base();
    const p = planMerge('cat_u_moto', 'cat_transport', d)!;
    expect(p.transactions.map((t) => [t.id, t.categoryId, t.subcategoryId ?? null])).toEqual([
      ['m1', 'cat_transport', null],
      ['m2', 'cat_transport', 'cat_u_moto_fuel'],
    ]);
    expect(p.recurring.map((r) => r.categoryId)).toEqual(['cat_transport']);
    expect(p.envelopes.map((e) => [e.id, e.categoryIds])).toEqual([['e_moto', ['cat_transport', 'cat_leisure']]]);
    expect(p.children.map((c) => [c.id, c.parentId])).toEqual([['cat_u_moto_fuel', 'cat_transport']]);
    // Après fusion, plus rien ne pointe vers la source.
    const after = d.transactions.map((t) => p.transactions.find((x) => x.id === t.id) ?? t);
    expect(after.some((t) => t.categoryId === 'cat_u_moto')).toBe(false);
    // Totaux inchangés.
    expect(after.reduce((n, t) => n + t.amount, 0)).toBe(d.transactions.reduce((n, t) => n + t.amount, 0));
  });

  it('vers une sous-catégorie : catégorie et sous-catégorie renseignées', () => {
    const d = base();
    const p = planMerge('cat_u_moto', 'sub_transport_fuel', d)!;
    expect(p.transactions.every((t) => t.categoryId === 'cat_transport' && t.subcategoryId === 'sub_transport_fuel')).toBe(true);
  });

  it('les mots de la saisie vocale passent à la cible ; une catégorie système fusionnée est masquée, jamais supprimée', () => {
    const d = base();
    d.categories = d.categories.map((c) => (c.id === 'cat_leisure' ? { ...c, keywords: ['boite'] } : c.id === 'cat_other' ? { ...c, keywords: ['divers'] } : c));
    d.transactions.push(tx({ id: 'l1', type: 'expense', amount: 3_000, accountId: 'a', categoryId: 'cat_leisure' }));
    const p = planMerge('cat_leisure', 'cat_other', d)!;
    expect(p.target.keywords).toEqual(['divers', 'boite']);
    expect(p.source.disabled).toBe(true);
    expect(p.source.deleted).toBeUndefined();
  });

  it('refus : même catégorie, types différents, ou vers sa propre sous-catégorie', () => {
    const d = base();
    d.categories.push(cat({ id: 'inc_x', kind: 'income' }));
    expect(planMerge('cat_u_moto', 'cat_u_moto', d)).toBeNull();
    expect(planMerge('cat_u_moto', 'inc_x', d)).toBeNull();
    expect(planMerge('cat_u_moto', 'cat_u_moto_fuel', d)).toBeNull();
  });
});

describe('catégorie système : masquer puis « Rétablir par défaut »', () => {
  it('rend le libellé, l’emoji et la couleur du catalogue, et la réaffiche', () => {
    const food = catalogStarterDocs('CI', { now: 1, uid: 'u' }).find((c) => c.id === 'cat_food')!;
    const changed: Category = { ...food, name: 'Bouffe', emoji: '🍔', color: '#000000', disabled: true };
    expect(canRestore(changed)).toBe(true);
    const r = restoreDefaults(changed);
    expect([r.name, r.labelKey, r.emoji, r.color, r.disabled]).toEqual(['', 'catalog:cat_food', '🍛', '#F59E0B', undefined]);
    expect(canRestore(r)).toBe(false);
  });
  it('ancienne catégorie système (hors catalogue) : libellé d’origine', () => {
    const r = restoreDefaults(cat({ id: 'cat_taxes', name: 'Mes impôts', system: true, labelKey: 'cat.taxes' }));
    expect([r.name, r.labelKey]).toEqual(['', 'cat.taxes']);
  });
});

describe('listes de choix : recherche, récentes en premier, masquées, désactivées', () => {
  const d = base();
  const label = (id: string) => (d.categories.find((c) => c.id === id)?.name || id);
  const opts = { kind: 'expense' as const, showAll: false, query: '', recent: [] as string[], label: (id: string) => labelFr(id), spaceOnCatalog: true, used: new Set<string>(), profile: null };
  const fr: Record<string, string> = { cat_food: 'Alimentation & boissons', cat_transport: 'Transport', sub_transport_vtc: 'Yango / VTC', cat_family: 'Famille', sub_family_children: 'Enfants' };
  function labelFr(id: string) {
    return fr[id] ?? label(id);
  }
  it('récentes en premier, puis l’ordre de l’utilisateur', () => {
    const ids = pickCategories(d.categories, { ...opts, recent: ['cat_transport', 'cat_food'] }).map((c) => c.id);
    expect(ids.slice(0, 3)).toEqual(['cat_transport', 'cat_food', 'cat_family']);
  });
  it('recherche par nom de catégorie, de sous-catégorie ou par mot-clé (accents ignorés)', () => {
    expect(pickCategories(d.categories, { ...opts, query: 'yango' }).map((c) => c.id)).toEqual(['cat_transport']);
    expect(pickCategories(d.categories, { ...opts, query: 'ALIMENTATION' }).map((c) => c.id)).toEqual(['cat_food']);
    const withWord = d.categories.map((c) => (c.id === 'cat_u_moto' ? { ...c, keywords: ['djakarta'] } : c));
    expect(pickCategories(withWord, { ...opts, query: 'djakarta' }).map((c) => c.id)).toEqual(['cat_u_moto']);
  });
  it('masquée par le profil : absente par défaut, présente avec « Afficher toutes les catégories »', () => {
    const profile = { familyStatus: 'single' as const, children: 0, dependents: 0 };
    expect(pickSubcategories(d.categories, 'cat_family', { ...opts, profile }).map((c) => c.id)).not.toContain('sub_family_children');
    expect(pickSubcategories(d.categories, 'cat_family', { ...opts, profile, showAll: true }).map((c) => c.id)).toContain('sub_family_children');
  });
  it('désactivée : hors des choix (même « toutes »), sauf si déjà choisie', () => {
    const off = d.categories.map((c) => (c.id === 'cat_u_moto' ? { ...c, disabled: true } : c));
    expect(pickCategories(off, { ...opts, showAll: true }).some((c) => c.id === 'cat_u_moto')).toBe(false);
    expect(pickCategories(off, { ...opts, keep: 'cat_u_moto' }).some((c) => c.id === 'cat_u_moto')).toBe(true);
  });
});

describe('réordonner (glisser-déposer) et mots-clés', () => {
  it('nouvel ordre : seules les catégories déplacées changent', () => {
    const list = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }, { id: 'd', order: 3 }];
    expect(reorder(list, 'd', 1)).toEqual([{ id: 'd', order: 1 }, { id: 'b', order: 2 }, { id: 'c', order: 3 }]);
    expect(reorder(list, 'a', 0)).toEqual([]);
  });
  it('mots-clés normalisés, sans doublon', () => {
    expect(cleanKeywords('Djakarta, djakarta ; Moto-taxi\nÉcole, x')).toEqual(['djakarta', 'moto-taxi', 'ecole']);
  });
});
