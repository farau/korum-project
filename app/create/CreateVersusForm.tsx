"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BaseError,
  bytesToHex,
  formatEther,
  formatUnits,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { useWallet } from "../components/WalletProvider";
import {
  KORUM_CHAIN,
  KORUM_CORE_ABI,
  KORUM_CORE_ADDRESS,
  KORUM_FACTORY_ABI,
  KORUM_FACTORY_ADDRESS,
  REFERRAL_REGISTRY_ABI,
  REFERRAL_REGISTRY_ADDRESS,
} from "../lib/contracts/korum";
import type { PendingReferral } from "../lib/referrals/pending";

const classes = {
  actions: "create-actions",
  buyColumn: "create-buy-column",
  buyGrid: "create-buy-grid",
  content: "create-content",
  costRow: "create-cost-row",
  costTotal: "create-cost-total",
  counter: "create-counter",
  field: "create-field",
  form: "create-form",
  formHint: "create-form-hint",
  hero: "create-hero",
  imagePreview: "create-image-preview",
  infoNote: "create-info-note",
  inlineError: "create-inline-error",
  layout: "create-layout",
  modal: "create-modal",
  modalClose: "create-modal-close",
  modalOverlay: "create-modal-overlay",
  networkBadge: "create-network-badge",
  page: "create-page",
  previewButton: "create-preview-button",
  previewCard: "create-preview-card",
  previewCategory: "create-preview-category",
  previewImages: "create-preview-images",
  previewLabel: "create-preview-label",
  previewMeter: "create-preview-meter",
  previewTokens: "create-preview-tokens",
  publicWarning: "create-public-warning",
  publishButton: "create-publish-button",
  referralNotice: "create-referral-notice",
  reverted: "create-reverted",
  sectionNote: "create-section-note",
  sectionTitle: "create-section-title",
  submitError: "create-submit-error",
  success: "create-success",
  terms: "create-terms",
  tickerInput: "create-ticker-input",
  tokenCard: "create-token-card",
  tokenRow: "create-token-row",
  tokenVs: "create-token-vs",
  transactionStatus: "create-transaction-status",
  uploadPlaceholder: "create-upload-placeholder",
  uploadSquare: "create-upload-square",
  viralGuide: "create-viral-guide",
  visibilityRow: "create-visibility-row",
} as const;

const CATEGORIES = [
  "Memes",
  "Politics",
  "Sports",
  "Crypto",
  "Pop Culture",
  "Movies & TV",
  "Music",
  "Tech",
  "Gaming",
  "WTF",
] as const;

const PUBLIC_URI_PATTERN = /^(https?:\/\/|ipfs:\/\/|ar:\/\/)/i;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

type LaunchConfig = {
  virtualEth: bigint;
  graduationEth: bigint;
  totalSupply: bigint;
  tier1Eth: bigint;
  tier2Eth: bigint;
  fee1Bps: number;
  fee2Bps: number;
  fee3Bps: number;
  creatorShare1Bps: number;
  creatorShare2Bps: number;
  creatorShare3Bps: number;
  referralBps: number;
  snipeStartBps: number;
  snipeWindowSeconds: number;
  launchFeeWei: bigint;
  tickSpacing: number;
  active: boolean;
};

type VersusParams = {
  title: string;
  description: string;
  category: string;
  socialsJson: string;
  campA: { name: string; symbol: string; uri: string };
  campB: { name: string; symbol: string; uri: string };
  creatorBuyBpsA: number;
  creatorBuyBpsB: number;
  creatorFeeRecipient: Address;
  configId: number;
  salt: Hex;
};

type PendingReferralResponse = {
  referral: { code: string; referrerWallet: Address } | null;
};

function createSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function symbolFromName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)
    .toUpperCase();
}

function sanitizeSymbol(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
}

