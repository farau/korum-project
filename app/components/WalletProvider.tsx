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
import { useAccount, useDisconnect } from "wagmi";
import { WalletContext, type WalletContextValue } from "./WalletContext";
import { WalletSessionGuard, walletMatches, isWalletConnectorReady } from "../lib/auth/wallet-session-guard";

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


async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function WalletAuthenticationProvider({ children, hasSessionCookie = false }: {
  children: React.ReactNode; hasSessionCookie?: boolean;
}) {
  const router = useRouter();
  const { address, connector: restoredConnector, isConnected, status: accountStatus } = useAccount();
  const connector = isWalletConnectorReady(accountStatus, restoredConnector) ? restoredConnector : undefined;
  const { disconnectAsync } = useDisconnect();
  const [sessionGuard] = useState(() => new WalletSessionGuard());
  const previousAddress = useRef<string | null>(null);
  const [authenticationStatus, setAuthenticationStatus] = useState<AuthenticationStatus>("loading");
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const deleteSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) throw new Error("Unable to close the wallet session. Please retry disconnecting.");
  }, []);

  const signOut = useCallback(async () => {
    sessionGuard.invalidate();
    // Hide all authenticated data immediately, before waiting for the network.
    setSessionAddress(null);
    setAuthenticationStatus("unauthenticated");
    try {
      await sessionGuard.run(deleteSession);
    } catch {
      setAuthError("Unable to close the wallet session. Please retry disconnecting.");
    } finally {
      router.refresh();
    }
  }, [deleteSession, router, sessionGuard]);

  const invalidateWallet = useCallback(async () => {
    await Promise.allSettled([signOut(), disconnectAsync()]);
  }, [disconnectAsync, signOut]);

  const authenticationAdapter = useMemo(() => createAuthenticationAdapter<string>({
    getNonce: async () => {
      await sessionGuard.settled();
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
      const guard = sessionGuard;
      guard.invalidate();
      const revision = guard.revision;
      return guard.run(async () => {
        if (!guard.isCurrent(revision) || !connector || !walletMatches(address, await connector.getAccounts())) return false;
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, signature }),
        });
        const verified = await response.json() as SessionResponse & { error?: string };
        // A signature can finish after accountsChanged or logout. Clear its
        // cookie inside this queue, before any subsequent sign-in can run.
        const accounts = await connector.getAccounts().catch(() => []);
        if (!guard.isCurrent(revision) || !walletMatches(verified.address, accounts) || !walletMatches(address, accounts)) {
          setSessionAddress(null);
          setAuthenticationStatus("unauthenticated");
          await deleteSession();
          router.refresh();
          return false;
        }
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
      });
    },
    signOut,
  }), [address, connector, deleteSession, router, signOut, sessionGuard]);

  useEffect(() => {
    if (accountStatus === "connecting" || accountStatus === "reconnecting") return;
    const nextAddress = isConnected && address ? address.toLowerCase() : null;
    const previous = previousAddress.current;
    previousAddress.current = nextAddress;
    let cancelled = false;
    const guard = sessionGuard;
    guard.invalidate();
    const revision = guard.revision;
    const timer = window.setTimeout(async () => {
      if (previous && previous !== nextAddress) {
        await invalidateWallet();
        return;
      }
      if (!nextAddress) {
        // Also expire restored server cookies when the wallet disconnected
        // while the page was closed.
        if (hasSessionCookie) await signOut();
        else {
          setSessionAddress(null);
          setAuthenticationStatus("unauthenticated");
        }
        return;
      }
      setSessionAddress(null);
      setAuthenticationStatus("loading");
      setAuthError(null);
      if (!connector) return; // Wait for Wagmi to replace its cookie descriptor.
      try {
        await guard.settled();
        const accounts = await connector.getAccounts();
        if (cancelled || !guard.isCurrent(revision)) return;
        if (!walletMatches(nextAddress, accounts)) {
          await invalidateWallet();
          return;
        }
        const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Session check failed");
        const session = await response.json() as SessionResponse;
        if (cancelled || !guard.isCurrent(revision)) return;
        if (session.authenticated && !walletMatches(session.address, accounts)) {
          await invalidateWallet();
          return;
        }
        setSessionAddress(session.authenticated ? session.address ?? null : null);
        setAuthenticationStatus(session.authenticated ? "authenticated" : "unauthenticated");
      } catch {
        if (cancelled || !guard.isCurrent(revision)) return;
        setSessionAddress(null);
        setAuthenticationStatus("unauthenticated");
        setAuthError("Unable to check the wallet session.");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      guard.invalidate();
    };
  }, [accountStatus, address, connector, isConnected, invalidateWallet, signOut, sessionGuard, hasSessionCookie]);

  useEffect(() => {
    if (!connector || !isConnected || !address) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;
    const checkAccounts = (accounts: readonly string[]) => {
      if (!cancelled && !walletMatches(address, accounts)) void invalidateWallet();
    };
    const recheck = () => {
      if (document.visibilityState !== "hidden") {
        void Promise.resolve().then(() => connector.getAccounts()).then(checkAccounts).catch(() => {
          if (!cancelled) void invalidateWallet();
        });
      }
    };
    // Listen on the selected connector, not window.ethereum (which may point
    // at a different extension when several wallets are installed).
    void Promise.resolve().then(() => connector.getProvider()).then(provider => {
      if (cancelled) return;
      const events = provider as {
        on?: (event: "accountsChanged", listener: typeof checkAccounts) => void;
        removeListener?: (event: "accountsChanged", listener: typeof checkAccounts) => void;
      } | undefined;
      if (typeof events?.on === "function" && typeof events.removeListener === "function") {
        events.on("accountsChanged", checkAccounts);
        removeListener = () => events.removeListener?.("accountsChanged", checkAccounts);
      }
      recheck();
    }).catch(() => { if (!cancelled) void invalidateWallet(); });
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      cancelled = true;
      removeListener?.();
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [address, connector, invalidateWallet, isConnected]);

  const effectiveStatus: AuthenticationStatus = isConnected && !connector
    ? "loading" : authenticationStatus === "authenticated"
    && (!isConnected || !walletMatches(sessionAddress, address ? [address] : []))
    ? "unauthenticated" : authenticationStatus;

  const authContext = useMemo<AuthContextValue>(() => ({ authenticationStatus: effectiveStatus, authError, sessionAddress, signOut }), [
    effectiveStatus,
    authError,
    sessionAddress,
    signOut,
  ]);

  return (
    <AuthContext.Provider value={authContext}>
      <RainbowKitAuthenticationProvider adapter={authenticationAdapter} status={effectiveStatus}>
        {children}
      </RainbowKitAuthenticationProvider>
    </AuthContext.Provider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, status: accountStatus } = useAccount();
  const { disconnectAsync } = useDisconnect();
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

  const disconnect = useCallback(async () => {
    const [, walletResult] = await Promise.allSettled([
      authContext.signOut(),
      disconnectAsync(),
    ]);
    if (walletResult.status === "rejected") throw walletResult.reason;
  }, [authContext, disconnectAsync]);

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
    disconnect,
  }), [
    authContext.authError,
    authenticated,
    authenticating,
    connect,
    disconnect,
    hydrated,
    connected,
    normalizedAddress,
    openWallet,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export { useWallet, shortenAddress } from "./WalletContext";
