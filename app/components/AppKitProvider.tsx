"use client";

import { createAppKit, useAppKitTheme } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { appKitMetadata, defaultNetwork, networks, projectId, wagmiAdapter } from "../config/appkit";
import { WalletProvider } from "./WalletProvider";

const queryClient = new QueryClient();

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork,
  projectId,
  metadata: appKitMetadata,
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  allWallets: "SHOW",
});

function AppKitThemeSync() {
  const { setThemeMode } = useAppKitTheme();

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setThemeMode(root.dataset.theme === "light" ? "light" : "dark");
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [setThemeMode]);

  return null;
}

export default function AppKitProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitThemeSync />
        <WalletProvider>{children}</WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
