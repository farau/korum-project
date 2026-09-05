"use client";
import React, { useEffect, useRef } from 'react';
import { useMock } from './MockProvider';

export default function HeroBanner() {
  const { mockEnabled, hydrated } = useMock();
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const el = layerRef.current;
    if (!el) return;

    let running = true;
    const onScroll = () => {
      if (!running) return;
      const rect = el.getBoundingClientRect();
      const offset = Math.max(0, window.scrollY - (rect.top + window.scrollY - window.innerHeight / 2));
      // simple parallax: translateY smaller fraction of scroll
      const t = Math.min(40, offset * 0.06);
      el.style.transform = `translateY(${t}px)`;
    };

    // passive listener for performance
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { running = false; window.removeEventListener('scroll', onScroll); };
  }, [hydrated]);

  // Placeholder if not hydrated or mock disabled
  if (!hydrated || !mockEnabled) {
    return (
      <section className="hero-banner" aria-hidden>
        <div className="hero-layer" />
        <div className="hero-inner" style={{ padding: 28 }}>
          <h1 style={{ margin: 0, height: 32, background: 'var(--panel-2)', width: '60%', borderRadius: 8 }} />
          <p style={{ marginTop: 12, height: 14, background: 'var(--panel-2)', width: '40%', borderRadius: 6 }} />
        </div>
      </section>
    );
  }

  return (
    <section className="hero-banner" role="region" aria-label="Hero">
      <div className="hero-layer" ref={layerRef} />
      <div className="hero-inner">
        <div style={{ maxWidth: 720 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Korum — Trade the debates that matter</h1>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Explore popular debates, take a position, and follow the trend in real time.</p>
          <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
            <a href="/create" className="btn btn-solid">Create a VS</a>
            <a href="/explore" className="btn btn-create">Explore</a>
          </div>
        </div>
        <div style={{ marginLeft: 24, minWidth: 220 }}>
          <div style={{ padding: 12, borderRadius: 12, background: 'var(--panel)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Live</div>
            <div style={{ marginTop: 8, fontWeight: 700 }}>Bitcoin vs Ethereum</div>
            <div style={{ marginTop: 6, color: 'var(--muted)' }}>1,234 traders • $243k volume</div>
          </div>
        </div>
      </div>
    </section>
  );
}
