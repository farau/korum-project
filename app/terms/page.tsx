import React from "react";
import PageWrapper from "../components/PageWrapper";

const sections = [
  ["1. Acceptance and eligibility", "By accessing or using Korum, you agree to these Terms. You must have the legal capacity to enter into this agreement and use the Service in accordance with the laws that apply to you. If you do not agree, stop using the Service. You are responsible for determining whether your participation in a particular market or transaction is permitted where you live."],
  ["2. The Service", "Korum lets users create, explore, and track VS matchups represented by two tokenized sides, view market activity and rankings, and use profile, watchlist, and referral features. Creating a matchup does not establish an official association with the people, organizations, or brands mentioned. Features may change as the product develops."],
  ["3. Wallet access and security", "Some actions require a compatible EVM wallet and a signed message to verify ownership. You control your wallet and are responsible for its keys, permissions, and transaction approvals. Review each request in your wallet before signing. Korum will not ask for your private key or recovery phrase; wallet providers and connection services have their own terms."],
  ["4. Transactions and fees", "Before confirming a transaction, check the selected network, token, amount, recipient, fees, minimum received, and any spending approval. Network fees and protocol fees may apply, including when a transaction fails. Confirmed blockchain transactions generally cannot be reversed by Korum, and disconnecting a wallet does not revoke existing on-chain approvals."],
  ["5. Market and technical risks", "Token prices can change rapidly, liquidity may be limited, and you may lose some or all of the assets involved. Smart contract bugs, malicious tokens, network disruption, and third-party failures can also affect transactions. Prices, past performance, rankings, and community activity do not guarantee future results. Information displayed through Korum does not constitute financial, legal, or tax advice."],
  ["6. Content and acceptable use", "Only submit content and media you have the right to use. Do not publish unlawful, deceptive, hateful, harassing, or infringing material, impersonate others, distribute malicious links, manipulate activity or rankings, or interfere with the Service. You remain responsible for your submissions. Korum may hide content or restrict interface access to address abuse; this does not remove records already published on a blockchain."],
  ["7. Referrals and rewards", "A short referral code may be associated with a wallet and used to attribute eligible activity. Sharing a code does not guarantee attribution, earnings, or a payout. Eligibility, fee allocation, and claim availability depend on the applicable feature and protocol rules displayed in the Service. Do not use misleading promotions, unsolicited bulk messages, or artificial activity to obtain rewards."],
  ["8. Market data and third-party services", "Prices, volumes, holdings, timestamps, and rankings may update with a delay or be incomplete because they depend on network confirmations, indexers, and external data providers. Verify transaction details in your wallet and, where needed, on the relevant blockchain explorer. Links, external images, and integrations do not imply that Korum endorses the provider or guarantees its availability or accuracy."],
  ["9. Privacy", "Use of the Service involves processing wallet identifiers, profile information, and technical data as described in the Privacy Policy. Public profile content and blockchain activity may be visible to others. Avoid publishing sensitive personal information in market descriptions, profile fields, or any content recorded on-chain."],
  ["10. Availability and responsibility", "The Service may be interrupted, modified, or become unavailable during maintenance, testing, migrations, network outages, or third-party incidents. Korum cannot guarantee uninterrupted access or error-free market information. You remain responsible for your decisions, wallet security, and applicable reporting or tax obligations. Nothing in these Terms excludes rights or responsibilities that cannot be excluded under applicable law."],
  ["11. Updates and contact", "These Terms may be revised as the Service changes, with the latest revision date shown above. Review the current Terms before using a new feature or approving a transaction. For questions about these Terms or to report problematic content, contact contact@korum.com with the relevant page or transaction reference. Never send private keys or recovery phrases."],
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
              Last updated: October 8, 2026 · Contact:{" "}
              <a href="mailto:contact@korum.com">contact@korum.com</a>
            </p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap legal-doc">
            <p className="legal-intro">
              These Terms of Use (“Terms”) govern access to and use of the Korum decentralized application, its website, and all associated services (collectively, the “Service”), operated by Korum Labs (“Korum,” “we,” or “us”). This document is provided as a template for this product concept and must be reviewed by qualified legal counsel before any production launch. By accessing the Service, you agree to these Terms in full.
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
