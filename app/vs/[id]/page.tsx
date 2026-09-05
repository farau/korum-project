import React from 'react';
import PageWrapper from '../../components/PageWrapper';
import { getDebates } from '../../lib/debates';
import VsDetailClient from '../../components/VsDetailClient';

export default async function VsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  const id = Number(routeId);
  const debates = getDebates();
  const debate = debates.find(d => d.id === id);

  return (
    <PageWrapper>
      <VsDetailClient debate={debate} />
    </PageWrapper>
  );
}
