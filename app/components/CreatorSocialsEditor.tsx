"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAddress } from "viem";
import { useAccount, useChainId, useSignMessage, useSwitchChain } from "wagmi";
import { KORUM_CHAIN } from "../config/korum-network";
import { INDEXED_DEBATE_QUERY_KEY } from "../hooks/useIndexedMarkets";
import { KORUM_FACTORY_ADDRESS } from "../lib/contracts/korum";
import type { Debate } from "../lib/debates";
import { createSocialsEditMessage, EMPTY_SOCIAL_LINKS, normalizeSocialLinks, socialLinksFromJson, type VersusSocialLinks } from "../lib/versus-socials";
import { useWallet } from "./WalletProvider";
import styles from "./CreatorSocialsEditor.module.css";

type SocialsResponse = { links: VersusSocialLinks; version: number; socialsJson?: string; error?: string };

async function parseResponse(response: Response) {
  const result = await response.json() as SocialsResponse;
  if (!response.ok) throw new Error(result.error || "Social links are unavailable.");
  return result;
}

export default function CreatorSocialsEditor({ versusId, socialsJson }: { versusId: number; socialsJson?: string }) {
  const { address } = useAccount();
  const { authenticated } = useWallet();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [links, setLinks] = useState<VersusSocialLinks>(() => socialsJson ? socialLinksFromJson(socialsJson) : { ...EMPTY_SOCIAL_LINKS });
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    fetch(`/api/versus/${versusId}/socials`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(parseResponse)
      .then(result => {
        if (controller.signal.aborted) return;
        setLinks(result.links);
        setVersion(result.version);
        setLoading(false);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setStatus(error instanceof Error ? error.message : "Unable to load social links.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [authenticated, versusId]);

  function update(field: keyof VersusSocialLinks, value: string) {
    setLinks(current => ({ ...current, [field]: value }));
    setStatus("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !authenticated || version === null || busy) return;
    const normalized = normalizeSocialLinks(links);
    if (!normalized) { setStatus("Enter valid HTTPS links or account handles."); return; }
    if (chainId !== KORUM_CHAIN.id) {
      try { await switchChainAsync({ chainId: KORUM_CHAIN.id }); setStatus("Network switched. Review the links and save again."); }
      catch { setStatus(`Switch to ${KORUM_CHAIN.name} to continue.`); }
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const deadline = Date.now() + 5 * 60_000;
      const message = createSocialsEditMessage({
        origin: window.location.origin, chainId: KORUM_CHAIN.id,
        factory: KORUM_FACTORY_ADDRESS, versusId: String(versusId),
        wallet: getAddress(address), version, deadline, links: normalized,
      });
      const signature = await signMessageAsync({ message });
      const response = await fetch(`/api/versus/${versusId}/socials`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: normalized, version, deadline, signature }),
      });
      const saved = await parseResponse(response);
      setLinks(saved.links);
      setVersion(saved.version);
      if (saved.socialsJson) {
        queryClient.setQueryData<Debate>([INDEXED_DEBATE_QUERY_KEY, String(versusId)], old => old ? { ...old, socialsJson: saved.socialsJson } : old);
      }
      await queryClient.invalidateQueries({ queryKey: [INDEXED_DEBATE_QUERY_KEY, String(versusId)] });
      setStatus("Social links updated. No blockchain transaction was needed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update social links.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card} aria-label="Edit Versus social links">
    <div><span className={styles.eyebrow}>Versus socials</span><h3>Edit social links</h3><p>Either camp’s current creator fee recipient can edit these links with an off-chain wallet signature.</p></div>
    <form onSubmit={event => void save(event)}>
      <div className={styles.grid}>
        {([
          ["x", "X account", "@account or https://x.com/account"],
          ["telegram", "Telegram", "@group or https://t.me/group"],
          ["discord", "Discord invite", "https://discord.gg/invite"],
          ["website", "Website", "https://example.com"],
        ] as const).map(([key, label, placeholder]) => <label key={key}>{label}<input type="text" value={links[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder} maxLength={256} disabled={busy || loading || !authenticated} autoComplete="off" spellCheck={false} /></label>)}
      </div>
      <div className={styles.footer}><small>Leave a field empty to remove its link. Your wallet will ask you to sign a message, without gas fees.</small><button type="submit" disabled={busy || loading || version === null || !authenticated}>{busy ? "Waiting for signature…" : "Sign and save"}</button></div>
    </form>
    {!authenticated ? <p className={styles.status}>Sign in with the connected wallet to edit socials.</p> : null}
    {status ? <p className={styles.status} role="status">{status}</p> : null}
  </section>;
}
