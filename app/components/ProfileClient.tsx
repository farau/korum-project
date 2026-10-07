"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { KORUM_CHAIN } from "../config/korum-network";
import { useWatchlist } from "../hooks/useWatchlist";
import { BADGE_TIERS, calculateBadgeProgress, type BadgeTier } from "../lib/badges";
import type { Debate } from "../lib/debates";
import { formatMarketValue, formatTokenAmount } from "../lib/markets/format";
import type { UserProfile, UserProfileActivityPage, UserProfileStats, ProfileReferrer } from "../lib/profile";
import type { ProfileHoldings } from "../lib/profile-holdings";
import ProfileAvatar from "./ProfileAvatar";
import AvatarUpload from "./AvatarUpload";
import ProfileFeeClaim from "./ProfileFeeClaim";
import { TokenImage, VsTableView } from "./explore/VsTable";
import { shortenAddress, useWallet } from "./WalletProvider";

type ProfileTab = "information" | "holdings" | "managed" | "activity" | "referrals" | "badges" | "watchlist" | "simulator";

type ProfileClientProps = {
  profile: UserProfile | null;
  stats: UserProfileStats | null;
  sessionAddress: string | null;
  sessionChainId: number | null;
  referral: ProfileReferrer;
};

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "information", label: "Information" },
  { id: "holdings", label: "My Holdings" },
  { id: "managed", label: "Managed Versus" },
  { id: "activity", label: "Activity" },
  { id: "referrals", label: "Referrals" },
  { id: "badges", label: "Badges" },
  { id: "watchlist", label: "Watchlist" },
  { id: "simulator", label: "Global simulator" },
];

function chainName(chainId: number | null) {
  if (chainId === 4663) return "Robinhood Chain";
  if (chainId === 46630) return "Robinhood Chain Testnet";
  return chainId ? `Chain ${chainId}` : "Awaiting wallet";
}

function formatUtcDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function compactMoney(value: number) {
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function formatHoldingUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.01) return "<$0.01";
  return formatMarketValue(value, "USD", 2);
}

