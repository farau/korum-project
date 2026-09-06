export type UserProfile = {
  id: string;
  evmWallet: `0x${string}`;
  referralCode: `0x${string}`;
  referredByUserId: string | null;
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
