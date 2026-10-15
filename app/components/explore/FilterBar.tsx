"use client";
import React from 'react';
import HorizontalRail from './HorizontalRail';
import { type ExploreCategory, useExploreCategory } from './ExploreCategoryProvider';

const categories: Array<{ value: ExploreCategory; label: string }> = [
  { value: 'HotTake', label: 'Hot Take' },
  { value: 'All', label: 'All' },
  { value: 'Memes', label: 'Memes' },
  { value: 'Politics', label: 'Politics' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'Pop culture', label: 'Pop culture' },
  { value: 'Movies & TV', label: 'Movies & TV' },
  { value: 'Music', label: 'Music' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Gaming', label: 'Gaming' },
  { value: 'WTF', label: 'WTF' },
];

export default function FilterBar() {
  const { category, setCategory } = useExploreCategory();

  return (
    <HorizontalRail className="filter-bar" viewportClassName="filter-inner" viewportId="pillRow" label="Categories">
        {categories.map((item) => (
          <button
            key={item.value}
            className={`pill ${item.value === 'HotTake' ? 'flame' : ''} ${category === item.value ? 'active' : ''}`}
            data-category={item.value}
            type="button"
            aria-pressed={category === item.value}
            onClick={() => setCategory(item.value)}
          >
            <span className="pill-label">
              {item.value === 'HotTake' ? (
                <>
                <svg viewBox="0 0 51.12 71.67" fill="currentColor" className="pill-flame" width={16} height={22}>
                  <path d="M26.26,36.18c-7.27,4.49-9.38,13.03-8.01,21.63-2.18-1.31-3.28-3.48-3.97-6.1-1.44,2.84-1.5,5.96-.98,9.04.72,4.28,2.72,8.01,6.12,10.81-8.55-1.4-16.13-7.22-18.28-15.56-1.71-6.62-1.46-13.39.54-19.87l2.27-7.33c.85-2.74.9-5.51.01-8.3,4.3,2.78,6.7,7.33,6.38,12.26,4.12-4.21,4.76-10.39,4.84-15.98.1-7.45,4.03-14.03,11.14-16.78-2.68,5.97.62,12.77,4.38,17.53l4.65,5.88c3.9,4.94,5.18,9.39,5.68,15.7,3.41-4.53,3.27-10.6,2.54-16.09,7.33,8.59,9.62,22.51,5.56,32.82-3.2,8.14-10.59,14.21-19.36,15.83,3.26-3.21,4.97-7.03,4.97-11.44.24-4.27-1.23-8.16-4.14-11.23-1.21-1.58-2.54-2.97-3.31-4.81-1.13-2.42-1.15-4.89-1.02-8Z" />
                </svg>
                Hot Take
                </>
              ) : (
                item.label
              )}
            </span>
          </button>
        ))}
    </HorizontalRail>
  );
}
