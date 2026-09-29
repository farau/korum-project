"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NOTIFICATION_EVENT,
  isAppNotification,
  readStoredNotifications,
  storeNotifications,
  type AppNotification,
} from "../lib/notifications/client";
import ProfileAvatar from "./ProfileAvatar";
import { shortenAddress, useWallet } from "./WalletProvider";

const navItems = [
  { href: "/explore", label: "Explore" },
  { href: "/earn", label: "Earn" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/concept", label: "Concept" },
  { href: "/analytics", label: "Analytics" },
];

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
    <>
      <svg className="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2 6 6M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
      </svg>
      <svg className="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
      </svg>
    </>
  );
}

function DisconnectIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="m15 16 4-4-4-4M19 12H9" /></svg>;
}

export default function Header() {
  const { address, connected, authenticated } = useWallet();
  const notificationWallet = connected && authenticated && address ? address.toLowerCase() : null;
  // A new owner gets fresh state immediately, before effects or requests settle.
  return <HeaderContent key={notificationWallet ?? "anonymous"} notificationWallet={notificationWallet} />;
}

function HeaderContent({ notificationWallet }: { notificationWallet: string | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationCenterRef = useRef<HTMLDivElement>(null);
  const walletCenterRef = useRef<HTMLDivElement>(null);
  const { address, connected, authenticating, connect, disconnect, hydrated: walletHydrated } = useWallet();

  useEffect(() => {
    if (!walletHydrated) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadReferralNotification() {
      const storedNotifications = readStoredNotifications(notificationWallet);
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json() as { notification?: Omit<AppNotification, "read"> | null };
        if (cancelled) return;
        if (!response.ok || !result.notification) {
          setNotifications((current) => current.length ? current : storedNotifications);
          return;
        }

        const notification: AppNotification = { ...result.notification, walletAddress: notificationWallet, read: false };
        setNotifications((current) => {
          const existing = current.length ? current : storedNotifications;
          const next = [notification, ...existing.filter((item) => item.id !== notification.id)].slice(0, 10);
          storeNotifications(notificationWallet, next);
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
    return () => { cancelled = true; controller.abort(); };
  }, [notificationWallet, walletHydrated]);

  useEffect(() => {
    function showClientNotification(event: Event) {
      const notification = (event as CustomEvent<unknown>).detail;
      if (!isAppNotification(notification) || notification.walletAddress !== notificationWallet) return;
      setNotifications((current) => {
        const next = [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 10);
        storeNotifications(notificationWallet, next);
        return next;
      });
      setNotificationOpen(true);
    }

    window.addEventListener(NOTIFICATION_EVENT, showClientNotification);
    return () => window.removeEventListener(NOTIFICATION_EVENT, showClientNotification);
  }, [notificationWallet]);

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

  useEffect(() => {
    if (!walletMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!walletCenterRef.current?.contains(event.target as Node)) setWalletMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setWalletMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [walletMenuOpen]);

  const hasUnreadNotifications = notifications.some((notification) => !notification.read);

  function toggleNotifications() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (nextOpen) setWalletMenuOpen(false);
    if (!hasUnreadNotifications) return;

    setNotifications((current) => {
      const next = current.map((notification) => ({ ...notification, read: true }));
      storeNotifications(notificationWallet, next);
      return next;
    });
  }

  function clearNotifications() {
    setNotifications([]);
    storeNotifications(notificationWallet, []);
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

  function toggleWalletMenu() {
    setWalletMenuOpen((open) => !open);
    setNotificationOpen(false);
    setDisconnectError(null);
  }

  async function disconnectWallet() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await disconnect();
      setWalletMenuOpen(false);
    } catch {
      setDisconnectError("Unable to disconnect the wallet. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/explore" className="logo" aria-label="Korum">
          <LogoMark />
        </Link>

        <nav className={`topnav${menuOpen ? " open" : ""}`} id="primary-navigation" aria-label="Main navigation">
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
                        <span className="notification-success-icon" aria-hidden="true">{notification.type === "watchlist" ? "★" : "✓"}</span>
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

          <Link href="/create" className="btn btn-create" aria-label="Create a VS">
            <span className="btn-create-label-desktop">Create a VS</span>
            <span className="btn-create-label-mobile" aria-hidden="true">VS</span>
          </Link>

          {connected && address ? (
            <div className="wallet-account-center" ref={walletCenterRef}>
              <button
                type="button"
                className="wallet-avatar-button"
                aria-label="Open wallet menu"
                aria-expanded={walletMenuOpen}
                aria-controls="wallet-account-panel"
                onClick={toggleWalletMenu}
              >
                <ProfileAvatar address={address} />
              </button>

              {walletMenuOpen ? (
                <section className="wallet-account-panel" id="wallet-account-panel" role="dialog" aria-label="Connected wallet">
                  <div className="wallet-account-summary">
                    <ProfileAvatar address={address} className="wallet-avatar-large" />
                    <div className="wallet-account-copy">
                      <span>Connected with</span>
                      <strong>{shortenAddress(address)}</strong>
                    </div>
                    <Link href="/profile" className="wallet-profile-link" onClick={() => setWalletMenuOpen(false)}>See Profile</Link>
                  </div>
                  <div className="wallet-account-divider" />
                  <button type="button" className="wallet-disconnect-button" disabled={disconnecting} onClick={disconnectWallet}>
                    <DisconnectIcon />
                    <span>{disconnecting ? "Disconnecting…" : "Disconnect wallet"}</span>
                  </button>
                  {disconnectError ? <p className="wallet-disconnect-error" role="alert">{disconnectError}</p> : null}
                </section>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-solid wallet-shine-btn"
              disabled={!walletHydrated || authenticating}
              onClick={connect}
              aria-busy={authenticating}
              title={authenticating ? "Authenticating wallet..." : undefined}
            >
              {connected ? "Connecting..." : "Connect wallet"}
            </button>
          )}

        </div>

        <button
          type="button"
          className="navtoggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
      </div>
    </header>
  );
}
