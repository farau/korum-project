export const NOTIFICATION_STORAGE_KEY = "korum-notifications-v2";
export const NOTIFICATION_EVENT = "korum:notification";

export type AppNotification = {
  walletAddress: string | null;
  id: string;
  type: "referral" | "watchlist";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export function isAppNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppNotification>;
  return typeof candidate.id === "string"
    && (candidate.walletAddress === null || (typeof candidate.walletAddress === "string" && /^0x[0-9a-f]{40}$/.test(candidate.walletAddress)))
    && (candidate.type === "referral" || candidate.type === "watchlist")
    && typeof candidate.title === "string"
    && typeof candidate.message === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.read === "boolean";
}

export function notificationStorageKey(walletAddress: string | null) {
  return `${NOTIFICATION_STORAGE_KEY}:${walletAddress?.toLowerCase() ?? "anonymous"}`;
}

export function readStoredNotifications(walletAddress: string | null) {
  try {
    // Legacy entries have no owner and cannot safely be assigned to a wallet.
    localStorage.removeItem("korum-notifications-v1");
    const value: unknown = JSON.parse(localStorage.getItem(notificationStorageKey(walletAddress)) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isAppNotification).filter(item => item.walletAddress === (walletAddress?.toLowerCase() ?? null)).slice(0, 10);
  } catch {
    return [];
  }
}

export function storeNotifications(walletAddress: string | null, notifications: AppNotification[]) {
  try {
    const owner = walletAddress?.toLowerCase() ?? null;
    localStorage.setItem(notificationStorageKey(owner), JSON.stringify(notifications.filter(item => item.walletAddress === owner).slice(0, 10)));
  } catch {}
}

export function pushAppNotification(walletAddress: string, notification: Omit<AppNotification, "id" | "createdAt" | "read" | "walletAddress">) {
  const nextNotification: AppNotification = {
    ...notification,
    walletAddress: walletAddress.toLowerCase(),
    id: `${notification.type}-${Date.now()}-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const next = [nextNotification, ...readStoredNotifications(walletAddress)].slice(0, 10);
  storeNotifications(walletAddress, next);
  window.dispatchEvent(new CustomEvent<AppNotification>(NOTIFICATION_EVENT, { detail: nextNotification }));
}
