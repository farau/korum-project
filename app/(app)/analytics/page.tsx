import React from 'react';
import PageWrapper from '../../components/PageWrapper';
import StatsServer from '../../components/analytics/StatsServer';
import ScrollReveal from '../../components/ScrollReveal';

export default function AnalyticsPage() {
  return (
    <PageWrapper>
      <div className="analytics-page">
        <ScrollReveal rootSelector=".analytics-page" />
        <section className="vs-hero-section analytics-hero">
          <div className="wrap">
            <span className="vs-hero-badge">Analytics</span>
            <h1 className="vs-hero-title">Complete protocol data</h1>
            <p>
              Real-time key metrics for tracking activity, liquidity, and ecosystem engagement.
            </p>
          </div>
        </section>
        <StatsServer />
      </div>
    </PageWrapper>
  );
}
