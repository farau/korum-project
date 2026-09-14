"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useWatchlist } from "../hooks/useWatchlist";
import type { UserProfile } from "../lib/profile";
import { shortenAddress, useWallet } from "./WalletProvider";

type ProfileTab = "information" | "activity" | "referrals" | "badges" | "watchlist" | "simulator";

type ProfileClientProps = {
  profile: UserProfile | null;
  sessionAddress: string | null;
  sessionChainId: number | null;
};

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "information", label: "Information" },
  { id: "activity", label: "Activity" },
  { id: "referrals", label: "Referrals" },
  { id: "badges", label: "Badges" },
  { id: "watchlist", label: "Watchlist" },
  { id: "simulator", label: "Global simulator" },
];

const TIERS = ["Copper", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion"];

function walletInitial(address: string) {
  return address.slice(2, 4).toUpperCase();
}

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

function Icon({ name }: { name: "copy" | "users" | "bolt" | "chart" | "wallet" | "trade" | "image" | "x" | "edit" }) {
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

function DataPending() {
  return <span className="profile-data-pending">Awaiting indexer</span>;
}

function InformationPanel({ profile, onProfileChange }: { profile: UserProfile; onProfileChange: (profile: UserProfile) => void }) {
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
          <div className="profile-field profile-field-disabled" aria-disabled="true">
            <span><small>Profile picture</small><strong>{profile.avatar ? "Image stored" : "No image"}</strong></span>
            <button type="button" className="profile-pill-button" disabled title="Image uploads are not available yet"><Icon name="image" /> Upload</button>
          </div>
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
            <span><small>Account address</small><strong className="profile-address-value">{profile.evmWallet}</strong></span>
            <CopyButton value={profile.evmWallet} label="Copy wallet address" />
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
          <strong className="profile-stat-value">0</strong><DataPending />
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="bolt" /></span><span>Versus</span></div>
          <div className="profile-versus-values"><span><strong>0</strong><small>Created</small></span><span><strong>0</strong><small>Joined</small></span></div>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading profile-stat-split"><span><span className="profile-stat-icon"><Icon name="chart" /></span><span>PNL</span></span><strong>$0.00</strong></div>
          <div className="profile-flat-chart" aria-label="No indexed PNL data"><span /></div>
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="wallet" /></span><span>Wallet</span></div>
          <strong className="profile-stat-value">$0.00</strong><DataPending />
        </article>
        <article className="profile-stat-block">
          <div className="profile-stat-heading"><span className="profile-stat-icon"><Icon name="trade" /></span><span>Traded volume</span></div>
          <strong className="profile-stat-value">$0.00</strong><DataPending />
        </article>
      </div>
    </div>
  );
}

function ActivityPanel() {
  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-activity">
      <section className="profile-content-card profile-pnl-card">
        <div className="profile-panel-heading"><div><span>All-time PNL</span><strong>$0.00</strong></div><div className="profile-win-loss"><span>0 wins</span><span>0 losses</span></div></div>
        <div className="profile-empty-chart"><span>No indexed activity yet</span></div>
      </section>
      <section className="profile-content-card">
        <div className="profile-section-title"><div><span className="profile-eyebrow">Transactions</span><h2>Trading activity</h2></div><DataPending /></div>
        <div className="profile-empty-state"><Icon name="trade" /><strong>No activity yet</strong><p>Your indexed purchases and sales will appear here.</p></div>
      </section>
    </div>
  );
}

