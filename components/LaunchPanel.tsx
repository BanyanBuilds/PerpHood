"use client";

/* eslint-disable @next/next/no-img-element -- token artwork preview uses the selected local file. */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  RadioTower,
  Rocket,
  ShieldCheck,
  Upload,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { LAUNCHPAD_TARGET_MARKET_CAP_USD } from "@/lib/launchpad";
import { fingerprintImageFile, hammingSimilarity, tokenIdentityParts } from "@/lib/og";
import {
  ROBINHOOD_NETWORKS,
  creatorBuyEthFromBudget,
  formatEthWei,
  launchV54Market,
  quoteV54LaunchBudget,
  toMetadataHash,
  totalBudgetEth,
  type V54LaunchBudget,
  type V54LaunchReceipt,
} from "@/lib/chain/robinhood-v54";
import type { XLaunchDraft } from "@/lib/x-launch-feed";
import { KeyButton } from "./KeyButton";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";

const NETWORK_KEY = "mainnet" as const;
const AUTO_DESCRIPTION = "Launched on Leverage X.";
const MAINNET_ENABLED = process.env.NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED === "true" || process.env.NEXT_PUBLIC_V56_MAINNET_ENABLED === "true";
const MAINNET_CANARY_CREATOR = process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS?.trim().toLowerCase() ?? "";
const MAINNET_CANARY_ONLY = /^0x[0-9a-f]{40}$/.test(MAINNET_CANARY_CREATOR);
const GENERIC_FILENAMES = new Set(["image", "img", "photo", "picture", "upload", "untitled", "token", "coin"]);

type ArtworkState = {
  file: File;
  imageDataUrl: string;
  imageExactHash: string;
  imagePerceptualHash: string;
  filename: string;
} | null;

type PreparedMetadata = {
  launchId: string;
  imageUrl: string;
  metadataUri: string;
  metadataHash: string;
};

type LaunchStep = "create" | "review";

