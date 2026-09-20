"use client";

import { useEffect, useRef, useState } from "react";

export default function EarnHeroStats() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }

    let animationFrame = 0;
    let hasAnimated = false;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || hasAnimated) return;
      hasAnimated = true;
      observer.disconnect();

      const startedAt = performance.now();
      const duration = 1400;

      const animate = (now: number) => {
        const elapsed = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        setProgress(eased);

        if (elapsed < 1) animationFrame = window.requestAnimationFrame(animate);
      };

      animationFrame = window.requestAnimationFrame(animate);
    }, { threshold: 0.35 });

    observer.observe(root);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className="earn-hero-stats" ref={rootRef}>
      <div className="earn-hero-stat">
        <span className="val" aria-label="70 percent">{Math.round(70 * progress)}%</span>
        <span className="lbl">of fees paid to the creator</span>
      </div>
      <div className="earn-hero-stat">
        <span className="val" aria-label="10 percent">{Math.round(10 * progress)}%</span>
        <span className="lbl">referral commission</span>
      </div>
      <div className="earn-hero-stat">
        <span className="val">1% to 1.25%</span>
        <span className="lbl">maximum total fees</span>
      </div>
    </div>
  );
}
