"use client";
import { useExploreCategory } from './ExploreCategoryProvider';

export default function MiniHero() {
  const { category } = useExploreCategory();
  return (
    <section className="mini-hero">
      <div className="mini-hero-inner">
        <span className="explore-eyebrow">Hot takes</span>
        <h1>{category === "HotTake" ? "Versus of the week" : "Explore Versus"}</h1>
        <p>Two sides. One question. What do you think?</p>
      </div>
    </section>
  );
}
