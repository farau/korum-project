"use client";

import "@rainbow-me/rainbowkit/styles.css";

import {
  darkTheme,
  lightTheme,
  RainbowKitProvider as RainbowKit,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider } from "wagmi";
import { defaultChain, wagmiConfig } from "../config/rainbowkit";
import { WalletAuthenticationProvider, WalletProvider } from "./WalletProvider";
import { WatchlistProvider } from "../hooks/useWatchlist";

function ThemedRainbowKitProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setThemeMode(root.dataset.theme === "light" ? "light" : "dark");
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const theme = useMemo(() => {
    const options = {
      accentColor: "#80ff00",
      accentColorForeground: "#071000",
      borderRadius: "medium" as const,
      fontStack: "system" as const,
    };
    return themeMode === "light" ? lightTheme(options) : darkTheme(options);
  }, [themeMode]);

  return (
    <RainbowKit initialChain={defaultChain} locale="en-US" theme={theme}>
      <WalletProvider><WatchlistProvider>{children}</WatchlistProvider></WalletProvider>
    </RainbowKit>
  );
}

export default function RainbowKitProvider({ children, cookies, hasSessionCookie }: {
  children: ReactNode; cookies: string | null; hasSessionCookie: boolean;
}) {
  // Each render tree owns its cache so server requests cannot share changing market quotes.
  const [queryClient] = useState(() => new QueryClient());
  const initialState = useMemo(() => {
    try { return cookieToInitialState(wagmiConfig, cookies); }
    catch { return undefined; }
  }, [cookies]);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <WalletAuthenticationProvider hasSessionCookie={hasSessionCookie}>
          <ThemedRainbowKitProvider>{children}</ThemedRainbowKitProvider>
        </WalletAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
