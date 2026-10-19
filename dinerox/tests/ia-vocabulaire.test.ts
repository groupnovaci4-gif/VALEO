/**
 * IA — vocabulaire construit depuis l'application (docs/ia-comprend-tout.md §2.0) : catalogue,
 * noms de la personne, rubriques ; rapprochement tolérant ; ambiguïté signalée, jamais tranchée.
 */
import { describe, expect, it } from 'vitest';
import { EMBEDDED_CATALOG } from '../src/core/categoryCatalog';
import { SECTIONS } from '../src/core/ai/sections';
import { bestEntity, buildVocabulary, matchEntities, sameWord, tokens } from '../src/core/ai/vocabulary';
import { iaData } from './fixtures/ia-data';

const vocab = buildVocabulary(iaData());
const ids = (kind: string) => vocab.entries.filter((e) => e.kind === kind).map((e) => e.id);

describe('vocabulaire : tout vient des données de l’application', () => {
  it('chaque entrée du catalogue (95) est un mot connu, en français ET en anglais', () => {
    const cats = new Set(ids('category'));
    for (const e of EMBEDDED_CATALOG.entries) expect(cats.has(e.id), e.id).toBe(true);
    const rent = vocab.entries.find((e) => e.id === 'sub_housing_rent')!;
    expect(rent.variants.map((v) => v.join(' '))).toEqual(expect.arrayContaining(['loyer', 'rent']));
  });

  it('les noms de la personne : enveloppes, objectifs, réserve, moments forts, tontines, comptes, dettes, récurrences, biens', () => {
    expect(ids('envelope')).toEqual(['env_home', 'env_food', 'env_tr', 'env_fam', 'env_free']);
    expect(ids('goal')).toEqual(['g_moto', 'g_car', 'g_wedding', 'g_emergency']);
    expect(ids('reserve')).toEqual(['r_family']);
    expect(ids('season')).toEqual(['s_school', 's_tabaski']);
    expect(ids('tontine')).toEqual(['t_bureau', 't_marche']);
    expect(ids('account')).toEqual(['cash', 'om', 'wave', 'bank', 'sav']);
    expect(ids('debt')).toEqual(['d_koffi', 'd_bank', 'd_awa']);
    expect(ids('recurring')).toEqual(['rec_rent', 'rec_mum', 'rec_salary', 'rec_canal']);
    expect(ids('asset')).toEqual(['as_land', 'as_shop']);
  });

  it('toutes les rubriques de l’application', () => {
    expect(ids('section')).toEqual(SECTIONS.map((s) => s.id));
  });

  it('les catégories désactivées ou supprimées ne sont pas proposées', () => {
    const d = iaData();
    d.categories = d.categories.map((c) => (c.id === 'sub_food_maquis' ? { ...c, disabled: true } : c));
    expect(buildVocabulary(d).entries.some((e) => e.id === 'sub_food_maquis')).toBe(false);
  });
});

describe('rapprochement tolérant', () => {
  it('accents, majuscules, pluriels, articles et possessifs', () => {
    expect(tokens("Mon FONDS d'Urgence")).toEqual(['fond', 'urgence']);
    expect(bestEntity('où en est ma moto', vocab, ['goal']).one?.id).toBe('g_moto');
    expect(bestEntity('les voitures', vocab, ['goal']).one?.id).toBe('g_car');
    expect(bestEntity('combien sur orange money', vocab, ['account']).one?.id).toBe('om');
    expect(bestEntity('sur mon OM', vocab, ['account']).one?.id).toBe('om');
  });

  it('une petite faute de frappe sur un mot de 5 lettres ou plus', () => {
    expect(sameWord('mariage', 'marriage')).toBe(true);
    expect(sameWord('tabaski', 'tabaky')).toBe(false);
    expect(sameWord('moto', 'mot')).toBe(false);
    expect(bestEntity('mon marriage', vocab, ['goal']).one?.id).toBe('g_wedding');
  });

  it('le nom le plus précis l’emporte (« autres transport » plutôt que « transport »)', () => {
    expect(matchEntities('autres transport', vocab, ['category'])[0].entry.id).toBe('sub_transport_other');
  });

  it('« ma tontine » avec deux tontines : ambiguïté (jamais tranchée)', () => {
    const r = bestEntity('quand je paie ma tontine', vocab, ['tontine']);
    expect(r.one).toBeNull();
    expect(r.tied).toEqual([]);
    expect(bestEntity('ma tontine du bureau', vocab, ['tontine']).one?.id).toBe('t_bureau');
  });

  it('une personne : « Koffi », « Awa » ; le prêt banque n’est pas le compte Banque', () => {
    expect(bestEntity('je dois combien a koffi', vocab, ['debt']).one?.id).toBe('d_koffi');
    expect(bestEntity('prochaine echeance du pret banque', vocab, ['debt']).one?.id).toBe('d_bank');
    expect(bestEntity('awa me doit combien', vocab, ['debt']).one?.id).toBe('d_awa');
  });
});
