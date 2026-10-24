import type { QueryClient } from "@tanstack/react-query";
import type { Debate } from "../debates";

export type WatchlistData = { ids: number[]; debates: Debate[] };
type Operation = "add" | "remove" | "toggle";

function parseWatchlist(value: unknown, details: boolean): WatchlistData {
  const data = value as Partial<WatchlistData> | null;
  if (!data || !Array.isArray(data.ids) || !data.ids.every(id => Number.isSafeInteger(id) && id >= 0)) {
    throw new Error("Invalid watchlist response.");
  }
  if (details && (!Array.isArray(data.debates) || !data.debates.every(debate => debate
    && Number.isSafeInteger(debate.id) && typeof debate.sideA === "string" && typeof debate.sideB === "string"))) {
    throw new Error("Invalid watchlist details.");
  }
  return { ids: [...new Set(data.ids)], debates: details ? data.debates! : [] };
}

// One instance per mounted wallet session. Old promises retain this instance,
// never the new wallet's cache, notification callback or mutation queue.
export class WatchlistSession {
  readonly key: readonly string[];
  readonly idsKey: readonly string[];
  readonly detailsKey: readonly string[];
  private active = true;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private revision = 0;

  constructor(
    private client: QueryClient,
    scope: string,
    readonly address: string,
    private onPending: (pending: boolean) => void,
    private onSuccess: (id: number, label: string | undefined, added: boolean) => void,
  ) {
    this.key = ["watchlist", scope, address.toLowerCase()];
    this.idsKey = [...this.key, "ids"];
    this.detailsKey = [...this.key, "details"];
  }

  private async read(details: boolean, signal: AbortSignal) {
    const response = await fetch(`/api/watchlist${details ? "" : "?view=ids"}`, {
      cache: "no-store", credentials: "same-origin", signal,
      headers: { "X-Korum-Wallet": this.address },
    });
    if (!response.ok) throw new Error(`Unable to load watchlist (${response.status}).`);
    return parseWatchlist(await response.json(), details);
  }

  idsOptions() {
    return {
      queryKey: this.idsKey,
      queryFn: async ({ signal }: { signal: AbortSignal }) => (await this.read(false, signal)).ids,
      staleTime: 30_000, gcTime: 0, retry: false as const,
    };
  }

  detailsOptions() {
    return {
      queryKey: this.detailsKey,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const revision = this.revision;
        const data = await this.read(true, signal);
        if (this.active && !signal.aborted && revision === this.revision) {
          this.client.setQueryData(this.idsKey, data.ids);
        }
        return data;
      },
      staleTime: 15_000, gcTime: 0, retry: false as const,
    };
  }

  async refresh() {
    if (this.active && !this.pending) await this.client.invalidateQueries({ queryKey: this.key });
  }

  activate() {
    this.active = true;
  }

  mutate(id: number, label: string | undefined, operation: Operation): Promise<boolean> {
    if (!this.active || !Number.isSafeInteger(id) || id < 0) return Promise.resolve(false);
    this.pending++;
    this.onPending(true);
    const result = this.queue.then(async () => {
      if (!this.active) return false;
      // A click can arrive before the initial membership read has completed.
      // Never replace an unknown list with an optimistic one-item list.
      if (!this.client.getQueryData(this.idsKey)) {
        try { await this.client.fetchQuery(this.idsOptions()); }
        catch { return false; }
      }
      this.revision++;
      await this.client.cancelQueries({ queryKey: this.key });
      if (!this.active) return false;
      const previous = this.client.getQueryData<number[]>(this.idsKey) ?? [];
      const previousDetails = this.client.getQueryData<WatchlistData>(this.detailsKey);
      const added = operation === "toggle" ? !previous.includes(id) : operation === "add";
      if (previous.includes(id) === added) return true;
      const next = added ? [...previous, id] : previous.filter(value => value !== id);
      this.client.setQueryData(this.idsKey, next);
      if (previousDetails) this.client.setQueryData(this.detailsKey, {
        ids: next, debates: previousDetails.debates.filter(debate => next.includes(debate.id)),
      });
      try {
        const response = await fetch("/api/watchlist", {
          method: added ? "POST" : "DELETE", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-Korum-Wallet": this.address },
          body: JSON.stringify({ versusId: id }),
        });
        if (!response.ok) throw new Error("Unable to update watchlist.");
      } catch {
        if (this.active) {
          this.client.setQueryData(this.idsKey, previous);
          if (previousDetails) this.client.setQueryData(this.detailsKey, previousDetails);
        }
        return false;
      }
      if (!this.active) return false;
      // A notification/storage error must not roll back a successful server write.
      try { this.onSuccess(id, label, added); } catch { /* Refetch still reconciles membership. */ }
      return true;
    }).finally(() => {
      this.pending--;
      if (this.active && !this.pending) {
        this.onPending(false);
        void this.refresh();
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }

  dispose() {
    this.active = false;
    this.revision++;
    void this.client.cancelQueries({ queryKey: this.key });
    this.client.removeQueries({ queryKey: this.key });
  }
}
