import React from "react";
import PageWrapper from "../components/PageWrapper";
import ProfileClient from "../components/ProfileClient";
import { getDebates } from "../lib/debates";

export default function ProfilePage() {
  return (
    <PageWrapper>
      <ProfileClient debates={getDebates()} />
    </PageWrapper>
  );
}
