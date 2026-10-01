"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { KORUM_CHAIN } from "../config/korum-network";
import { INDEXED_DEBATE_QUERY_KEY } from "../hooks/useIndexedMarkets";
import {
  KORUM_CORE_ABI, KORUM_CORE_ADDRESS,
  KORUM_FACTORY_ABI, KORUM_FACTORY_ADDRESS,
} from "../lib/contracts/korum";
import styles from "./CreatorFeeTransfer.module.css";
import CreatorSocialsEditor from "./CreatorSocialsEditor";

type Camp = { name: string; symbol: string; address?: string; indexedRecipient?: string };
type Curve = { creator: Address };
type Pending = { newRecipient: Address; effectiveAt: bigint; expiresAt: bigint };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function pendingLabel(pending: Pending | undefined) {
  if (!pending || pending.newRecipient.toLowerCase() === zeroAddress) return null;
  const effectiveAt = new Date(Number(pending.effectiveAt) * 1_000);
  const expiresAt = new Date(Number(pending.expiresAt) * 1_000);
  return `Owner proposal → ${shortAddress(pending.newRecipient)} · executable from ${effectiveAt.toLocaleString()} until ${expiresAt.toLocaleString()}`;
}

export default function CreatorFeeTransfer({ versusId, camps, socialsJson }: { versusId: number; camps: [Camp, Camp]; socialsJson?: string }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const tokenA = camps[0].address && isAddress(camps[0].address) ? getAddress(camps[0].address) : zeroAddress;
  const tokenB = camps[1].address && isAddress(camps[1].address) ? getAddress(camps[1].address) : zeroAddress;
  const tokens = [tokenA, tokenB] as const;
  const readOptions = { chainId: KORUM_CHAIN.id, query: { refetchInterval: 15_000 } } as const;
  const curveA = useReadContract({ ...readOptions, address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "getCurve", args: [tokenA], query: { ...readOptions.query, enabled: tokenA !== zeroAddress } });
  const pendingA = useReadContract({ ...readOptions, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI, functionName: "getPendingCreatorFeeRecipient", args: [tokenA], query: { ...readOptions.query, enabled: tokenA !== zeroAddress } });
  const curveB = useReadContract({ ...readOptions, address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "getCurve", args: [tokenB], query: { ...readOptions.query, enabled: tokenB !== zeroAddress } });
  const pendingB = useReadContract({ ...readOptions, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI, functionName: "getPendingCreatorFeeRecipient", args: [tokenB], query: { ...readOptions.query, enabled: tokenB !== zeroAddress } });
  const curves = [curveA.data as Curve | undefined, curveB.data as Curve | undefined];
  const pendings = [pendingA.data as Pending | undefined, pendingB.data as Pending | undefined];
  const isPending = curveA.isPending || curveB.isPending;
  async function refetch() {
    await Promise.all([curveA.refetch(), pendingA.refetch(), curveB.refetch(), pendingB.refetch()]);
  }
  const owns = curves.map((curve) => Boolean(address && curve?.creator.toLowerCase() === address.toLowerCase()));
  const targetValid = isAddress(target) && target.toLowerCase() !== zeroAddress;

  async function copyRecipient(recipient: string) {
    try {
      await navigator.clipboard.writeText(recipient);
      setMessage("Creator fee recipient address copied.");
    } catch {
      setMessage("Unable to access the clipboard.");
    }
  }

  async function transfer(sides: number[]) {
    if (!address || !publicClient || !targetValid || busy) return;
    const newRecipient = getAddress(target);
    if (chainId !== KORUM_CHAIN.id) {
      try { await switchChainAsync({ chainId: KORUM_CHAIN.id }); setMessage("Network switched. Review the recipient and submit the transfer again."); }
      catch { setMessage(`Switch to ${KORUM_CHAIN.name} to continue.`); }
      return;
    }

    setBusy(true);
    setMessage("");
    const completed: string[] = [];
    try {
      for (const side of sides) {
        const token = tokens[side];
        const camp = camps[side];
        if (token === zeroAddress) throw new Error(`${camp.name}: token address unavailable.`);
        const latest = await publicClient.readContract({
          address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI,
          functionName: "getCurve", args: [token],
        }) as Curve;
        if (latest.creator.toLowerCase() !== address.toLowerCase()) {
          throw new Error(`${camp.name}: this wallet is no longer the current fee recipient.`);
        }
        if (latest.creator.toLowerCase() === newRecipient.toLowerCase()) {
          throw new Error(`${camp.name}: the new address is already the fee recipient.`);
        }
        await publicClient.simulateContract({
          account: address, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI,
          functionName: "transferCreatorFeeRecipient", args: [token, newRecipient],
        });
        const hash = await writeContractAsync({
          account: address, address: KORUM_FACTORY_ADDRESS, abi: KORUM_FACTORY_ABI,
          functionName: "transferCreatorFeeRecipient", args: [token, newRecipient],
          chainId: KORUM_CHAIN.id,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`${camp.name}: transaction reverted.`);
        completed.push(camp.name);
        setMessage(`${completed.join(" and ")} transferred. ${sides.length > completed.length ? "Confirm the next wallet transaction." : "The recipient has been updated on-chain."}`);
        await refetch();
        await queryClient.invalidateQueries({ queryKey: [INDEXED_DEBATE_QUERY_KEY, String(versusId)] });
      }
      setTarget("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Transfer failed.";
      setMessage(completed.length ? `${completed.join(" and ")} transferred. ${reason} The remaining camp was not transferred.` : reason);
    } finally {
      setBusy(false);
      void refetch();
    }
  }

  return <><section className={styles.card} aria-label="Creator fee recipient management">
    <div className={styles.heading}><div><span>Token creator</span><h3>Current creator fee recipients</h3></div><small>One recipient per camp</small></div>
    <p className={styles.intro}>These wallets receive future creator fees. They may differ from the wallet that launched this Versus. Fees already accrued remain claimable by the previous recipient.</p>
    <div className={styles.camps}>{camps.map((camp, index) => {
      const chainRecipient = curves[index]?.creator;
      const current = chainRecipient ?? camp.indexedRecipient;
      const pending = pendingLabel(pendings[index]);
      return <div className={styles.camp} key={camp.address || index}>
        <div><strong>{camp.name}</strong><small>{camp.symbol}</small></div>
        <div className={styles.recipient}><span>{chainRecipient ? "Current recipient" : "Last known recipient"}</span><strong title={current}>{current || (isPending ? "Loading…" : "Unavailable")}</strong>{pending ? <small className={styles.pending}>{pending}. An immediate transfer will not cancel it.</small> : null}</div>
        {current ? <button className={styles.copy} type="button" onClick={() => void copyRecipient(current)} aria-label={`Copy ${camp.name} creator fee recipient`}>Copy</button> : null}
        {owns[index] ? <span className={styles.owned}>You control this camp</span> : null}
      </div>;
    })}</div>
    {curveA.isError || curveB.isError ? <p className={styles.notice}>The live recipient could not be read. Transfers remain unavailable until the contract read succeeds.</p> : null}
    {address && owns.some(Boolean) ? <div className={styles.form}>
      <label htmlFor="creator-fee-target">Transfer future fee rights to a new wallet</label>
      <input id="creator-fee-target" value={target} onChange={(event) => setTarget(event.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off" disabled={busy} aria-invalid={target.length > 0 && !targetValid} />
      <div className={styles.actions}>
        {owns.map((owned, index) => owned ? <button key={index} type="button" disabled={!targetValid || busy} onClick={() => void transfer([index])}>Transfer {camps[index].name}</button> : null)}
        {owns.every(Boolean) ? <button type="button" disabled={!targetValid || busy} onClick={() => void transfer([0, 1])}>Transfer both camps</button> : null}
      </div>
      <small>Check the destination carefully. Each transfer takes effect after its transaction confirms, and the two-camp action requires two wallet confirmations.</small>
    </div> : <p className={styles.notice}>{address ? "Only a camp’s current fee recipient can transfer its rights." : "Connect the current recipient wallet to manage fees."}</p>}
    {message ? <p className={styles.message} role="status">{message}</p> : null}
  </section>{owns.some(Boolean) ? <CreatorSocialsEditor key={address} versusId={versusId} socialsJson={socialsJson} /> : null}</>;
}
