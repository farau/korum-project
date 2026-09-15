import "server-only";

import { createPublicClient, fallback, http } from "viem";
import { KORUM_CHAIN, KORUM_NETWORK } from "../../config/korum-network";

export function getAlchemyRpcUrl() {
  const configuredUrl = process.env.KORUM_ALCHEMY_RPC_URL;
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl);
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".g.alchemy.com")) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  const apiKey = process.env.ALCHEMY_API_KEY;
  if (KORUM_NETWORK !== "testnet" || !apiKey) return null;
  return `https://robinhood-testnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
}

let publicClient: ReturnType<typeof createPublicClient> | null = null;

export function getKorumServerPublicClient() {
  if (publicClient) return publicClient;

  const alchemyUrl = getAlchemyRpcUrl();
  const transports = [
    http(KORUM_CHAIN.rpcUrls.default.http[0], { timeout: 5_000 }),
    ...(alchemyUrl ? [http(alchemyUrl, { timeout: 5_000 })] : []),
  ];

  publicClient = createPublicClient({
    chain: KORUM_CHAIN,
    transport: transports.length === 1 ? transports[0] : fallback(transports),
  });
  return publicClient;
}
