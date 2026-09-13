"use client";

import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  useAccountModal,
  useConnectModal,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

type WalletContextValue = {
  address: string | null;
  connected: boolean;
  authenticated: boolean;
  authenticating: boolean;
  hydrated: boolean;
  authError: string | null;
  connect: () => void;
  openWallet: () => void;
};

type SessionResponse = {
  authenticated: boolean;
  address?: string;
};

type AuthContextValue = {
  authenticationStatus: AuthenticationStatus;
  authError: string | null;
  sessionAddress: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const WalletContext = createContext<WalletContextValue | null>(null);

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function WalletAuthenticationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { address, isConnected, status: accountStatus } = useAccount();
  const [authenticationStatus, setAuthenticationStatus] = useState<AuthenticationStatus>("loading");
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      setAuthError("Unable to close the wallet session cleanly.");
    } finally {
      setSessionAddress(null);
      setAuthenticationStatus("unauthenticated");
      router.refresh();
    }
  }, [router]);

  const authenticationAdapter = useMemo(() => createAuthenticationAdapter<string>({
    getNonce: async () => {
      setAuthError(null);
      const response = await fetch("/api/auth/challenge", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const error = await responseError(response, "Unable to create a wallet nonce.");
        setAuthError(error);
        throw new Error(error);
      }
      return response.text();
    },
    createMessage: async ({ nonce, address: messageAddress, chainId }) => {
      const response = await fetch("/api/auth/challenge", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, address: messageAddress, chainId }),
      });
      const challenge = await response.json() as { message?: string; error?: string };
      if (!response.ok || !challenge.message) {
        const error = challenge.error || "Unable to create a wallet challenge.";
        setAuthError(error);
        throw new Error(error);
      }
      return challenge.message;
    },
    verify: async ({ message, signature }) => {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const verified = await response.json() as SessionResponse & { error?: string };
      if (!response.ok || !verified.authenticated || !verified.address) {
        setSessionAddress(null);
        setAuthenticationStatus("unauthenticated");
        setAuthError(verified.error || "Wallet authentication failed.");
        return false;
      }

      setSessionAddress(verified.address);
      setAuthenticationStatus("authenticated");
      setAuthError(null);
      router.refresh();
      return true;
    },
    signOut,
  }), [router, signOut]);

  useEffect(() => {
    if (accountStatus === "connecting" || accountStatus === "reconnecting") return;
    if (!isConnected || !address) {
      const resetTimer = window.setTimeout(() => {
        setSessionAddress(null);
        setAuthenticationStatus("unauthenticated");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    let cancelled = false;
    const loadTimer = window.setTimeout(() => {
      setAuthenticationStatus("loading");
      setAuthError(null);
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then((response) => response.json() as Promise<SessionResponse>)
        .then((session) => {
          if (cancelled) return;
          const matches = session.authenticated
            && session.address?.toLowerCase() === address.toLowerCase();
          setSessionAddress(matches && session.address ? session.address : null);
          setAuthenticationStatus(matches ? "authenticated" : "unauthenticated");
        })
        .catch(() => {
          if (cancelled) return;
          setSessionAddress(null);
          setAuthenticationStatus("unauthenticated");
          setAuthError("Unable to check the wallet session.");
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
    };
  }, [accountStatus, address, isConnected]);

  const authContext = useMemo<AuthContextValue>(() => ({ authenticationStatus, authError, sessionAddress, signOut }), [
    authenticationStatus,
    authError,
    sessionAddress,
    signOut,
  ]);

  return (
    <AuthContext.Provider value={authContext}>
      <RainbowKitAuthenticationProvider adapter={authenticationAdapter} status={authenticationStatus}>
        {children}
      </RainbowKitAuthenticationProvider>
    </AuthContext.Provider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, status: accountStatus } = useAccount();
  const { openAccountModal } = useAccountModal();
  const { openConnectModal } = useConnectModal();
  const authContext = useContext(AuthContext);
  const [mounted, setMounted] = useState(false);
  const previousAuthenticationStatus = useRef<AuthenticationStatus | null>(null);
  const promptedAddress = useRef<string | null>(null);
  if (!authContext) throw new Error("WalletProvider must be used within WalletAuthenticationProvider");
  const { authenticationStatus } = authContext;

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const previousStatus = previousAuthenticationStatus.current;
    previousAuthenticationStatus.current = authenticationStatus;

    if (!isConnected || !address) {
      promptedAddress.current = null;
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (authenticationStatus === "authenticated") {
      promptedAddress.current = normalizedAddress;
      return;
    }

    const needsAuthentication = previousStatus === "loading"
      && authenticationStatus === "unauthenticated"
      && promptedAddress.current !== normalizedAddress;
    if (!needsAuthentication || !openConnectModal) return;

    promptedAddress.current = normalizedAddress;
    const promptTimer = window.setTimeout(openConnectModal, 0);
    return () => window.clearTimeout(promptTimer);
  }, [address, authenticationStatus, isConnected, openConnectModal]);

  const connect = useCallback(() => {
    openConnectModal?.();
  }, [openConnectModal]);

  const openWallet = useCallback(() => {
    if (authenticationStatus === "authenticated") {
      openAccountModal?.();
      return;
    }
    openConnectModal?.();
  }, [authenticationStatus, openAccountModal, openConnectModal]);

  // Wagmi may restore a cookie-backed account on the server before the matching
  // connector exists in the browser. Hide account state until mount so every
  // consumer gets the same first render and React can hydrate deterministically.
  const normalizedAddress = mounted ? address || null : null;
  const connected = mounted && isConnected;
  const authenticated = Boolean(
    authenticationStatus === "authenticated"
    && normalizedAddress
    && authContext.sessionAddress
    && normalizedAddress.toLowerCase() === authContext.sessionAddress.toLowerCase(),
  );
  const authenticating = Boolean(connected && authenticationStatus === "loading");
  const hydrated = mounted
    && accountStatus !== "connecting"
    && accountStatus !== "reconnecting"
    && authenticationStatus !== "loading";

  const value = useMemo<WalletContextValue>(() => ({
    address: normalizedAddress,
    connected,
    authenticated,
    authenticating,
    hydrated,
    authError: authContext.authError,
    connect,
    openWallet,
  }), [
    authContext.authError,
    authenticated,
    authenticating,
    connect,
    hydrated,
    connected,
    normalizedAddress,
    openWallet,
  ]);

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
