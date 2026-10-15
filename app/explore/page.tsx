import React from 'react';
import PageWrapper from '../components/PageWrapper';
import MiniHero from '../components/explore/MiniHero';
import FilterBar from '../components/explore/FilterBar';
import VsListServer from '../components/explore/VsListServer';
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

  return (
    <PageWrapper>
      <div className="page explore-page" id="page-explore">
        <div className="explore-header">
          <TickerServer />
          <MiniHero />
        </div>

        <FilterBar />

        <VsListServer
          indexedDebates={indexedDebates}
          indexedReadFailed={indexedReadFailed}
        />
      </div>
    </PageWrapper>
  );
}
