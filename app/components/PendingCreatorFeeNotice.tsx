"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { KORUM_CHAIN } from "../config/korum-network";
import { KORUM_FACTORY_ABI, KORUM_FACTORY_ADDRESS } from "../lib/contracts/korum";
import styles from "./PendingCreatorFeeNotice.module.css";
import { useWallet } from "./WalletProvider";

type Pending = { newRecipient: Address; effectiveAt: bigint; expiresAt: bigint };

function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

export default function PendingCreatorFeeNotice({ camps }: { camps: [{ name: string; token?: string }, { name: string; token?: string }] }) {
  const { address } = useAccount();
  const { connect } = useWallet();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [executing, setExecuting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const tokenA = camps[0].token && isAddress(camps[0].token) ? getAddress(camps[0].token) : zeroAddress;
  const tokenB = camps[1].token && isAddress(camps[1].token) ? getAddress(camps[1].token) : zeroAddress;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  const options = { address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI, functionName: "getPendingCreatorFeeRecipient", chainId: KORUM_CHAIN.id } as const;
  const pendingA = useReadContract({ ...options, args: [tokenA], query: { enabled: tokenA !== zeroAddress, refetchInterval: 30_000 } });
  const pendingB = useReadContract({ ...options, args: [tokenB], query: { enabled: tokenB !== zeroAddress, refetchInterval: 30_000 } });
  const notices = [pendingA.data as Pending | undefined, pendingB.data as Pending | undefined]
    .map((pending, index) => ({ pending, camp: camps[index] }))
    .filter((entry): entry is { pending: Pending; camp: { name: string; token?: string } } => Boolean(entry.pending && entry.pending.newRecipient.toLowerCase() !== zeroAddress));
  if (!notices.length || now === null) return null;

  async function execute(token: string, name: string) {
    if (!isAddress(token) || executing || !publicClient) return;
    if (!address) { connect(); return; }
    if (chainId !== KORUM_CHAIN.id) {
      try { await switchChainAsync({ chainId: KORUM_CHAIN.id }); setMessage("Network switched. Confirm the change again."); }
      catch { setMessage(`Switch to ${KORUM_CHAIN.name} to continue.`); }
      return;
    }
    setExecuting(token);
    setMessage("");
    try {
      const args = [getAddress(token)] as const;
      await publicClient.simulateContract({ account: address, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI, functionName: "executeCreatorFeeRecipientChange", args });
      const hash = await writeContractAsync({ account: address, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI, functionName: "executeCreatorFeeRecipientChange", args, chainId: KORUM_CHAIN.id });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      await Promise.all([pendingA.refetch(), pendingB.refetch()]);
      setMessage(`${name}: recipient change executed. Future creator fees now go to the proposed wallet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not execute the recipient change.");
    } finally { setExecuting(null); }
  }

  return <div className={styles.notice} role="status" aria-label="Protocol creator fee change notices">
    {notices.map(({ pending, camp }) => {
      const effectiveAt = Number(pending.effectiveAt) * 1_000;
      const expiresAt = Number(pending.expiresAt) * 1_000;
      const phase = now < effectiveAt ? "proposed" : now <= expiresAt ? "executable" : "expired";
      return <p key={camp.token || camp.name}>
        <strong>{camp.name}: protocol fee-recipient change {phase}.</strong>{" "}
        {phase === "proposed" ? `The protocol owner proposed ${shortAddress(pending.newRecipient)}. It can be executed from ${new Date(effectiveAt).toLocaleString()} until ${new Date(expiresAt).toLocaleString()}.` :
          phase === "executable" ? `A transaction can now redirect future creator fees to ${shortAddress(pending.newRecipient)} until ${new Date(expiresAt).toLocaleString()}.` :
            `The proposal for ${shortAddress(pending.newRecipient)} expired without execution; it cannot change the current recipient.`}
        {phase !== "expired" ? " A direct transfer by the current recipient does not cancel this proposal." : ""}
        {phase === "executable" && camp.token ? <button type="button" disabled={Boolean(executing)} onClick={() => void execute(camp.token!, camp.name)}>{executing === camp.token ? "Waiting for transaction…" : "Execute change"}</button> : null}
      </p>;
    })}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
