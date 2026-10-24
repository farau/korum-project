import DesignIcon from "../../components/DesignIcon";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import FeeTierCards, { type FeeTier } from "../../components/FeeTierCards";
import PageWrapper from "../../components/PageWrapper";
import ScrollReveal from "../../components/ScrollReveal";

const steps = [
  { title: "A matchup launches", body: "Two tokens are created at once, one for each side.", darkImage: "/korum-reference/concept-step-1-dark.png", darkSize: [463, 308], lightImage: "/korum-reference/concept-step-1-light.webp", lightSize: [488, 463] },
  { title: "The sides compete", body: "Every purchase raises that side's market cap and its share against the other.", darkImage: "/korum-reference/concept-step-2-dark.png", darkSize: [487, 332], lightImage: "/korum-reference/concept-step-2-light.webp", lightSize: [488, 463], middle: true },
  { title: "You stay in control", body: "Buy or sell whenever you want.", darkImage: "/korum-reference/concept-step-3-dark.png", darkSize: [441, 303], lightImage: "/korum-reference/concept-step-3-light.webp", lightSize: [488, 463] },
];

const lexicon = [
  { term: "VS", definition: "One debate, two tokens.", icon: "/korum-icons/flash.svg" },
  { term: "Side", definition: "Each of the two tokens in a matchup.", icon: "/korum-icons/DobleFlag.svg" },
  { term: "Trader", definition: "Someone who holds one side.", icon: "/korum-icons/Side.svg" },
  { term: "Join", definition: "Take a position on one side.", icon: "/korum-icons/Raly.svg" },
  { term: "Badges", definition: "Your trading, creator, and referral level, visible to everyone.", icon: "/korum-icons/Badge.svg" },
  { term: "Hot Take", definition: "A matchup that is heating up right now.", icon: "/korum-icons/fire.svg" },
];

const feeTiers: FeeTier[] = [
  { label: "Tier 1, launch", range: "$0 → $50,000 cumulative volume", fee: "1.25%", creator: "50%", creatorSub: "0.625% of volume", platform: "50%", platformSub: "0.625% of volume" },
  { label: "Tier 2, growth", range: "$50,000 → $1,000,000", fee: "1%", creator: "60%", creatorSub: "0.60% of volume", platform: "40%", platformSub: "0.40% of volume" },
  { label: "Tier 3, breakout", range: "Above $1,000,000", fee: "1%", creator: "70%", creatorSub: "0.70% of volume", platform: "30%", platformSub: "0.30% of volume", highlight: true },
];

function ReferralIcon() {
  return <DesignIcon name="users" />;
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
}

function RevenueIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>;
}

