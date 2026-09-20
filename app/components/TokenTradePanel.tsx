"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BaseError,
  formatUnits,
  getAddress,
  isAddress,
  parseEther,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import type { DebateToken } from "../lib/debates";
import { formatTokenAmount } from "../lib/markets/format";
import {
  INDEXED_DEBATES_QUERY_KEY,
  INDEXED_DEBATE_QUERY_KEY,
  RECENT_MARKET_TRADES_QUERY_KEY,
  TOKEN_CHART_QUERY_KEY,
  TOKEN_TRADES_QUERY_KEY,
} from "../hooks/useIndexedMarkets";
import {
  KORUM_CHAIN,
  KORUM_CORE_ABI,
  KORUM_CORE_ADDRESS,
  KORUM_HOOK_ADDRESS,
  KORUM_ROUTER_ABI,
  KORUM_ROUTER_ADDRESS,
  REFERRAL_REGISTRY_ABI,
  REFERRAL_REGISTRY_ADDRESS,
  VERSUS_TOKEN_ABI,
} from "../lib/contracts/korum";
import { useWallet } from "./WalletProvider";
import styles from "./VsDetailClient.module.css";

export type TradeMode = "buy" | "sell";
type TransactionStep = "idle" | "approving" | "submitting" | "confirming" | "success";

type CurveState = {
  configId: number;
  status: number;
};

type LaunchConfig = {
  tickSpacing: number;
};

type Quote = {
  amountIn: bigint;
  amountOut: bigint;
  ethAccepted?: bigint;
  fee?: bigint;
  mode: TradeMode;
  venueStatus: number;
};

type PendingReferralResponse = {
  referral: { code: string; referrerWallet: Address } | null;
};

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const SLIPPAGE_BPS = BigInt(100);
const BPS_DENOMINATOR = BigInt(10_000);
const SELL_PERCENTAGES = [BigInt(25), BigInt(50), BigInt(75), HUNDRED];

function WalletIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" /><path d="M15 12h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a2 2 0 0 1 0-4Z" /></svg>;
}

function symbolLabel(symbol?: string) {
  if (!symbol) return "$TOKEN";
  return symbol.startsWith("$") ? symbol : `$${symbol}`;
}

function trimUnits(value: bigint, decimals: number, maximumFractionDigits = 6) {
  return formatTokenAmount(formatUnits(value, decimals), maximumFractionDigits);
}

function compactBalance(value: bigint | undefined, decimals: number) {
  if (value === undefined) return "—";
  const numeric = Number(formatUnits(value, decimals));
  if (!Number.isFinite(numeric)) return trimUnits(value, decimals, 4);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric > 0 && numeric < 0.0001 ? 8 : 4,
  }).format(numeric);
}

function transactionErrorMessage(error: unknown) {
  const message = error instanceof BaseError
    ? error.shortMessage
    : error instanceof Error
      ? error.message
      : "The transaction could not be completed.";

  if (/rejected|denied|cancelled/i.test(message)) return "The wallet request was cancelled.";
  if (/InsufficientOutput/i.test(message)) return "Price moved beyond the 1% slippage limit. Refresh the quote and try again.";
  if (/CurveNotTrading/i.test(message)) return "This token changed trading venue. Refresh the page and try again.";
  if (/insufficient funds/i.test(message)) return "Your wallet does not have enough ETH for this trade and network fees.";
  return message;
}

function minimumOutput(amountOut: bigint) {
  return amountOut * (BPS_DENOMINATOR - SLIPPAGE_BPS) / BPS_DENOMINATOR;
}

