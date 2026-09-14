import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "viem";
import { cookieStorage, createStorage } from "wagmi";

import { KORUM_CHAIN } from "./korum-network";

const LOCALHOST_WALLETCONNECT_PROJECT_ID = "b56e18d47c72ab683b10814fe9495694";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  || LOCALHOST_WALLETCONNECT_PROJECT_ID;

export const chains = [KORUM_CHAIN] as const;
export const defaultChain = KORUM_CHAIN;

function rpcProxyUrl() {
  if (typeof window !== "undefined") return "/api/rpc";
  return new URL("/api/rpc", APP_URL).toString();
}

export const wagmiConfig = getDefaultConfig({
  appName: "Korum",
  appDescription: "Create and explore tokenized matchups on Robinhood Chain.",
  appUrl: APP_URL,
  appIcon: new URL("/icon.png", APP_URL).toString(),
  projectId: walletConnectProjectId,
  chains,
  transports: {
    [KORUM_CHAIN.id]: fallback([
      http(KORUM_CHAIN.rpcUrls.default.http[0]),
      http(rpcProxyUrl(), { retryCount: 0 }),
    ]),
  },
  ssr: true,
  storage: createStorage({
    key: "korum-rainbowkit-wagmi-v1",
    storage: cookieStorage,
  }),
});
