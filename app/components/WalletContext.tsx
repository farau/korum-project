"use client";
import { createContext, useContext } from "react";

export type WalletContextValue = {
  address: string | null;
  connected: boolean;
  authenticated: boolean;
  authenticating: boolean;
  hydrated: boolean;
  deferred?: boolean;
  authError: string | null;
  connect: () => void;
  openWallet: () => void;
  disconnect: () => Promise<void>;
};

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
