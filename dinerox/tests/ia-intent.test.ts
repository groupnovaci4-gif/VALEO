/**
 * IA — compréhension locale (docs/ia-comprend-tout.md §1, §2, §4, §7) : corpus de phrases
 * (fr + en, tournures ivoiriennes, fautes, montants en lettres), taux de phrases comprises sur
 * le téléphone, couverture (rubriques de Plus, catalogue, types de données), interdits, ambiguïtés.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { EMBEDDED_CATALOG } from '../src/core/categoryCatalog';
import { SECTIONS } from '../src/core/ai/sections';
import { answerAsk, intentContext, understand, type Intent } from '../src/core/ai/intent';
import { iaData, TODAY } from './fixtures/ia-data';
import CORPUS from './fixtures/ia-phrases.json';

type Expect = Record<string, string | number> | 'ia';
const phrases = (CORPUS as { phrases: { text: string; expect: Expect }[] }).phrases;
const data = iaData();
const ctx = intentContext(data, { today: TODAY, currency: 'XOF' });

/** Ce que l'on compare d'une intention (seuls les champs attendus comptent). */
function view(i: Intent): Record<string, unknown> {
  switch (i.kind) {
    case 'question':
      return { kind: i.kind, topic: i.topic, ref: i.ref?.id, categoryId: i.categoryId ?? undefined, subcategoryId: i.subcategoryId ?? undefined, amount: i.amount ?? undefined, period: i.period };
    case 'action':
      return { kind: i.kind, action: i.action, amount: i.amount ?? undefined, ref: i.ref?.id, from: i.from?.id, to: i.to?.id, label: i.label ?? undefined, direction: i.direction, dueDay: i.dueDay ?? undefined, categoryId: i.categoryId ?? undefined, subcategoryId: i.subcategoryId ?? undefined };
    case 'ask': {
      const inner = view(i.intent);
      return { ...inner, kind: 'ask', field: i.field };
    }
    case 'entry': {
      const d = i.drafts[0];
      return { kind: 'entry', lines: i.drafts.length, type: d?.type, amount: d?.amount ?? undefined, categoryId: d?.categoryId ?? undefined, subcategoryId: d?.subcategoryId ?? undefined, account: d?.accountId ?? undefined, tontine: d?.tontine?.id };
    }
    case 'open':
      return { kind: 'open', section: i.section };
    case 'forbidden':
      return { kind: 'forbidden', reason: i.reason };
    case 'notFound':
      return { kind: 'notFound', entity: i.entity, word: i.word };
    default:
      return { kind: i.kind };
  }
}

const matches = (got: Record<string, unknown>, want: Record<string, string | number>) => Object.entries(want).every(([k, v]) => got[k] === v);

describe('corpus : chaque phrase comprise comme prévu', () => {
  it(`plus de 200 phrases (${phrases.length}), français et anglais`, () => {
    expect(phrases.length).toBeGreaterThan(200);
    expect(phrases.some((p) => /\b(the|my|how|what)\b/i.test(p.text))).toBe(true);
  });

  for (const p of phrases) {
    it(p.text, () => {
      const got = view(understand(p.text, ctx));
      if (p.expect === 'ia') expect(got.kind, JSON.stringify(got)).toBe('unknown');
      else expect(got, JSON.stringify(got)).toMatchObject(Object.fromEntries(Object.entries(p.expect).map(([k, v]) => [k, v])));
    });
  }

  it('au moins 80 % des phrases comprises sur le téléphone (sans réseau)', () => {
    const local = phrases.filter((p) => p.expect !== 'ia' && matches(view(understand(p.text, ctx)), p.expect));
    const rate = local.length / phrases.length;
    console.log(`IA — phrases comprises sur le téléphone : ${local.length}/${phrases.length} (${Math.round(rate * 1000) / 10} %)`);
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });
});

