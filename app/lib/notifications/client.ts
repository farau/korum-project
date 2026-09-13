export const NOTIFICATION_STORAGE_KEY = "korum-notifications-v1";
export const NOTIFICATION_EVENT = "korum:notification";

export type AppNotification = {
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
    && (candidate.type === "referral" || candidate.type === "watchlist")
    && typeof candidate.title === "string"
    && typeof candidate.message === "string"
    && typeof candidate.createdAt === "string"
    && typeof candidate.read === "boolean";
}

export function readStoredNotifications() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isAppNotification).slice(0, 10);
  } catch {
    return [];
  }
}

export function storeNotifications(notifications: AppNotification[]) {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
  } catch {}
}

export function pushAppNotification(notification: Omit<AppNotification, "id" | "createdAt" | "read">) {
  const nextNotification: AppNotification = {
    ...notification,
    id: `${notification.type}-${Date.now()}-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const next = [nextNotification, ...readStoredNotifications()].slice(0, 10);
  storeNotifications(next);
  window.dispatchEvent(new CustomEvent<AppNotification>(NOTIFICATION_EVENT, { detail: nextNotification }));
}