function Icon({ name }: { name: "copy" | "users" | "bolt" | "chart" | "wallet" | "trade" | "image" | "x" | "edit" | "external" }) {
  const paths = {
    copy: <><rect x="8" y="8" width="10" height="10" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z" />,
    chart: <><path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 5-7" /></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6" /><path d="M16 13h4" /></>,
    trade: <><path d="m7 7 3-3 3 3" /><path d="M10 4v13" /><path d="m17 17-3 3-3-3" /><path d="M14 20V7" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    x: <path d="M5 4h4.5l3.2 4.5L17 4h2l-5.4 6 5.9 10H15l-3.6-5.2L6.8 20h-2l5.7-6.7L5 4Z" />,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    external: <><path d="M15 3h6v6" /><path d="m10 14 11-11" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function CopyButton({ value, label }: { value: string | (() => string); label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const copyValue = typeof value === "function" ? value() : value;
    await navigator.clipboard?.writeText(copyValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button type="button" className={`profile-copy-button${copied ? " copied" : ""}`} onClick={copy} aria-label={label} title={copied ? "Copied" : label}>
      <Icon name="copy" />
    </button>
  );
}

function getReferralLink(code: string) {
  const referralUrl = new URL("/", window.location.origin);
  referralUrl.searchParams.set("ref", code);
  return referralUrl.toString();
}

function IndexedData({ children = "Recorded activity" }: { children?: React.ReactNode }) {
  return <span className="profile-data-pending">{children}</span>;
}

function formatTradedVolume(stats: UserProfileStats) {
  return stats.tradedVolumeUsd === null
    ? formatMarketValue(stats.tradedVolumeEth, "ETH", 4)
    : formatMarketValue(stats.tradedVolumeUsd, "USD", 2);
}

function formatEstimatedPnl(stats: UserProfileStats) {
  const value = stats.estimatedPnlUsd ?? stats.estimatedPnlEth;
  if (value === null) return "—";
  const currency = stats.estimatedPnlUsd === null ? "ETH" : "USD";
  const formatted = formatMarketValue(Math.abs(value), currency, currency === "ETH" ? 5 : 2);
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function pnlClass(stats: UserProfileStats) {
  const pnl = stats.estimatedPnlEth;
  if (pnl === null || pnl === 0) return "";
  return pnl > 0 ? "profile-value-positive" : "profile-value-negative";
}

function formatTradeDate(timestamp: number) {
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000))} UTC`;
}

function InformationPanel({ profile, stats, referral, holdings, holdingsLoading, onOpenHoldings, onProfileChange }: { profile: UserProfile; stats: UserProfileStats; referral: ProfileReferrer; holdings: ProfileHoldings | null; holdingsLoading: boolean; onOpenHoldings: () => void; onProfileChange: (profile: UserProfile) => void }) {
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  async function saveDisplayName() {
    setSavingDisplayName(true);
    setDisplayNameError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const result = await response.json() as { user?: UserProfile; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Unable to update the username.");
      setDisplayName(result.user.displayName ?? "");
      onProfileChange(result.user);
      setEditingDisplayName(false);
    } catch (error) {
      setDisplayNameError(error instanceof Error ? error.message : "Unable to update the username.");
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function saveBio() {
    setSavingBio(true);
    setBioError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      const result = await response.json() as { user?: UserProfile; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Unable to update the profile bio.");
      onProfileChange(result.user);
      setEditingBio(false);
    } catch (error) {
      setBioError(error instanceof Error ? error.message : "Unable to update the profile bio.");
    } finally {
      setSavingBio(false);
    }
  }

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-information">
      <section className="profile-account-card">
        <h2>Account information</h2>
        <p>Wallet identity and account access in one place.</p>
        <div className="profile-account-grid">
          <div className={`profile-field profile-editable-field${editingDisplayName ? " editing" : ""}`}>
            <span><small>Username</small>{editingDisplayName ? <input aria-label="Username" autoComplete="nickname" maxLength={32} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /> : <strong>{profile.displayName || "Choose a username"}</strong>}</span>
            {editingDisplayName ? <span className="profile-bio-actions"><button type="button" disabled={savingDisplayName} onClick={saveDisplayName}>{savingDisplayName ? "Saving..." : "Save"}</button><button type="button" disabled={savingDisplayName} onClick={() => { setDisplayName(profile.displayName ?? ""); setDisplayNameError(null); setEditingDisplayName(false); }}>Cancel</button></span> : <button type="button" className="profile-copy-button" onClick={() => setEditingDisplayName(true)} aria-label="Edit username" title="Edit username"><Icon name="edit" /></button>}
          </div>
          <AvatarUpload profile={profile} onChange={onProfileChange} />
          <div className="profile-field">
            <span><small>Member since</small><strong>{formatUtcDate(profile.createdAt)}</strong></span>
          </div>
          <div className={`profile-field profile-editable-field profile-bio-field${editingBio ? " editing" : ""}`}>
            <span><small>Profile bio</small>{editingBio ? <input aria-label="Profile bio" maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} /> : <strong>{profile.bio || "No bio set"}</strong>}</span>
            {editingBio ? <span className="profile-bio-actions"><button type="button" disabled={savingBio} onClick={saveBio}>{savingBio ? "Saving..." : "Save"}</button><button type="button" disabled={savingBio} onClick={() => { setBio(profile.bio ?? ""); setBioError(null); setEditingBio(false); }}>Cancel</button></span> : <button type="button" className="profile-copy-button" onClick={() => setEditingBio(true)} aria-label="Edit profile bio" title="Edit profile bio"><Icon name="edit" /></button>}
          </div>
          <div className="profile-field profile-field-disabled" aria-disabled="true">
            <span><small className="profile-label-with-icon"><Icon name="x" /> X account</small><strong>{profile.xAccount ? `@${profile.xAccount.username}` : "Not linked"}</strong></span>
            <button type="button" className="profile-pill-button" disabled title="X account linking is not available yet">Link</button>
          </div>
          <div className="profile-field">
            <span><small>Account address</small><strong className="profile-address-value" title={profile.evmWallet}>{profile.evmWallet.slice(0, 4)}…{profile.evmWallet.slice(-4)}</strong></span>
            <CopyButton value={profile.evmWallet} label="Copy wallet address" />
          </div>
          <div className="profile-field">
            <span><small>Referrer</small><strong title={referral.referrer?.address}>{referral.referrer ? referral.referrer.displayName || shortenAddress(referral.referrer.address) : referral.unavailable ? "Temporarily unavailable" : "No referrer"}</strong>{referral.referrer ? <small>{shortenAddress(referral.referrer.address)} · Confirmed on-chain</small> : null}</span>
            {referral.referrer ? <CopyButton value={referral.referrer.address} label="Copy referrer address" /> : null}
          </div>
        </div>
        {displayNameError ? <p className="profile-field-error" role="alert">{displayNameError}</p> : null}
        {bioError ? <p className="profile-field-error" role="alert">{bioError}</p> : null}
      </section>

      <div className="profile-stat-grid">
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="users" /></span><span>Referral</span></div>
          <div className="profile-referral-code"><span><small>Referral code</small><strong>{profile.referralCode}</strong></span><CopyButton value={() => getReferralLink(profile.referralCode)} label="Copy referral link" /></div>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="users" /></span><span>Referrals</span></div>
          <strong className="profile-stat-value">{stats.referralCount}</strong><IndexedData />
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="bolt" /></span><span>Versus</span></div>
          <div className="profile-versus-values"><span><strong>{stats.versusCreated}</strong><small>Created</small></span><span><strong>{stats.versusJoined}</strong><small>Joined</small></span></div>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading profile-stat-split"><span><span className="profile-stat-icon"><Icon name="chart" /></span><span>Estimated PNL</span></span><strong className={pnlClass(stats)}>{formatEstimatedPnl(stats)}</strong></div>
          <div className="profile-flat-chart" aria-label="Estimated mark-to-market PNL excluding gas"><span /></div>
          <IndexedData>Mark-to-market · gas excluded</IndexedData>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="wallet" /></span><span>My Holdings</span></div>
          <strong className="profile-stat-value">{formatHoldingUsd(holdings?.totalValueUsd)}</strong>
          <button type="button" className="profile-holdings-shortcut" onClick={onOpenHoldings}>{holdingsLoading ? "Loading balances…" : holdings?.partial ? "Partial valuation · View holdings →" : holdings?.quoteAvailable === false ? "USD quote unavailable · View holdings →" : "View holdings →"}</button>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="trade" /></span><span>Traded volume</span></div>
          <strong className="profile-stat-value">{formatTradedVolume(stats)}</strong><IndexedData>{stats.tradeCount} {stats.tradeCount === 1 ? "trade" : "trades"}</IndexedData>
        </article>
      </div>
    </div>
  );
}

function HoldingsPanel({ holdings, loading, error, retry }: { holdings: ProfileHoldings | null; loading: boolean; error: string | null; retry: () => void }) {
  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-holdings">
      <section className="profile-content-card profile-holdings-card">
        <div className="profile-section-title">
          <div><span className="profile-eyebrow">Your wallet on Robinhood Chain</span><h2>My Holdings</h2></div>
          {holdings ? <button type="button" className="profile-holdings-refresh" onClick={retry} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh balances"}</button> : null}
        </div>
        {loading && !holdings ? (
          <div className="profile-empty-state" aria-live="polite"><Icon name="wallet" /><strong>Loading wallet balances…</strong></div>
        ) : error && !holdings ? (
          <div className="profile-empty-state" role="alert"><Icon name="wallet" /><strong>Unable to load holdings</strong><p>{error}</p><button type="button" className="btn btn-glass" onClick={retry}>Retry</button></div>
        ) : holdings ? (
          <>
            <div className="profile-holdings-summary">
              <span>{holdings.partial ? "Priced assets" : "Estimated known holdings"}</span>
              <strong>{formatHoldingUsd(holdings.partial ? holdings.pricedValueUsd : holdings.totalValueUsd)}</strong>
              <small>{holdings.partial ? "Some Korum tokens cannot be priced yet; this is not a portfolio total." : "ETH plus tokens from your traded markets · pool values use spot prices"}</small>
            </div>
            {holdings.limited ? <p className="profile-holdings-note">Only the first 100 traded tokens were checked. The displayed value is incomplete.</p> : null}
            {!holdings.quoteAvailable ? <p className="profile-holdings-note">ETH/USD is unavailable. Dollar values will appear when the quote returns.</p> : null}
            <div className="profile-holdings-list">
              <div className="profile-holding-row profile-holding-heading"><span>Asset</span><span>Amount</span><span>Estimated value</span></div>
              <div className="profile-holding-row">
                <div className="profile-holding-asset"><span className="profile-holding-symbol">Ξ</span><span><strong>ETH</strong><small>Native balance</small></span></div>
                <strong>{formatTokenAmount(holdings.ethAmount, 6)} ETH</strong>
                <strong>{formatHoldingUsd(holdings.ethValueUsd)}</strong>
              </div>
              {holdings.tokens.map((token) => (
                <div className="profile-holding-row" key={token.tokenAddress}>
                  <div className="profile-holding-asset"><span className="profile-holding-symbol">{token.tokenSymbol.slice(0, 1).toUpperCase()}</span><span><Link href={`/vs/${token.versusId}`}>{token.tokenSymbol}</Link><small>{token.tokenName} · VS #{token.versusId}</small></span></div>
                  <strong>{formatTokenAmount(token.amount, 6)} {token.tokenSymbol}</strong>
                  <span><strong>{formatHoldingUsd(token.valueUsd)}</strong>{token.status !== "priced" ? <small>{token.status === "pool_estimate" ? "Pool spot estimate" : token.status === "graduated" ? "Pool price unavailable" : "Quote unavailable"}</small> : null}</span>
                </div>
              ))}
            </div>
            {!holdings.tokens.length ? <p className="profile-holdings-note">No Korum tokens found among your traded markets.</p> : null}
            <p className="profile-holdings-note">Token balances are shown for markets you have traded. Tokens received without any trade in this wallet may not appear yet. Curve values estimate selling the full balance after protocol fees. Graduated token values use the latest available pool price times the balance, without price impact or selling fees. Gas is excluded.</p>
          </>
        ) : null}
      </section>
    </div>
  );
}

type ManagedCamp = { versusId: string; title: string; side: number; tokenAddress: string; tokenName: string; tokenSymbol: string; tokenImage?: string };

function ManagedVersusPanel() {
  const [result, setResult] = useState<{ items: ManagedCamp[]; limited: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/managed-versus", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Managed Versus request failed (${response.status}).`);
        return response.json() as Promise<{ items: ManagedCamp[]; limited: boolean }>;
      })
      .then((data) => { if (!controller.signal.aborted) { setResult(data); setError(null); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load managed Versus."); });
    return () => controller.abort();
  }, [retry]);

  const managedVersus = Array.from((result?.items ?? []).reduce((groups, camp) => {
    const group = groups.get(camp.versusId);
    if (group) group.camps.push(camp);
    else groups.set(camp.versusId, { versusId: camp.versusId, title: camp.title, camps: [camp] });
    return groups;
  }, new Map<string, { versusId: string; title: string; camps: ManagedCamp[] }>()).values());

  return <div className="profile-tab-panel" role="tabpanel" id="profile-panel-managed">
    <ProfileFeeClaim />
    <section className="profile-content-card">
      <div className="profile-section-title"><div><span className="profile-eyebrow">Current fee rights</span><h2>Managed Versus</h2></div>{result ? <span className="profile-count-pill">{managedVersus.length} versus</span> : null}</div>
      <p className="profile-holdings-note">These camps currently send their future creator fees to your wallet. The original launch creator remains unchanged.</p>
      {!result && !error ? <div className="profile-empty-state"><Icon name="wallet" /><strong>Loading managed camps…</strong></div> : null}
      {error ? <div className="profile-empty-state" role="alert"><Icon name="wallet" /><strong>Unable to load managed Versus</strong><p>{error}</p><button type="button" className="btn btn-glass" onClick={() => { setError(null); setRetry((value) => value + 1); }}>Retry</button></div> : null}
      {result && !error && result.items.length === 0 ? <div className="profile-empty-state"><Icon name="wallet" /><strong>No managed camps yet</strong><p>When your wallet receives a camp’s creator fees, it will appear here.</p></div> : null}
      {result && !error && managedVersus.length > 0 ? (
        <div className="vs-table-wrap profile-managed-table-wrap" tabIndex={0} role="region" aria-label="Managed Versus and fee rights">
          <table className="vs-table profile-managed-table">
            <thead><tr><th scope="col">VS</th><th scope="col">Camp</th><th scope="col">Rights</th><th scope="col"><span className="sr-only">Manage</span></th></tr></thead>
            {managedVersus.map((versus) => (
              <tbody key={versus.versusId} className="table-matchup-group">
                {versus.camps.map((camp, index) => (
                  <tr className="table-token-row" key={camp.tokenAddress}>
                    {index === 0 ? <td className="col-matchup" rowSpan={versus.camps.length}>
                      <Link className="table-matchup-link" href={`/vs/${versus.versusId}`}>
                        <span className="table-matchup-tint" />
                        <span className="table-matchup-content">
                          <span className="pair-bolt" aria-hidden="true"><span className="pb-dot pb-dot1" /><span className="pb-dot pb-dot2" /><span className="pb-icon" /></span>
                          <span className="table-matchup-text"><span className="table-matchup-title">{versus.title}</span></span>
                        </span>
                      </Link>
                    </td> : null}
                    <td><Link href={`/vs/${versus.versusId}`} className="table-vs-link"><TokenImage src={camp.tokenImage} name={camp.tokenName} /><span className="table-vs-title">{camp.tokenName}</span></Link></td>
                    <td className="profile-managed-rights">Future creator fees</td>
                    {index === 0 ? <td className="profile-managed-action" rowSpan={versus.camps.length}><Link className="btn btn-glass" href={`/vs/${versus.versusId}`} aria-label={`Manage ${versus.title}`}>Manage</Link></td> : null}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      ) : null}
      {result?.limited ? <p className="profile-holdings-note">Showing the 100 most recent managed camps.</p> : null}
    </section>
  </div>;
}

function ActivityPanel({ stats }: { stats: UserProfileStats }) {
  const [page, setPage] = useState(1);
  const [activity, setActivity] = useState<UserProfileActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(stats.tradeCount / 10));

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/profile/activity?page=${page}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as UserProfileActivityPage & { error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load trading activity.");
        setActivity(result);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load trading activity.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, retryCount]);

  function goToActivityPage(nextPage: number) {
    setLoading(true);
    setError(null);
    setPage(nextPage);
  }

  function retryActivity() {
    setLoading(true);
    setError(null);
    setRetryCount((count) => count + 1);
  }

  const trades = activity?.items ?? [];
  const displayedPage = activity?.page ?? page;
  const pageStart = (displayedPage - 1) * 10;

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-activity">
      <section className="profile-content-card profile-pnl-card">
        <div className="profile-panel-heading"><div><span>Estimated all-time PNL</span><strong className={pnlClass(stats)}>{formatEstimatedPnl(stats)}</strong></div><div className="profile-win-loss"><span>{stats.winningVersus} wins</span><span>{stats.losingVersus} losses</span></div></div>
        <div className="profile-empty-chart"><span>{stats.estimatedPnlEth === null ? "PNL cannot be estimated until every open position has an executable liquidation quote." : "Sales received + executable liquidation value − purchases paid. Gas and external ERC-20 transfers are excluded."}</span></div>
      </section>
      <section className="profile-content-card">
        <div className="profile-section-title"><div><span className="profile-eyebrow">Transactions</span><h2>Trading activity</h2></div><IndexedData>{stats.tradeCount} {stats.tradeCount === 1 ? "trade" : "trades"} · {formatTradedVolume(stats)}</IndexedData></div>
        {loading && !activity ? (
          <div className="profile-empty-state" aria-live="polite"><Icon name="trade" /><strong>Loading activity...</strong></div>
        ) : error ? (
          <div className="profile-empty-state" role="alert"><Icon name="trade" /><strong>Unable to load activity</strong><p>{error}</p><button type="button" className="btn btn-glass" onClick={retryActivity}>Retry</button></div>
        ) : trades.length === 0 ? (
          <div className="profile-empty-state"><Icon name="trade" /><strong>No activity yet</strong><p>Your purchases and sales will appear here.</p></div>
        ) : (
          <>
            <p className="profile-activity-caption">Showing {pageStart + 1}–{Math.min(pageStart + trades.length, stats.tradeCount)} of {stats.tradeCount} trades</p>
            <div className="profile-activity-list">
              {trades.map((trade) => {
                const displayedEth = trade.side === "buy" ? trade.grossAmountEth : trade.netAmountEth;
                return (
                  <article className="profile-activity-row" key={trade.id}>
                    <span className={`profile-activity-side ${trade.side}`}>{trade.side}</span>
                    <div className="profile-activity-token"><Link href={`/vs/${trade.versusId}`}>{trade.tokenSymbol}</Link><span>{trade.tokenName} · VS #{trade.versusId}</span></div>
                    <div><strong>{formatTokenAmount(trade.tokenAmount)} tokens</strong><span>{trade.venue}</span></div>
                    <div><strong>{formatTokenAmount(displayedEth, 6)} ETH</strong><span>{trade.side === "buy" ? "Paid" : "Received net"}{trade.feeAmountEth !== "0" ? ` · ${formatTokenAmount(trade.feeAmountEth, 6)} fee` : ""}</span></div>
                    <time dateTime={new Date(trade.timestamp * 1_000).toISOString()}>{formatTradeDate(trade.timestamp)}</time>
                    <a href={`${KORUM_CHAIN.blockExplorers.default.url}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`Open ${trade.side} transaction`}><Icon name="external" /></a>
                  </article>
                );
              })}
            </div>
            {totalPages > 1 ? (
              <nav className="profile-activity-pagination" aria-label="Trading activity pagination">
                <button type="button" disabled={page === 1 || loading} onClick={() => goToActivityPage(page - 1)}>← Previous</button>
                <span>Page {displayedPage} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages || activity?.hasNext === false || loading} onClick={() => goToActivityPage(page + 1)}>Next →</button>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function ReferralsPanel({ code }: { code: string }) {
  const [referredVolume, setReferredVolume] = useState(10000);
  const estimatedReward = referredVolume * 0.001;

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-referrals">
      <ProfileFeeClaim />
      <div className="profile-referral-flow" aria-label="Referral reward flow">
        <article><span>01</span><strong>Share your code</strong><p>Your unique referral code stays bound to your connected EVM wallet.</p></article>
        <span className="profile-flow-arrow">→</span>
        <article><span>02</span><strong>Friends trade</strong><p>Their trading volume counts toward your referral activity.</p></article>
        <span className="profile-flow-arrow">→</span>
        <article><span>03</span><strong>Earn rewards</strong><p>Your rewards will appear here when available.</p></article>
      </div>
      <section className="profile-content-card profile-referral-address">
        <div><span className="profile-eyebrow">Your referral code</span><strong>{code}</strong></div>
        <CopyButton value={() => getReferralLink(code)} label="Copy referral link" />
      </section>
      <div className="profile-referral-layout">
        <section className="profile-content-card">
          <div className="profile-section-title"><div><span className="profile-eyebrow">Performance</span><h2>Referral overview</h2></div></div>
          <div className="profile-metric-row"><span><small>Referrals</small><strong>0</strong></span><span><small>Active</small><strong>0</strong></span><span><small>Rewards</small><strong>$0.00</strong></span></div>
          <div className="profile-empty-state compact"><Icon name="users" /><p>Referral history will appear here when available.</p></div>
        </section>
        <section className="profile-content-card profile-simulator-card">
          <span className="profile-eyebrow">Reward simulator</span><h2>Estimate referral rewards</h2>
          <label htmlFor="referral-volume">Monthly referred volume <strong>{compactMoney(referredVolume)}</strong></label>
          <input id="referral-volume" type="range" min="0" max="250000" step="5000" value={referredVolume} onChange={(event) => setReferredVolume(Number(event.target.value))} />
          <div className="profile-simulator-result"><span>Illustrative reward</span><strong>{compactMoney(estimatedReward)}</strong></div>
          <small>Illustrative only. Final reward rules will be announced later.</small>
        </section>
      </div>
    </div>
  );
}

type BadgeTableProps = {
  title: string;
  description: string;
  columns: [string, string, string];
  rows: Array<[string, string, string]>;
  earnedTier: BadgeTier | null;
};

function BadgeTable({ title, description, columns, rows, earnedTier }: BadgeTableProps) {
  const earnedIndex = earnedTier ? BADGE_TIERS.findIndex((tier) => tier.name === earnedTier.name) : -1;
  return (
    <section className="profile-badge-section">
      <h2>{title}</h2><p>{description}</p>
      <div className="profile-table-scroll"><table className="profile-data-table"><thead><tr><th>Tier</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
        {rows.map((row, index) => <tr key={row[0]}><td><span className={`profile-tier tier-${index}`}>{row[0]}</span></td><td>{row[1]}</td><td>{row[2]}</td><td>{index <= earnedIndex ? "Earned" : "Locked"}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

function BadgesPanel({ stats }: { stats: UserProfileStats }) {
  const progress = calculateBadgeProgress(stats);
  const creatorRows: Array<[string, string, string]> = BADGE_TIERS.map((tier) => [tier.name, `${tier.minimumCount}+ created`, `${compactMoney(tier.minimumVolumeUsd)}+ generated`]);
  const traderRows: Array<[string, string, string]> = BADGE_TIERS.map((tier) => [tier.name, `${compactMoney(tier.minimumVolumeUsd)}+ volume`, `${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(tier.minimumTrades)}+ trades`]);
  const referralRows: Array<[string, string, string]> = BADGE_TIERS.map((tier) => [tier.name, `${tier.minimumCount}+ ${tier.minimumCount === 1 ? "referral" : "referrals"}`, `${compactMoney(tier.minimumVolumeUsd)}+ volume`]);

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-badges">
      <p className="profile-panel-intro">Three paths and seven tiers make account history easy to recognize across versus, chat and leaderboard views. Your public badge is the highest tier reached on any path.</p>
      <section className="profile-tier-overview"><h2>{progress.overall ? `Current badge: ${progress.overall.name}` : "No badge earned yet"}</h2><p>Each tier requires both conditions in its path and includes the benefits of the previous one.</p><div>{BADGE_TIERS.map((tier, index) => <span className={`profile-tier tier-${index}`} key={tier.name}>{tier.name}</span>)}</div></section>
      <BadgeTable title="Path 1, Creator badge" description="Based on Versus created and their all-time trading volume." columns={["Versus", "Generated volume", "Status"]} rows={creatorRows} earnedTier={progress.creator} />
      <BadgeTable title="Path 2, Trader badge" description="Based on your total trading volume and transactions." columns={["Volume", "Trades", "Status"]} rows={traderRows} earnedTier={progress.trader} />
      <BadgeTable title="Path 3, Referrer badge" description="Based on confirmed referrals and their trading volume." columns={["Referrals", "Referred volume", "Status"]} rows={referralRows} earnedTier={progress.referrer} />
    </div>
  );
}

function watchlistAgeLabel(debate: Debate, now: number | null) {
  const created = Date.parse(debate.launchedAtUtc || debate.createdAtUtc || debate.launchedAt || debate.createdAt || "");
  const minutes = Number.isFinite(created) && now !== null
    ? Math.max(0, Math.floor((now - created) / 60_000))
    : Math.max(0, debate.createdMinutesAgo);
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function WatchlistPanel() {
  const { ids, debates, ready, remove } = useWatchlist();
  const [now, setNow] = useState<number | null>(null);
  const watched = useMemo(() => debates.filter((debate) => ids.includes(debate.id)), [debates, ids]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const kickoff = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(interval); };
  }, []);

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-watchlist">
      <div className="profile-section-title"><div><span className="profile-eyebrow">Saved markets</span><h2>Watchlist</h2></div><span className="profile-count-pill">{watched.length}</span></div>
      {!ready ? <div className="profile-empty-state"><Icon name="bolt" /><strong>Loading your watchlist...</strong></div> : watched.length ? <VsTableView debates={watched} ageLabel={(debate) => watchlistAgeLabel(debate, now)} isWatched={(id) => ids.includes(id)} onWatchlistToggle={remove} /> : <div className="profile-empty-state"><Icon name="bolt" /><strong>Your watchlist is empty</strong><p>Save a versus from Explore to find it here.</p><Link className="btn" href="/explore">Explore versus</Link></div>}
    </div>
  );
}

function SimulatorPanel() {
  const [monthlyVolume, setMonthlyVolume] = useState(25000);
  const [winRate, setWinRate] = useState(55);
  const [averageReturn, setAverageReturn] = useState(8);
  const estimate = monthlyVolume * ((winRate / 100) * (averageReturn / 100) - ((100 - winRate) / 100) * 0.05);

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-simulator">
      <section className="profile-content-card profile-global-simulator">
        <div className="profile-section-title"><div><span className="profile-eyebrow">Scenario tool</span><h2>Global simulator</h2></div></div>
        <div className="profile-global-sim-grid">
          <div className="profile-sim-controls">
            <label htmlFor="sim-volume">Monthly volume <strong>{compactMoney(monthlyVolume)}</strong></label><input id="sim-volume" type="range" min="1000" max="250000" step="1000" value={monthlyVolume} onChange={(event) => setMonthlyVolume(Number(event.target.value))} />
            <label htmlFor="sim-winrate">Winning positions <strong>{winRate}%</strong></label><input id="sim-winrate" type="range" min="0" max="100" value={winRate} onChange={(event) => setWinRate(Number(event.target.value))} />
            <label htmlFor="sim-return">Average winning return <strong>{averageReturn}%</strong></label><input id="sim-return" type="range" min="1" max="30" value={averageReturn} onChange={(event) => setAverageReturn(Number(event.target.value))} />
          </div>
          <div className="profile-sim-output"><span>Illustrative monthly result</span><strong className={estimate >= 0 ? "positive" : "negative"}>{estimate >= 0 ? "+" : ""}{compactMoney(estimate)}</strong><p>This simulation is not financial advice and does not use live account data.</p></div>
        </div>
      </section>
    </div>
  );
}

function LockedProfile({ connected, authenticating, authError, connect, loading = false }: { connected: boolean; authenticating: boolean; authError: string | null; connect: () => void; loading?: boolean }) {
  const title = loading ? "Loading your profile" : connected ? "Verify your wallet" : "Unlock your Korum profile";
  const description = loading
    ? "Checking your wallet connection and restoring your secure session."
    : connected
      ? "Your wallet is connected. Sign the secure message to access the profile linked to this address."
      : "Connect your EVM wallet to bring your activity, badges, referrals, and saved Versus together.";
  const buttonLabel = authenticating ? "Waiting for signature…" : connected ? "Sign in with wallet" : "Connect wallet";

  return (
    <div className="page profile-page">
      <section className="profile-reference-hero profile-locked-hero" aria-live={loading ? "polite" : undefined}>
        <div className="wrap profile-locked-wrap">
          <div className={`profile-locked-card${loading ? " is-loading" : ""}`}>
            <div className="profile-locked-copy">
              <span className="profile-locked-eyebrow"><span aria-hidden="true" /> Wallet required</span>
              <h1>{title}</h1>
              <p>{description}</p>

              {authError ? <div className="profile-locked-error" role="alert"><span aria-hidden="true">!</span>{authError}</div> : null}

              {!loading ? (
                <button type="button" className="btn btn-solid wallet-shine-btn profile-unlock-button" disabled={authenticating} onClick={connect}>
                  <Icon name="wallet" />
                  <span>{buttonLabel}</span>
                  <span className="profile-unlock-arrow" aria-hidden="true">→</span>
                </button>
              ) : <div className="profile-locked-loading" role="status"><span aria-hidden="true" /> Checking wallet status…</div>}

              <div className="profile-locked-assurances" aria-label="Wallet connection information">
                <span><strong>No custody</strong>Korum never holds your funds</span>
                <span><strong>Secure access</strong>A signature proves wallet ownership</span>
              </div>
            </div>

            <div className="profile-locked-preview" aria-hidden="true">
              <div className="profile-preview-glow" />
              <div className="profile-preview-card">
                <div className="profile-preview-heading">
                  <div className="profile-preview-avatar">KR</div>
                  <div><span>Your profile</span><strong>0x•••• · ••••</strong></div>
                  <span className="profile-preview-lock">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></svg>
                  </span>
                </div>
                <div className="profile-preview-pills"><span>Wallet verified</span><span>Robinhood Chain</span></div>
                <div className="profile-preview-stats">
                  <span><small>Activity</small><strong>—</strong></span>
                  <span><small>Badge</small><strong>Locked</strong></span>
                  <span><small>Watchlist</small><strong>—</strong></span>
                </div>
                <div className="profile-preview-chart"><i /><i /><i /><i /><i /><i /><i /><i /></div>
              </div>
            </div>
          </div>

          <div className="profile-locked-benefits">
            <article><span className="profile-benefit-icon"><Icon name="trade" /></span><div><strong>Track your activity</strong><p>Review trades and estimated performance.</p></div></article>
            <article><span className="profile-benefit-icon"><Icon name="users" /></span><div><strong>Grow your reputation</strong><p>Follow badges, referrals, and creator progress.</p></div></article>
            <article><span className="profile-benefit-icon"><Icon name="bolt" /></span><div><strong>Keep your Versus close</strong><p>Find every market saved to your watchlist.</p></div></article>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ProfileClient(props: ProfileClientProps) {
  const { address, connected, authenticated } = useWallet();
  const owner = connected && authenticated ? address?.toLowerCase() : null;
  return <WalletProfile key={`${owner ?? "anonymous"}:${props.profile?.id ?? "none"}`} {...props} />;
}

function WalletProfile({ profile, stats, sessionAddress, sessionChainId, referral }: ProfileClientProps) {
  const { address, connected, authenticated, authenticating, connect, hydrated, authError } = useWallet();
  const [activeTab, setActiveTab] = useState<ProfileTab>("information");
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [holdings, setHoldings] = useState<ProfileHoldings | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [holdingsRetry, setHoldingsRetry] = useState(0);

  useEffect(() => {
    if (!authenticated || !address || !sessionAddress || address.toLowerCase() !== sessionAddress.toLowerCase()) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/profile/holdings", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Holdings service returned ${response.status}.`);
        const result = await response.json() as ProfileHoldings;
        if (!controller.signal.aborted) { setHoldings(result); setHoldingsError(null); setHoldingsLoading(false); }
      } catch (error) {
        if (!controller.signal.aborted) { setHoldingsError(error instanceof Error ? error.message : "Unable to refresh holdings."); setHoldingsLoading(false); }
      }
    }
    void load();
    const timer = activeTab === "holdings"
      ? window.setInterval(() => { if (!document.hidden) void load(); }, 120_000)
      : null;
    return () => { controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [authenticated, address, sessionAddress, holdingsRetry, activeTab]);

  if (!hydrated) return <LockedProfile connected={false} authenticating={false} authError={null} connect={() => undefined} loading />;

  const hasMatchingServerSession = Boolean(authenticated && address && sessionAddress
    && address.toLowerCase() === sessionAddress.toLowerCase()
    && profile?.evmWallet.toLowerCase() === address.toLowerCase()
    && currentProfile?.evmWallet.toLowerCase() === address.toLowerCase());
  if (!connected || !address || !hasMatchingServerSession) return <LockedProfile connected={connected} authenticating={authenticating} authError={authError} connect={connect} />;
  if (!currentProfile || !stats) return <LockedProfile connected authenticating={authenticating} authError="The wallet profile could not be initialized. Sign in again to retry." connect={connect} />;

  const panels: Record<ProfileTab, React.ReactNode> = {
    information: <InformationPanel profile={currentProfile} stats={stats} referral={referral} holdings={holdings} holdingsLoading={holdingsLoading} onOpenHoldings={() => setActiveTab("holdings")} onProfileChange={setCurrentProfile} />,
    holdings: <HoldingsPanel holdings={holdings} loading={holdingsLoading} error={holdingsError} retry={() => { setHoldingsLoading(true); setHoldingsRetry((count) => count + 1); }} />,
    managed: <ManagedVersusPanel />,
    activity: <ActivityPanel stats={stats} />,
    referrals: <ReferralsPanel code={currentProfile.referralCode} />,
    badges: <BadgesPanel stats={stats} />,
    watchlist: <WatchlistPanel />,
    simulator: <SimulatorPanel />,
  };

  return (
    <div className="page profile-page">
      <section className="profile-reference-hero">
        <div className="wrap"><div className="profile-reference-card"><ProfileAvatar address={address} className="profile-avatar-hex" /><div className="profile-reference-main"><h1>{currentProfile.displayName || shortenAddress(address)}</h1><p>{currentProfile.bio || "Profile linked to your connected EVM wallet."}</p><div className="profile-reference-badges"><span>Wallet verified</span><span>{chainName(sessionChainId)}</span></div></div></div></div>
      </section>
      <section className="profile-reference-content">
        <div className="wrap">
          <div className="profile-tabs" role="tablist" aria-label="Profile sections">{PROFILE_TABS.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`profile-panel-${tab.id}`} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} key={tab.id}>{tab.label}</button>)}</div>
          {panels[activeTab]}
        </div>
      </section>
    </div>
  );
}
