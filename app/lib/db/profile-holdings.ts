import "server-only";

import { createHash } from "node:crypto";
import { formatEther, formatUnits, getAddress } from "viem";
import { redisCacheKey, rememberJson } from "../cache/redis";
import { sellFeeBps } from "../contracts/economics";
import { VERSUS_TOKEN_ABI } from "../contracts/korum";
import { getKorumServerPublicClient } from "../contracts/server-client";
import { marketValueWei } from "../markets/math";
import { getLaunchConfig } from "../markets/pnl";
import { getEthUsdQuote } from "../markets/quote-usd";
import type { ProfileHolding, ProfileHoldings } from "../profile-holdings";
import { getProfileSource } from "./profile-source";
import { getProfileMarkets } from "./profile-markets";

type Candidate = {
  versusId: string;
  tokenAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  configId: number | string;
  virtualEth: string | null;
  graduationEth: string | null;
  realEthAfter: string | null;
  tokenReserveAfter: string | null;
  cumulativeVolumeAfter: string | null;
  curveStatus: number | null;
  poolSqrtPriceX96: string | null;
};

const MAX_CANDIDATES = 100;
const BALANCE_BATCH_SIZE = 12;
const CACHE_SECONDS = 20;

function parseUnsigned(value: string | null) {
  return value !== null && /^\d+$/.test(value) ? BigInt(value) : null;
}

function etherNumber(value: bigint) {
  const result = Number(formatEther(value));
  return Number.isFinite(result) ? result : null;
}

async function readTokenBalances(wallet: `0x${string}`, rows: Candidate[]) {
  const client = getKorumServerPublicClient();
  const results: Array<{ row: Candidate; balance: bigint }> = [];
  for (let start = 0; start < rows.length; start += BALANCE_BATCH_SIZE) {
    const batch = rows.slice(start, start + BALANCE_BATCH_SIZE);
    const balances = await Promise.all(batch.map((row) => client.readContract({
      address: row.tokenAddress,
      abi: VERSUS_TOKEN_ABI,
      functionName: "balanceOf",
      args: [wallet],
    }) as Promise<bigint>));
    balances.forEach((balance, index) => {
      if (balance > BigInt(0)) results.push({ row: batch[index], balance });
    });
  }
  return results;
}

async function loadProfileHoldings(wallet: `0x${string}`): Promise<ProfileHoldings> {
  const client = getKorumServerPublicClient();
  const [source, ethBalance, quote] = await Promise.all([
    getProfileSource(wallet),
    client.getBalance({ address: wallet }),
    getEthUsdQuote(),
  ]);
  const selected = source.positions.slice(0, MAX_CANDIDATES);
  const markets = await getProfileMarkets(selected);
  const rows: Candidate[] = source.positions.map(position => ({
    ...position,
    virtualEth: null, graduationEth: null, realEthAfter: null, tokenReserveAfter: null,
    cumulativeVolumeAfter: null, curveStatus: null, poolSqrtPriceX96: null,
    ...markets.get(position.tokenAddress.toLowerCase()),
  }));

  const limited = rows.length > MAX_CANDIDATES;
  const held = await readTokenBalances(wallet, rows.slice(0, MAX_CANDIDATES));
  const configIds = [...new Set(held.filter(({ row }) => row.curveStatus === 1).map(({ row }) => String(row.configId)))];
  const configs = new Map(await Promise.all(configIds.map(async (id) => [id, await getLaunchConfig(id)] as const)));

  const tokens: ProfileHolding[] = held.map(({ row, balance }) => {
    let valueEth: number | null = null;
    const virtualEth = parseUnsigned(row.virtualEth);
    const graduationEth = parseUnsigned(row.graduationEth);
    const realEth = parseUnsigned(row.realEthAfter);
    const reserve = parseUnsigned(row.tokenReserveAfter);
    const volume = parseUnsigned(row.cumulativeVolumeAfter);
    const config = configs.get(String(row.configId));
    if (row.curveStatus === 1 && config && virtualEth !== null && graduationEth !== null
      && realEth !== null && reserve !== null && volume !== null && reserve + balance > BigInt(0)) {
      const gross = (virtualEth + realEth) * balance / (reserve + balance);
      const feeBps = sellFeeBps(config, graduationEth, volume);
      valueEth = etherNumber(gross - gross * BigInt(feeBps) / BigInt(10_000));
    } else if (row.curveStatus === 3) {
      const spotValueWei = marketValueWei(row.poolSqrtPriceX96, balance.toString());
      valueEth = spotValueWei === null ? null : etherNumber(spotValueWei);
    }
    return {
      versusId: row.versusId,
      tokenAddress: row.tokenAddress,
      tokenName: row.tokenName,
      tokenSymbol: row.tokenSymbol,
      amount: formatUnits(balance, 18),
      valueEth,
      valueUsd: valueEth !== null && quote ? valueEth * quote.value : null,
      status: valueEth !== null
        ? row.curveStatus === 3 ? "pool_estimate" : "priced"
        : row.curveStatus === 3 ? "graduated" : "unavailable",
    };
  });
  tokens.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const ethAmount = formatEther(ethBalance);
  const ethValueUsd = quote ? Number(ethAmount) * quote.value : null;
  const partial = limited || tokens.some((token) => token.valueEth === null);
  const pricedValueUsd = quote && ethValueUsd !== null
    ? ethValueUsd + tokens.reduce((sum, token) => sum + (token.valueUsd ?? 0), 0)
    : null;
  const totalValueUsd = partial ? null : pricedValueUsd;

  return { ethAmount, ethValueUsd, tokens, totalValueUsd, pricedValueUsd, partial, limited, quoteAvailable: quote !== null };
}

export function getProfileHoldings(address: `0x${string}`) {
  const wallet = getAddress(address);
  const walletKey = createHash("sha256").update(wallet.toLowerCase()).digest("hex");
  return rememberJson(
    redisCacheKey("private", "profile-holdings-v3", walletKey),
    CACHE_SECONDS,
    () => loadProfileHoldings(wallet),
  );
}
