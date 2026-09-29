"use client";

import React, { useEffect, useState } from "react";

type ProfileAvatarProps = {
  address: string;
  className?: string;
};

export default function ProfileAvatar({ address, className = "" }: ProfileAvatarProps) {
  return <WalletAvatar key={address.toLowerCase()} address={address} className={className} />;
}

function WalletAvatar({ address, className = "" }: ProfileAvatarProps) {
  const [revision, setRevision] = useState("");
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const wallet = address.toLowerCase();
  const source = `/api/avatars/${wallet}${revision ? `?v=${encodeURIComponent(revision)}` : ""}`;
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ address: string; revision: string }>).detail;
      if (detail.address.toLowerCase() === wallet) setRevision(detail.revision);
    };
    window.addEventListener("korum:avatar-changed", changed);
    return () => window.removeEventListener("korum:avatar-changed", changed);
  }, [wallet]);
  const initials = address.slice(2, 4).toUpperCase() || "KR";
  return (
    <span className={`account-profile-avatar${className ? ` ${className}` : ""}`} aria-hidden="true">
      {/^0x[0-9a-f]{40}$/.test(wallet) && failedSource !== source ? (
        // Already resized and compressed; bypass the image optimizer's stale cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={source} src={source} alt="" width={256} height={256} onError={() => setFailedSource(source)} />
      ) : initials}
    </span>
  );
}
