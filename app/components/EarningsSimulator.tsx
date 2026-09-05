"use client";

import React, { useMemo, useState } from "react";

const feeTiers = [
  { min: 0, max: 50_000, feeRate: 0.0125, creatorShare: 0.5 },
  { min: 50_000, max: 1_000_000, feeRate: 0.01, creatorShare: 0.6 },
  { min: 1_000_000, max: Number.POSITIVE_INFINITY, feeRate: 0.01, creatorShare: 0.7 },
];

function creatorEarningsForVolume(totalVolume: number) {
  let remaining = totalVolume;
  let creatorEarnings = 0;

  for (const tier of feeTiers) {
    const amountInTier = Math.min(remaining, tier.max - tier.min);
    if (amountInTier <= 0) continue;
    creatorEarnings += amountInTier * tier.feeRate * tier.creatorShare;
    remaining -= amountInTier;
    if (remaining <= 0) break;
  }

  return creatorEarnings;
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h6.5L8 22l13-12h-6.5L13 2Z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export default function EarningsSimulator() {
  const [vsCount, setVsCount] = useState(3);
  const [vsVolume, setVsVolume] = useState(10_000);
  const [refCount, setRefCount] = useState(10);
  const [refVolume, setRefVolume] = useState(1_200);

  const results = useMemo(() => {
    const creator = creatorEarningsForVolume(vsCount * vsVolume);
    const referral = refCount * refVolume * 0.01 * 0.1;
    return { creator, referral, total: creator + referral };
  }, [refCount, refVolume, vsCount, vsVolume]);

  return (
    <div className="earn-sim-card">
      <div className="global-sim-grid">
        <div className="global-sim-col">
          <h3 className="gsim-col-head">
            <span className="gsim-icon"><BoltIcon /></span>
            <span>
              <span className="gsim-col-title">Creation</span>
              <span className="gsim-col-sub">VS you plan to create</span>
            </span>
          </h3>
          <input aria-label="Number of VS" type="range" min="0" max="30" step="1" value={vsCount} onChange={(event) => setVsCount(Number(event.target.value))} />
          <div className="sim-value"><b>{vsCount}</b> VS</div>
          <label className="sim-label" htmlFor="gg-vs-volume">Average volume generated per VS</label>
          <input id="gg-vs-volume" type="range" min="500" max="100000" step="500" value={vsVolume} onChange={(event) => setVsVolume(Number(event.target.value))} />
          <div className="sim-value"><b>${vsVolume.toLocaleString("en-US")}</b></div>
        </div>

        <div className="global-sim-col">
          <h3 className="gsim-col-head">
            <span className="gsim-icon"><UsersIcon /></span>
            <span>
              <span className="gsim-col-title">Referrals</span>
              <span className="gsim-col-sub">Active referrals</span>
            </span>
          </h3>
          <input aria-label="Number of referrals" type="range" min="0" max="40" step="1" value={refCount} onChange={(event) => setRefCount(Number(event.target.value))} />
          <div className="sim-value"><b>{refCount}</b> {refCount === 1 ? "referral" : "referrals"}</div>
          <label className="sim-label" htmlFor="gg-ref-volume">Average monthly volume per referral</label>
          <input id="gg-ref-volume" type="range" min="100" max="5000" step="50" value={refVolume} onChange={(event) => setRefVolume(Number(event.target.value))} />
          <div className="sim-value"><b>${refVolume.toLocaleString("en-US")}</b> / month</div>
        </div>
      </div>

      <div className="sim-results gsim-results">
        <div className="sim-stat gsim-stat"><span><span className="lbl">Creator revenue</span><span className="val">{formatMoney(results.creator)}</span></span></div>
        <div className="sim-stat gsim-stat"><span><span className="lbl">Referral revenue / month</span><span className="val">{formatMoney(results.referral)}</span></span></div>
        <div className="sim-stat gsim-stat highlight"><span><span className="lbl">Projected total / month</span><span className="val">{formatMoney(results.total)}</span></span></div>
      </div>
      <p className="small-note gsim-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
        Illustrative estimate based on the current fee tiers.
      </p>
    </div>
  );
}