function displayImageUri(uri: string) {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function backgroundImage(uri: string) {
  return `url(${JSON.stringify(uri)})`;
}

function formatEth(value?: bigint) {
  if (value === undefined) return "…";
  const amount = Number(formatEther(value));
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(amount)} ETH`;
}

function formatTokenAmount(value?: bigint) {
  if (value === undefined) return "…";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(formatUnits(value, 18)),
  );
}

function errorMessage(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error) return error.message;
  return "The transaction could not be prepared.";
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h6.5L8 22l13-12h-6.5L13 2Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

export default function CreateVersusForm({ initialPendingReferral }: { initialPendingReferral: PendingReferral | null }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { authenticated, authenticating, connect } = useWallet();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: KORUM_CHAIN.id });
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWalletPromptOpen, reset: resetWrite } = useWriteContract();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Memes");
  const [campAName, setCampAName] = useState("");
  const [campBName, setCampBName] = useState("");
  const [campASymbol, setCampASymbol] = useState("");
  const [campBSymbol, setCampBSymbol] = useState("");
  const [campASymbolEdited, setCampASymbolEdited] = useState(false);
  const [campBSymbolEdited, setCampBSymbolEdited] = useState(false);
  const [campAUri, setCampAUri] = useState("");
  const [campBUri, setCampBUri] = useState("");
  const [campAPreview, setCampAPreview] = useState("");
  const [campBPreview, setCampBPreview] = useState("");
  const [creatorBuyBpsA, setCreatorBuyBpsA] = useState(100);
  const [creatorBuyBpsB, setCreatorBuyBpsB] = useState(100);
  const [xHandle, setXHandle] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingReferral, setPendingReferral] = useState<PendingReferral | null>(initialPendingReferral);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<Hash | undefined>();
  const [createdVersusId, setCreatedVersusId] = useState<string | null>(null);
  const processedReceipt = useRef<Hash | null>(null);
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    fetch("/api/referrals/pending", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PendingReferralResponse> : null)
      .then((result) => {
        if (cancelled || !result) return;
        setPendingReferral(result.referral ? {
          referralCode: result.referral.code,
          evmWallet: result.referral.referrerWallet,
        } : null);
      })
      .catch(() => {
        // Referral lookup must not prevent the creator from using the form.
      });

    return () => { cancelled = true; };
  }, [authenticated]);

  useEffect(() => {
    if (!previewOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [previewOpen]);

  const { data: configCountData, error: configCountError, isLoading: isLoadingConfigCount } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "configCount",
    chainId: KORUM_CHAIN.id,
    query: { staleTime: 60_000 },
  });
  const configId = Number(configCountData ?? 0);

  const { data: configData, error: configError, isLoading: isLoadingConfig } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "getConfig",
    args: [configId],
    chainId: KORUM_CHAIN.id,
    query: { enabled: configId > 0, staleTime: 60_000 },
  });
  const config = configData as LaunchConfig | undefined;

  const { data: minBuyData } = useReadContract({
    address: KORUM_FACTORY_ADDRESS,
    abi: KORUM_FACTORY_ABI,
    functionName: "MIN_CREATOR_BUY_BPS",
    chainId: KORUM_CHAIN.id,
    query: { staleTime: Infinity },
  });
  const { data: maxBuyData } = useReadContract({
    address: KORUM_FACTORY_ADDRESS,
    abi: KORUM_FACTORY_ABI,
    functionName: "MAX_CREATOR_BUY_BPS",
    chainId: KORUM_CHAIN.id,
    query: { staleTime: Infinity },
  });
  const minBuyBps = Number(minBuyData ?? 10);
  const maxBuyBps = Number(maxBuyData ?? 200);

  const effectiveCreatorBuyBpsA = Math.min(maxBuyBps, Math.max(minBuyBps, creatorBuyBpsA));
  const effectiveCreatorBuyBpsB = Math.min(maxBuyBps, Math.max(minBuyBps, creatorBuyBpsB));
  const tokenAmountA = config ? config.totalSupply * BigInt(effectiveCreatorBuyBpsA) / BigInt(10_000) : undefined;
  const tokenAmountB = config ? config.totalSupply * BigInt(effectiveCreatorBuyBpsB) / BigInt(10_000) : undefined;

  const { data: initialBuyCostAData, isLoading: isLoadingCostA } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "quoteCreatorInitialBuy",
    args: [configId, tokenAmountA ?? BigInt(0)],
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(config?.active && tokenAmountA) },
  });
  const { data: initialBuyCostBData, isLoading: isLoadingCostB } = useReadContract({
    address: KORUM_CORE_ADDRESS,
    abi: KORUM_CORE_ABI,
    functionName: "quoteCreatorInitialBuy",
    args: [configId, tokenAmountB ?? BigInt(0)],
    chainId: KORUM_CHAIN.id,
    query: { enabled: Boolean(config?.active && tokenAmountB) },
  });
  const initialBuyCostA = initialBuyCostAData as bigint | undefined;
  const initialBuyCostB = initialBuyCostBData as bigint | undefined;
  const initialBuyTotal = initialBuyCostA !== undefined && initialBuyCostB !== undefined
    ? initialBuyCostA + initialBuyCostB
    : undefined;
  const estimatedTotalCost = config && initialBuyTotal !== undefined
    ? config.launchFeeWei + initialBuyTotal
    : undefined;

  const { data: balanceData } = useBalance({ address, chainId: KORUM_CHAIN.id });
  const insufficientBalance = estimatedTotalCost !== undefined
    && balanceData !== undefined
    && balanceData.value < estimatedTotalCost;

  const campAImage = campAPreview || (PUBLIC_URI_PATTERN.test(campAUri) ? displayImageUri(campAUri) : "");
  const campBImage = campBPreview || (PUBLIC_URI_PATTERN.test(campBUri) ? displayImageUri(campBUri) : "");
  const normalizedXHandle = xHandle.trim().replace(/^@/, "");

  const formIssue = useMemo(() => {
    if (!title.trim()) return "Add a debate title.";
    if (title.trim().length < 6) return "The debate title must be at least 6 characters long.";
    if (!campAName.trim() || !campBName.trim()) return "Enter a name for both sides.";
    if (campAName.trim().toLowerCase() === campBName.trim().toLowerCase()) return "The two sides must be different.";
    if (!campASymbol || !campBSymbol) return "Enter both token symbols.";
    if (campASymbol === campBSymbol) return "The two token symbols must be different.";
    if (!PUBLIC_URI_PATTERN.test(campAUri.trim()) || !PUBLIC_URI_PATTERN.test(campBUri.trim())) {
      return "Add a public HTTPS, IPFS, or Arweave URI for each side.";
    }
    if (normalizedXHandle && !/^[A-Za-z0-9_]{1,15}$/.test(normalizedXHandle)) return "The X account is invalid.";
    if (!termsAccepted) return "Accept the Terms of Use before publishing.";
    if (!configId || !config?.active) return "No active launch configuration is available.";
    return null;
  }, [
    campAName,
    campASymbol,
    campAUri,
    campBName,
    campBSymbol,
    campBUri,
    config?.active,
    configId,
    normalizedXHandle,
    termsAccepted,
    title,
  ]);

  const buildParams = useCallback((creator: Address, creationSalt: Hex): VersusParams => ({
    title: title.trim(),
    description: description.trim(),
    category,
    socialsJson: JSON.stringify({
      ...(normalizedXHandle ? { x: `https://x.com/${normalizedXHandle}` } : {}),
      visibility: "public",
    }),
    campA: { name: campAName.trim(), symbol: campASymbol, uri: campAUri.trim() },
    campB: { name: campBName.trim(), symbol: campBSymbol, uri: campBUri.trim() },
    creatorBuyBpsA: effectiveCreatorBuyBpsA,
    creatorBuyBpsB: effectiveCreatorBuyBpsB,
    creatorFeeRecipient: creator,
    configId,
    salt: creationSalt,
  }), [
    campAName,
    campASymbol,
    campAUri,
    campBName,
    campBSymbol,
    campBUri,
    category,
    configId,
    effectiveCreatorBuyBpsA,
    effectiveCreatorBuyBpsB,
    description,
    normalizedXHandle,
    title,
  ]);

  const { data: receipt, isLoading: isConfirming, error: receiptError } = useWaitForTransactionReceipt({
    hash: transactionHash,
    chainId: KORUM_CHAIN.id,
    confirmations: 1,
  });

  useEffect(() => {
    if (!receipt || receipt.status !== "success" || processedReceipt.current === receipt.transactionHash) return;
    processedReceipt.current = receipt.transactionHash;

    const finish = async () => {
      const versusLogs = parseEventLogs({
        abi: KORUM_FACTORY_ABI,
        eventName: "VersusCreated",
        logs: receipt.logs,
        strict: false,
      });
      const versusArgs = versusLogs[0]?.args as { versusId?: bigint } | undefined;
      const versusId = versusArgs?.versusId?.toString() ?? null;
      setCreatedVersusId(versusId);
      if (versusId) router.replace(`/vs/${versusId}`);

      if (!pendingReferral || !address || !publicClient) return;

      const referralLogs = parseEventLogs({
        abi: REFERRAL_REGISTRY_ABI,
        eventName: "ReferrerBound",
        logs: receipt.logs,
        strict: false,
      });
      const didBindExpectedWallet = referralLogs.some((log) => {
        const args = log.args as { user?: Address };
        return args.user?.toLowerCase() === address.toLowerCase();
      });

      let alreadyBound = didBindExpectedWallet;
      if (!alreadyBound) {
        try {
          const referrer = await publicClient.readContract({
            address: REFERRAL_REGISTRY_ADDRESS,
            abi: REFERRAL_REGISTRY_ABI,
            functionName: "referrerOf",
            args: [address],
          }) as Address;
          alreadyBound = referrer !== zeroAddress;
        } catch {
          return;
        }
      }

      if (alreadyBound) {
        await fetch("/api/referrals/pending", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        setPendingReferral(null);
      }
    };

    void finish();
  }, [address, pendingReferral, publicClient, receipt, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setCreatedVersusId(null);

    if (!isConnected || !authenticated || !address) {
      connect();
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    if (chainId !== KORUM_CHAIN.id) {
      try {
        await switchChainAsync({ chainId: KORUM_CHAIN.id });
      } catch (error) {
        setSubmitError(errorMessage(error));
      }
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    if (formIssue) {
      setSubmitError(formIssue);
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    if (!publicClient) {
      setSubmitError("The Robinhood Testnet RPC client is unavailable.");
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    try {
      resetWrite();
      setTransactionHash(undefined);
      const params = buildParams(address, createSalt());
      const referrer = pendingReferral?.evmWallet ?? zeroAddress;
      const latestCost = await publicClient.readContract({
        address: KORUM_FACTORY_ADDRESS,
        abi: KORUM_FACTORY_ABI,
        functionName: "previewCost",
        args: [params],
      }) as bigint;

      await publicClient.simulateContract({
        account: address,
        address: KORUM_FACTORY_ADDRESS,
        abi: KORUM_FACTORY_ABI,
        functionName: "createVersus",
        args: [params, referrer],
        value: latestCost,
      });

      const hash = await writeContractAsync({
        account: address,
        address: KORUM_FACTORY_ADDRESS,
        abi: KORUM_FACTORY_ABI,
        functionName: "createVersus",
        args: [params, referrer],
        chainId: KORUM_CHAIN.id,
        value: latestCost,
      });
      setTransactionHash(hash);
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
    submittingRef.current = false;
    setIsSubmitting(false);
  }

  function handleCampName(side: "a" | "b", value: string) {
    if (side === "a") {
      setCampAName(value);
      if (!campASymbolEdited) setCampASymbol(symbolFromName(value));
      return;
    }
    setCampBName(value);
    if (!campBSymbolEdited) setCampBSymbol(symbolFromName(value));
  }

  function handleImageFile(side: "a" | "b", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      setFileError("Choose a PNG, JPEG, WebP, or GIF image under 5 MB.");
      event.target.value = "";
      return;
    }
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (side === "a") setCampAPreview(result);
      else setCampBPreview(result);
    };
    reader.readAsDataURL(file);
  }

  const transactionPending = isSubmitting || isWalletPromptOpen || isConfirming || Boolean(transactionHash && !receipt && !receiptError);
  const configLoading = isLoadingConfigCount || isLoadingConfig;
  const costsLoading = isLoadingCostA || isLoadingCostB;
  const explorerUrl = transactionHash
    ? `${KORUM_CHAIN.blockExplorers.default.url}/tx/${transactionHash}`
    : null;

  let publishLabel = "Publish Versus";
  if (!isConnected || !authenticated) publishLabel = authenticating ? "Authenticating…" : "Connect wallet to publish";
  else if (chainId !== KORUM_CHAIN.id) publishLabel = `Switch to ${KORUM_CHAIN.name}`;
  else if (isSwitchingChain) publishLabel = "Switching network…";
  else if (isSubmitting) publishLabel = "Preparing transaction…";
  else if (isWalletPromptOpen) publishLabel = "Confirm in your wallet…";
  else if (isConfirming) publishLabel = "Publishing…";

  return (
    <div className={classes.page}>
      <section className={classes.hero}>
        <div className="wrap">
          <span className="vs-hero-badge">Create a Versus</span>
          <h1>Create your Versus. Make it viral. Earn.</h1>
          <p>Every Versus launches two opposing tokens. You fund their initial position and earn a share of the fees generated by trading.</p>
          <div className={classes.networkBadge}>
            <span aria-hidden="true" /> {KORUM_CHAIN.name} · Contract deployed
          </div>
        </div>
      </section>

      <section className={classes.content}>
        <div className="wrap">
          <div className={classes.layout}>
            <form className={classes.form} onSubmit={handleSubmit} noValidate>
              {pendingReferral ? (
                <div className={classes.referralNotice} data-app="pending-referral">
                  <span aria-hidden="true">✓</span>
                  <div><strong>Referral ready</strong><small>Code {pendingReferral.referralCode} will be submitted to the contract with this creation.</small></div>
                </div>
              ) : null}

              <p className={classes.sectionTitle}>1. The debate</p>
              <div className={classes.field}>
                <label htmlFor="versus-title">Debate title</label>
                <input id="versus-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Pizza forever, or burgers forever?" />
                <small className={classes.counter}>{title.length}/120</small>
              </div>
              <div className={classes.field}>
                <label htmlFor="versus-description">Description <span>(optional, up to 280 characters)</span></label>
                <textarea id="versus-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={280} placeholder="Explain the debate in a few sentences and make people want to pick a side…" />
                <small className={classes.counter}>{description.length}/280</small>
              </div>
              <div className={classes.field}>
                <label htmlFor="versus-category">Category</label>
                <select id="versus-category" value={category} onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}>
                  {CATEGORIES.map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>

              <p className={classes.sectionTitle}>2. The two tokens</p>
              <p className={classes.sectionNote}>Each side becomes a token when published. The local image is used for the preview; its public URI is stored on-chain.</p>
              <div className={classes.tokenRow}>
                <div className={classes.tokenCard}>
                  <label className={classes.uploadSquare}>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleImageFile("a", event)} />
                    {campAImage ? <span className={classes.imagePreview} style={{ backgroundImage: backgroundImage(campAImage) }} /> : <span className={classes.uploadPlaceholder}><ImageIcon /><span>Side A image</span><small>Local preview</small></span>}
                  </label>
                  <div className={classes.field}>
                    <label htmlFor="camp-a-name">Name · Option A</label>
                    <input id="camp-a-name" value={campAName} onChange={(event) => handleCampName("a", event.target.value)} maxLength={40} placeholder="Pizza" />
                  </div>
                  <div className={classes.field}>
                    <label htmlFor="camp-a-symbol">Symbol <span>(auto-generated)</span></label>
                    <div className={classes.tickerInput}><span>$</span><input id="camp-a-symbol" value={campASymbol} onChange={(event) => { setCampASymbolEdited(true); setCampASymbol(sanitizeSymbol(event.target.value)); }} maxLength={10} placeholder="PIZZA" /></div>
                  </div>
                  <div className={classes.field}>
                    <label htmlFor="camp-a-uri">Public image URI</label>
                    <input id="camp-a-uri" type="url" value={campAUri} onChange={(event) => setCampAUri(event.target.value)} maxLength={512} placeholder="ipfs://… or https://…" />
                  </div>
                </div>

                <div className={classes.tokenVs}><span><BoltIcon /></span></div>

                <div className={classes.tokenCard}>
                  <label className={classes.uploadSquare}>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleImageFile("b", event)} />
                    {campBImage ? <span className={classes.imagePreview} style={{ backgroundImage: backgroundImage(campBImage) }} /> : <span className={classes.uploadPlaceholder}><ImageIcon /><span>Side B image</span><small>Local preview</small></span>}
                  </label>
                  <div className={classes.field}>
                    <label htmlFor="camp-b-name">Name · Option B</label>
                    <input id="camp-b-name" value={campBName} onChange={(event) => handleCampName("b", event.target.value)} maxLength={40} placeholder="Burger" />
                  </div>
                  <div className={classes.field}>
                    <label htmlFor="camp-b-symbol">Symbol <span>(auto-generated)</span></label>
                    <div className={classes.tickerInput}><span>$</span><input id="camp-b-symbol" value={campBSymbol} onChange={(event) => { setCampBSymbolEdited(true); setCampBSymbol(sanitizeSymbol(event.target.value)); }} maxLength={10} placeholder="BURGER" /></div>
                  </div>
                  <div className={classes.field}>
                    <label htmlFor="camp-b-uri">Public image URI</label>
                    <input id="camp-b-uri" type="url" value={campBUri} onChange={(event) => setCampBUri(event.target.value)} maxLength={512} placeholder="ipfs://… or https://…" />
                  </div>
                </div>
              </div>
              {fileError ? <p className={classes.inlineError}>{fileError}</p> : null}
              <div className={classes.infoNote}><InfoIcon /><span>Supply from configuration #{configId || "…"}: <strong>{formatTokenAmount(config?.totalSupply)} tokens</strong> per side. Data and costs are read directly from the contracts.</span></div>

              <p className={classes.sectionTitle}>3. Required initial purchase</p>
              <p className={classes.sectionNote}>Choose between {(minBuyBps / 100).toLocaleString("en-US")}% and {(maxBuyBps / 100).toLocaleString("en-US")}% of each side’s supply. Purchased tokens will be sent to the publishing wallet.</p>
              <div className={classes.buyGrid}>
                <div className={classes.buyColumn}>
                  <label htmlFor="camp-a-buy">Initial purchase ${campASymbol || "A"} <strong>{(effectiveCreatorBuyBpsA / 100).toLocaleString("en-US")}%</strong></label>
                  <input id="camp-a-buy" type="range" min={minBuyBps} max={maxBuyBps} step={10} value={effectiveCreatorBuyBpsA} onChange={(event) => setCreatorBuyBpsA(Number(event.target.value))} />
                  <div><span>{formatTokenAmount(tokenAmountA)} tokens</span><strong>{formatEth(initialBuyCostA)}</strong></div>
                </div>
                <div className={classes.buyColumn}>
                  <label htmlFor="camp-b-buy">Initial purchase ${campBSymbol || "B"} <strong>{(effectiveCreatorBuyBpsB / 100).toLocaleString("en-US")}%</strong></label>
                  <input id="camp-b-buy" type="range" min={minBuyBps} max={maxBuyBps} step={10} value={effectiveCreatorBuyBpsB} onChange={(event) => setCreatorBuyBpsB(Number(event.target.value))} />
                  <div><span>{formatTokenAmount(tokenAmountB)} tokens</span><strong>{formatEth(initialBuyCostB)}</strong></div>
                </div>
              </div>

              <p className={classes.sectionTitle}>4. Visibility & profile</p>
              <div className={classes.visibilityRow}>
                <span>Visibility</span><strong><span aria-hidden="true" /> Public</strong>
              </div>
              <p className={classes.publicWarning}>Versus titles, metadata, and transactions are public on the blockchain.</p>
              <div className={classes.field}>
                <label htmlFor="versus-x">Versus X account <span>(optional)</span></label>
                <div className={classes.tickerInput}><span>@</span><input id="versus-x" value={xHandle} onChange={(event) => setXHandle(event.target.value)} maxLength={16} placeholder="pizzavsburger" /></div>
              </div>
              <div className={classes.viralGuide}>
                <strong>Bring your Versus account to life</strong>
                <p>Publish content that pits both sides against each other, alternate which side you highlight, and share the Versus link to turn reactions into participants.</p>
              </div>

              <p className={classes.sectionTitle}>5. Publish</p>
              <label className={classes.terms}>
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>I accept the <Link href="/terms" target="_blank">Terms of Use</Link> and confirm that this Versus follows Korum’s rules.</span>
              </label>

              {configCountError || configError ? <p className={classes.inlineError}>Unable to read the contract configuration. Check access to the Robinhood Testnet RPC.</p> : null}
              <div className={classes.costRow}><span>Launch fee · config #{configId || "…"}</span><strong>{configLoading ? "…" : formatEth(config?.launchFeeWei)}</strong></div>
              <div className={classes.costRow}><span>Initial purchases · both sides</span><strong>{costsLoading ? "…" : formatEth(initialBuyTotal)}</strong></div>
              <div className={`${classes.costRow} ${classes.costTotal}`}><span>Estimated total</span><strong>{formatEth(estimatedTotalCost)}</strong></div>
              {insufficientBalance ? <p className={classes.inlineError}>The connected wallet does not have enough ETH on Robinhood Testnet for this launch.</p> : null}
              {submitError || receiptError ? <p className={classes.submitError} role="alert">{submitError || errorMessage(receiptError)}</p> : null}

              {transactionHash ? (
                <div className={`${classes.transactionStatus} ${receipt?.status === "success" ? classes.success : ""} ${receipt?.status === "reverted" ? classes.reverted : ""}`} aria-live="polite">
                  <span>{receipt?.status === "success" ? "✓" : receipt?.status === "reverted" ? "!" : "↗"}</span>
                  <div>
                    <strong>{receipt?.status === "success" ? `Versus${createdVersusId ? ` #${createdVersusId}` : ""} created` : receipt?.status === "reverted" ? "Transaction reverted on-chain" : "Transaction submitted"}</strong>
                    <p>{receipt?.status === "success" ? "Goldsky will now project the events into Railway." : receipt?.status === "reverted" ? "No Versus was created, and the referral remains available for another attempt." : "Waiting for on-chain confirmation."}</p>
                    {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction ↗</a> : null}
                  </div>
                </div>
              ) : null}

              <div className={classes.actions}>
                <button type="button" className={classes.previewButton} onClick={() => setPreviewOpen(true)}>Preview</button>
                <button type="submit" className={classes.publishButton} disabled={transactionPending || isSwitchingChain || authenticating || (isConnected && authenticated && chainId === KORUM_CHAIN.id && Boolean(formIssue || insufficientBalance || configLoading || costsLoading))}>
                  {publishLabel}
                </button>
              </div>
              {isConnected && authenticated && chainId === KORUM_CHAIN.id && formIssue && !submitError ? <p className={classes.formHint}>{formIssue}</p> : null}
            </form>
          </div>
        </div>
      </section>

      {previewOpen ? (
        <div className={classes.modalOverlay} onMouseDown={(event) => { if (event.currentTarget === event.target) setPreviewOpen(false); }}>
          <section className={classes.modal} role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <button type="button" className={classes.modalClose} onClick={() => setPreviewOpen(false)} aria-label="Close preview">×</button>
            <p className={classes.previewLabel}>Preview</p>
            <div className={classes.previewCard}>
              <span className={classes.previewCategory}>{category}</span>
              <div className={classes.previewImages}>
                <span style={campAImage ? { backgroundImage: backgroundImage(campAImage) } : undefined}>{!campAImage ? (campASymbol || "A") : null}</span>
                <i><BoltIcon /></i>
                <span style={campBImage ? { backgroundImage: backgroundImage(campBImage) } : undefined}>{!campBImage ? (campBSymbol || "B") : null}</span>
              </div>
              <h2 id="preview-title">{title.trim() || `${campAName || "Side A"} vs ${campBName || "Side B"}`}</h2>
              <div className={classes.previewTokens}><strong>${campASymbol || "A"}</strong><span>VS</span><strong>${campBSymbol || "B"}</strong></div>
              <div className={classes.previewMeter}><span /><span /></div>
              {description ? <p>{description}</p> : null}
              <small>Two tokens will be created in a single transaction.</small>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
