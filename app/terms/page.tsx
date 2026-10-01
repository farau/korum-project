import React from "react";
import PageWrapper from "../components/PageWrapper";

const sections = [
  ["1. Acceptance", "By using Korum, you agree to these Terms of Use and the rules governing interactions, wallets, VS markets, and related features."],
  ["2. Service", "Korum lets users create, explore, and track matchups represented by two tokenized sides. Market activity is displayed as trades are recorded."],
  ["3. Wallet", "Access to certain pages or actions may require a connected EVM wallet. A unique short code associated with the wallet address may be used as a public referral identifier."],
  ["4. Risks", "Tokenized markets can be volatile. Information displayed through the Service does not constitute financial, legal, or tax advice."],
  ["5. Conduct", "Users must avoid unlawful, misleading, hateful, or third-party-infringing content. Korum may hide or remove problematic content."],
  ["6. Market data", "Prices, volumes, timestamps, fees, and rankings are informational and may update with a delay."],
  ["7. Availability", "The Service may evolve, be interrupted, or be modified, particularly during testing, migration, or maintenance."],
  ["8. Contact", "For questions about these Terms of Use, contact the team at contact@korum.com."],
];

export default function TermsPage() {
  return (
    <PageWrapper>
      <div className="page legal-page" id="page-terms">
        <section className="vs-hero-section subpage-hero">
          <div className="wrap">
            <span className="vs-hero-badge">Legal</span>
            <h1 className="vs-hero-title">Terms of Use</h1>
            <p className="legal-meta">
              Last updated: July 24, 2026 · Contact:{" "}
              <a href="mailto:contact@korum.com">contact@korum.com</a>
            </p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap legal-doc">
            <p className="legal-intro">
              These Terms of Use (“Terms”) govern access to and use of the Korum decentralized application, its website, and all associated services (collectively, the “Service”), operated by Korum Labs, LLC (“Korum,” “we,” or “us”). This document is provided as a template for this product concept and must be reviewed by qualified legal counsel before any production launch. By accessing the Service, you agree to these Terms in full.
            </p>
            {sections.map(([title, body]) => (
              <section key={title}>
                <h2>{title}</h2>
                <p>{body}</p>
              </section>
            ))}
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
