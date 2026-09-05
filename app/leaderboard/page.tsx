import React from "react";
import LeaderboardClient from "../components/LeaderboardClient";
import PageWrapper from "../components/PageWrapper";
import { getDebates } from "../lib/debates";

export default function LeaderboardPage() {
  const debates = getDebates().map((debate) => ({
    id: debate.id,
    sideA: debate.tokenA?.name ?? debate.sideA,
    sideB: debate.tokenB?.name ?? debate.sideB,
  }));

  return (
    <PageWrapper>
      <LeaderboardClient debates={debates} />
    </PageWrapper>
  );
}
