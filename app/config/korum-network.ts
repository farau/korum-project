import { defineChain } from "viem";

export type KorumNetwork = "testnet" | "mainnet";

const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  blockTime: 100,
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api",
    },
  }
});

const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api",
    },
  },
  testnet: true,
});

const configuredNetwork = process.env.NEXT_PUBLIC_KORUM_NETWORK ?? "testnet";

if (configuredNetwork !== "testnet" && configuredNetwork !== "mainnet") {
  throw new Error("NEXT_PUBLIC_KORUM_NETWORK must be either 'testnet' or 'mainnet'.");
}

export const KORUM_NETWORK: KorumNetwork = configuredNetwork;
export const KORUM_CHAIN = KORUM_NETWORK === "mainnet" ? robinhoodMainnet : robinhoodTestnet;
export const KORUM_CHAIN_ID = KORUM_CHAIN.id;
