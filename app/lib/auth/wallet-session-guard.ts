// Serialize cookie mutations: an old signature must finish (and be cleared)
// before a new wallet is allowed to establish its session.
export class WalletSessionGuard {
  revision = 0;
  private pending: Promise<unknown> = Promise.resolve();

  invalidate() {
    this.revision += 1;
  }

  isCurrent(revision: number) {
    return revision === this.revision;
  }

  settled() {
    return this.pending;
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
}

export function walletMatches(address: string | undefined | null, accounts: readonly string[]) {
  return Boolean(address && accounts[0]?.toLowerCase() === address.toLowerCase());
}

// Wagmi restores a serializable connector descriptor from its cookie while
// reconnecting. It is not a live connector, even when isConnected is true.
export function isWalletConnectorReady(status: string, connector: unknown) {
  if (status !== "connected" || !connector || typeof connector !== "object") return false;
  const candidate = connector as { getAccounts?: unknown; getProvider?: unknown };
  return typeof candidate.getAccounts === "function" && typeof candidate.getProvider === "function";
}