export default function ConceptPage() {
  return (
    <PageWrapper>
      <div className="page concept-page" id="page-concept">
        <ScrollReveal rootSelector="#page-concept" />
        <section className="earn-hero concept-hero">
          <div className="wrap">
            <span className="vs-hero-badge">Concept</span>
            <h1 className="earn-hero-title">One matchup. Two tokens.<br />The <span className="green-accent">market</span> decides.</h1>
            <p className="earn-hero-sub">Every matchup launches two opposing sides at once. No jury, no forced resolution: the market decides who is right, in real time.</p>
          </div>
        </section>

        <section className="info-section three-steps-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Three steps</span><h2>From an idea to a live market</h2></div>
            <div className="steps-row three-steps-row">
              {steps.map((step) => (
                <article className={`step-card three-steps-card${step.middle ? " three-steps-middle" : ""}`} key={step.title}>
                  <div className="step-image-wrap" aria-hidden="true">
                    <Image className="step-image step-image-dark" src={step.darkImage} alt="" width={step.darkSize[0]} height={step.darkSize[1]} loading="eager" />
                    <Image className="step-image step-image-light" src={step.lightImage} alt="" width={step.lightSize[0]} height={step.lightSize[1]} loading="eager" />
                  </div>
                  <h3>{step.title}</h3><p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="info-section concept-audience-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Who it is for</span><h2>Three ways to find your place</h2></div>
            <div className="icon-row"><span className="icon-pill glass-pill pill-center-text">Communities</span><span className="icon-pill glass-pill pill-center-text">On-chain traders</span><span className="icon-pill glass-pill pill-center-text">Creators</span></div>
          </div>
        </section>

        <section className="info-section lex-section">
          <div className="lex-bg-glow" aria-hidden="true" />
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Korum vocabulary</span><h2>Why “Korum”</h2><p>The name comes from <b>quorum</b>, the participation threshold that makes a decision valid.</p></div>
            <div className="lexicon-grid">
              {lexicon.map((item) => (
                <article className="lex-card" key={item.term}>
                  <div className="lex-icon-ring"><span className="lex-dot lex-dot1" /><span className="lex-dot lex-dot2" /><span className="lex-icon" style={{ WebkitMaskImage: `url(${item.icon})`, maskImage: `url(${item.icon})` }} /></div>
                  <div className="lex-content"><span className="lex-term">{item.term}</span><span className="lex-dash" /><span className="lex-def">{item.definition}</span></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="info-section concept-fees-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">The fee waterfall</span><h2>Lower fees, a higher creator share</h2><p>Trading fees are charged on every transaction, never on a deposit or withdrawal. They depend only on the token&apos;s cumulative volume, not on a subscription or status.</p></div>
            <FeeTierCards tiers={feeTiers} />
            <p className="small-note note-centered">The more successful a token becomes, the larger its creator&apos;s share. Tiers apply to each token based on cumulative volume since launch.</p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Worked example</span><h2>A token reaching $2M in cumulative volume</h2></div>
            <div className="combined-example">
              <div className="combined-row"><span className="combined-description">Tier 1, $50,000 volume at 1.25%, $625 in fees</span><span className="val">$312.50</span></div>
              <div className="combined-row"><span className="combined-description">Tier 2, $950,000 volume at 1%, $9,500 in fees</span><span className="val">$5,700</span></div>
              <div className="combined-row"><span className="combined-description">Tier 3, $1,000,000 volume at 1%, $10,000 in fees</span><span className="val">$7,000</span></div>
              <div className="combined-row total combined-total-glow"><div className="combined-total-left"><span className="combined-total-icon"><RevenueIcon /></span><span className="combined-total-text"><span className="combined-total-label">Total creator revenue</span><span className="combined-total-sub">Combined revenue generated across all three tiers</span></span></div><span className="val">$13,012.50</span></div>
            </div>
            <p className="small-note note-centered">Illustrative example, excluding any referral share deducted from Korum&apos;s margin.</p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap">
            <div className="info-head referral-head"><span className="eyebrow">Referrals</span><h2>10% of your referrals&apos; fees, funded by Korum</h2><p>A referrer receives 10% of the trading fees generated by users they directly referred, never more. This share comes from Korum&apos;s revenue, never the creator&apos;s.</p></div>
            <div className="ref-flow-card">
              <div className="ref-flow-step"><span className="ref-flow-icon"><ReferralIcon /></span><div className="ref-flow-text"><span className="ref-flow-label">Your referral trades</span><span className="ref-flow-value">$100</span><span className="ref-flow-sub">Volume generated</span></div></div>
              <span className="ref-flow-arrow">→</span>
              <div className="ref-flow-step"><div className="ref-flow-text"><span className="ref-flow-label">Trading fees (1%)</span><span className="ref-flow-value">$1.00</span><span className="ref-flow-sub">Fees generated</span></div></div>
              <span className="ref-flow-arrow">→</span>
              <div className="ref-split"><span className="ref-split-title">Fee distribution</span><div className="ref-split-timeline"><span className="ref-split-dot" /><span className="ref-split-line" /><span className="ref-split-dot" /><span className="ref-split-line highlight" /><span className="ref-split-dot highlight" /></div><div className="ref-split-items"><div className="ref-split-item"><span className="v">$0.60</span><span className="l">Creator</span><span className="pct">(60%)</span></div><div className="ref-split-item"><span className="v">$0.30</span><span className="l">Korum</span><span className="pct">(30%)</span></div><div className="ref-split-item highlight"><span className="v">$0.10</span><span className="l">Your referral share</span><span className="pct">(10%)</span></div></div></div>
            </div>
            <p className="small-note ref-flow-note"><InfoIcon />Never more than 10%. This share is funded by Korum.</p>
            <div className="center-cta referral-cta"><Link prefetch={false} href="/profile" className="btn btn-glass">Manage referrals in your profile →</Link></div>
          </div>
        </section>

        <section className="info-section concept-final-section">
          <div className="wrap">
            <div className="info-head"><span className="eyebrow">Your turn</span><h2>The next viral matchup could be yours</h2><p>Launch a debate, choose a side, or do both.</p></div>
            <div className="center-cta"><Link prefetch={false} href="/create" className="btn btn-solid">Create a VS →</Link><Link prefetch={false} href="/explore" className="btn btn-glass">Explore live VS →</Link></div>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
