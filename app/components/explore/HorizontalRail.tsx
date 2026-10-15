"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type HorizontalRailProps = {
  children: ReactNode;
  className: string;
  viewportClassName: string;
  viewportId?: string;
  label: string;
  list?: boolean;
};

export default function HorizontalRail({ children, className, viewportClassName, viewportId, label, list }: HorizontalRailProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ overflow: false, atEnd: false });

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const overflow = element.scrollWidth > element.clientWidth + 2;
      const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
      setScrollState((current) => current.overflow === overflow && current.atEnd === atEnd ? current : { overflow, atEnd });
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [children]);

  function scroll() {
    const element = viewport.current;
    if (!element) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (scrollState.atEnd) element.scrollTo({ left: 0, behavior });
    else element.scrollBy({ left: element.clientWidth * .8, behavior });
  }

  return (
    <div className={`${className} horizontal-rail`}>
      <div className={viewportClassName} id={viewportId} ref={viewport} role={list ? "list" : undefined} aria-label={label} aria-live={list ? "polite" : undefined} aria-atomic={list ? false : undefined}>
        {children}
      </div>
      <button type="button" className="rail-next" hidden={!scrollState.overflow} aria-label={scrollState.atEnd ? `Back to the start of ${label.toLowerCase()}` : `Scroll ${label.toLowerCase()}`} onClick={scroll}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={scrollState.atEnd ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} /></svg>
      </button>
    </div>
  );
}
