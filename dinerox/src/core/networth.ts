/**
 * Patrimoine net = actifs − passifs, dans la devise principale.
 * Actifs : biens déclarés + soldes des comptes + créances (ce qu'on me doit).
 * Passifs : dettes restantes (ce que je dois).
 */
import type { Account, Asset, Debt, DebtPayment, Transaction } from './types';
import { accountBalances } from './balance';
import { debtStatus } from './debts';
import type { CurrencyCode } from './money';

export interface NetWorth {
  assets: number;
  accounts: number;
  receivables: number;
  liabilities: number;
  net: number;
  byAssetType: Record<string, number>;
  /** Éléments ignorés car dans une autre devise (pas de conversion sans taux fiable). */
  skippedOtherCurrency: number;
}

export function netWorth(
  assets: Asset[],
  accounts: Account[],
  transactions: Transaction[],
  debts: Debt[],
  payments: DebtPayment[],
  currency: CurrencyCode,
): NetWorth {
  let assetTotal = 0;
  let skipped = 0;
  const byAssetType: Record<string, number> = {};
  for (const a of assets) {
    if (a.deleted) continue;
    if (a.currency !== currency) {
      skipped++;
      continue;
    }
    assetTotal += a.value;
    byAssetType[a.type] = (byAssetType[a.type] ?? 0) + a.value;
  }
  const balances = accountBalances(accounts, transactions);
  let accountTotal = 0;
  for (const acc of accounts) {
    if (acc.deleted || !acc.active) continue;
    if (acc.currency !== currency) {
      skipped++;
      continue;
    }
    accountTotal += balances[acc.id] ?? 0;
  }
  let receivables = 0;
  let liabilities = 0;
  for (const d of debts) {
    if (d.deleted) continue;
    if (d.currency !== currency) {
      skipped++;
      continue;
    }
    const st = debtStatus(d, payments);
    const r = st.settled ? 0 : st.remaining; // dette clôturée : plus un passif
    if (d.direction === 'i_owe') liabilities += r;
    else receivables += r;
  }
  const totalAssets = assetTotal + accountTotal + receivables;
  return {
    assets: assetTotal,
    accounts: accountTotal,
    receivables,
    liabilities,
    net: totalAssets - liabilities,
    byAssetType,
    skippedOtherCurrency: skipped,
  };
}
