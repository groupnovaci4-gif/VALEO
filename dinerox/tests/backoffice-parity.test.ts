import { describe, expect, it, vi } from 'vitest';

import { linkedRemovals as appRemovals, type RemovalData } from '../src/core/removal';
import { linkedRemovals as serverRemovals } from '../firebase/functions/src/backoffice/removal';
import { defaultProfile } from '../src/services/profile';
import { serverDefaultProfile } from '../firebase/functions/src/backoffice/profile';
import { CURRENCIES } from '../src/core/money';
import { COUNTRY_PROFILES, OTHER_COUNTRY } from '../src/core/countries';
import { validateEmail, validateName } from '../src/core/validation';
import { cleanEmail, cleanName, COUNTRY_CODES, CURRENCY_CODES } from '../firebase/functions/src/backoffice/registry';
import type { CollectionName } from '../src/core/types';

// services/profile importe firebase (React Native) et i18n : inutiles pour comparer les profils
// (vi.mock est remonté avant les imports par Vitest).
vi.mock('../src/services/firebase', () => ({ firebase: () => ({}) }));
vi.mock('../src/i18n', () => ({ deviceLanguage: () => 'fr' }));

/** Miroirs serveur ↔ application : mêmes résultats (le serveur ne peut pas importer src/). */
describe('parité back-office ↔ application', () => {
  it('écritures liées à une suppression : identiques (500 cas aléatoires)', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const pick = (arr: string[]) => (rnd(3) === 0 ? null : arr[rnd(arr.length)]);
    const cols: CollectionName[] = ['transactions', 'debtPayments', 'goalContributions', 'tontineEntries', 'goals'];
    for (let round = 0; round < 500; round++) {
      const tx = ids('tx', 1 + rnd(6));
      const d: RemovalData = {
        transactions: tx.filter(() => rnd(5) !== 0).map((id) => ({ id })),
        debtPayments: ids('dp', rnd(4)).map((id) => ({ id, transactionId: pick(tx) })),
        goalContributions: ids('gc', rnd(5)).map((id) => ({ id, transferId: pick(tx), linkedTransactionId: pick(tx) })),
        tontineEntries: ids('te', rnd(3)).map((id) => ({ id, transactionId: pick(tx) })),
      };
      const col = cols[rnd(cols.length)];
      const id = col === 'transactions' ? tx[rnd(tx.length)] : `${col}_x`;
      const doc = { id, transactionId: pick(tx), transferId: pick(tx) };
      expect(serverRemovals(d, col, doc, id)).toEqual(appRemovals(d, col, doc, id));
    }
  });

  it('le serveur, qui ne charge QUE les écritures liées (requêtes ciblées), obtient la même liste que l’app', () => {
    const d: RemovalData = {
      transactions: [{ id: 't1' }, { id: 't2' }, { id: 'tr' }],
      debtPayments: [{ id: 'dp1', transactionId: 't1' }, { id: 'dp2', transactionId: 't2' }],
      goalContributions: [{ id: 'g1', transferId: 't1', linkedTransactionId: null }, { id: 'g2', transferId: 'tr', linkedTransactionId: 't1' }, { id: 'g3', transferId: null, linkedTransactionId: 't2' }],
      tontineEntries: [{ id: 'e1', transactionId: 't1' }],
    };
    const filtered: RemovalData = {
      transactions: [],
      debtPayments: d.debtPayments.filter((x) => x.transactionId === 't1'),
      goalContributions: d.goalContributions.filter((x) => x.transferId === 't1' || x.linkedTransactionId === 't1'),
      tontineEntries: d.tontineEntries.filter((x) => x.transactionId === 't1'),
    };
    expect(serverRemovals(filtered, 'transactions', { id: 't1' }, 't1')).toEqual(appRemovals(d, 'transactions', { id: 't1' }, 't1'));
  });

  it('profil d’un compte créé par le back-office = profil d’une inscription dans l’app (formule gratuite)', () => {
    const app = defaultProfile('u1', 'a@ex.com', 'Awa');
    const server = serverDefaultProfile({ uid: 'u1', email: 'a@ex.com', firstName: 'Awa', lastName: '', country: app.country, currency: app.currency, language: app.language, timezone: app.timezone }, app.createdAt);
    expect(server).toEqual({ ...app, subscription: { ...app.subscription, updatedAt: app.createdAt } });
    expect(server.subscription).toMatchObject({ plan: 'free', status: 'active', provider: 'none' });
  });

  it('devises et pays : mêmes listes', () => {
    expect([...CURRENCY_CODES].sort()).toEqual(Object.keys(CURRENCIES).sort());
    // « Autre pays » (OTHER_COUNTRY) compris.
    expect([...COUNTRY_CODES].sort()).toEqual([...COUNTRY_PROFILES, OTHER_COUNTRY].map((p) => p.code).sort());
  });

  it('noms et e-mails : mêmes règles de validation', () => {
    for (const n of ['Awa', 'Jean-Marc', "N'Guessan", 'Kouassi Aya', 'Aïcha', '', '  ', '123', 'A@b', 'x'.repeat(81), ' Awa  Koné ']) {
      expect(cleanName(n) !== null, n).toBe(validateName(n) === null);
    }
    for (const e of ['a@b.co', 'awa@exemple.ci', 'pas-un-email', 'a@b', '', 'a b@c.de']) {
      expect(cleanEmail(e) !== null, e).toBe(validateEmail(e) === null);
    }
  });
});