function ReferralsPanel({ code }: { code: string }) {
  const [referredVolume, setReferredVolume] = useState(10000);
  const estimatedReward = referredVolume * 0.001;

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-referrals">
      <div className="profile-referral-flow" aria-label="Referral reward flow">
        <article><span>01</span><strong>Share your code</strong><p>Your unique referral code stays bound to your connected EVM wallet.</p></article>
        <span className="profile-flow-arrow">→</span>
        <article><span>02</span><strong>Friends trade</strong><p>Indexed referral volume accumulates automatically.</p></article>
        <span className="profile-flow-arrow">→</span>
        <article><span>03</span><strong>Earn rewards</strong><p>Rewards become visible when the indexer is connected.</p></article>
      </div>
      <section className="profile-content-card profile-referral-address">
        <div><span className="profile-eyebrow">Your referral code</span><strong>{code}</strong></div>
        <CopyButton value={() => getReferralLink(code)} label="Copy referral link" />
      </section>
      <div className="profile-referral-layout">
        <section className="profile-content-card">
          <div className="profile-section-title"><div><span className="profile-eyebrow">Performance</span><h2>Referral overview</h2></div></div>
          <div className="profile-metric-row"><span><small>Referrals</small><strong>0</strong></span><span><small>Active</small><strong>0</strong></span><span><small>Rewards</small><strong>$0.00</strong></span></div>
          <div className="profile-empty-state compact"><Icon name="users" /><p>Referral history will be provided by Railway.</p></div>
        </section>
        <section className="profile-content-card profile-simulator-card">
          <span className="profile-eyebrow">Reward simulator</span><h2>Estimate referral rewards</h2>
          <label htmlFor="referral-volume">Monthly referred volume <strong>{compactMoney(referredVolume)}</strong></label>
          <input id="referral-volume" type="range" min="0" max="250000" step="5000" value={referredVolume} onChange={(event) => setReferredVolume(Number(event.target.value))} />
          <div className="profile-simulator-result"><span>Illustrative reward</span><strong>{compactMoney(estimatedReward)}</strong></div>
          <small>Illustrative only. Final reward rules will come from the protocol and indexer.</small>
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
  requiresX?: boolean;
};

