"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, formatEther, zeroAddress } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { KORUM_CHAIN } from "../config/korum-network";
import { FEE_ESCROW_ABI, FEE_ESCROW_ADDRESS } from "../lib/contracts/korum";
import styles from "./ProfileFeeClaim.module.css";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function ProfileFeeClaim() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [claimPhase, setClaimPhase] = useState<"idle" | "wallet" | "confirming">("idle");
  const claimable = useReadContract({
    chainId: KORUM_CHAIN.id, address: FEE_ESCROW_ADDRESS, abi: FEE_ESCROW_ABI,
    functionName: "claimable", args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: 15_000, refetchIntervalInBackground: false },
  });
  const claimableAmount = typeof claimable.data === "bigint" ? claimable.data : undefined;

  async function claimFees() {
    if (!address || !publicClient || busy) return;
    if (chainId !== KORUM_CHAIN.id) {
      try { await switchChainAsync({ chainId: KORUM_CHAIN.id }); setMessage("Network switched. Click Claim fees to continue."); }
      catch { setMessage(`Switch to ${KORUM_CHAIN.name} to claim your fees.`); }
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const latest = await publicClient.readContract({
        address: FEE_ESCROW_ADDRESS, abi: FEE_ESCROW_ABI,
        functionName: "claimable", args: [address],
      }) as bigint;
      if (latest === BigInt(0)) throw new Error("There are no fees to claim for this wallet.");
      await publicClient.simulateContract({
        account: address, address: FEE_ESCROW_ADDRESS, abi: FEE_ESCROW_ABI, functionName: "claim",
      });
      setClaimPhase("wallet");
      const hash = await writeContractAsync({
        account: address, address: FEE_ESCROW_ADDRESS, abi: FEE_ESCROW_ABI,
        functionName: "claim", chainId: KORUM_CHAIN.id,
      });
      setClaimPhase("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The fee claim transaction reverted.");
      setMessage("Fees claimed successfully and sent to your wallet.");
    } catch (error) {
      setMessage(error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : "Unable to claim fees. Please try again.");
    } finally {
      setClaimPhase("idle");
      setBusy(false);
      void claimable.refetch();
      // Refresh balance displays mounted elsewhere in the app after the payout.
      void queryClient.invalidateQueries({ queryKey: ["balance"] });
    }
  }

  return <section className={`profile-content-card ${styles.card}`} aria-label="Claimable creator and referral fees">
    <div className={styles.claim}>
      <div><strong>Claimable fees · Creator &amp; referral</strong>
        <span title={address}>{address ? `For your wallet ${shortAddress(address)}` : "Connect your wallet to view and claim fees."}</span>
        <strong className={styles.claimAmount}>{!address ? "—" : claimable.isError ? "Unavailable" : claimableAmount === undefined ? "Loading…" : `${formatEther(claimableAmount)} ETH`}</strong>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={!address || !publicClient || busy || claimable.isError || claimableAmount === undefined || claimableAmount === BigInt(0)} onClick={() => void claimFees()}>
          {claimPhase === "wallet" ? "Confirm in wallet…" : claimPhase === "confirming" ? "Confirming…" : "Claim fees"}
        </button>
        {address && claimable.isError ? <button type="button" disabled={busy || claimable.isFetching} onClick={() => void claimable.refetch()}>Retry balance</button> : null}
      </div>
      <p>This is the same combined balance in Managed Versus and Referrals. One withdrawal collects all your accrued creator and referral fees across all Versus. Previously accrued fees remain available after transferring creator rights.</p>
    </div>
    {message ? <p className={styles.message} role="status">{message}</p> : null}
  </section>;
}
