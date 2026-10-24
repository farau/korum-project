export type ProfileReferrer = {
  referrer: { address: `0x${string}`; displayName: string | null } | null;
  unavailable: boolean;
};

export type UserProfile = {
  id: string;
  evmWallet: `0x${string}`;
  displayName: string | null;
  referralCode: string;
  bio: string | null;
  avatar: {
    objectKey: string;
    mimeType: string;
    updatedAt: string;
  } | null;
  xAccount: {
    userId: string;
    username: string;
    linkedAt: string;
  } | null;
  lastLoginChainId: number | null;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UserProfileStats = {
  /** Open positions whose market prices affect the displayed PNL (at most 25). */
  liveTokens?: string[];
  referralCount: number;
  activeReferralCount: number;
  versusCreated: number;
  versusJoined: number;
  tradeCount: number;
  tradedVolumeEth: number;
  tradedVolumeUsd: number | null;
  creatorVolumeEth: number;
  creatorVolumeUsd: number | null;
  referredVolumeEth: number;
  referredVolumeUsd: number | null;
  estimatedPnlEth: number | null;
  estimatedPnlUsd: number | null;
  estimatedPnlUsesPoolPrice: boolean;
  winningVersus: number;
  losingVersus: number;
};

export type UserProfileActivityPage = {
  items: UserProfileTrade[];
  page: number;
  pageSize: number;
  hasNext: boolean;
};

export type UserProfileTrade = {
  id: string;
  versusId: string;
  tokenName: string;
  tokenSymbol: string;
  side: "buy" | "sell";
  venue: "curve" | "pool";
  emitterAddress: string | null;
  poolId: string | null;
  tokenAmount: string;
  grossAmountEth: string;
  netAmountEth: string;
  feeAmountEth: string;
  timestamp: number;
  transactionHash: string;
};
