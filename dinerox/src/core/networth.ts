/**
 * Patrimoine net — argent disponible v2 (docs/argent-disponible.md §5.6), REDIRIGÉ vers la
 * position (`positionOf`) : un seul calcul dans toute l'application.
 *
 *   patrimoine = Σ comptes (solde > 0) + épargne hors comptes + biens
 *              + créances (prêts accordés, créances de tontine)
 *              − dettes (emprunts, avances de tontine, découverts, cartes)
 *
 * On n'y ajoute JAMAIS les objectifs ni les réserves : ils sont déjà dans les comptes ou
 * dans l'épargne hors comptes. Une tontine close vaut 0 ; en pause, elle reste comptée.
 */
import type { SpaceData } from './types';
import type { CurrencyCode } from './money';
import type { ISODate } from './dates';
import { debtStatus } from './debts';
import { positionOf } from './position';

export interface NetWorth {
  assets: number;
  accounts: number;
  /** Épargne hors comptes (montants initiaux des objectifs et réserves). */
  outside: number;
  receivables: number;
  liabilities: number;
  net: number;
  byAssetType: Record<string, number>;
  /** Éléments ignorés car dans une autre devise (pas de conversion sans taux fiable). */
  skippedOtherCurrency: number;
}

export function netWorth(data: SpaceData, currency: CurrencyCode, today: ISODate): NetWorth {
  const p = positionOf(data, currency, today);
  let assets = 0;
  let skipped = 0;
  const byAssetType: Record<string, number> = {};
  for (const a of data.assets) {
    if (a.deleted) continue;
    if (a.currency !== currency) {
      skipped++;
      continue;
    }
    assets += a.value;
    byAssetType[a.type] = (byAssetType[a.type] ?? 0) + a.value;
  }
  let receivables = p.tontineReceivable;
  let liabilities = p.tontineAdvance + p.shortTermDebt;
  for (const d of data.debts) {
    if (d.deleted) continue;
    if (d.currency !== currency) {
      skipped++;
      continue;
    }
    const s = debtStatus(d, data.debtPayments, today);
    const r = s.settled ? 0 : s.remaining;
    if (d.direction === 'i_owe') liabilities += r;
    else receivables += r;
  }
  skipped += data.accounts.filter((a) => !a.deleted && a.currency !== currency).length;
  const accounts = Object.values(p.accounts).reduce((n, a) => n + Math.max(0, a.balance), 0);
  return { assets, accounts, outside: p.outside, receivables, liabilities, net: p.netWorth, byAssetType, skippedOtherCurrency: skipped };
}
