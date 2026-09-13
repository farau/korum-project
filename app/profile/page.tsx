import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getWalletSession } from "../lib/auth/session";
import { getUserForSession } from "../lib/db/users";

export default async function ProfilePage() {
  const session = await getWalletSession();
  const profile = session
    ? await getUserForSession(session.userId, session.address)
    : null;

  return (
    <PageWrapper>
      <ProfileClient
        profile={profile}
        sessionAddress={session?.address ?? null}
        sessionChainId={session?.chainId ?? null}
      />
    </PageWrapper>
  );
}
