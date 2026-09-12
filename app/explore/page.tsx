import React from 'react';
import PageWrapper from '../components/PageWrapper';
import MiniHero from '../components/explore/MiniHero';
import TickerServer from '../components/explore/TickerServer';
import HotTrending from '../components/explore/HotTrending';
import FilterBar from '../components/explore/FilterBar';
import VsListServer from '../components/explore/VsListServer';
import ExploreVisualEffects from '../components/explore/ExploreVisualEffects';
import { ExploreSearchProvider } from '../components/explore/ExploreSearchProvider';
import { getDebates } from '../lib/debates';
import type { Debate } from '../lib/debates';
import { getIndexedDebates } from '../lib/db/debates';

export default async function ExplorePage() {
  const mockDebates = getDebates();
  let indexedDebates: Debate[] = [];
  let indexedReadFailed = false;

  try {
    indexedDebates = await getIndexedDebates();
  } catch (error) {
    indexedReadFailed = true;
    console.error("Unable to load indexed versus for Explore.", error);
  }

  const gridPattern = [
    [1, 1], [1, 1], [2, 1], [1, 2], [1, 1], [2, 1], [1, 1], [1, 1],
    [1, 2], [1, 1], [2, 1], [1, 1], [1, 1], [2, 2], [1, 1], [1, 1],
    [2, 1], [1, 1], [1, 2], [1, 1], [1, 1], [2, 1], [1, 1], [1, 1],
  ];

  return (
    <PageWrapper>
      <div className="page explore-page" id="page-explore">
        <ExploreSearchProvider>
          <ExploreVisualEffects />

          <div className="explore-header">
            <div className="bg-grid-header" aria-hidden="true">
              <div className="bg-grid-header-cells">
                {Array.from({ length: 170 }, (_, index) => {
                  const [columnSpan, rowSpan] = gridPattern[index % gridPattern.length];
                  return (
                    <div
                      className="bg-grid-header-cell"
                      key={index}
                      style={{ gridColumn: `span ${columnSpan}`, gridRow: `span ${rowSpan}` }}
                    />
                  );
                })}
              </div>
            </div>

            <MiniHero />
          </div>

          <TickerServer />

          <HotTrending mockDebates={mockDebates} indexedDebates={indexedDebates} />

          <FilterBar />

          <VsListServer
            mockDebates={mockDebates}
            indexedDebates={indexedDebates}
            indexedReadFailed={indexedReadFailed}
          />
        </ExploreSearchProvider>

        <div className="preview-modal-overlay" id="quickAmountModalOverlay" style={{ display: 'none' }}>
          <div className="preview-modal" style={{ maxWidth: 360 }}>
            <button type="button" className="preview-modal-close" id="quickAmountModalClose" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <p className="preview-label">Quick amounts</p>
            <p className="form-section-note" style={{ marginTop: -4 }}>Customize the three amounts offered for one-click purchases from the home page.</p>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
