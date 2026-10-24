import React from 'react';
import { connection } from 'next/server';
import PageWrapper from '../../components/PageWrapper';
import MiniHero from '../../components/explore/MiniHero';
import FilterBar from '../../components/explore/FilterBar';
import VsListServer from '../../components/explore/VsListServer';
import TickerServer from '../../components/explore/TickerServer';
import type { ExplorePage } from '../../lib/explore-page';
import { getExplorePage } from '../../lib/db/explore';

export default async function ExplorePage() {
  await connection();
  let initialPage: ExplorePage | undefined;

  try {
    initialPage = await getExplorePage();
  } catch (error) {
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
          initialPage={initialPage}
        />
      </div>
    </PageWrapper>
  );
}
