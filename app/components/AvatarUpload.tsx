"use client";

import { useRef, useState } from "react";
import type { UserProfile } from "../lib/profile";
import ProfileAvatar from "./ProfileAvatar";

export default function AvatarUpload({ profile, onChange }: { profile: UserProfile; onChange: (profile: UserProfile) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function save(file: File | null) {
    setError(null);
    setMessage("");
    if (file && (!file.size || file.size > 5 * 1024 * 1024)) {
      setError("Choose an image no larger than 5 MB.");
      return;
    }
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/profile/avatar", {
        method: file ? "PUT" : "DELETE",
        credentials: "same-origin",
        ...(file ? { headers: { "Content-Type": file.type }, body: file } : {}),
      });
      const result = await response.json() as { user?: UserProfile; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Unable to update your profile picture.");
      onChange(result.user);
      window.dispatchEvent(new CustomEvent("korum:avatar-changed", {
        detail: { address: profile.evmWallet, revision: result.user.avatar?.objectKey ?? String(Date.now()) },
      }));
      setMessage(file ? "Profile picture updated." : "Profile picture removed.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update your profile picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-field profile-avatar-upload" aria-busy={busy}>
      <div className="profile-avatar-summary">
        <ProfileAvatar address={profile.evmWallet} className="profile-avatar-thumbnail" />
        <span><small>Profile picture</small><strong>{profile.avatar ? "Custom image" : "No image"}</strong><small title="JPG, PNG or WebP · Max 5 MB · Square crop">JPG, PNG or WebP · Max 5 MB · Square crop</small></span>
      </div>
      <div className="profile-avatar-actions">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile picture" hidden disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void save(file);
        }} />
        <button type="button" className="profile-pill-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Saving…" : profile.avatar ? "Replace" : "Upload"}</button>
        {profile.avatar && <button type="button" className="profile-pill-button" disabled={busy} onClick={() => void save(null)}>Remove</button>}
      </div>
      {error && <p className="profile-field-error" role="alert">{error}</p>}
      <span className="sr-only" role="status">{message}</span>
    </div>
  );
}
