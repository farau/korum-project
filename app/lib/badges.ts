export const BADGE_TIERS = [
  { name: "Copper", className: "copper", minimumCount: 1, minimumVolumeUsd: 1_000, minimumTrades: 10 },
  { name: "Bronze", className: "bronze", minimumCount: 3, minimumVolumeUsd: 10_000, minimumTrades: 50 },
  { name: "Silver", className: "silver", minimumCount: 10, minimumVolumeUsd: 50_000, minimumTrades: 150 },
  { name: "Gold", className: "gold", minimumCount: 25, minimumVolumeUsd: 200_000, minimumTrades: 400 },
  { name: "Platinum", className: "platinum", minimumCount: 50, minimumVolumeUsd: 1_000_000, minimumTrades: 1_000 },
  { name: "Diamond", className: "diamond", minimumCount: 100, minimumVolumeUsd: 5_000_000, minimumTrades: 2_500 },
  { name: "Champion", className: "champion", minimumCount: 250, minimumVolumeUsd: 20_000_000, minimumTrades: 10_000 },
] as const;

export type BadgeTier = (typeof BADGE_TIERS)[number];
export type BadgeTierName = BadgeTier["name"];
export type BadgePath = "creator" | "trader" | "referrer";

export type BadgeMetrics = {
  versusCreated: number;
  creatorVolumeUsd: number | null;
  tradeCount: number;
  tradedVolumeUsd: number | null;
  referralCount: number;
  referredVolumeUsd: number | null;
};

export type BadgeProgress = Record<BadgePath, BadgeTier | null> & {
  overall: BadgeTier | null;
};

function highestMatchingTier(matches: (tier: BadgeTier) => boolean) {
  return [...BADGE_TIERS].reverse().find(matches) ?? null;
}

export function calculateBadgeProgress(metrics: BadgeMetrics): BadgeProgress {
  const creator = highestMatchingTier((tier) => (
    metrics.creatorVolumeUsd !== null
    && metrics.versusCreated >= tier.minimumCount
    && metrics.creatorVolumeUsd >= tier.minimumVolumeUsd
  ));
  const trader = highestMatchingTier((tier) => (
    metrics.tradedVolumeUsd !== null
    && metrics.tradeCount >= tier.minimumTrades
    && metrics.tradedVolumeUsd >= tier.minimumVolumeUsd
  ));
  const referrer = highestMatchingTier((tier) => (
    metrics.referredVolumeUsd !== null
    && metrics.referralCount >= tier.minimumCount
    && metrics.referredVolumeUsd >= tier.minimumVolumeUsd
  ));
  const paths = [creator, trader, referrer];
  const overall = [...BADGE_TIERS].reverse().find((tier) => paths.some((path) => path?.name === tier.name)) ?? null;

  return { creator, trader, referrer, overall };
}
