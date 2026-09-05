"use client";
import React from "react";
import Link from "next/link";

function KorumWordmark({ className, hidden = false }: { className?: string; hidden?: boolean }) {
  return (
    <span className={className} aria-hidden={hidden}>
      <svg viewBox="0 0 662 198" fill="currentColor">
        <path d="M530.92,162.63l-.17-80.53c-.02-9.87-8.24-16.99-17.34-17.15s-17.66,7.17-17.69,17.08l-.24,80.58-31.82-.05.3-82.54c1.09-15.27,7.45-29.24,19.9-38.16,19.43-13.92,46.2-11.34,63.15,6.24,9.67-8.77,20.31-14.82,32.87-15.81,26.02-2.05,47.12,15.92,50.03,41.93l.11,88.37-31.72.03-.02-79.62c-.03-9.91-7.47-17.64-16.83-18.02-9.2-.37-18.51,6.77-18.54,17.04l-.22,80.59h-31.78Z" />
        <path d="M138.93,161.5l-97.85.28c-5.46.02-9.12-3.27-9.11-8.84l.05-109.8c.47-3.73,2.97-7.93,7.08-7.94l107.83-.03-75.55,62.58,67.55,63.76Z" />
        <path d="M409.05,33.23l32.04-.09-.12,74.71c-.05,32.34-24.02,56.61-56.06,56.49-28.15-.1-52.25-19.72-54.68-48.53l-.08-82.63,31.78-.03.6,80.62c.09,11.68,12.74,18.83,22.71,18.75,11.82-.09,21.57-7.81,23.65-19.72l.15-79.56Z" />
        <path d="M287.96,162.02l-39.53-45.08,21.85-22.6c4.42-4.57,5.49-11.35,3.51-17.39-3.51-10.73-15.56-13.19-28.44-11.9l-.15-31.82,12.88-.07c24.65.84,45.23,18.96,48.17,43.59,1.81,15.15-3.79,29.39-14.39,40.26l37.79,44.47-41.7.54Z" />
        <path d="M176.02,63.55c19.65-3.31,37.06,10.63,39.77,29s-10.14,36.6-28.96,39.68c-18.51,3.03-36.43-9.89-39.55-27.98-3.34-19.34,8.52-37.28,28.74-40.7Z" />
      </svg>
    </span>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.2-9.4L1 2h7.2l5 6.6L18.9 2zm-1.2 18h1.7L7.4 4h-1.8l12.1 16z" />
    </svg>
  );
}

export default function Footer() {
  const marqueeItems = Array.from({ length: 16 }, (_, index) => index);

  return (
    <footer>
      <div className="footer-marquee">
        <div className="footer-marquee-track">
          {marqueeItems.map((item, index) => (
            <KorumWordmark key={item} className="footer-marquee-logo" hidden={index >= marqueeItems.length / 2} />
          ))}
        </div>
      </div>

      <div className="wrap">
        <div className="footer-grid-new">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/korum-footer-logo.png" alt="Korum" className="footer-logo-img" />
            <p>Launch and explore tokenized matchups on Robinhood Chain. Your wallet signs every transaction. Korum never holds your funds.</p>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Product</span>
            <Link href="/explore">Explore</Link>
            <Link href="/concept">Concept</Link>
            <Link href="/analytics">Analytics</Link>
            <Link href="/create">Create a VS</Link>
            <Link href="/profile">Profile</Link>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Legal</span>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
          </div>
          <div className="footer-col footer-risk">
            <span className="footer-col-title">Risk warning</span>
            <p>Transactions are submitted through your wallet and may be irreversible. Tokens can be volatile or lose all their value. Korum provides no custody, guarantee, or financial advice.</p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 Korum Labs, LLC.</span>
          <span className="footer-chain">
            Built on
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/robinhood-chain.png" alt="Robinhood Chain" className="footer-chain-logo" />
          </span>
          <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="footer-x">@korumdapp<XIcon /></a>
        </div>
      </div>
    </footer>
  );
}
