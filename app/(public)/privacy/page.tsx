import React from "react";
import PageWrapper from "../../components/PageWrapper";

const sections = [
  ["1. Scope", "This policy covers information processed through the Korum website and decentralized application, including wallet connections, profiles, VS markets, watchlists, and referrals. Independent wallet applications, blockchain networks, and linked websites operate under their own privacy policies."],
  ["2. Information we process", "Information may include your public wallet address, authentication messages and signatures, transaction history, holdings, referral code and attribution, and information you choose to provide, such as a display name, biography, avatar, or market description. Technical information associated with requests may also be processed to operate and protect the Service. If you contact us, we receive the details you include in your message."],
  ["3. How information is used", "Information is used to authenticate wallet ownership, save profile changes and watchlists, display markets and activity, calculate rankings, attribute referrals, and provide notifications. It also supports troubleshooting, abuse prevention, and responses to support requests. Please provide only information needed for the feature you are using."],
  ["4. Public profiles and blockchain activity", "Wallet addresses are pseudonymous identifiers, but they can become identifiable when linked to a profile, public transactions, or other information. Profile information and market content intended for public display may be visible to other users. Transactions recorded on a public blockchain can be inspected and copied by anyone; changing or deleting information in Korum does not erase blockchain records or copies held by others."],
  ["5. Cookies and browser storage", "Korum uses cookies to maintain wallet authentication and referral attribution, and browser storage for features such as interface preferences and recent notifications. Authentication sessions currently last up to 12 hours, authentication challenges up to 5 minutes, and pending referral cookies up to 30 days. You can clear cookies and local storage through your browser settings; doing so may sign you out, reset preferences, or remove a pending referral."],
  ["6. Service providers and external services", "Operating the Service involves hosting, database, blockchain RPC, indexing, and wallet connection services. Depending on the feature, these services may receive technical requests, wallet addresses, or public transaction data. Loading external images or following third-party links also sends requests to the relevant provider. Their processing is subject to their own policies and applicable obligations."],
  ["7. Retention", "Off-chain information is retained as needed to provide the relevant feature, maintain security, handle support requests, and meet applicable obligations. Different records may have different retention periods; cookie lifetimes are described above. Public blockchain records persist independently of Korum and cannot be deleted by the team."],
  ["8. Security and wallet control", "Korum uses measures such as signed authentication challenges, protected session cookies, input validation, and rate limits to help secure the Service. No system can guarantee complete security. Korum does not need your wallet’s private key or recovery phrase: never include them in a profile, support request, or message to the team."],
  ["9. Your choices and privacy requests", "You can edit supported profile fields, manage your watchlist, disconnect your wallet, and clear browser storage. Depending on applicable law, you may also have rights to access, correct, delete, restrict, or object to processing of personal information, request portability, or complain to a data protection authority. Contact us to make a request; we may need to verify wallet ownership or request limited information to confirm your identity. Never send a private key or recovery phrase as proof."],
  ["10. Updates and contact", "This policy may be updated as features or information practices change. The date above identifies the latest revision. For questions about privacy, retention, service providers, or exercising your rights, contact contact@korum.com and describe the relevant feature and your request."],
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
              Last updated: October 8, 2026 · Contact:{" "}
              <a href="mailto:contact@korum.com">contact@korum.com</a>
            </p>
          </div>
        </section>

        <section className="info-section">
          <div className="wrap legal-doc">
            <p className="legal-intro">
              This document explains how Korum Labs (“Korum,” “we,” or “us”) collects, uses, and protects information related to use of the Korum decentralized application (the “Service”). It is provided as a template for this product concept and must be reviewed by qualified legal counsel before any production launch.
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
