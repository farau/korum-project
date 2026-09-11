import React from "react";
import PageWrapper from "../components/PageWrapper";

const sections = [
  ["1. Scope", "This policy explains how Korum processes information related to use of the platform, including connection data, public interactions, and information required for wallet functionality."],
  ["2. Data collected", "Korum may process wallet addresses, public transactions, interface preferences, usage metrics, and technical information required to secure the Service."],
  ["3. Use of data", "Data is used to display VS markets, calculate rankings, secure interactions, improve the product experience, and prepare future API, indexer, and database integrations."],
  ["4. Wallets", "An EVM address may be used as a public identifier or key for linking activity, and a short referral code may be associated with it. On its own, a wallet address does not constitute a civil identity within the application."],
  ["5. Retention", "Data is retained for as long as necessary for the purposes described, applicable obligations, and abuse prevention."],
  ["6. Security", "Korum applies reasonable measures to protect processed data. Blockchain transactions remain public and depend on the relevant networks."],
  ["7. Contact", "For privacy-related questions, contact the team at contact@korum.com."],
];

export default function PrivacyPage() {
  return (
    <PageWrapper>
      <div className="page legal-page" id="page-privacy">
        <section className="vs-hero-section subpage-hero">
          <div className="wrap">
            <span className="vs-hero-badge">Legal</span>
            <h1 className="vs-hero-title">Privacy Policy</h1>
            <p className="legal-meta">
              Last updated: July 24, 2026 · Contact:{" "}
              <a href="mailto:contact@korum.com">contact@korum.com</a>
            </p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap legal-doc">
            <p className="legal-intro">
              This document explains how Korum Labs, LLC (“Korum,” “we,” or “us”) collects, uses, and protects information related to use of the Korum decentralized application (the “Service”). It is provided as a template for this product concept and must be reviewed by qualified legal counsel before any production launch.
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
