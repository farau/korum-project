"use client";

import type { PointerEvent } from "react";

export type FeeTier = {
  label: string;
  range: string;
  fee: string;
  creator: string;
  creatorSub: string;
  platform: string;
  platformSub: string;
  highlight?: boolean;
};

const MAX_TILT = 14;

function resetCard(slot: HTMLDivElement) {
  const card = slot.querySelector<HTMLElement>(".fee-tier-card");
  const glare = slot.querySelector<HTMLElement>(".fee-tier-tilt-glare");

  if (card) {
    card.style.transform = "perspective(700px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
    card.style.boxShadow = "";
  }

  if (glare) glare.style.background = "transparent";
}

function tiltCard(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const slot = event.currentTarget;
  const card = slot.querySelector<HTMLElement>(".fee-tier-card");
  const glare = slot.querySelector<HTMLElement>(".fee-tier-tilt-glare");
  if (!card || !glare) return;

  const rect = slot.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  const rotateY = (x - 0.5) * 2 * MAX_TILT;
  const rotateX = (0.5 - y) * 2 * MAX_TILT;
  const shadowX = (x - 0.5) * -32;
  const shadowY = (y - 0.5) * -32;

  card.style.transform = `perspective(700px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`;
  card.style.boxShadow = `${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px 40px rgba(0, 0, 0, 0.5)`;
  glare.style.background = `radial-gradient(circle at ${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%, rgba(255, 255, 255, 0.16), transparent 55%)`;
}

export default function FeeTierCards({ tiers }: { tiers: FeeTier[] }) {
  return (
    <div className="fee-tier-grid">
      {tiers.map((tier) => (
        <div
          className="fee-tier-slot"
          key={tier.label}
          onPointerMove={tiltCard}
          onPointerLeave={(event) => resetCard(event.currentTarget)}
          onPointerCancel={(event) => resetCard(event.currentTarget)}
        >
          <article className={`fee-tier-card${tier.highlight ? " highlight" : ""}`}>
            <span className="fee-tier-label">{tier.label}</span>
            <span className="fee-tier-range">{tier.range}</span>
            <span className="fee-tier-pct">{tier.fee}</span>
            <div className="fee-tier-split">
              <div><span className="dot creator" />Creator<b>{tier.creator}</b><span className="sub">{tier.creatorSub}</span></div>
              <div><span className="dot platform" />Korum<b>{tier.platform}</b><span className="sub">{tier.platformSub}</span></div>
            </div>
            <span className="fee-tier-tilt-glare" aria-hidden="true" />
          </article>
        </div>
      ))}
    </div>
  );
}
