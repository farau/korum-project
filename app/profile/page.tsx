import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getWalletSession } from "../lib/auth/session";
import { getUserProfileStats } from "../lib/db/profile-stats";
import { getUserForSession } from "../lib/db/users";
import { getProfileReferrer } from "../lib/referrals/profile";

export default async function ProfilePage() {
  const session = await getWalletSession();
  const [profile, stats, referral] = session
    ? await Promise.all([
        getUserForSession(session.userId, session.address),
        getUserProfileStats(session.address),
        getProfileReferrer(session.address),
      ])
    : [null, null, { referrer: null, unavailable: false }];

  return (
    <PageWrapper>
      <ProfileClient
        profile={profile}
        stats={stats}
        referral={referral}
        sessionAddress={session?.address ?? null}
        sessionChainId={session?.chainId ?? null}
      />
    </PageWrapper>
  );
}
