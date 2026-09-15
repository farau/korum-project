import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getWalletSession } from "../lib/auth/session";
import { getUserProfileStats } from "../lib/db/profile-stats";
import { getUserForSession } from "../lib/db/users";

export default async function ProfilePage() {
  const session = await getWalletSession();
  const [profile, stats] = session
    ? await Promise.all([
        getUserForSession(session.userId, session.address),
        getUserProfileStats(session.address),
      ])
    : [null, null];

  return (
    <PageWrapper>
      <ProfileClient
        profile={profile}
        stats={stats}
        sessionAddress={session?.address ?? null}
        sessionChainId={session?.chainId ?? null}
      />
    </PageWrapper>
  );
}
