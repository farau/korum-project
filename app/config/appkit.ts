import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { robinhood, robinhoodTestnet, type AppKitNetwork } from "@reown/appkit/networks";
import { cookieStorage, createStorage } from "wagmi";

const LOCALHOST_PROJECT_ID = "b56e18d47c72ab683b10814fe9495694";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || LOCALHOST_PROJECT_ID;
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  robinhoodTestnet,
  robinhood,
];

export const defaultNetwork = process.env.NODE_ENV === "production" ? robinhood : robinhoodTestnet;

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({
    key: "korum-wagmi-v1",
    storage: cookieStorage,
  }),
});

export const appKitMetadata = {
  name: "Korum",
  description: "Create and explore tokenized matchups on Robinhood Chain.",
  url: appUrl,
  icons: [`${appUrl.replace(/\/$/, "")}/icon.png`],
};
