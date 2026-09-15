import type { BadgeTierName } from "./badges";

export type LeaderboardSort = "pnl" | "volume";

export type TraderLeaderboardRow = {
  rank: number;
  wallet: string;
  name: string;
  pnlEth: number | null;
  pnlUsd: number | null;
  volumeEth: number;
  volumeUsd: number | null;
  tradeCount: number;
  badge: BadgeTierName | null;
};

export type TraderLeaderboardPage = {
  items: TraderLeaderboardRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sort: LeaderboardSort;
  search: string;
};
