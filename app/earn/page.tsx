import React from "react";
import Link from "next/link";
import PageWrapper from "../components/PageWrapper";
import EarningsSimulator from "../components/EarningsSimulator";

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2Z" /></svg>;
}

function ChartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 18 5-6 4 3 5-8 6 5" /><path d="M2 22h20" /></svg>;
}

function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}

function ExitIcon() {
  return <svg viewBox="0 0 70.35 59.8" fill="currentColor" aria-hidden="true"><path d="M32.54 10.55h-7.91c-6.63 0-9.95 0-12.01 2.06s-2.06 5.38-2.06 12.01v21.99h49.25V24.62c0-6.63 0-9.95-2.06-12.01s-5.38-2.06-12.01-2.06h-7.91v17.49l2.39-2.79a2.64 2.64 0 0 1 4 3.43l-7.04 8.21a2.64 2.64 0 0 1-4 0l-7.04-8.21a2.64 2.64 0 0 1 4-3.43l2.39 2.79V10.55Z" /><path d="M10.66 51.89h49.03c-.18 2.78-.66 4.56-1.95 5.85-2.06 2.06-5.38 2.06-12.01 2.06H24.62c-6.63 0-9.95 0-12.01-2.06-1.29-1.29-1.77-3.07-1.95-5.85ZM13.68 0h42.99c7.56 0 13.68 6.33 13.68 14.14 0 4.54-2.07 8.57-5.28 11.16v-.99c0-3.05 0-5.84-.3-8.11-.34-2.5-1.13-5.14-3.3-7.32-2.17-2.17-4.82-2.97-7.32-3.3-2.27-.31-5.06-.31-8.11-.3H24.3c-3.05 0-5.84 0-8.11.3-2.5.34-5.14 1.13-7.32 3.3-2.17 2.17-2.97 4.82-3.3 7.32-.31 2.27-.3 5.06-.3 8.11v.99C2.07 22.71 0 18.68 0 14.14 0 6.33 6.12 0 13.68 0Z" /></svg>;
}

function MoneyIcon() {
  return <svg viewBox="0 0 97.86 58.03" fill="currentColor" aria-hidden="true"><path d="M83.85 47.04H2.91C1.3 47.04.02 46 0 44.39V2.94C0 1.24 1.09 0 2.91 0h80.77c1.56 0 2.74 1.18 2.74 2.65l.03 41.02c0 1.67-.6 3.01-2.61 3.37ZM78.41 43.6c.12-3.2 2.14-4.53 4.64-4.6V8.02c-2.68.03-4.61-1.7-4.65-4.59H8.06C8 6.27 6.02 8.02 3.39 8.08l.03 30.93c2.89 0 4.53 2.03 4.7 4.63l70.29-.04Z" /><path d="M9.46 52.6c-2.32 0-3.57-1.44-3.53-3.44l78.81-.03c2.11 0 3.84-1.72 3.85-3.77l.09-38.91c1.64-.37 3.43.74 3.43 2.56l-.08 38.55c0 2.73-2.77 5-5.47 5l-77.09.03Z" /><path d="M92.57 57.97h-1.46c.2-.49-.37-.49-.47.06H14.15c.12-.47-.09-.83-.38-.95-.4-.17-.77-.19-1.23-.2-.46-.6-.89-1.26-.72-2.27l78.88-.09c2.15 0 3.74-2.9 3.74-4.76l.03-37.86c1.5-.33 3.38.69 3.38 2.47v38.2c.01 3.01-2.58 5.45-5.28 5.42Z" /><path d="M40.45 9.13c8.21-1.28 15.41 4.36 16.63 12.1 1.26 8.01-4.2 15.46-12.26 16.67s-15.19-4.12-16.5-12.03S32.16 10.42 40.45 9.13Zm3.09 24.2c-.14-.75-.1-1.61.2-1.89 1.69-.23 3.13-1.18 3.72-2.58 1.18-2.77-.66-5.47-3.94-6.68l.09-4.04c.92.19 1.43.79 2.24 1.07.44.16 1.22-.59 1.46-1.07-1.65-2.36-4.18-1.14-3.83-3.66-.31-.42-1.08-.07-.98.31.06.21.02.86-.06 1.24-1.45.41-3.03 1.28-3.44 2.63-.48 1.58-.06 3.33 1.39 4.2l2.05 1.24v5.14c-1.36-.33-1.88-1.16-2.38-2.13-.76-.03-1.37.07-2.05.35.62 2.15 2.24 3.58 4.39 3.98l.15 2.05c.02.31 1.08.29.99-.17Z" /><path d="M68.12 17.66c3.5-.75 6.53 1.53 7.1 4.62s-1.41 6.34-4.64 7-6.18-1.26-6.96-4.34c-.8-3.18.98-6.53 4.5-7.28ZM15.27 17.68c3.39-.83 6.49 1.33 7.21 4.41s-1.19 6.39-4.47 7.15c-3 .7-6.13-1.05-7.03-4.14s.8-6.57 4.29-7.42Z" /></svg>;
}

function TotalIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>;
}

const earnCards = [
  { title: "Create", subtitle: "Earn forever", example: <>Up to <b>70%</b> of fees, for life, even without trading.</>, action: "See details →", href: "/create", icon: <PlusIcon /> },
  { title: "Trade", subtitle: "Buy low, sell high", example: <>Two independent tokens per matchup, available at any time.</>, action: "Explore VS →", href: "/explore", icon: <ChartIcon /> },
  { title: "Refer", subtitle: "Your network, your capital", example: <><b>10%</b> of your referrals&apos; fees, for life.</>, action: "See tiers →", href: "/profile", icon: <UsersIcon /> },
];

export default function EarnPage() {
  return (
    <PageWrapper>
      <div className="page earn-page" id="page-earn">
        <section className="earn-hero earn-hero-video">
          <video className="earn-hero-video-bg" autoPlay muted loop playsInline aria-hidden="true">
            <source src="/korum-reference/earn-hero.mp4" type="video/mp4" />
          </video>
          <div className="wrap">
            <span className="vs-hero-badge">The Korum model</span>
            <h1 className="earn-hero-title"><span className="green-accent">3</span> ways to <span className="green-accent">earn</span><br />One protocol</h1>
            <p className="earn-hero-sub">Create, trade, refer: there is always a share for you, and all three add up.</p>
            <div className="earn-hero-stats">
              <div className="earn-hero-stat"><span className="val">70%</span><span className="lbl">of fees paid to the creator</span></div>
              <div className="earn-hero-stat"><span className="val">10%</span><span className="lbl">referral commission</span></div>
              <div className="earn-hero-stat"><span className="val">1% to 1.25%</span><span className="lbl">maximum total fees</span></div>
            </div>
            <a className="btn btn-solid earn-hero-cta" href="#earnings-calculator">Estimate your earnings ↓</a>
          </div>
        </section>

        <section className="info-section earn-paths-section">
          <div className="wrap">
            <div className="earn-cards">
              {earnCards.map((card) => (
                <article className="earn-card" key={card.title}>
                  <div className="earn-card-icon">{card.icon}</div>
                  <h2 className="earn-card-title">{card.title}</h2>
                  <h3 className="earn-card-subtitle">{card.subtitle}</h3>
                  <div className="earn-example">{card.example}</div>
                  <Link href={card.href} className="btn btn-create earn-card-btn">{card.action}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="info-section" id="earnings-calculator">
          <div className="wrap">
            <div className="info-head">
              <span className="eyebrow">Projection</span>
              <h2>How much you could <span className="green-accent">earn</span></h2>
              <p>Combine what you plan to create with the network you plan to refer. Both revenue streams add up each month.</p>
            </div>
            <EarningsSimulator />
          </div>
        </section>

        <section className="info-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Why it is fair</span><h2>You do not need to be right to earn</h2></div>
            <div className="icon-row fair-icon-row">
              <span className="icon-pill glass-pill"><span className="icon-badge glass-badge"><ExitIcon /></span>Exit whenever you want, with no forced resolution</span>
              <span className="icon-pill glass-pill"><span className="icon-badge glass-badge"><MoneyIcon /></span>Earn from generated volume, never from a verdict</span>
            </div>
          </div>
        </section>

        <section className="info-section earn-combined-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Combined earnings</span><h2>All three paths add up</h2><p>You can be a creator, trader, and referrer at the same time.</p></div>
            <div className="combined-example">
              <div className="combined-row"><span>You create a matchup that generates $50,000 in volume</span><span className="val">≈ $312.50</span></div>
              <div className="combined-row"><span>You trade it and double a $100 position</span><span className="val">≈ $100</span></div>
              <div className="combined-row"><span>Three friends you referred trade $1,500 this month</span><span className="val">≈ $1.50</span></div>
              <div className="combined-row total combined-total-glow"><div className="combined-total-left"><span className="combined-total-icon"><TotalIcon /></span><span className="combined-total-text"><span className="combined-total-label">Total for this month</span><span className="combined-total-sub">Combined income from all three sources</span></span></div><span className="val">≈ $414</span></div>
            </div>
            <p className="small-note note-centered">Illustrative example.</p>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
