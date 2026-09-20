import React from "react";

type ProfileAvatarProps = {
  address: string;
  className?: string;
};

/** Shared fallback avatar until Railway bucket images become available. */
export default function ProfileAvatar({ address, className = "" }: ProfileAvatarProps) {
  const initials = address.slice(2, 4).toUpperCase() || "KR";
  return (
    <span className={`account-profile-avatar${className ? ` ${className}` : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}
