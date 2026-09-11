"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMock } from "./MockProvider";
import { shortenAddress, useWallet } from "./WalletProvider";

const navItems = [
  { href: "/explore", label: "Explore" },
  { href: "/earn", label: "Earn" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/concept", label: "Concept" },
  { href: "/analytics", label: "Analytics" },
];

const NOTIFICATION_STORAGE_KEY = "korum-notifications-v1";

type AppNotification = {
  id: string;
  type: "referral";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

function readStoredNotifications() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];

    return value.filter((notification): notification is AppNotification => {
      if (!notification || typeof notification !== "object") return false;
      const candidate = notification as Partial<AppNotification>;
      return typeof candidate.id === "string"
        && candidate.type === "referral"
        && typeof candidate.title === "string"
        && typeof candidate.message === "string"
        && typeof candidate.createdAt === "string"
        && typeof candidate.read === "boolean";
    }).slice(0, 10);
  } catch {
    return [];
  }
}

function storeNotifications(notifications: AppNotification[]) {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
  } catch {}
}

function notificationTime(createdAt: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 60_000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(createdAt));
}

function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 114.96 126.62" fill="currentColor" aria-hidden="true">
      <path d="M106.96,126.34l-97.85.28C3.65,126.63,0,123.35,0,117.77L.05,7.97C.52,4.24,3.02.04,7.13.03l107.83-.03L39.41,62.58l67.55,63.76Z" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationCenterRef = useRef<HTMLDivElement>(null);
  const { mockEnabled, setMockEnabled, hydrated } = useMock();
  const { address, connected, authenticating, connect, openWallet, hydrated: walletHydrated } = useWallet();

  useEffect(() => {
    let cancelled = false;

    async function loadReferralNotification() {
      const storedNotifications = readStoredNotifications();
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const result = await response.json() as { notification?: Omit<AppNotification, "read"> | null };
        if (cancelled) return;
        if (!response.ok || !result.notification) {
          setNotifications((current) => current.length ? current : storedNotifications);
          return;
        }

        const notification: AppNotification = { ...result.notification, read: false };
        setNotifications((current) => {
          const existing = current.length ? current : storedNotifications;
          const next = [notification, ...existing.filter((item) => item.id !== notification.id)].slice(0, 10);
          storeNotifications(next);
          return next;
        });
        setNotificationOpen(true);

        await fetch("/api/notifications", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // A notification failure must not interrupt the rest of the application.
        if (!cancelled) {
          setNotifications((current) => current.length ? current : storedNotifications);
        }
      }
    }

    void loadReferralNotification();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!notificationCenterRef.current?.contains(event.target as Node)) setNotificationOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setNotificationOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationOpen]);

  const hasUnreadNotifications = notifications.some((notification) => !notification.read);

  function toggleNotifications() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (!hasUnreadNotifications) return;

    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      storeNotifications(next);
      return next;
    });
  }

  function clearNotifications() {
    setNotifications([]);
    storeNotifications([]);
    setNotificationOpen(false);
  }

  function toggleTheme() {
    const el = document.documentElement;
    const current = el.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    const applyTheme = () => {
      el.setAttribute("data-theme", next);
      try {
        localStorage.setItem("korum-theme", next);
      } catch {}
    };
    const doc = document as Document & { startViewTransition?: (callback: () => void) => void };
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(applyTheme);
      return;
    }
    applyTheme();
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/explore" className="logo" aria-label="Korum">
          <LogoMark />
        </Link>

        <nav className={`topnav${menuOpen ? " open" : ""}`}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : undefined} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="notification-center" ref={notificationCenterRef}>
            <button
              type="button"
              className="icon-btn header-icon"
              aria-label="Notifications"
              aria-expanded={notificationOpen}
              aria-controls="notification-panel"
              onClick={toggleNotifications}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c0.5-0.5 2-2 2-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
              <span className="notif-dot" hidden={!hasUnreadNotifications} />
            </button>

            {notificationOpen ? (
              <section className="notification-panel" id="notification-panel" aria-label="Notifications" aria-live="polite">
                <div className="notification-panel-header">
                  <strong>Notifications</strong>
                  {notifications.length ? <button type="button" onClick={clearNotifications}>Clear</button> : null}
                </div>
                {notifications.length ? (
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <article className={`notification-item${notification.read ? "" : " unread"}`} key={notification.id}>
                        <span className="notification-success-icon" aria-hidden="true">✓</span>
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                          <small>{notificationTime(notification.createdAt)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="notification-empty">No notifications yet.</p>}
              </section>
            ) : null}
          </div>

          <button type="button" className="theme-toggle header-icon" aria-label="Change theme" onClick={toggleTheme}>
            <ThemeIcon />
          </button>

          {walletHydrated && connected ? (
            <Link href="/profile" className="icon-btn header-icon" aria-label="Profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5" /></svg>
            </Link>
          ) : null}

          <Link href="/create" className="btn btn-create">Create a VS</Link>

          <button
            type="button"
            className="btn btn-solid wallet-shine-btn"
            disabled={!walletHydrated || authenticating}
            onClick={connected ? openWallet : connect}
            aria-busy={authenticating}
            title={authenticating ? "Authenticating wallet..." : undefined}
          >
            {address ? shortenAddress(address) : connected ? "Connecting..." : "Connect wallet"}
          </button>

          <label className="mock-toggle" title="Show test data">
            <input
              type="checkbox"
              checked={mockEnabled}
              disabled={!hydrated}
              onChange={(event) => setMockEnabled(event.target.checked)}
            />
            <span className="mock-switch" aria-hidden="true" />
            <span>Mock data</span>
          </label>
        </div>

        <button type="button" className="navtoggle" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>☰</button>
      </div>
    </header>
  );
}
