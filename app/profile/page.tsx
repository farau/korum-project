import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getWalletSession } from "../lib/auth/session";
import { getDebates } from "../lib/debates";

export default async function ProfilePage() {
  const session = await getWalletSession();

  return (
    <PageWrapper>
      <ProfileClient
        debates={session ? getDebates() : []}
        sessionAddress={session?.address ?? null}
        sessionChainId={session?.chainId ?? null}
      />
    </PageWrapper>
  );
}
