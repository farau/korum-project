import "server-only";

import { redisCacheKey, rememberJson } from "../cache/redis";

type AlchemyPriceResponse = {
  data?: Array<{
    symbol?: string;
    prices?: Array<{ currency?: string; value?: string; lastUpdatedAt?: string }>;
  }>;
};

export type QuoteUsd = {
  symbol: "ETH";
  value: number;
  updatedAt: string;
};

let cachedQuote: { expiresAt: number; promise: Promise<QuoteUsd | null> } | null = null;

async function fetchEthUsdQuote(): Promise<QuoteUsd | null> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(apiKey)}/tokens/by-symbol?symbols=ETH`,
      { signal: AbortSignal.timeout(5_000), cache: "no-store" },
    );
    if (!response.ok) return null;

    const payload = await response.json() as AlchemyPriceResponse;
    const eth = payload.data?.find((entry) => entry.symbol?.toUpperCase() === "ETH");
    const usd = eth?.prices?.find((price) => price.currency?.toLowerCase() === "usd");
    const value = Number(usd?.value);
    if (!Number.isFinite(value) || value <= 0 || !usd?.lastUpdatedAt) return null;

    return { symbol: "ETH", value, updatedAt: usd.lastUpdatedAt };
  } catch {
    return null;
  }
}

export function getEthUsdQuote() {
  const now = Date.now();
  if (cachedQuote && cachedQuote.expiresAt > now) return cachedQuote.promise;

  const promise = rememberJson(
    redisCacheKey("quote", "eth-usd"),
    60,
    fetchEthUsdQuote,
  );
  cachedQuote = { expiresAt: now + 60_000, promise };
  return promise;
}
