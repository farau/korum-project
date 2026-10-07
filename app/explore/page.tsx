import React from 'react';
import PageWrapper from '../components/PageWrapper';
import MiniHero from '../components/explore/MiniHero';
import HotTrending from '../components/explore/HotTrending';
import FilterBar from '../components/explore/FilterBar';
import VsListServer from '../components/explore/VsListServer';
import ExploreVisualEffects from '../components/explore/ExploreVisualEffects';
import { ExploreSearchProvider } from '../components/explore/ExploreSearchProvider';
import TickerServer from '../components/explore/TickerServer';
import type { Debate } from '../lib/debates';
import { getIndexedDebates } from '../lib/db/debates';

export default async function ExplorePage() {
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
            <TickerServer />
          </div>


          <HotTrending indexedDebates={indexedDebates} />

          <FilterBar />

          <VsListServer
            indexedDebates={indexedDebates}
            indexedReadFailed={indexedReadFailed}
          />
        </ExploreSearchProvider>
      </div>
    </PageWrapper>
  );
}