function BadgeTable({ title, description, columns, rows, requiresX = false }: BadgeTableProps) {
  return (
    <section className="profile-badge-section">
      <h2>{title}</h2><p>{description}</p>
      <div className="profile-table-scroll"><table className="profile-data-table"><thead><tr><th>Tier</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>
        {rows.map((row, index) => <tr key={row[0]}><td><span className={`profile-tier tier-${index}`}>{row[0]}</span></td><td>{row[1]}</td><td>{row[2]}</td><td className={requiresX && index > 4 ? "profile-unavailable" : ""}>{requiresX && index > 4 ? "Unavailable until X linking" : "Awaiting indexer"}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

function BadgesPanel() {
  const creatorRows: Array<[string, string, string]> = [
    ["Copper", "1+ created", "$1K+ generated"], ["Bronze", "3+ created", "$10K+ generated"], ["Silver", "10+ created", "$50K+ generated"], ["Gold", "25+ created", "$200K+ generated"], ["Platinum", "50+ created", "$1M+ generated"], ["Diamond", "100+ created", "$5M+ generated"], ["Champion", "250+ created", "$20M+ generated"],
  ];
  const traderRows: Array<[string, string, string]> = [
    ["Copper", "$1K+ volume", "10+ trades"], ["Bronze", "$10K+ volume", "50+ trades"], ["Silver", "$50K+ volume", "150+ trades"], ["Gold", "$200K+ volume", "400+ trades"], ["Platinum", "$1M+ volume", "1K+ trades"], ["Diamond", "$5M+ volume", "2.5K+ trades"], ["Champion", "$20M+ volume", "10K+ trades"],
  ];
  const referralRows: Array<[string, string, string]> = [
    ["Copper", "1+ referral", "$1K+ volume"], ["Bronze", "3+ referrals", "$10K+ volume"], ["Silver", "10+ referrals", "$50K+ volume"], ["Gold", "25+ referrals", "$200K+ volume"], ["Platinum", "50+ referrals", "$1M+ volume"], ["Diamond", "100+ referrals", "$5M+ volume"], ["Champion", "250+ referrals", "$20M+ volume"],
  ];

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-badges">
      <p className="profile-panel-intro">Three paths and seven tiers make account history easy to recognize across versus, chat and leaderboard views.</p>
      <section className="profile-tier-overview"><h2>Shared tier scale</h2><p>Each tier includes the benefits of the previous one.</p><div>{TIERS.map((tier, index) => <span className={`profile-tier tier-${index}`} key={tier}>{tier}</span>)}</div></section>
      <BadgeTable title="Path 1, Creator badge" description="Based on versus created and the indexed volume they generate. X-based requirements remain unavailable." columns={["Versus", "Generated volume", "X account"]} rows={creatorRows} requiresX />
      <BadgeTable title="Path 2, Trader badge" description="Based on total traded volume and indexed on-chain transactions." columns={["Volume", "Trades", "Status"]} rows={traderRows} />
      <BadgeTable title="Path 3, Referrer badge" description="Based on active referrals and the volume attributed to the connected wallet." columns={["Referrals", "Referred volume", "Status"]} rows={referralRows} />
    </div>
  );
}

function WatchlistPanel() {
  const { ids, debates, ready, remove } = useWatchlist();
  const watched = useMemo(() => debates.filter((debate) => ids.includes(debate.id)), [debates, ids]);

  return (
    <div className="profile-tab-panel" role="tabpanel" id="profile-panel-watchlist">
      <div className="profile-section-title"><div><span className="profile-eyebrow">Saved markets</span><h2>Watchlist</h2></div><span className="profile-count-pill">{watched.length}</span></div>
      {!ready ? <div className="profile-empty-state"><Icon name="bolt" /><strong>Loading your watchlist...</strong></div> : watched.length ? <div className="profile-table-scroll"><table className="profile-data-table profile-watchlist-table"><thead><tr><th>Versus</th><th>Category</th><th>24h volume</th><th>Participants</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {watched.map((debate) => <tr key={debate.id}><td><Link href={`/vs/${debate.id}`}>{debate.sideA} <span>vs</span> {debate.sideB}</Link></td><td>{debate.category}</td><td>{compactMoney(debate.volume24h)}</td><td>{Intl.NumberFormat("en-US").format(debate.participantCount)}</td><td><button type="button" onClick={() => remove(debate.id, `${debate.sideA} vs ${debate.sideB}`)}>Remove</button></td></tr>)}
      </tbody></table></div> : <div className="profile-empty-state"><Icon name="bolt" /><strong>Your watchlist is empty</strong><p>Save a versus from Explore to find it here.</p><Link className="btn" href="/explore">Explore versus</Link></div>}
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
  return (
    <div className="page profile-page">
      <section className="profile-reference-hero profile-locked-hero"><div className="wrap profile-locked-card"><span className="vs-hero-badge">Profile</span><h1>Wallet required</h1><p>{loading ? "Loading wallet status..." : "Connect and sign with your EVM wallet to access the profile linked to that address."}</p>{authError ? <p role="alert">{authError}</p> : null}{!loading ? <button type="button" className="btn btn-solid wallet-shine-btn" disabled={authenticating} onClick={connect}>{authenticating ? "Waiting for signature..." : connected ? "Sign in with wallet" : "Connect wallet"}</button> : null}</div></section>
    </div>
  );
}

export default function ProfileClient({ profile, sessionAddress, sessionChainId }: ProfileClientProps) {
  const { address, connected, authenticated, authenticating, connect, hydrated, authError } = useWallet();
  const [activeTab, setActiveTab] = useState<ProfileTab>("information");
  const [currentProfile, setCurrentProfile] = useState(profile);

  if (!hydrated) return <LockedProfile connected={false} authenticating={false} authError={null} connect={() => undefined} loading />;

  const hasMatchingServerSession = Boolean(authenticated && address && sessionAddress && address.toLowerCase() === sessionAddress.toLowerCase());
  if (!connected || !address || !hasMatchingServerSession) return <LockedProfile connected={connected} authenticating={authenticating} authError={authError} connect={connect} />;
  if (!currentProfile) return <LockedProfile connected authenticating={authenticating} authError="The wallet profile could not be initialized. Sign in again to retry." connect={connect} />;

  const panels: Record<ProfileTab, React.ReactNode> = {
    information: <InformationPanel profile={currentProfile} onProfileChange={setCurrentProfile} />,
    activity: <ActivityPanel />,
    referrals: <ReferralsPanel code={currentProfile.referralCode} />,
    badges: <BadgesPanel />,
    watchlist: <WatchlistPanel />,
    simulator: <SimulatorPanel />,
  };

  return (
    <div className="page profile-page">
      <section className="profile-reference-hero">
        <div className="wrap"><div className="profile-reference-card"><div className="profile-avatar-hex" aria-hidden="true">{walletInitial(address)}</div><div className="profile-reference-main"><h1>{currentProfile.displayName || shortenAddress(address)}</h1><p>{currentProfile.bio || "Profile linked to your connected EVM wallet."}</p><div className="profile-reference-badges"><span>Wallet verified</span><span>{chainName(sessionChainId)}</span></div></div></div></div>
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
