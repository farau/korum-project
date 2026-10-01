export type ProfileHolding = {
  versusId: string;
  tokenAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  amount: string;
  valueEth: number | null;
  valueUsd: number | null;
  status: "priced" | "pool_estimate" | "graduated" | "unavailable";
};

export type ProfileHoldings = {
  ethAmount: string;
  ethValueUsd: number | null;
  tokens: ProfileHolding[];
  totalValueUsd: number | null;
  pricedValueUsd: number | null;
  partial: boolean;
  limited: boolean;
  quoteAvailable: boolean;
};
