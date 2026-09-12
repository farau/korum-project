import React from 'react';
import PageWrapper from '../../components/PageWrapper';
import { getDebates } from '../../lib/debates';
import { getIndexedDebateById } from '../../lib/db/debates';
import VsDetailClient from '../../components/VsDetailClient';

export default async function VsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  const mockDebate = getDebates().find((debate) => String(debate.id) === routeId);
  let indexedDebate = null;
  let indexedReadFailed = false;

  try {
    indexedDebate = await getIndexedDebateById(routeId);
  } catch (error) {
    indexedReadFailed = true;
    console.error(`Unable to load indexed versus ${routeId}.`, error);
  }

  return (
    <PageWrapper>
      <VsDetailClient
        mockDebate={mockDebate}
        indexedDebate={indexedDebate}
        indexedReadFailed={indexedReadFailed}
      />
    </PageWrapper>
  );
}
