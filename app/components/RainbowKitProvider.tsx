"use client";

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

const queryClient = new QueryClient();

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
      <WalletProvider>{children}</WalletProvider>
    </RainbowKit>
  );
}

export default function RainbowKitProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiConfig, cookies);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <WalletAuthenticationProvider>
          <ThemedRainbowKitProvider>{children}</ThemedRainbowKitProvider>
        </WalletAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
