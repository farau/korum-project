import type { Address } from "viem";

export type PairEconomics = {
  quoteAsset: Address;
  quoteDecimals: number;
  virtualQuote: bigint;
  graduationQuote: bigint;
};

export type LaunchConfig = {
  totalSupply: bigint;
  tier1Num: number;
  tier1Den: number;
  tier2Num: number;
  tier2Den: number;
  launchFeeNum: number;
  launchFeeDen: number;
  snipeWindowSeconds: number;
  tickSpacing: number;
  active: boolean;
  fee1Bps: number;
  fee2Bps: number;
  fee3Bps: number;
  creatorShare1Bps: number;
  creatorShare2Bps: number;
  creatorShare3Bps: number;
  referralBps: number;
  snipeStartBps: number;
};

export function launchFee(config: LaunchConfig, graduationQuote: bigint) {
  const denominator = BigInt(config.launchFeeDen);
  return (graduationQuote * BigInt(config.launchFeeNum) + denominator - BigInt(1)) / denominator;
}

export function sellFeeBps(config: Pick<LaunchConfig, "tier1Num" | "tier1Den" | "tier2Num" | "tier2Den" | "fee1Bps" | "fee2Bps" | "fee3Bps">, graduationQuote: bigint, volume: bigint) {
  if (volume < graduationQuote * BigInt(config.tier1Num) / BigInt(config.tier1Den)) return config.fee1Bps;
  if (volume < graduationQuote * BigInt(config.tier2Num) / BigInt(config.tier2Den)) return config.fee2Bps;
  return config.fee3Bps;
}
