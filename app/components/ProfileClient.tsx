"use client";

import React from "react";
import Link from "next/link";
import type { Debate } from "../lib/debates";
import { shortenAddress, useWallet } from "./WalletProvider";

function compactMoney(value: number) {
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function debateVolume(debate: Debate) {
  return debate.volume24h;
}

function walletInitial(address: string) {
  return address.slice(2, 4).toUpperCase();
}

export default function ProfileClient({ debates }: { debates: Debate[] }) {
  const { address, connected, connect, hydrated } = useWallet();
  const featured = debates.slice(0, 6);
  const totalVolume = featured.reduce((sum, debate) => sum + debateVolume(debate), 0);

  if (!hydrated) {
    return (
      <div className="page profile-page">
        <section className="profile-hero">
          <div className="wrap profile-locked-card">
            <span className="vs-hero-badge">Profile</span>
            <h1>Wallet required</h1>
            <p>Loading wallet status...</p>
          </div>
        </section>
      </div>
    );
  }

  if (!connected || !address) {
    return (
      <div className="page profile-page">
        <section className="profile-hero">
          <div className="wrap profile-locked-card">
            <span className="vs-hero-badge">Profile</span>
            <h1>Wallet required</h1>
            <p>Connect your EVM wallet to view your profile, referral code, and data linked to this address.</p>
            <button type="button" className="btn btn-solid wallet-shine-btn" onClick={connect}>Connect wallet</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <section className="profile-hero">
        <div className="wrap profile-hero-grid">
          <div className="profile-id-card">
            <div className="profile-avatar">{walletInitial(address)}</div>
            <div>
              <span className="vs-hero-badge">Profile</span>
              <h1>{shortenAddress(address)}</h1>
              <p>Profile linked to the connected EVM wallet</p>
            </div>
          </div>
          <div className="profile-wallet-card">
            <span className="mini-badge green">Connected</span>
            <strong>{shortenAddress(address)}</strong>
            <p>The displayed information will be retrieved from the Railway indexer for this address.</p>
          </div>
        </div>
      </section>

      <section className="info-section profile-section">
        <div className="wrap">
          <div className="subpage-stats-row">
            <div className="glass-stat-card"><span className="lbl">Tracked volume</span><span className="val">{compactMoney(totalVolume)}</span></div>
            <div className="glass-stat-card"><span className="lbl">VS created</span><span className="val">0</span></div>
            <div className="glass-stat-card"><span className="lbl">Watchlist</span><span className="val">Local</span></div>
          </div>

          <div className="profile-grid">
            <article className="profile-panel profile-main-panel">
              <div className="info-head">
                <span className="eyebrow">Recent activity</span>
                <h2>Recently viewed markets</h2>
              </div>
              <div className="profile-activity-list">
                {featured.map((debate, index) => (
                  <div className="profile-activity-row" key={debate.id}>
                    <span className="activity-dot">{index + 1}</span>
                    <span><b>{debate.tokenA?.name || debate.sideA} vs {debate.tokenB?.name || debate.sideB}</b><small>{debate.category}</small></span>
                    <span>{compactMoney(debateVolume(debate))}</span>
                  </div>
                ))}
              </div>
            </article>

            <aside className="profile-panel profile-side-panel">
              <span className="mini-badge">Referrals</span>
              <h3>Referral address</h3>
              <p>Your referral code is the connected EVM address.</p>
              <div className="profile-code">{address}</div>
              <Link className="btn btn-solid" href="/earn">See how to earn</Link>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
