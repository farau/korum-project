"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, type Address, type Hash } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { KORUM_CHAIN } from "../config/korum-network";
import { DEPLOYMENT_CACHE_SCOPE } from "../config/deployment";
import { INDEXED_DEBATES_QUERY_KEY, INDEXED_DEBATE_QUERY_KEY } from "../hooks/useIndexedMarkets";
import { prepareGraduation, readGraduationStatus } from "../lib/markets/graduation";
import { useWallet } from "./WalletProvider";
import styles from "./VsDetailClient.module.css";

type Phase = "idle" | "switching" | "preparing" | "wallet" | "confirming";

type Props = {
  tokenAddress?: Address;
  migrating: boolean;
  disabled?: boolean;
  onCurveStatus?: (address: string, status: number) => void;
  onStatus: (message: string) => void;
};

export default function GraduateTokenButton({ tokenAddress, migrating, disabled, onCurveStatus, onStatus }: Props) {
  const { address, isConnected } = useAccount();
  const { connect, hydrated } = useWallet();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [complete, setComplete] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pendingHash = useRef<Hash | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const wallet = useRef({ address, chainId });
  useEffect(() => { wallet.current = { address, chainId }; }, [address, chainId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function refresh(status: number) {
    if (!tokenAddress) return;
    onCurveStatus?.(tokenAddress.toLowerCase(), status);
    void Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: INDEXED_DEBATES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: [INDEXED_DEBATE_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: ["readContract"] }),
      queryClient.invalidateQueries({ queryKey: ["balance"] }),
      queryClient.invalidateQueries({ queryKey: ["pool-chart", DEPLOYMENT_CACHE_SCOPE, tokenAddress.toLowerCase()] }),
    ]);
  }

  function finish() {
    pendingHash.current = null;
    setAwaitingConfirmation(false);
    setComplete(true);
    setMessage("Migration complete. Trading is available while the DEX Screener chart is being retrieved.");
    refresh(3);
    onStatus("Token migration completed.");
  }

  async function finalize() {
    if (busy.current || disabled || !hydrated || !tokenAddress || !publicClient) return;
    // A timeout keeps its transaction hash: the next click checks that transaction instead of sending another.
    if (!pendingHash.current && (!address || !isConnected)) { connect(); return; }
    busy.current = true;
    setError("");
    setMessage("");
    try {
      if (!pendingHash.current) {
        if (chainId !== KORUM_CHAIN.id) {
          setPhase("switching");
          await switchChainAsync({ chainId: KORUM_CHAIN.id });
          setMessage("Network switched. Click Finalize migration to continue.");
          return;
        }
        setPhase("preparing");
        const request = await prepareGraduation(publicClient, tokenAddress, address!);
        if (!mounted.current) return;
        if (!request) { finish(); return; }
        if (wallet.current.address !== address || wallet.current.chainId !== KORUM_CHAIN.id) throw new Error("Your wallet changed. Please retry with the current wallet.");
        setPhase("wallet");
        const submittedHash = await writeContractAsync({ ...request, chainId: KORUM_CHAIN.id });
        pendingHash.current = submittedHash;
        setAwaitingConfirmation(true);
        setHash(submittedHash);
      }
      setPhase("confirming");
      let replacedByAnotherAction = false;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: pendingHash.current!, confirmations: 1,
        onReplaced: ({ reason, transaction }) => {
          replacedByAnotherAction = reason !== "repriced";
          pendingHash.current = transaction.hash;
          setHash(transaction.hash);
        },
      });
      if (replacedByAnotherAction || receipt.status !== "success") {
        pendingHash.current = null;
        setAwaitingConfirmation(false);
        throw new Error(replacedByAnotherAction ? "The migration transaction was replaced. Check the token status before retrying." : "The migration transaction reverted. The token has not been migrated by this transaction.");
      }
      const status = await readGraduationStatus(publicClient, tokenAddress);
      if (status !== 3) {
        refresh(status);
        throw new Error("Transaction confirmed, but migration is not complete. Check confirmation again before retrying.");
      }
      finish();
    } catch (caught) {
      // Another permissionless caller may finish between our status check and simulation.
      if (!pendingHash.current) {
        try {
          if (await readGraduationStatus(publicClient, tokenAddress) === 3) { finish(); return; }
        } catch { /* Keep the original error if the status read also fails. */ }
      }
      const reason = caught instanceof BaseError ? caught.shortMessage : caught instanceof Error ? caught.message : "Unable to finalize migration.";
      setError(/rejected|denied|cancelled/i.test(reason) ? "The wallet request was cancelled. You can retry the migration." : reason);
    } finally {
      busy.current = false;
      setPhase("idle");
    }
  }

  if (!migrating && !hash && !complete && phase === "idle") return null;
  const label = phase === "switching" ? "Switching network…" : phase === "preparing" ? "Checking migration…" : phase === "wallet" ? "Confirm in wallet…" : phase === "confirming" ? "Confirming migration…" : awaitingConfirmation ? "Check confirmation" : !hydrated ? "Finalize migration" : !isConnected || !address ? "Connect wallet to finalize" : chainId !== KORUM_CHAIN.id ? "Switch network to finalize" : "Finalize migration";
  return <section className={styles.migrationAction} aria-label="Finalize token migration">
    {!complete ? <>
      <p>Anyone can finalize this migration. Your wallet pays only the network gas fee.</p>
      <button type="button" disabled={!hydrated || disabled || phase !== "idle" || !tokenAddress || !publicClient} aria-busy={phase !== "idle"} onClick={finalize}>{label}</button>
    </> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p className={styles.migrationError} role="alert">{error}</p> : null}
    {hash ? <a href={`${KORUM_CHAIN.blockExplorers.default.url}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{complete ? "Migration confirmed" : "View migration transaction"} ↗</a> : null}
  </section>;
}
