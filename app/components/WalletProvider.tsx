"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type WalletContextValue = {
  address: string | null;
  connected: boolean;
  hydrated: boolean;
  connect: () => void;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const DEV_WALLET_ADDRESS = "0x8F3A6B4C91D22E5F7A40B8D612E8C9301A2D029B";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem("korum-wallet-address");
        setAddress(stored && /^0x[a-fA-F0-9]{40}$/.test(stored) ? stored : null);
      } catch {
        setAddress(null);
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    address,
    connected: Boolean(address),
    hydrated,
    connect: () => {
      setAddress(DEV_WALLET_ADDRESS);
      try {
        localStorage.setItem("korum-wallet-address", DEV_WALLET_ADDRESS);
      } catch {}
    },
    disconnect: () => {
      setAddress(null);
      try {
        localStorage.removeItem("korum-wallet-address");
      } catch {}
    },
  }), [address, hydrated]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
