import React from 'react';
import PageWrapper from '../components/PageWrapper';
import { getWalletSession } from '../lib/auth/session';
import { getPendingReferralForWallet, type PendingReferral } from '../lib/referrals/pending';

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
      <main style={{ padding: 24 }}>
        <h1>Create a VS</h1>
        <p>Creation form placeholder. Enable mock data to see an example.</p>
        {pendingReferral ? (
          <p data-app="pending-referral" style={{ marginTop: 12 }}>
            Referral <strong>{pendingReferral.referralCode}</strong> is ready for your first eligible protocol transaction.
          </p>
        ) : null}
        <form style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 600 }}>
          <input placeholder="Debate title (e.g. Messi vs Ronaldo)" />
          <input placeholder="Category" />
          <textarea placeholder="Description" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-solid" type="button">Preview</button>
            <button className="btn btn-outline" type="button">Create</button>
          </div>
        </form>
      </main>
    </PageWrapper>
  );
}
