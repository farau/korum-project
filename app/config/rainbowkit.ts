import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage } from "wagmi";
import { robinhood, robinhoodTestnet } from "wagmi/chains";

const LOCALHOST_WALLETCONNECT_PROJECT_ID = "b56e18d47c72ab683b10814fe9495694";

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  || LOCALHOST_WALLETCONNECT_PROJECT_ID;

export const chains = [robinhoodTestnet, robinhood] as const;
export const defaultChain = process.env.NODE_ENV === "production" ? robinhood : robinhoodTestnet;

export const wagmiConfig = getDefaultConfig({
  appName: "Korum",
  appDescription: "Create and explore tokenized matchups on Robinhood Chain.",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  appIcon: "/icon.png",
  projectId: walletConnectProjectId,
  chains,
  ssr: true,
  storage: createStorage({
    key: "korum-rainbowkit-wagmi-v1",
    storage: cookieStorage,
  }),
});
