"use client";

import React, { useEffect } from "react";

export default function ExploreVisualEffects() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".explore-page");
    const grid = document.querySelector<HTMLElement>(".explore-page .bg-grid-header");
    if (!page || !grid) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        page.style.setProperty("--cursor-x", `${event.clientX}px`);
        page.style.setProperty("--cursor-y", `${event.clientY}px`);
        page.classList.add("cursor-spotlight-on");
      });
    };

    const onPointerLeave = () => {
      page.classList.remove("cursor-spotlight-on");
    };

    const spawnStreak = () => {
      const width = grid.clientWidth;
      const height = grid.clientHeight;
      if (!width || !height) return;

      const columnCount = 10;
      const rowHeight = 84;
      const horizontal = Math.random() < 0.58;
      const streak = document.createElement("span");
      streak.className = `bg-grid-streak ${horizontal ? "h" : "v"}`;
      const length = 110 + Math.random() * 150;
      const duration = 2.7 + Math.random() * 1.8;

      if (horizontal) {
        const horizontalLineCount = Math.max(1, Math.floor(height / rowHeight));
        const rowLine = 1 + Math.floor(Math.random() * horizontalLineCount);
        streak.style.width = `${length}px`;
        streak.style.left = `${-length}px`;
        streak.style.top = `${rowLine * rowHeight}px`;
        streak.style.setProperty("--travel", `${width + length * 2}px`);
      } else {
        const columnLine = 1 + Math.floor(Math.random() * (columnCount - 1));
        streak.style.height = `${length}px`;
        streak.style.top = `${-length}px`;
        streak.style.left = `${Math.round((columnLine * width) / columnCount)}px`;
        streak.style.setProperty("--travel", `${height + length * 2}px`);
      }

      streak.style.animationDuration = `${duration}s`;
      grid.appendChild(streak);
      requestAnimationFrame(() => streak.classList.add("playing"));
      window.setTimeout(() => streak.remove(), duration * 1000 + 160);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    const timer = window.setInterval(spawnStreak, 1500);
    spawnStreak();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.clearInterval(timer);
      page.classList.remove("cursor-spotlight-on");
      grid.querySelectorAll(".bg-grid-streak").forEach((streak) => streak.remove());
    };
  }, []);

  return (
    <div className="cursor-spotlight" aria-hidden="true">
      <div className="cs-glow" />
    </div>
  );
}