export default function TokenTradePanel({
  token,
  onStatus,
  initialMode = "buy",
  initialAmount,
  compact = false,
}: {
  token: DebateToken;
  onStatus: (message: string) => void;
  initialMode?: TradeMode;
  initialAmount?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { authenticated, authenticating, connect } = useWallet();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWalletPromptOpen, reset: resetWrite } = useWriteContract();

  const [mode, setMode] = useState<TradeMode>(initialMode);
  const [amount, setAmount] = useState(initialAmount ?? (initialMode === "buy" ? "0.01" : ""));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [transactionStep, setTransactionStep] = useState<TransactionStep>("idle");
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const [pendingReferrer, setPendingReferrer] = useState<Address>(zeroAddress);

  const tokenAddress = useMemo<Address | undefined>(() => {
    if (!token.address || !isAddress(token.address)) return undefined;
    return getAddress(token.address);
  }, [token.address]);
  const symbol = symbolLabel(token.symbol);

  const { data: decimalsData } = useReadContract({
    address: tokenAddress ?? zeroAddress,
    abi: VERSUS_TOKEN_ABI,
    functionName: "decimals",
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(tokenAddress), staleTime: Infinity },
  });
  const decimals = Number(decimalsData ?? token.decimals ?? 18);

  const amountRaw = useMemo(() => {
    try {
      const parsed = mode === "buy" ? parseEther(amount) : parseUnits(amount, decimals);
      return parsed > ZERO ? parsed : null;
    } catch {
      return null;
    }
  }, [amount, decimals, mode]);

  const {
    data: curveData,
    error: curveError,
    isLoading: isLoadingCurve,
    refetch: refetchCurve,
  } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "getCurve",
    args: [tokenAddress ?? zeroAddress],
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(tokenAddress), refetchInterval: 15_000 },
  });
  const curve = curveData as CurveState | undefined;

  const { data: configData } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "getConfig",
    args: [curve?.configId ?? 0],
    chainId: KORUM_CHAIN.id,
    query: { enabled: curve?.status === 3 && Boolean(curve.configId), staleTime: 60_000 },
  });
  const config = configData as LaunchConfig | undefined;

  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: tokenAddress ?? zeroAddress,
    abi: VERSUS_TOKEN_ABI,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(address && tokenAddress), refetchInterval: 15_000 },
  });
  const tokenBalance = tokenBalanceData as bigint | undefined;
  const spender = curve?.status === 3 ? KORUM_ROUTER_ADDRESS : KORUM_CORE_ADDRESS;
  const { data: allowanceData, isLoading: isLoadingAllowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress ?? zeroAddress,
    abi: VERSUS_TOKEN_ABI,
    functionName: "allowance",
    args: [address ?? zeroAddress, spender],
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(address && tokenAddress && (curve?.status === 1 || curve?.status === 3)) },
  });
  const allowance = allowanceData as bigint | undefined;

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    fetch("/api/referrals/pending", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PendingReferralResponse> : null)
      .then((result) => {
        if (!cancelled) setPendingReferrer(result?.referral?.referrerWallet ?? zeroAddress);
      })
      .catch(() => {
        // A referral lookup failure must never block a trade.
      });

    return () => { cancelled = true; };
  }, [authenticated]);

  useEffect(() => {
    if (!publicClient || !tokenAddress || !amountRaw || !curve || (curve.status === 3 && !config)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsQuoting(true);
      setQuoteError(null);

      const loadQuote = async () => {
        try {
          let nextQuote: Quote;
          if (curve.status === 1) {
            if (mode === "buy") {
              const result = await publicClient.readContract({
                address: KORUM_CORE_ADDRESS,
                abi: KORUM_CORE_ABI,
                functionName: "quoteBuy",
                args: [tokenAddress, amountRaw],
              }) as readonly [bigint, bigint, bigint];
              nextQuote = { amountIn: amountRaw, amountOut: result[0], fee: result[1], ethAccepted: result[2], mode, venueStatus: curve.status };
            } else {
              const result = await publicClient.readContract({
                address: KORUM_CORE_ADDRESS,
                abi: KORUM_CORE_ABI,
                functionName: "quoteSell",
                args: [tokenAddress, amountRaw],
              }) as readonly [bigint, bigint];
              nextQuote = { amountIn: amountRaw, amountOut: result[0], fee: result[1], mode, venueStatus: curve.status };
            }
          } else if (curve.status === 3 && !address) {
            if (!cancelled) {
              setQuote(null);
              setQuoteError("Connect your wallet to simulate this pool trade.");
            }
            return;
          } else if (curve.status === 3 && address && config) {
            if (mode === "sell" && allowance === undefined) return;
            if (mode === "sell" && (allowance === undefined || allowance < amountRaw)) {
              if (!cancelled) {
                setQuote(null);
                setQuoteError(`Approve ${symbol} to preview and complete this pool sale.`);
              }
              return;
            }
            const simulation = await publicClient.simulateContract({
              account: address,
              address: KORUM_ROUTER_ADDRESS,
              abi: KORUM_ROUTER_ABI,
              functionName: "swap",
              args: [{
                currency0: zeroAddress,
                currency1: tokenAddress,
                fee: 0,
                tickSpacing: config.tickSpacing,
                hooks: KORUM_HOOK_ADDRESS,
              }, mode === "buy", amountRaw, ZERO, address, pendingReferrer],
              value: mode === "buy" ? amountRaw : undefined,
            });
            nextQuote = { amountIn: amountRaw, amountOut: simulation.result as bigint, mode, venueStatus: curve.status };
          } else {
            if (!cancelled) {
              setQuote(null);
              setQuoteError(curve.status === 2 ? "This token is graduating to its liquidity pool." : "Trading is unavailable for this token.");
            }
            return;
          }

          if (nextQuote.amountOut <= ZERO) throw new Error("This amount is too small to receive any output tokens.");
          if (!cancelled) setQuote(nextQuote);
        } catch (error) {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(transactionErrorMessage(error));
          }
        } finally {
          if (!cancelled) setIsQuoting(false);
        }
      };

      void loadQuote();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, allowance, amountRaw, config, curve, mode, pendingReferrer, publicClient, symbol, tokenAddress]);

  const currentQuote = quote?.amountIn === amountRaw
    && quote.mode === mode
    && quote.venueStatus === curve?.status
    ? quote
    : null;
  const insufficientBalance = amountRaw !== null && (
    mode === "buy"
      ? ethBalance !== undefined && ethBalance.value < amountRaw
      : tokenBalance !== undefined && tokenBalance < amountRaw
  );
  const approvalRequired = mode === "sell"
    && amountRaw !== null
    && allowance !== undefined
    && allowance < amountRaw;
  const venueAvailable = curve?.status === 1 || curve?.status === 3;
  const transactionBusy = transactionStep === "approving"
    || transactionStep === "submitting"
    || transactionStep === "confirming"
    || isWalletPromptOpen
    || isSwitchingChain;

  async function clearConsumedReferral() {
    if (!address || pendingReferrer === zeroAddress || !publicClient) return;
    try {
      const boundReferrer = await publicClient.readContract({
        address: REFERRAL_REGISTRY_ADDRESS,
        abi: REFERRAL_REGISTRY_ABI,
        functionName: "referrerOf",
        args: [address],
      }) as Address;
      if (boundReferrer === zeroAddress) return;
      await fetch("/api/referrals/pending", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      setPendingReferrer(zeroAddress);
    } catch {
      // The trade succeeded; retaining the cookie is safer than clearing it without verification.
    }
  }

  async function approveIfRequired(target: Address, rawAmount: bigint) {
    if (!address || !publicClient || mode !== "sell" || (allowance !== undefined && allowance >= rawAmount)) return;
    setTransactionStep("approving");
    const approvalHash = await writeContractAsync({
      account: address,
      address: tokenAddress!,
      abi: VERSUS_TOKEN_ABI,
      functionName: "approve",
      args: [target, rawAmount],
      chainId: KORUM_CHAIN.id,
    });
    setTransactionHash(approvalHash);
    const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash, confirmations: 1 });
    if (approvalReceipt.status !== "success") throw new Error("Token approval reverted.");
    await refetchAllowance();
  }

  async function handleTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransactionError(null);
    setTransactionHash(null);

    if (!isConnected || !authenticated || !address) {
      connect();
      return;
    }
    if (!tokenAddress || !amountRaw || !publicClient || !curve || !venueAvailable) return;
    if (insufficientBalance) {
      setTransactionError(`Insufficient ${mode === "buy" ? "ETH" : symbol} balance.`);
      return;
    }

    try {
      resetWrite();
      if (chainId !== KORUM_CHAIN.id) await switchChainAsync({ chainId: KORUM_CHAIN.id });

      const target = curve.status === 3 ? KORUM_ROUTER_ADDRESS : KORUM_CORE_ADDRESS;
      await approveIfRequired(target, amountRaw);

      let freshAmountOut: bigint;
      let value: bigint | undefined;
      let contractAddress: Address;
      let abi = KORUM_CORE_ABI;
      let functionName: "buy" | "sell" | "swap";
      let args: readonly unknown[];

      if (curve.status === 1) {
        contractAddress = KORUM_CORE_ADDRESS;
        if (mode === "buy") {
          const result = await publicClient.readContract({
            address: KORUM_CORE_ADDRESS,
            abi: KORUM_CORE_ABI,
            functionName: "quoteBuy",
            args: [tokenAddress, amountRaw],
          }) as readonly [bigint, bigint, bigint];
          freshAmountOut = result[0];
          value = amountRaw;
          functionName = "buy";
          args = [tokenAddress, address, minimumOutput(freshAmountOut), pendingReferrer];
        } else {
          const result = await publicClient.readContract({
            address: KORUM_CORE_ADDRESS,
            abi: KORUM_CORE_ABI,
            functionName: "quoteSell",
            args: [tokenAddress, amountRaw],
          }) as readonly [bigint, bigint];
          freshAmountOut = result[0];
          functionName = "sell";
          args = [tokenAddress, address, amountRaw, minimumOutput(freshAmountOut), pendingReferrer];
        }
      } else {
        if (!config) throw new Error("The pool configuration is still loading.");
        contractAddress = KORUM_ROUTER_ADDRESS;
        abi = KORUM_ROUTER_ABI;
        functionName = "swap";
        const poolKey = {
          currency0: zeroAddress,
          currency1: tokenAddress,
          fee: 0,
          tickSpacing: config.tickSpacing,
          hooks: KORUM_HOOK_ADDRESS,
        } as const;
        const preview = await publicClient.simulateContract({
          account: address,
          address: contractAddress,
          abi,
          functionName,
          args: [poolKey, mode === "buy", amountRaw, ZERO, address, pendingReferrer],
          value: mode === "buy" ? amountRaw : undefined,
        });
        freshAmountOut = preview.result as bigint;
        value = mode === "buy" ? amountRaw : undefined;
        args = [poolKey, mode === "buy", amountRaw, minimumOutput(freshAmountOut), address, pendingReferrer];
      }

      await publicClient.simulateContract({
        account: address,
        address: contractAddress,
        abi,
        functionName,
        args,
        value,
      });

      setTransactionStep("submitting");
      const hash = await writeContractAsync({
        account: address,
        address: contractAddress,
        abi,
        functionName,
        args,
        chainId: KORUM_CHAIN.id,
        value,
      });
      setTransactionHash(hash);
      setTransactionStep("confirming");
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") throw new Error("The trade reverted.");

      setTransactionStep("success");
      onStatus(`${mode === "buy" ? "Purchase" : "Sale"} confirmed for ${symbol}.`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: INDEXED_DEBATES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: [INDEXED_DEBATE_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [TOKEN_CHART_QUERY_KEY, tokenAddress.toLowerCase()] }),
        queryClient.invalidateQueries({ queryKey: [TOKEN_TRADES_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [RECENT_MARKET_TRADES_QUERY_KEY] }),
      ]);
      await Promise.all([refetchEthBalance(), refetchTokenBalance(), refetchAllowance(), refetchCurve()]);
      await clearConsumedReferral();
    } catch (error) {
      setTransactionStep("idle");
      setTransactionError(transactionErrorMessage(error));
    }
  }

  function selectMode(nextMode: TradeMode) {
    setMode(nextMode);
    setAmount(nextMode === "buy" ? "0.01" : "");
    setQuote(null);
    setQuoteError(null);
    setIsQuoting(false);
    setTransactionError(null);
    setTransactionStep("idle");
    setTransactionHash(null);
  }

  function setSellPercentage(percentage: bigint) {
    if (tokenBalance === undefined) return;
    setAmount(formatUnits(tokenBalance * percentage / HUNDRED, decimals));
    setQuote(null);
    setQuoteError(null);
    setIsQuoting(false);
    setTransactionError(null);
    setTransactionStep("idle");
  }

  function selectBuyAmount(nextAmount: string) {
    setAmount(nextAmount);
    setQuote(null);
    setQuoteError(null);
    setIsQuoting(false);
    setTransactionError(null);
    setTransactionStep("idle");
    setTransactionHash(null);
  }

  const inputUnit = mode === "buy" ? "ETH" : symbol;
  const outputUnit = mode === "buy" ? symbol : "ETH";
  const displayedBalance = mode === "buy"
    ? compactBalance(ethBalance?.value, ethBalance?.decimals ?? 18)
    : compactBalance(tokenBalance, decimals);
  const displayedOutput = currentQuote
    ? mode === "buy"
      ? trimUnits(currentQuote.amountOut, decimals)
      : trimUnits(currentQuote.amountOut, 18)
    : "—";
  const refund = mode === "buy" && currentQuote?.ethAccepted !== undefined
    ? currentQuote.amountIn - currentQuote.ethAccepted
    : ZERO;
  const explorerUrl = transactionHash
    ? `${KORUM_CHAIN.blockExplorers.default.url}/tx/${transactionHash}`
    : null;

  let buttonLabel = `${mode === "buy" ? "BUY" : "SELL"} ${symbol}`;
  let buttonHint = curve?.status === 3 ? "Uniswap pool via KorumRouter" : "Korum bonding curve";
  if (!isConnected || !authenticated) {
    buttonLabel = authenticating ? "AUTHENTICATING…" : "CONNECT WALLET";
    buttonHint = "Connect and sign in to trade";
  } else if (chainId !== KORUM_CHAIN.id) {
    buttonLabel = `SWITCH TO ${KORUM_CHAIN.name.toUpperCase()}`;
    buttonHint = "Your wallet is on another network";
  } else if (approvalRequired && curve?.status === 3) {
    buttonLabel = `APPROVE & SELL ${symbol}`;
    buttonHint = "Two wallet confirmations are required";
  } else if (transactionStep === "approving") {
    buttonLabel = `APPROVING ${symbol}…`;
    buttonHint = "Waiting for token approval";
  } else if (transactionStep === "submitting" || isWalletPromptOpen) {
    buttonLabel = "CONFIRM IN WALLET…";
    buttonHint = "Review the transaction in your wallet";
  } else if (transactionStep === "confirming") {
    buttonLabel = "CONFIRMING TRADE…";
    buttonHint = "Waiting for one network confirmation";
  } else if (curve?.status === 2) {
    buttonLabel = "GRADUATION IN PROGRESS";
    buttonHint = "Trading resumes automatically on the pool";
  } else if (curve?.status === 0 || curveError || !tokenAddress) {
    buttonLabel = "TRADING UNAVAILABLE";
    buttonHint = !tokenAddress ? "No deployed token address" : "This is not an active Korum token";
  } else if (insufficientBalance) {
    buttonLabel = `INSUFFICIENT ${inputUnit}`;
    buttonHint = "Choose a smaller amount";
  }

  const submitDisabled = transactionBusy
    || isLoadingCurve
    || !tokenAddress
    || ((!isConnected || !authenticated)
      ? false
      : (chainId !== KORUM_CHAIN.id)
        ? false
        : !amountRaw
          || !venueAvailable
          || insufficientBalance
          || (mode === "sell" && isLoadingAllowance)
          || (!currentQuote && !(approvalRequired && curve?.status === 3)));

  return (
    <form className={`${styles.tradeCard} ${mode === "sell" ? styles.sellMode : ""} ${compact ? styles.compactTradeCard : ""}`} onSubmit={handleTrade}>
      {!compact ? (
        <div className={styles.tradeTabs}>
          <button type="button" className={mode === "buy" ? styles.activeBuy : ""} onClick={() => selectMode("buy")}>BUY</button>
          <button type="button" className={mode === "sell" ? styles.activeSell : ""} onClick={() => selectMode("sell")}>SELL</button>
        </div>
      ) : null}

      <div className={styles.amountHead}>
        <span>AMOUNT</span>
        <span><WalletIcon /> Wallet balance {displayedBalance} {inputUnit}</span>
      </div>
      <label className={styles.amountField}>
        <span className={styles.srOnly}>Amount in {inputUnit}</span>
        <span className={styles.amountMain}>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setQuote(null);
              setQuoteError(null);
              setIsQuoting(false);
              setTransactionError(null);
              setTransactionStep("idle");
            }}
          />
          <b>{inputUnit}</b>
        </span>
        <small>{curve?.status === 3 ? "Pool quote simulated on-chain" : "Live quote · 1% maximum slippage"}</small>
      </label>

      {mode === "buy" ? (
        <div className={styles.quickAmounts}>
          {["0.001", "0.005", "0.01", "0.05", "0.1", "0.5"].map((value) => (
            <button type="button" className={amount === value ? styles.quickSelected : ""} onClick={() => selectBuyAmount(value)} key={value}>{value}</button>
          ))}
        </div>
      ) : (
        <div className={`${styles.quickAmounts} ${styles.sellQuickAmounts}`}>
          {SELL_PERCENTAGES.map((percentage) => (
            <button type="button" onClick={() => setSellPercentage(percentage)} disabled={tokenBalance === undefined || tokenBalance === ZERO} key={percentage.toString()}>{percentage === HUNDRED ? "MAX" : `${percentage}%`}</button>
          ))}
        </div>
      )}

      <div className={styles.receiveRow}>
        <span>{mode === "buy" ? "TOKEN RECEIVED" : "ETH RECEIVED"}</span>
        <strong>{isQuoting ? "Quoting…" : `${displayedOutput} ${outputUnit}`}</strong>
      </div>
      {currentQuote ? (
        <div className={styles.quoteDetails}>
          <span>Minimum received <b>{trimUnits(minimumOutput(currentQuote.amountOut), mode === "buy" ? decimals : 18)} {outputUnit}</b></span>
          {currentQuote.fee !== undefined ? <span>Protocol fee <b>{trimUnits(currentQuote.fee, 18)} ETH</b></span> : null}
          {refund > ZERO ? <span>Automatic refund <b>{trimUnits(refund, 18)} ETH</b></span> : null}
        </div>
      ) : null}
      {quoteError && amountRaw ? <p className={styles.tradeNotice}>{quoteError}</p> : null}
      {transactionError ? <p className={`${styles.tradeNotice} ${styles.tradeError}`}>{transactionError}</p> : null}
      {transactionStep === "success" && explorerUrl ? (
        <a className={styles.transactionLink} href={explorerUrl} target="_blank" rel="noreferrer">Trade confirmed · View transaction ↗</a>
      ) : null}

      <button className={styles.tradeSubmit} type="submit" disabled={submitDisabled}>
        {buttonLabel}
        <small>{buttonHint}</small>
      </button>
    </form>
  );
}
