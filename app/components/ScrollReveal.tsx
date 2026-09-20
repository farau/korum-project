"use client";

import { useEffect } from "react";

const revealSelectors = [
  ".info-head",
  ".earn-card",
  ".simulator-card",
  ".icon-row",
  ".combined-example",
  ".step-card",
  ".lexicon-grid > *",
  ".fee-tier-grid > *",
  ".ref-flow-card",
  ".center-cta",
  ".analytics-stat-cards > *",
  ".analytics-panel",
  ".tac-card",
  ".analytics-chart-col",
  ".topvs-table",
].join(",");

export default function ScrollReveal({ rootSelector }: { rootSelector: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSelector);
    if (!root) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(revealSelectors));
    if (!elements.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("scroll-reveal-shown"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("scroll-reveal-shown");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

    elements.forEach((element, index) => {
      element.classList.add("scroll-reveal-target");
      element.style.setProperty("--reveal-delay", `${(index % 4) * 70}ms`);
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [rootSelector]);

  return null;
}
