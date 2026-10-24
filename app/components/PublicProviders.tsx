"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalletContext, type WalletContextValue } from "./WalletContext";
import type PublicWalletRuntime from "./PublicWalletRuntime";

export default function PublicProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const [runtime, setRuntime] = useState<{ Component: typeof PublicWalletRuntime; cookies: string; hasSessionCookie: boolean } | null>(null);
  const [wallet, setWallet] = useState<WalletContextValue | null>(null);
  const [connectRequested, setConnectRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const activate = useCallback(async (connect: boolean) => {
    if (connect) setConnectRequested(true);
    if (loading.current) return;
    loading.current = true;
    setError(null);
    try {
      const [module, response] = await Promise.all([
        import("./PublicWalletRuntime"),
        fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("Session unavailable");
      const session = await response.json() as { authenticated: boolean };
      setRuntime({ Component: module.default, cookies: document.cookie, hasSessionCookie: session.authenticated });
    } catch {
      loading.current = false;
      setError("Unable to load the wallet. Please try connecting again.");
    }
  }, []);
  useEffect(() => {
    // Restore returning wallet users without making first-time public visits load the SDK.
    if (!document.cookie.split(";").some(cookie => cookie.trim().startsWith("korum-rainbowkit-wagmi-v1."))) return;
    const timer = setTimeout(() => { void activate(false); }, 0);
    return () => clearTimeout(timer);
  }, [activate]);
  const fallback = useMemo<WalletContextValue>(() => ({
    address: null, connected: false, authenticated: false, authenticating: false, hydrated: false, deferred: true,
    authError: error, connect: () => { void activate(true); }, openWallet: () => { void activate(true); }, disconnect: async () => {},
  }), [activate, error]);
  return <QueryClientProvider client={client}>
    <WalletContext.Provider value={wallet ?? fallback}>
      {children}
      {error ? <p role="alert">{error}</p> : null}
    </WalletContext.Provider>
    {runtime ? <runtime.Component cookies={runtime.cookies} hasSessionCookie={runtime.hasSessionCookie}
      connectRequested={connectRequested} onChange={setWallet} /> : null}
  </QueryClientProvider>;
}
