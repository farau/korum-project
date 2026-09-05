import React from 'react';
import { getDebates } from '../lib/debates';
import WatchlistView from '../components/WatchlistView';
import PageWrapper from '../components/PageWrapper';

export default function WatchlistPage() {
  const debates = getDebates();
  return (
    <PageWrapper>
      <WatchlistView debates={debates} />
    </PageWrapper>
  );
}
