"use client";

/* eslint-disable @next/next/no-img-element -- token artwork preview uses the selected local file. */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  ExternalLink,
  Fuel,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  RadioTower,
  Rocket,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fingerprintImageFile, hammingSimilarity, tokenIdentityParts } from "@/lib/og";
import {
  ROBINHOOD_NETWORKS,
  creatorBuyEthFromBudget,
  ensureRobinhoodNetwork,
  formatEthWei,
  launchV54Market,
  quoteV54LaunchBudget,
  toMetadataHash,
  totalBudgetEth,
  type RobinhoodNetworkKey,
  type V54LaunchBudget,
  type V54LaunchReceipt,
} from "@/lib/chain/robinhood-v54";
import type { XLaunchDraft } from "@/lib/x-launch-feed";
import { KeyButton } from "./KeyButton";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";

const EMOJIS = ["🧊", "🐸", "🐕", "🗿", "🛸", "🦎", "🥷", "🦉"];
const MAINNET_ENABLED = (process.env.NEXT_PUBLIC_V55_MAINNET_ENABLED ?? process.env.NEXT_PUBLIC_V54_MAINNET_ENABLED) === "true";

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

type LaunchStep = "identity" | "funding" | "review";

function compactAddress(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
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
  const { tokens } = useMarkets();
  const [step, setStep] = useState<LaunchStep>("identity");
  const [networkKey, setNetworkKey] = useState<RobinhoodNetworkKey>("testnet");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🧊");
  const [artwork, setArtwork] = useState<ArtworkState>(null);
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [migrationTargetMarketCapUsd, setMigrationTargetMarketCapUsd] = useState(45_000);
  const [status, setStatus] = useState("Connect an EVM wallet and prepare the first real Robinhood Chain launch.");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMetadata | null>(null);
  const [budget, setBudget] = useState<V54LaunchBudget | null>(null);
  const [walletAccount, setWalletAccount] = useState("");
  const [receipt, setReceipt] = useState<V54LaunchReceipt | null>(null);
  const [registrySaved, setRegistrySaved] = useState(false);
  const appliedDraftRef = useRef("");

  const network = ROBINHOOD_NETWORKS[networkKey];
  const factoryReady = /^0x[0-9a-fA-F]{40}$/.test(network.factoryAddress);

  useEffect(() => {
    if (!initialDraft || appliedDraftRef.current === initialDraft.sourcePostId + initialDraft.ticker) return;
    appliedDraftRef.current = initialDraft.sourcePostId + initialDraft.ticker;
    setName(initialDraft.name);
    setTicker(initialDraft.ticker.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
    setDescription(initialDraft.description);
    setWebsite(initialDraft.website);
    setXHandle(initialDraft.xHandle);
    setPrepared(null);
    setBudget(null);
    setStatus(`Drafted from @${initialDraft.xHandle.replace(/^@/, "")} · confirm the artwork and identity before preparing the real transaction.`);
  }, [initialDraft]);

  const resetPrepared = () => {
    setPrepared(null);
    setBudget(null);
    setReceipt(null);
    setRegistrySaved(false);
  };

  const ogPreview = useMemo(() => {
    const identity = tokenIdentityParts({
      name,
      symbol: ticker,
      emoji,
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
  }, [artwork, emoji, name, ticker, tokens]);

  const identityReady = name.trim().length >= 2
    && /^[A-Z0-9]{1,12}$/.test(ticker)
    && description.trim().length >= 4
    && Boolean(artwork);

  const readArtwork = async (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type)) {
      setStatus("Artwork must be PNG, JPG, WEBP, GIF, or AVIF.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("Real launch artwork must be 4 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const fingerprint = await fingerprintImageFile(file);
      setArtwork({ file, ...fingerprint, filename: file.name });
      resetPrepared();
      setStatus(file.type === "image/gif" ? "Animated GIF ready for token metadata." : "Artwork fingerprinted and ready for metadata upload.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const prepareLaunch = async () => {
    if (!identityReady || !artwork) {
      setStatus("Add a valid name, ticker, description, and artwork first.");
      return;
    }
    if (!factoryReady) {
      setStatus(`${network.name} factory is not deployed/configured yet. V55 must deploy the factory before minting is enabled.`);
      return;
    }
    setBusy(true);
    try {
      setStatus("Uploading immutable launch metadata to Supabase Storage…");
      const form = new FormData();
      form.set("name", name.trim());
      form.set("symbol", ticker);
      form.set("description", description.trim());
      form.set("website", website.trim());
      form.set("xHandle", xHandle.trim());
      form.set("telegram", telegram.trim());
      form.set("imageExactHash", artwork.imageExactHash);
      form.set("image", artwork.file);
      const metadataResponse = await fetch("/api/v55/metadata", { method: "POST", body: form });
      const metadataPayload = await metadataResponse.json() as PreparedMetadata & { error?: string };
      if (!metadataResponse.ok) throw new Error(metadataPayload.error || "Metadata upload failed.");
      const metadata = {
        launchId: metadataPayload.launchId,
        imageUrl: metadataPayload.imageUrl,
        metadataUri: metadataPayload.metadataUri,
        metadataHash: metadataPayload.metadataHash,
      };
      setPrepared(metadata);
      setStatus("Requesting wallet access and calculating a gas-capped 0.001 ETH launch…");
      const input = {
        name: name.trim(),
        symbol: ticker,
        metadataURI: metadata.metadataUri,
        metadataHash: toMetadataHash(metadata.metadataHash),
        migrationTargetMarketCapUsd,
      };
      const quote = await quoteV54LaunchBudget(input, networkKey);
      setBudget(quote.budget);
      setWalletAccount(quote.account);
      setStep("review");
      setStatus("Launch prepared. Review the exact wallet, gas ceiling, creator buy, and factory before signing.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The launch could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  const connectWallet = async () => {
    setBusy(true);
    try {
      const connected = await ensureRobinhoodNetwork(networkKey);
      setWalletAccount(connected.account);
      setStatus(`${compactAddress(connected.account)} connected to ${connected.network.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  };

  const registerConfirmedLaunch = async (launched: V54LaunchReceipt) => {
    if (!prepared) throw new Error("Launch metadata is unavailable for registry verification.");
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
        name: name.trim(),
        symbol: ticker,
        description: description.trim(),
        metadataUri: prepared.metadataUri,
        metadataHash: prepared.metadataHash,
        imageUrl: prepared.imageUrl,
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
    if (!receipt) return;
    setBusy(true);
    try {
      setStatus("Re-verifying the confirmed on-chain launch and restoring the public registry record…");
      await registerConfirmedLaunch(receipt);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Registry verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitLaunch = async () => {
    if (!prepared || !budget) {
      await prepareLaunch();
      return;
    }
    setBusy(true);
    try {
      setStatus("Confirm the capped launch transaction in your wallet. No server private key is used.");
      const launched = await launchV54Market({
        name: name.trim(),
        symbol: ticker,
        metadataURI: prepared.metadataUri,
        metadataHash: toMetadataHash(prepared.metadataHash),
        migrationTargetMarketCapUsd,
      }, networkKey);
      setReceipt(launched);
      setWalletAccount(launched.account);
      setStatus("Transaction confirmed. Verifying and registering the real token launch…");
      await registerConfirmedLaunch(launched);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The launch failed.");
    } finally {
      setBusy(false);
    }
  };

  const steps: LaunchStep[] = ["identity", "funding", "review"];

  return (
    <section className={`v41-launchpad ${compact ? "compact" : ""}`}>
      <header className="v41-launchpad-head">
        <div>
          <span className="eyebrow"><Rocket size={13} /> LEVERAGE X V55 REAL ROBINHOOD CHAIN LAUNCH</span>
          <h2>Mint a real one-billion-supply memecoin.</h2>
          <p>Connected-wallet deployment, public ERC-20 transfers, real bonding-curve spot trading, and no free creator allocation.</p>
        </div>
        <span className="v41-test-badge">{network.name.toUpperCase()}</span>
      </header>

      {initialDraft && (
        <div className="terminal-launch-source">
          <RadioTower size={16} />
          <span>Draft imported from X Launch Feed. The creator must verify every field.</span>
          <button type="button" onClick={onClearDraft} aria-label="Clear launch draft"><X size={14} /></button>
        </div>
      )}

      <nav className="v41-launch-steps" aria-label="Launch steps">
        {steps.map((item, index) => (
          <button key={item} type="button" className={step === item ? "active" : ""} onClick={() => index <= steps.indexOf(step) && setStep(item)}>
            <span>{index + 1}</span>{item}
          </button>
        ))}
      </nav>

      <div className="v41-launch-body">
        {step === "identity" && (
          <div className="v41-launch-grid identity">
            <article className="v41-art-picker">
              <span>Token artwork <small>required · max 4 MB</small></span>
              <div className="v41-art-preview">
                {artwork ? <img src={artwork.imageDataUrl} alt={`${ticker || "Token"} artwork preview`} /> : <b>{emoji}</b>}
              </div>
              <label className="v41-upload-button">
                <Upload size={14} /> {busy ? "PROCESSING…" : artwork ? "REPLACE ARTWORK" : "UPLOAD ARTWORK"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy} onChange={(event) => void readArtwork(event.target.files?.[0])} />
              </label>
              <div className="v41-emoji-row">
                {EMOJIS.map((item) => <button key={item} type="button" className={emoji === item ? "active" : ""} onClick={() => { setEmoji(item); resetPrepared(); }}>{item}</button>)}
              </div>
            </article>

            <div className="v41-fields">
              <label><span>Name <small>2–64 characters</small></span><input value={name} maxLength={64} onChange={(event) => { setName(event.target.value); resetPrepared(); }} placeholder="Robinhood Rocket" /></label>
              <label><span>Ticker <small>1–12 letters/numbers</small></span><input value={ticker} maxLength={12} onChange={(event) => { setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); resetPrepared(); }} placeholder="ROCKET" /></label>
              <label><span>Description <small>stored in public metadata</small></span><textarea value={description} maxLength={1000} onChange={(event) => { setDescription(event.target.value); resetPrepared(); }} placeholder="What is this token and community about?" /></label>
              <div className="v41-field-pair three">
                <label><span>Website</span><input value={website} onChange={(event) => { setWebsite(event.target.value); resetPrepared(); }} placeholder="https://" /></label>
                <label><span>X</span><input value={xHandle} onChange={(event) => { setXHandle(event.target.value); resetPrepared(); }} placeholder="@handle" /></label>
                <label><span>Telegram</span><input value={telegram} onChange={(event) => { setTelegram(event.target.value); resetPrepared(); }} placeholder="t.me/" /></label>
              </div>
              {ogPreview.exact && <div className="v41-near-match"><AlertTriangle size={15} /> Exact or near-exact identity already exists: ${ogPreview.exact.symbol}.</div>}
              {!ogPreview.exact && ogPreview.near && <div className="v41-near-match"><ImagePlus size={15} /> Artwork is {ogPreview.near.similarity.toFixed(1)}% similar to ${ogPreview.near.token.symbol}.</div>}
            </div>
          </div>
        )}

        {step === "funding" && (
          <div className="v41-funding-layout">
            <article className="v41-budget-card">
              <header><Fuel size={21} /><span><strong>Fixed launch budget</strong><small>Gas + creator purchase combined</small></span></header>
              <div className="v41-budget-breakdown">
                <span><Coins size={15} /><small>Total wallet budget</small><b>{totalBudgetEth().toFixed(3)} ETH</b></span>
                <span><Fuel size={15} /><small>Maximum gas cost</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "estimated before signing"}</b></span>
                <span><Wallet size={15} /><small>Creator curve purchase</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "budget minus max gas"}</b></span>
              </div>
              <p className="v54-launch-note">The wallet transaction is capped so gas plus the creator purchase cannot exceed 0.001 ETH under the submitted gas settings.</p>
            </article>

            <article className="v41-migration-card">
              <header><ShieldCheck size={21} /><span><strong>Network and factory</strong><small>Testnet first; mainnet stays locked</small></span></header>
              <label><span>Network</span><select value={networkKey} onChange={(event) => { setNetworkKey(event.target.value as RobinhoodNetworkKey); resetPrepared(); }}>
                <option value="testnet">Robinhood Chain Testnet · 46630</option>
                <option value="mainnet" disabled={!MAINNET_ENABLED}>Robinhood Chain Mainnet · 4663 {MAINNET_ENABLED ? "" : "(locked)"}</option>
              </select></label>
              <label><span>Migration target display</span><select value={migrationTargetMarketCapUsd} onChange={(event) => { setMigrationTargetMarketCapUsd(Number(event.target.value)); resetPrepared(); }}>
                {[30_000, 45_000, 69_000, 100_000].map((value) => <option key={value} value={value}>${value.toLocaleString("en-US")}</option>)}
              </select></label>
              <div className="v41-migration-estimate">
                <span><small>Factory</small><b>{factoryReady ? compactAddress(network.factoryAddress) : "NOT DEPLOYED"}</b></span>
                <span><small>Fixed supply</small><b>1,000,000,000</b></span>
                <span><small>Creator free allocation</small><b>0</b></span>
                <span><small>Opening FDV</small><b>0.25 ETH</b></span>
              </div>
            </article>
          </div>
        )}

        {step === "review" && (
          <div className="v41-review-layout">
            <article className="v41-review-token">
              <div className="v41-review-art">{artwork ? <img src={artwork.imageDataUrl} alt="Token artwork" /> : emoji}</div>
              <span><strong>{name} <b>${ticker}</b></strong><small>{description}</small><small>{network.name}</small></span>
              <OgBadge token={{ slug: "preview", name, symbol: ticker, emoji, hue: 48, cap: 0, price: 0, change24h: 0, graduation: 0, longs: 50, volume24h: 0, openInterest: 0, funding: 0, launchedMinutesAgo: 0, description, ogStatus: ogPreview.exact ? "copy" : "og", firstSeenSlug: ogPreview.exact?.slug }} />
            </article>
            <div className="v41-review-ledger">
              <span><small>Wallet</small><b>{compactAddress(walletAccount)}</b></span>
              <span><small>Total cap</small><b>0.001 ETH</b></span>
              <span><small>Maximum gas</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "—"}</b></span>
              <span><small>Creator buy</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "—"}</b></span>
              <span><small>Factory</small><b>{compactAddress(network.factoryAddress)}</b></span>
              <span><small>Metadata</small><b>{prepared ? "UPLOADED" : "NOT PREPARED"}</b></span>
            </div>
            <article className="v41-launch-rules">
              <span><Check size={15} /> One billion tokens minted once</span>
              <span><Check size={15} /> Entire supply begins in the market contract</span>
              <span><Check size={15} /> Creator only receives purchased tokens</span>
              <span><Check size={15} /> Creator address permanently perps-restricted</span>
              <span><LockKeyhole size={15} /> No server-held creator private key</span>
              <span><ShieldCheck size={15} /> Registry accepts only verified receipts</span>
            </article>
            {receipt && (
              <article className="v54-launch-receipt">
                <strong>{registrySaved ? "Real token confirmed and indexed" : "Token confirmed on-chain · registry pending"}</strong>
                <span>Token <a href={receipt.explorerTokenUrl} target="_blank" rel="noreferrer">{receipt.tokenAddress} <ExternalLink size={12} /></a></span>
                <span>Market <a href={receipt.explorerMarketUrl} target="_blank" rel="noreferrer">{receipt.marketAddress} <ExternalLink size={12} /></a></span>
                <span>Transaction <a href={receipt.explorerTransactionUrl} target="_blank" rel="noreferrer">{receipt.transactionHash} <ExternalLink size={12} /></a></span>
              </article>
            )}
          </div>
        )}
      </div>

      <footer className="v41-launch-footer">
        <div className="terminal-launch-status">{busy && <LoaderCircle size={13} className="v54-spin" />} {status}</div>
        <div>
          {step !== "identity" && <KeyButton type="button" tone="ghost" compact disabled={busy} onClick={() => setStep(step === "review" ? "funding" : "identity")}><ArrowLeft size={13} /> BACK</KeyButton>}
          {step === "identity" && <KeyButton type="button" tone="green" compact disabled={!identityReady || busy} onClick={() => setStep("funding")}>FUNDING <ArrowRight size={13} /></KeyButton>}
          {step === "funding" && (
            <>
              <KeyButton type="button" tone="ghost" compact disabled={busy} onClick={() => void connectWallet()}><Wallet size={13} /> CONNECT</KeyButton>
              <KeyButton type="button" tone="green" compact disabled={!identityReady || !factoryReady || busy} onClick={() => void prepareLaunch()}>{busy ? "PREPARING…" : "PREPARE REAL LAUNCH"} <ArrowRight size={13} /></KeyButton>
            </>
          )}
          {step === "review" && !receipt && <KeyButton type="button" tone="green" compact disabled={!prepared || !budget || busy} onClick={() => void submitLaunch()}><Rocket size={13} /> {busy ? "CONFIRMING…" : "MINT ON ROBINHOOD CHAIN"}</KeyButton>}
          {step === "review" && receipt && !registrySaved && <KeyButton type="button" tone="green" compact disabled={busy} onClick={() => void retryRegistry()}><ShieldCheck size={13} /> {busy ? "VERIFYING…" : "RETRY REGISTRY VERIFY"}</KeyButton>}
        </div>
      </footer>
    </section>
  );
}
