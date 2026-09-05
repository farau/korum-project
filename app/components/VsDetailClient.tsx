"use client";
import React from 'react';
import type { Debate } from '../lib/debates';
import Link from 'next/link';

export default function VsDetailClient({ debate }: { debate?: Debate }) {
  if (!debate) return <div>Debate not found</div>;

  return (
    <div className="vs-detail" style={{ padding: 20 }}>
      <Link href="/explore">← Back to Explore</Link>
      <h1>{debate.sideA} vs {debate.sideB}</h1>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="vs-thumb-pair">
            <div className="vs-thumb vs-thumb-a">{debate.sideA}</div>
            <div className="vs-thumb vs-thumb-b">{debate.sideB}</div>
          </div>
          <p>MCap A: ${Intl.NumberFormat('en-US').format(debate.marketCapA ?? 0)}</p>
          <p>MCap B: ${Intl.NumberFormat('en-US').format(debate.marketCapB ?? 0)}</p>
          <p>Volume: ${Intl.NumberFormat('en-US').format(debate.volume24h)}</p>
          <p>Traders: {debate.participantCount}</p>
        </div>
        <div style={{ width: 320 }}>
          <div className="trade-box" style={{ padding: 12, borderRadius: 12, background: 'var(--panel)' }}>
            <h3>Actions</h3>
            <button className="btn btn-solid" style={{ width: '100%', marginBottom: 8 }}>Buy {debate.sideA}</button>
            <button className="btn btn-outline" style={{ width: '100%' }}>Buy {debate.sideB}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