function compactAddress(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function automaticIdentity(file: File, imageExactHash: string) {
  const rawBase = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
  const normalizedBase = rawBase.toLowerCase();
  const tag = imageExactHash.slice(0, 5).toUpperCase();
  const usableBase = rawBase.length >= 2 && !GENERIC_FILENAMES.has(normalizedBase);
  const name = usableBase ? titleCase(rawBase).slice(0, 64) : `Leverage X ${tag}`;
  const compact = rawBase.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const symbol = (usableBase && compact.length ? compact : `LX${tag}`).slice(0, 12);
  return { name, symbol, description: AUTO_DESCRIPTION };
}

export function LaunchPanel({
  compact = false,
  onComplete,
  initialDraft,
  onClearDraft,
}: {
  compact?: boolean;
  onComplete?: (slug: string) => void;
  initialDraft?: XLaunchDraft | null;
  onClearDraft?: () => void;
}) {
  const { tokens, connected, walletAddress, toggleWallet } = useMarkets();
  const [step, setStep] = useState<LaunchStep>("create");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState(AUTO_DESCRIPTION);
  const [artwork, setArtwork] = useState<ArtworkState>(null);
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [status, setStatus] = useState("Add one image or GIF. Leverage X handles the rest.");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMetadata | null>(null);
  const [budget, setBudget] = useState<V54LaunchBudget | null>(null);
  const [walletAccount, setWalletAccount] = useState("");
  const [receipt, setReceipt] = useState<V54LaunchReceipt | null>(null);
  const [registrySaved, setRegistrySaved] = useState(false);
  const appliedDraftRef = useRef("");

  const network = ROBINHOOD_NETWORKS[NETWORK_KEY];
  const factoryReady = /^0x[0-9a-fA-F]{40}$/.test(network.factoryAddress);
  const activeWallet = walletAccount || walletAddress || "";
  const canaryWalletMatches = !MAINNET_CANARY_ONLY || activeWallet.toLowerCase() === MAINNET_CANARY_CREATOR;
  const minimumReady = connected && Boolean(activeWallet) && Boolean(artwork);
  const launchReady = minimumReady && factoryReady && MAINNET_ENABLED && canaryWalletMatches;

  useEffect(() => {
    if (walletAddress) setWalletAccount(walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (!initialDraft || appliedDraftRef.current === initialDraft.sourcePostId + initialDraft.ticker) return;
    appliedDraftRef.current = initialDraft.sourcePostId + initialDraft.ticker;
    const draftName = initialDraft.name.trim().slice(0, 64);
    const draftTicker = initialDraft.ticker.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    setName(draftName.length >= 2 ? draftName : "");
    setTicker(draftTicker);
    setDescription(initialDraft.description.trim().slice(0, 1_000) || AUTO_DESCRIPTION);
    setWebsite(initialDraft.website);
    setXHandle(initialDraft.xHandle);
    setStatus(`X draft loaded. Add the artwork to continue; no other input is required.`);
  }, [initialDraft]);

  const resetPrepared = () => {
    setPrepared(null);
    setBudget(null);
    setReceipt(null);
    setRegistrySaved(false);
  };

  const ogPreview = useMemo(() => {
    const identity = tokenIdentityParts({
      name: name || "Leverage X Token",
      symbol: ticker || "LX",
      emoji: "⚡",
      imageExactHash: artwork?.imageExactHash,
      imagePerceptualHash: artwork?.imagePerceptualHash,
    });
    const exact = tokens.find((token) => {
      const prior = tokenIdentityParts(token);
      return prior.normalizedName === identity.normalizedName
        && prior.normalizedSymbol === identity.normalizedSymbol
        && (prior.imageExactHash === identity.imageExactHash
          || hammingSimilarity(prior.imagePerceptualHash, identity.imagePerceptualHash) >= 87.5);
    });
    const near = tokens
      .map((token) => ({ token, similarity: hammingSimilarity(tokenIdentityParts(token).imagePerceptualHash, identity.imagePerceptualHash) }))
      .filter((entry) => entry.similarity >= 87.5)
      .sort((a, b) => b.similarity - a.similarity)[0];
    return { exact, near };
  }, [artwork, name, ticker, tokens]);

  const readArtwork = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type)) {
      setStatus("Artwork must be PNG, JPG, WEBP, GIF, or AVIF.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("Artwork must be 4 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const fingerprint = await fingerprintImageFile(file);
      const generated = automaticIdentity(file, fingerprint.imageExactHash);
      setArtwork({ file, ...fingerprint, filename: file.name });
      if (!initialDraft) {
        setName(generated.name);
        setTicker(generated.symbol);
        setDescription(generated.description);
        setWebsite("");
        setXHandle("");
        setTelegram("");
      } else {
        setName((current) => current.trim().length >= 2 ? current : generated.name);
        setTicker((current) => /^[A-Z0-9]{1,12}$/.test(current) ? current : generated.symbol);
        setDescription((current) => current.trim().length >= 4 ? current : generated.description);
      }
      resetPrepared();
      setStatus(connected
        ? `${file.type === "image/gif" ? "Animated GIF" : "Artwork"} ready. Continue is unlocked.`
        : "Artwork ready. Connect your wallet to unlock Continue.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void readArtwork(event.dataTransfer.files?.[0]);
  };

  const uploadMetadataAndQuote = async () => {
    if (!artwork) throw new Error("Add token artwork first.");
    setStatus("Uploading artwork and preparing the 0.001 ETH launch…");
    const form = new FormData();
    form.set("name", name);
    form.set("symbol", ticker);
    form.set("description", description);
    form.set("website", website.trim());
    form.set("xHandle", xHandle.trim());
    form.set("telegram", telegram.trim());
    form.set("imageExactHash", artwork.imageExactHash);
    form.set("image", artwork.file);
    const metadataResponse = await fetch("/api/v55/metadata", { method: "POST", body: form });
    const metadataPayload = await metadataResponse.json() as PreparedMetadata & { error?: string };
    if (!metadataResponse.ok) throw new Error(metadataPayload.error || "Metadata upload failed.");
    const metadata: PreparedMetadata = {
      launchId: metadataPayload.launchId,
      imageUrl: metadataPayload.imageUrl,
      metadataUri: metadataPayload.metadataUri,
      metadataHash: metadataPayload.metadataHash,
    };
    const quote = await quoteV54LaunchBudget({
      name,
      symbol: ticker,
      metadataURI: metadata.metadataUri,
      metadataHash: toMetadataHash(metadata.metadataHash),
      migrationTargetMarketCapUsd: LAUNCHPAD_TARGET_MARKET_CAP_USD,
    }, NETWORK_KEY);
    setPrepared(metadata);
    setBudget(quote.budget);
    setWalletAccount(quote.account);
    return { metadata, quotedBudget: quote.budget, account: quote.account };
  };

  const registerConfirmedLaunch = async (launched: V54LaunchReceipt, metadataOverride?: PreparedMetadata) => {
    const metadata = metadataOverride ?? prepared;
    if (!metadata) throw new Error("Launch metadata is unavailable for registry verification.");
    const registryResponse = await fetch("/api/v55/launches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId: launched.chainId,
        network: launched.network,
        factoryAddress: launched.factoryAddress,
        marketAddress: launched.marketAddress,
        tokenAddress: launched.tokenAddress,
        creatorAddress: launched.creatorAddress,
        transactionHash: launched.transactionHash,
        blockNumber: launched.blockNumber,
        name,
        symbol: ticker,
        description,
        metadataUri: metadata.metadataUri,
        metadataHash: metadata.metadataHash,
        imageUrl: metadata.imageUrl,
        website: website.trim(),
        xHandle: xHandle.trim(),
        telegram: telegram.trim(),
        creatorBuyWei: launched.creatorBuyWei.toString(),
        creatorTokensOutWad: launched.creatorTokensOutWad.toString(),
        marketCapEthWad: launched.marketCapEthWad.toString(),
        migrationTargetUsdWad: launched.migrationTargetUsdWad.toString(),
      }),
    });
    const registryPayload = await registryResponse.json() as { error?: string };
    if (!registryResponse.ok) throw new Error(registryPayload.error || "The on-chain launch confirmed, but registry verification failed.");
    setRegistrySaved(true);
    window.dispatchEvent(new CustomEvent("leveragex:v55-launch-confirmed", { detail: { tokenAddress: launched.tokenAddress } }));
    setStatus(`REAL TOKEN CONFIRMED · ${ticker} minted at ${launched.tokenAddress}`);
    onComplete?.(launched.tokenAddress.toLowerCase());
  };

  const retryRegistry = async () => {
    if (!receipt || !prepared) return;
    setBusy(true);
    try {
      setStatus("Re-verifying the confirmed launch…");
      await registerConfirmedLaunch(receipt, prepared);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registry verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitLaunch = async () => {
    if (!minimumReady || !artwork) {
      setStatus("A connected wallet and token artwork are required.");
      return;
    }
    if (!MAINNET_ENABLED) {
      setStatus("Mainnet launch activation is still disabled.");
      return;
    }
    if (!factoryReady) {
      setStatus("The mainnet factory must be deployed and configured before launch signing is enabled.");
      return;
    }
    if (!canaryWalletMatches) {
      setStatus(`The first mainnet launch is restricted to ${compactAddress(MAINNET_CANARY_CREATOR)}.`);
      return;
    }
    setBusy(true);
    try {
      const launchMetadata = prepared ?? (await uploadMetadataAndQuote()).metadata;
      setStatus("Confirm the single capped launch transaction in your wallet.");
      const launched = await launchV54Market({
        name,
        symbol: ticker,
        metadataURI: launchMetadata.metadataUri,
        metadataHash: toMetadataHash(launchMetadata.metadataHash),
        migrationTargetMarketCapUsd: LAUNCHPAD_TARGET_MARKET_CAP_USD,
      }, NETWORK_KEY);
      setReceipt(launched);
      setWalletAccount(launched.account);
      setStatus("Transaction confirmed. Registering the real token…");
      await registerConfirmedLaunch(launched, launchMetadata);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The launch failed.");
    } finally {
      setBusy(false);
    }
  };

  const continueToReview = () => {
    if (!minimumReady) {
      setStatus(connected ? "Add an image or GIF to continue." : "Connect your wallet before continuing.");
      return;
    }
    setStep("review");
    setStatus("Ready. Review the auto-generated identity, then launch with one wallet confirmation.");
  };

  return (
    <section className={`lx-launchpad lx-fast-launchpad ${compact ? "compact" : ""}`}>
      <header className="lx-launch-head lx-fast-launch-head">
        <div>
          <span className="lx-launch-kicker"><Zap size={13} /> FAST LAUNCH</span>
          <h2>Launch Token</h2>
          <p>Connect wallet. Add artwork. Launch. Everything else is automatic.</p>
        </div>
        <span className="lx-launch-network"><i />Robinhood Chain</span>
      </header>

      {initialDraft && (
        <div className="lx-launch-import">
          <RadioTower size={15} />
          <span>X draft loaded. Artwork is still the only required token input.</span>
          <button type="button" onClick={onClearDraft} aria-label="Clear launch draft"><X size={14} /></button>
        </div>
      )}

      <nav className="lx-launch-progress lx-fast-launch-progress" aria-label="Token launch progress">
        <button type="button" className={step === "create" ? "active" : "complete"} onClick={() => setStep("create")}>
          <span>{step === "review" ? <Check size={12} /> : 1}</span><b>Artwork</b>
        </button>
        <button type="button" className={step === "review" ? "active" : ""} disabled={step !== "review"}>
          <span>2</span><b>Launch</b>
        </button>
      </nav>

      <div className="lx-launch-body lx-fast-launch-body">
        {step === "create" && (
          <div className="lx-fast-launch-create">
            <section className="lx-fast-upload-card">
              <header>
                <span><ImagePlus size={18} /><strong>Token artwork</strong></span>
                <small>Required · PNG, JPG, WEBP, GIF or AVIF · max 4 MB</small>
              </header>
              <label
                className={`lx-launch-dropzone lx-fast-dropzone ${artwork ? "has-image" : ""} ${dragging ? "dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={handleDrop}
              >
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(event) => void readArtwork(event.target.files?.[0])} />
                {artwork
                  ? <img src={artwork.imageDataUrl} alt="Selected token artwork" />
                  : <span><Upload size={30} /><strong>Drop image here or click to choose</strong><small>No image means no launch.</small></span>}
                <em><Upload size={13} />{busy ? "Processing…" : artwork ? "Replace artwork" : "Choose artwork"}</em>
              </label>
            </section>

            <aside className="lx-fast-launch-summary">
              <section className={`lx-fast-wallet-row ${connected ? "ready" : ""}`}>
                <Wallet size={17} />
                <span><small>Wallet</small><strong>{connected ? compactAddress(activeWallet) : "Not connected"}</strong></span>
                {connected ? <b><i />READY</b> : <button type="button" onClick={toggleWallet}>Connect</button>}
              </section>

              <section className={`lx-fast-auto-token ${artwork ? "ready" : ""}`}>
                <div>{artwork ? <img src={artwork.imageDataUrl} alt="Auto-generated token preview" /> : <ImagePlus size={24} />}</div>
                <span>
                  <small>AUTO-GENERATED IDENTITY</small>
                  <strong>{artwork ? name : "Waiting for artwork"}</strong>
                  <b>{artwork ? `$${ticker}` : "Name + ticker created automatically"}</b>
                </span>
                {artwork && <OgBadge token={{ slug: "preview", name, symbol: ticker, emoji: "⚡", hue: 48, cap: 0, price: 0, change24h: 0, graduation: 0, longs: 50, volume24h: 0, openInterest: 0, funding: 0, launchedMinutesAgo: 0, description, ogStatus: ogPreview.exact ? "copy" : "og", firstSeenSlug: ogPreview.exact?.slug }} />}
              </section>

              <section className="lx-fast-protocol-rules">
                <header><ShieldCheck size={15} /><strong>Fixed by Leverage X</strong></header>
                <span><small>Total launch spend</small><b>{totalBudgetEth().toFixed(3)} ETH incl. gas</b></span>
                <span><small>Token supply</small><b>1,000,000,000</b></span>
                <span><small>Migration target</small><b>${LAUNCHPAD_TARGET_MARKET_CAP_USD.toLocaleString("en-US")}</b></span>
                <span><small>Free creator tokens</small><b>0</b></span>
              </section>
            </aside>
          </div>
        )}

        {step === "review" && (
          <div className="lx-fast-launch-review">
            <section className="lx-fast-review-token">
              <div className="lx-fast-review-art">{artwork && <img src={artwork.imageDataUrl} alt="Token artwork" />}</div>
              <div className="lx-fast-review-copy">
                <span>READY TO CREATE</span>
                <h3>{name}</h3>
                <b>${ticker}</b>
                <p>Leverage X generated the token identity from the artwork. No description, ticker, social link, or migration setting was required.</p>
              </div>
            </section>

            <section className="lx-fast-review-ledger">
              <header><ShieldCheck size={16} /><strong>One-wallet launch</strong></header>
              <span><small>Connected wallet</small><b>{compactAddress(activeWallet)}</b></span>
              <span><small>Network</small><b>Robinhood Chain · 4663</b></span>
              <span><small>Total wallet cap</small><b>0.001 ETH including gas</b></span>
              <span><small>Creator purchase</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "Calculated when launched"}</b></span>
              <span><small>Maximum gas</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "Reserved automatically"}</b></span>
              <span><small>Migration</small><b>Protocol fixed · ${LAUNCHPAD_TARGET_MARKET_CAP_USD.toLocaleString("en-US")}</b></span>
              <div className="lx-fast-review-checks">
                <span><Check size={13} />One-billion fixed supply</span>
                <span><Check size={13} />No free creator allocation</span>
                <span><LockKeyhole size={13} />Wallet signs locally</span>
              </div>
            </section>

            {!factoryReady && <div className="lx-launch-warning lx-fast-launch-warning"><AlertTriangle size={15} /><span>The mainnet factory is not deployed yet. The launch button will unlock automatically after the verified factory address is configured.</span></div>}
            {MAINNET_CANARY_ONLY && !canaryWalletMatches && <div className="lx-launch-warning lx-fast-launch-warning"><ShieldCheck size={15} /><span>First launch is restricted to <b>{compactAddress(MAINNET_CANARY_CREATOR)}</b>.</span></div>}

            {receipt && (
              <section className="lx-launch-section lx-launch-receipt">
                <header><div><strong>{registrySaved ? "Token confirmed and indexed" : "Token confirmed on-chain"}</strong><small>{registrySaved ? "The market is now eligible for the live indexer." : "Registry verification is still pending."}</small></div><Check size={18} /></header>
                <span>Token <a href={receipt.explorerTokenUrl} target="_blank" rel="noreferrer">{receipt.tokenAddress} <ExternalLink size={12} /></a></span>
                <span>Market <a href={receipt.explorerMarketUrl} target="_blank" rel="noreferrer">{receipt.marketAddress} <ExternalLink size={12} /></a></span>
                <span>Transaction <a href={receipt.explorerTransactionUrl} target="_blank" rel="noreferrer">{receipt.transactionHash} <ExternalLink size={12} /></a></span>
              </section>
            )}
          </div>
        )}
      </div>

      <footer className="lx-launch-footer lx-fast-launch-footer">
        <div className="lx-launch-status">{busy && <LoaderCircle size={13} className="v54-spin" />}<span>{status}</span></div>
        <div>
          {step === "review" && <KeyButton type="button" tone="ghost" compact disabled={busy} onClick={() => setStep("create")}><ArrowLeft size={13} />Back</KeyButton>}
          {step === "create" && <KeyButton type="button" tone="green" compact className={`lx-fast-continue ${minimumReady ? "ready" : ""}`} disabled={!minimumReady || busy} onClick={continueToReview}>Continue <ArrowRight size={13} /></KeyButton>}
          {step === "review" && !receipt && <KeyButton type="button" tone="green" compact className={`lx-fast-launch-button ${launchReady ? "ready" : ""}`} disabled={!launchReady || busy} onClick={() => void submitLaunch()}><Rocket size={13} />{busy ? "Preparing…" : "Launch token"}</KeyButton>}
          {step === "review" && receipt && !registrySaved && <KeyButton type="button" tone="green" compact disabled={busy} onClick={() => void retryRegistry()}><ShieldCheck size={13} />{busy ? "Verifying…" : "Retry registry"}</KeyButton>}
        </div>
      </footer>
    </section>
  );
}
