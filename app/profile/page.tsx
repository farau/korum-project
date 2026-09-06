import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getWalletSession } from "../lib/auth/session";
import { getUserForSession } from "../lib/db/users";
import { getDebates } from "../lib/debates";

export default async function ProfilePage() {
  const session = await getWalletSession();
  const profile = session
    ? await getUserForSession(session.userId, session.address)
    : null;

  return (
    <PageWrapper>
      <ProfileClient
        debates={session ? getDebates() : []}
        profile={profile}
        sessionAddress={session?.address ?? null}
        sessionChainId={session?.chainId ?? null}
      />
    </PageWrapper>
  );
}
