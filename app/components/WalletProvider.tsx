"use client";

import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from "@reown/appkit/react";
import { useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConnections, useSignMessage } from "wagmi";

type WalletContextValue = {
  address: string | null;
  connected: boolean;
  authenticated: boolean;
  authenticating: boolean;
  hydrated: boolean;
  authError: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
};

type SessionResponse = {
  authenticated: boolean;
  address?: string;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount({ namespace: "eip155" });
  const { chainId } = useAppKitNetwork();
  const { disconnect: disconnectAppKit } = useDisconnect();
  const connections = useConnections();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const attemptedAddress = useRef<string | null>(null);
  const previousAddress = useRef<string | null>(null);
  const connectionReady = Boolean(address && connections.some((connection) => (
    connection.accounts.some((account) => account.toLowerCase() === address.toLowerCase())
    && typeof connection.connector.getChainId === "function"
  )));

  const authenticate = useCallback(async () => {
    if (!isConnected || !address || !connectionReady || authenticating) return;

    setAuthenticating(true);
    setAuthError(null);
    try {
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chainId: Number(chainId) }),
      });
      const challenge = await challengeResponse.json() as { message?: string; error?: string };
      if (!challengeResponse.ok || !challenge.message) {
        throw new Error(challenge.error || "Unable to create a wallet challenge.");
      }

      const signature = await signMessageAsync({ message: challenge.message });
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: challenge.message, signature }),
      });
      const verified = await verifyResponse.json() as SessionResponse & { error?: string };
      if (!verifyResponse.ok || !verified.authenticated || !verified.address) {
        throw new Error(verified.error || "Wallet authentication failed.");
      }

      setSessionAddress(verified.address);
      setSessionChecked(true);
      router.refresh();
    } catch (error) {
      setSessionAddress(null);
      setSessionChecked(true);
      setAuthError(error instanceof Error ? error.message : "Wallet authentication failed.");
    } finally {
      setAuthenticating(false);
    }
  }, [address, authenticating, chainId, connectionReady, isConnected, router, signMessageAsync]);

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") return;

    if (!isConnected || !address) {
      if (previousAddress.current) {
        void fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
      }
      previousAddress.current = null;
      attemptedAddress.current = null;
      const resetTimer = window.setTimeout(() => {
        setSessionAddress(null);
        setSessionChecked(true);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    previousAddress.current = address;
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json() as Promise<SessionResponse>)
      .then((session) => {
        if (cancelled) return;
        const matches = session.authenticated && session.address?.toLowerCase() === address.toLowerCase();
        setSessionAddress(matches && session.address ? session.address : null);
        setSessionChecked(true);
        if (!matches && connectionReady && attemptedAddress.current !== address.toLowerCase()) {
          attemptedAddress.current = address.toLowerCase();
          void authenticate();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSessionAddress(null);
        setSessionChecked(true);
        setAuthError("Unable to check the wallet session.");
      });

    return () => {
      cancelled = true;
    };
  }, [address, authenticate, connectionReady, isConnected, status]);

  const connect = useCallback(() => {
    if (isConnected && address) {
      attemptedAddress.current = null;
      void authenticate();
      return;
    }
    void open({ view: "Connect" });
  }, [address, authenticate, isConnected, open]);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      setSessionAddress(null);
      setSessionChecked(true);
      attemptedAddress.current = null;
      await disconnectAppKit({ namespace: "eip155" });
    }
  }, [disconnectAppKit]);

  const normalizedAddress = address || null;
  const authenticated = Boolean(
    normalizedAddress && sessionAddress && normalizedAddress.toLowerCase() === sessionAddress.toLowerCase(),
  );
  const hydrated = status !== "connecting" && status !== "reconnecting" && sessionChecked;

  const value = useMemo<WalletContextValue>(() => ({
    address: normalizedAddress,
    connected: isConnected,
    authenticated,
    authenticating,
    hydrated,
    authError,
    connect,
    disconnect,
  }), [authError, authenticated, authenticating, connect, disconnect, hydrated, isConnected, normalizedAddress]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
