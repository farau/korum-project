import React from 'react';
import type { Metadata } from 'next';
import PageWrapper from '../../components/PageWrapper';
import { getWalletSession } from '../../lib/auth/session';
import { getPendingReferralForWallet, type PendingReferral } from '../../lib/referrals/pending';
import CreateVersusForm from '../../create/CreateVersusForm';

export const metadata: Metadata = {
  title: "Create a Versus · Korum",
  description: "Launch two opposing tokens in a single Korum transaction.",
};

export default async function CreatePage() {
  const session = await getWalletSession();
  let pendingReferral: PendingReferral | null = null;

  if (session) {
    try {
      pendingReferral = await getPendingReferralForWallet(session.address);
    } catch (error) {
      console.error("Unable to display the pending referral.", error);
    }
  }

  return (
    <PageWrapper>
      <CreateVersusForm initialPendingReferral={pendingReferral} />
    </PageWrapper>
  );
}