describe('couverture : toute l’application a ses phrases', () => {
  const wanted = phrases.map((p) => p.expect).filter((e): e is Record<string, string | number> => e !== 'ia');

  it('chaque ligne de l’onglet Plus a sa rubrique (lue dans more.tsx)', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'app', '(tabs)', 'more.tsx'), 'utf8');
    const keys = [...src.matchAll(/\{ key: '([^']+)', sub:/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(SECTIONS.some((s) => s.moreKey === k), k).toBe(true);
  });

  it('chaque rubrique a au moins une phrase', () => {
    for (const s of SECTIONS) expect(wanted.some((e) => e.section === s.id), s.id).toBe(true);
  });

  it('chaque entrée du catalogue des catégories a au moins une phrase', () => {
    for (const e of EMBEDDED_CATALOG.entries) expect(wanted.some((w) => w.categoryId === e.id || w.subcategoryId === e.id), e.id).toBe(true);
  });

  it('chaque type de donnée de la personne a au moins une phrase', () => {
    const kindOf = new Map(ctx.vocab.entries.map((e) => [e.id, e.kind]));
    const kinds = new Set(wanted.flatMap((w) => [w.ref, w.from, w.to, w.tontine, w.account]).filter(Boolean).map((id) => kindOf.get(String(id))));
    for (const k of ['envelope', 'goal', 'reserve', 'season', 'tontine', 'account', 'debt', 'recurring', 'asset']) expect(kinds.has(k as never), k).toBe(true);
  });
});

describe('interdits, ambiguïtés, données', () => {
  it('chaque intention interdite est refusée, avec l’écran concerné', () => {
    const reasons = new Set(expectsOf('forbidden').map((e) => e.reason));
    for (const r of ['delete', 'edit_past', 'subscription', 'security', 'members', 'export', 'settings', 'real_money']) expect(reasons.has(r), r).toBe(true);
    const f = understand('Change mon mot de passe', ctx);
    expect(f).toMatchObject({ kind: 'forbidden', section: 'settings' });
  });

  it('une ambiguïté produit une question avec les choix tirés des données ; la réponse complète l’intention', () => {
    const a = understand('Quand est-ce que je paie ma tontine ?', ctx);
    expect(a.kind).toBe('ask');
    if (a.kind !== 'ask') return;
    expect(a.options.map((o) => o.id)).toEqual(['t_bureau', 't_marche']);
    expect(view(answerAsk(a, 't_marche', ctx))).toMatchObject({ kind: 'question', topic: 'tontine_next', ref: 't_marche' });
  });

  it('« L’argent disponible » n’est pas un compte : plusieurs comptes peuvent couvrir → « Depuis quel compte ? »', () => {
    const a = understand('Mets 50 000 de côté', ctx);
    expect(a.kind).toBe('ask');
    if (a.kind !== 'ask') return;
    expect(a.field).toBe('from');
    expect(a.options.map((o) => o.id)).toEqual(['om', 'bank']);
    expect(view(answerAsk(a, 'om', ctx))).toMatchObject({ kind: 'action', action: 'save', from: 'om', to: 'sav', amount: 50000 });
  });

  it('jamais deviné : aucune tontine → « Je ne trouve pas » avec la liste ; aucun nom inventé', () => {
    const f = understand('Je dois combien à Yao ?', ctx);
    expect(f).toMatchObject({ kind: 'notFound', entity: 'debt', word: 'yao' });
    if (f.kind === 'notFound') expect(f.options.map((o) => o.label)).toEqual(['Koffi', 'Prêt banque', 'Awa']);
  });

  it('comprendre ne modifie rien (fonction pure : mêmes données avant et après)', () => {
    const before = JSON.stringify(data);
    for (const p of phrases) understand(p.text, ctx);
    expect(JSON.stringify(data)).toBe(before);
  });
});

function expectsOf(kind: string) {
  return phrases.map((p) => p.expect).filter((e): e is Record<string, string | number> => e !== 'ia' && e.kind === kind);
}
