/** Saisie vocale et écrite (1.8) : mots-clés du catalogue, mots personnels, apprentissage après correction. */
import { describe, expect, it } from 'vitest';
import { keywordIndex, learnWord, learnableWord, matchKeyword } from '../src/core/entry/keywords';
import { catalogStarterDocs, normalizeWord } from '../src/core/categoryCatalog';
import type { Category } from '../src/core/types';

const v2 = () => catalogStarterDocs('CI', { now: 1, uid: 'u' });
const m = (text: string, cats: Category[], kind: 'income' | 'expense' = 'expense') => {
  const k = matchKeyword(normalizeWord(text), keywordIndex(cats), kind);
  return k ? [k.categoryId, k.subcategoryId] : null;
};

describe('mots-clés du catalogue (espace sur le catalogue 1.8)', () => {
  it('exemples du fondateur', () => {
    const c = v2();
    expect(m('Yango 2 500', c)).toEqual(['cat_transport', 'sub_transport_vtc']);
    expect(m('VTC 3000', c)).toEqual(['cat_transport', 'sub_transport_vtc']);
    expect(m('woro-woro 300', c)).toEqual(['cat_transport', 'sub_transport_taxi']);
    expect(m('gbaka 200', c)).toEqual(['cat_transport', 'sub_transport_bus']);
    expect(m('pharmacie 4 500', c)).toEqual(['cat_health', 'sub_health_pharmacy']);
    expect(m('médicaments 2000', c)).toEqual(['cat_health', 'sub_health_pharmacy']);
    expect(m('garba 500', c)).toEqual(['cat_food', 'sub_food_streetfood']);
    expect(m('alloco 300', c)).toEqual(['cat_food', 'sub_food_streetfood']);
    expect(m('crédit 1000', c)).toEqual(['cat_communication', 'sub_comm_airtime']);
    expect(m('unités 500', c)).toEqual(['cat_communication', 'sub_comm_airtime']);
    expect(m('Canal+ 10 000', c)).toEqual(['cat_leisure', 'sub_leisure_subscriptions']);
    expect(m('Netflix 5000', c)).toEqual(['cat_leisure', 'sub_leisure_subscriptions']);
    for (const [w, sub] of [['tontine', 'sub_informal_tontine'], ['cotisation', 'sub_informal_dues'], ['funérailles', 'sub_social_funerals'], ['mariage', 'sub_social_weddings'], ['baptême', 'sub_social_baptisms']]) {
      expect(m(`${w} 10 000`, c)).toEqual(['cat_social', sub]);
    }
  });
  it('le mot le plus long l’emporte ; aucun mot → rien', () => {
    expect(m('pass internet 1000', v2())).toEqual(['cat_communication', 'sub_comm_data']);
    expect(m('bonjour 1000', v2())).toBeNull();
  });
  it('espace pas encore mis à jour (anciennes catégories) : les mots du catalogue ne s’appliquent pas', () => {
    const old = v2().map((c) => ({ ...c, catalogVersion: undefined }));
    expect(m('Yango 2 500', old)).toBeNull();
  });
  it('catégorie désactivée (ou parent désactivé) : jamais proposée', () => {
    const c = v2().map((x) => (x.id === 'cat_transport' ? { ...x, disabled: true } : x));
    expect(m('Yango 2 500', c)).toBeNull();
  });
});

describe('mots personnels et apprentissage', () => {
  const mine = (): Category[] => [...v2(), { id: 'cat_u_moto', kind: 'expense', name: 'Moto', icon: 'x', color: '#000', order: 99, keywords: ['djakarta'], createdAt: 1, updatedAt: 1, createdBy: 'u' }];
  it('mots-clés d’une catégorie personnelle', () => {
    expect(m('Djakarta 1 000', mine())).toEqual(['cat_u_moto', null]);
  });
  it('mot à retenir d’un extrait corrigé : ni nombre, ni montant, ni liaison', () => {
    expect(learnableWord('Djakarta 1 000')).toBe('djakarta');
    expect(learnableWord("J'ai payé 2 000 francs pour le pressing")).toBe('pressing');
    expect(learnableWord('2 000 et 500')).toBeNull();
  });
  it('après correction, le mot est proposé en premier ; la dernière correction l’emporte ; effaçable', () => {
    let cats = v2();
    // « garba » proposé en Snacks ; l'utilisateur corrige vers Restaurant.
    const apply = (changes: Category[]) => (cats = cats.map((c) => changes.find((x) => x.id === c.id) ?? c));
    apply(learnWord(cats, 'garba', 'sub_food_restaurant'));
    expect(m('garba 500', cats)).toEqual(['cat_food', 'sub_food_restaurant']);
    // Nouvelle correction : vers Maquis (le mot quitte Restaurant).
    apply(learnWord(cats, 'garba', 'sub_food_maquis'));
    expect(cats.find((c) => c.id === 'sub_food_restaurant')!.learnedWords).toEqual([]);
    expect(m('garba 500', cats)).toEqual(['cat_food', 'sub_food_maquis']);
    // Effacé depuis l'écran Catégories : retour au mot-clé du catalogue.
    apply([{ ...cats.find((c) => c.id === 'sub_food_maquis')!, learnedWords: [] }]);
    expect(m('garba 500', cats)).toEqual(['cat_food', 'sub_food_streetfood']);
    // Rien à écrire si le mot est déjà au bon endroit.
    expect(learnWord(learnWord(cats, 'garba', 'sub_food_maquis').reduce((acc, c) => acc.map((x) => (x.id === c.id ? c : x)), cats), 'garba', 'sub_food_maquis')).toEqual([]);
  });
});
