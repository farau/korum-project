import "server-only";
import { getIndexedDebateRowsForValuation } from "./debates";
import type { ProfileTradePosition } from "./profile-source";

export type ProfileMarket = {
  tokenName: string;
  tokenSymbol: string;
  virtualEth: string | null;
  graduationEth: string | null;
  realEthAfter: string | null;
  tokenReserveAfter: string | null;
  cumulativeVolumeAfter: string | null;
  curveStatus: number | null;
  poolSqrtPriceX96: string | null;
};

export async function getProfileMarkets(positions: ProfileTradePosition[]) {
  const rows = await getIndexedDebateRowsForValuation(positions.map(position => position.versusId));
  const markets = new Map<string, ProfileMarket>();
  for (const row of rows) for (const side of ["A", "B"] as const) {
    markets.set(row[`token${side}Address`].toLowerCase(), {
      tokenName: row[`token${side}Name`], tokenSymbol: row[`token${side}Symbol`],
      virtualEth: row[`token${side}VirtualEth`], graduationEth: row[`token${side}GraduationEth`],
      realEthAfter: row[`token${side}RealEth`], tokenReserveAfter: row[`token${side}Reserve`],
      cumulativeVolumeAfter: row[`token${side}CumulativeVolume`], curveStatus: row[`token${side}CurveStatus`],
      poolSqrtPriceX96: row[`token${side}PoolSqrtPriceX96`],
    });
  }
  return markets;
}
