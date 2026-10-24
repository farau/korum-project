import React from "react";
import LeaderboardClient from "../../components/LeaderboardClient";
import PageWrapper from "../../components/PageWrapper";
import { getTraderLeaderboard } from "../../lib/db/leaderboard";

export default async function LeaderboardPage() {
  const leaderboard = await getTraderLeaderboard();

  return (
    <PageWrapper>
      <LeaderboardClient initialData={leaderboard} />
    </PageWrapper>
  );
}
