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
const MAINNET_ENABLED = process.env.NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED === "true" || process.env.NEXT_PUBLIC_V56_MAINNET_ENABLED === "true";
const MAINNET_CANARY_CREATOR = process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS?.trim().toLowerCase() ?? "";
const MAINNET_CANARY_ONLY = /^0x[0-9a-f]{40}$/.test(MAINNET_CANARY_CREATOR);

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
  const [networkKey, setNetworkKey] = useState<RobinhoodNetworkKey>("mainnet");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🧊");
  const [artwork, setArtwork] = useState<ArtworkState>(null);
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [socialOpen, setSocialOpen] = useState(false);
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
  const canaryWalletMatches = networkKey !== "mainnet" || !MAINNET_CANARY_ONLY || walletAccount.toLowerCase() === MAINNET_CANARY_CREATOR;

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
      setStatus(`${network.name} factory is not deployed/configured yet. Deploy and verify the paused V56 factory before minting is enabled.`);
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
      if (networkKey === "mainnet" && MAINNET_CANARY_ONLY && connected.account.toLowerCase() !== MAINNET_CANARY_CREATOR) {
        throw new Error(`The first mainnet launch is restricted to ${compactAddress(MAINNET_CANARY_CREATOR)}.`);
      }
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

  const activeStepIndex = steps.indexOf(step);

  return (
    <section className={`lx-launchpad ${compact ? "compact" : ""}`}>
      <header className="lx-launch-head">
        <div>
          <span className="lx-launch-kicker"><Rocket size={13} /> CREATE ON LEVERAGE X</span>
          <h2>Launch Token</h2>
          <p>Create a real Robinhood Chain token. Coin details and artwork become permanent after launch.</p>
        </div>
        <span className="lx-launch-network"><i />{network.name}</span>
      </header>

      {initialDraft && (
        <div className="lx-launch-import">
          <RadioTower size={15} />
          <span>Draft imported from X Launch Feed. Review every field before signing.</span>
          <button type="button" onClick={onClearDraft} aria-label="Clear launch draft"><X size={14} /></button>
        </div>
      )}

      <nav className="lx-launch-progress" aria-label="Token launch progress">
        {steps.map((item, index) => (
          <button
            key={item}
            type="button"
            className={`${step === item ? "active" : ""} ${index < activeStepIndex ? "complete" : ""}`}
            onClick={() => index <= activeStepIndex && setStep(item)}
          >
            <span>{index < activeStepIndex ? <Check size={12} /> : index + 1}</span>
            <b>{item === "identity" ? "Coin details" : item === "funding" ? "Launch setup" : "Review"}</b>
          </button>
        ))}
      </nav>

      <div className="lx-launch-body">
        {step === "identity" && (
          <div className="lx-launch-create-grid">
            <div className="lx-launch-form-column">
              <section className="lx-launch-section lx-launch-details">
                <header>
                  <div><strong>Coin details</strong><small>Choose carefully—these cannot be changed once the coin is created.</small></div>
                  <span>{[name, ticker, description, artwork].filter(Boolean).length}/4</span>
                </header>

                <div className="lx-launch-field-pair">
                  <label>
                    <span>Coin name <small>{name.length}/64</small></span>
                    <input value={name} maxLength={64} onChange={(event) => { setName(event.target.value); resetPrepared(); }} placeholder="Name your coin" />
                  </label>
                  <label>
                    <span>Ticker <small>{ticker.length}/12</small></span>
                    <div className="lx-launch-ticker-input"><b>$</b><input value={ticker} maxLength={12} onChange={(event) => { setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); resetPrepared(); }} placeholder="SYMBOL" /></div>
                  </label>
                </div>

                <label>
                  <span>Description <small>{description.length}/1000</small></span>
                  <textarea value={description} maxLength={1000} onChange={(event) => { setDescription(event.target.value); resetPrepared(); }} placeholder="Tell traders what this token and community are about." />
                </label>

                <button type="button" className={`lx-launch-social-toggle ${socialOpen ? "open" : ""}`} onClick={() => setSocialOpen((open) => !open)}>
                  <span><ExternalLink size={14} /><b>Add social links</b><small>Optional</small></span>
                  <ArrowRight size={14} />
                </button>

                {socialOpen && (
                  <div className="lx-launch-social-fields">
                    <label><span>Website</span><input value={website} onChange={(event) => { setWebsite(event.target.value); resetPrepared(); }} placeholder="https://yourcoin.com" /></label>
                    <label><span>X</span><input value={xHandle} onChange={(event) => { setXHandle(event.target.value); resetPrepared(); }} placeholder="https://x.com/handle" /></label>
                    <label><span>Telegram</span><input value={telegram} onChange={(event) => { setTelegram(event.target.value); resetPrepared(); }} placeholder="https://t.me/community" /></label>
                  </div>
                )}

                {ogPreview.exact && <div className="lx-launch-warning"><AlertTriangle size={15} /><span>Exact or near-exact identity already exists: <b>${ogPreview.exact.symbol}</b>.</span></div>}
                {!ogPreview.exact && ogPreview.near && <div className="lx-launch-warning"><ImagePlus size={15} /><span>Artwork is <b>{ogPreview.near.similarity.toFixed(1)}%</b> similar to ${ogPreview.near.token.symbol}.</span></div>}
              </section>

              <section className="lx-launch-section lx-launch-permanence">
                <LockKeyhole size={16} />
                <span><strong>Permanent token data</strong><small>Name, ticker, artwork, description, and social links are committed with the launch metadata.</small></span>
              </section>
            </div>

            <aside className="lx-launch-media-column">
              <section className="lx-launch-section lx-launch-media">
                <header>
                  <div><strong>Token artwork</strong><small>Square artwork is recommended. GIFs remain animated.</small></div>
                  <span>MAX 4 MB</span>
                </header>

                <label className={`lx-launch-dropzone ${artwork ? "has-art" : ""}`}>
                  {artwork ? (
                    <img src={artwork.imageDataUrl} alt={`${ticker || "Token"} artwork preview`} />
                  ) : (
                    <span><ImagePlus size={28} /><strong>Select an image or GIF</strong><small>PNG, JPG, WEBP, GIF, or AVIF</small></span>
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy} onChange={(event) => void readArtwork(event.target.files?.[0])} />
                  <em><Upload size={13} />{busy ? "Processing…" : artwork ? "Replace artwork" : "Upload artwork"}</em>
                </label>

                <div className="lx-launch-emoji-row" aria-label="Artwork placeholders">
                  <small>Quick placeholders</small>
                  <div>{EMOJIS.map((item) => <button key={item} type="button" className={emoji === item ? "active" : ""} onClick={() => { setEmoji(item); resetPrepared(); }}>{item}</button>)}</div>
                </div>
              </section>

              <section className="lx-launch-preview">
                <small>LIVE PREVIEW</small>
                <div className="lx-launch-preview-art">{artwork ? <img src={artwork.imageDataUrl} alt="Coin preview" /> : <b>{emoji}</b>}</div>
                <div>
                  <strong>{name.trim() || "Your coin"}</strong>
                  <span>${ticker || "SYMBOL"}</span>
                  <p>{description.trim() || "A preview of how the coin will appear across Leverage X."}</p>
                </div>
                <footer><span><i />Robinhood Chain</span><b>1B supply</b></footer>
              </section>
            </aside>
          </div>
        )}

        {step === "funding" && (
          <div className="lx-launch-setup-grid">
            <section className="lx-launch-section lx-launch-economics">
              <header><div><strong>Launch economics</strong><small>The creator’s total launch spend includes network gas.</small></div><Fuel size={18} /></header>
              <div className="lx-launch-metric-list">
                <span><small>Total wallet cap</small><b>{totalBudgetEth().toFixed(3)} ETH</b></span>
                <span><small>Maximum gas cost</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "Calculated before signing"}</b></span>
                <span><small>Creator token purchase</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "Budget minus gas"}</b></span>
                <span><small>Free creator allocation</small><b>0 tokens</b></span>
                <span><small>Fixed token supply</small><b>1,000,000,000</b></span>
                <span><small>Opening FDV</small><b>0.25 ETH</b></span>
              </div>
              <div className="lx-launch-callout"><Coins size={16} /><span><strong>0.001 ETH means 0.001 ETH total.</strong><small>Gas is reserved first; the remainder becomes the creator’s opening curve purchase.</small></span></div>
            </section>

            <section className="lx-launch-section lx-launch-chain-setup">
              <header><div><strong>Chain and market setup</strong><small>Review the production network before connecting.</small></div><ShieldCheck size={18} /></header>
              <label><span>Network</span><select value={networkKey} onChange={(event) => { setNetworkKey(event.target.value as RobinhoodNetworkKey); resetPrepared(); }}>
                <option value="mainnet" disabled={!MAINNET_ENABLED}>Robinhood Chain Mainnet · 4663 {MAINNET_ENABLED ? MAINNET_CANARY_ONLY ? "(canary only)" : "" : "(deployment locked)"}</option>
              </select></label>
              <label><span>Migration target</span><select value={migrationTargetMarketCapUsd} onChange={(event) => { setMigrationTargetMarketCapUsd(Number(event.target.value)); resetPrepared(); }}>
                {[30_000, 45_000, 69_000, 100_000].map((value) => <option key={value} value={value}>${value.toLocaleString("en-US")} market cap</option>)}
              </select></label>
              <div className="lx-launch-chain-status">
                <span><small>Factory</small><b className={factoryReady ? "ready" : "locked"}>{factoryReady ? compactAddress(network.factoryAddress) : "Not deployed"}</b></span>
                <span><small>Wallet</small><b>{walletAccount ? compactAddress(walletAccount) : "Not connected"}</b></span>
                <span><small>Deployment mode</small><b>Closed canary</b></span>
              </div>
              <KeyButton type="button" tone="ghost" disabled={busy} onClick={() => void connectWallet()}><Wallet size={14} />{walletAccount ? "Reconnect wallet" : "Connect wallet"}</KeyButton>
              {!factoryReady && <div className="lx-launch-warning"><AlertTriangle size={15} /><span>The mainnet factory must be deployed and configured before token creation can be signed.</span></div>}
              {networkKey === "mainnet" && MAINNET_CANARY_ONLY && <div className={`lx-launch-warning ${canaryWalletMatches ? "ready" : ""}`}><ShieldCheck size={15} /><span>Canary creator only: <b>{compactAddress(MAINNET_CANARY_CREATOR)}</b>{walletAccount ? canaryWalletMatches ? " · wallet matched" : " · switch wallets" : ""}</span></div>}
            </section>
          </div>
        )}

        {step === "review" && (
          <div className="lx-launch-review-grid">
            <section className="lx-launch-section lx-launch-final-preview">
              <header><div><strong>Review token</strong><small>This is the final identity that will be submitted.</small></div><OgBadge token={{ slug: "preview", name, symbol: ticker, emoji, hue: 48, cap: 0, price: 0, change24h: 0, graduation: 0, longs: 50, volume24h: 0, openInterest: 0, funding: 0, launchedMinutesAgo: 0, description, ogStatus: ogPreview.exact ? "copy" : "og", firstSeenSlug: ogPreview.exact?.slug }} /></header>
              <div className="lx-launch-final-token">
                <div>{artwork ? <img src={artwork.imageDataUrl} alt="Final token artwork" /> : emoji}</div>
                <span><strong>{name}</strong><b>${ticker}</b><small>{description}</small></span>
              </div>
              <div className="lx-launch-review-links">
                {website && <span>Website <b>{website}</b></span>}
                {xHandle && <span>X <b>{xHandle}</b></span>}
                {telegram && <span>Telegram <b>{telegram}</b></span>}
                {!website && !xHandle && !telegram && <span>No optional social links added.</span>}
              </div>
            </section>

            <section className="lx-launch-section lx-launch-signing-review">
              <header><div><strong>Signing review</strong><small>Verify every destination and limit before approving your wallet.</small></div><ShieldCheck size={18} /></header>
              <div className="lx-launch-metric-list compact">
                <span><small>Wallet</small><b>{compactAddress(walletAccount)}</b></span>
                <span><small>Total launch cap</small><b>0.001 ETH</b></span>
                <span><small>Maximum gas</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "—"}</b></span>
                <span><small>Creator purchase</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "—"}</b></span>
                <span><small>Factory</small><b>{compactAddress(network.factoryAddress)}</b></span>
                <span><small>Metadata</small><b>{prepared ? "Prepared" : "Not prepared"}</b></span>
              </div>
              <div className="lx-launch-checks">
                <span><Check size={14} />One billion tokens minted once</span>
                <span><Check size={14} />Entire supply begins in the market contract</span>
                <span><Check size={14} />Creator receives purchased tokens only</span>
                <span><Check size={14} />Creator wallet cannot trade perps on its token</span>
                <span><LockKeyhole size={14} />No server-held creator private key</span>
                <span><ShieldCheck size={14} />Only verified receipts enter the registry</span>
              </div>
            </section>

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

      <footer className="lx-launch-footer">
        <div className="lx-launch-status">{busy && <LoaderCircle size={13} className="v54-spin" />}<span>{status}</span></div>
        <div>
          {step !== "identity" && <KeyButton type="button" tone="ghost" compact disabled={busy} onClick={() => setStep(step === "review" ? "funding" : "identity")}><ArrowLeft size={13} />Back</KeyButton>}
          {step === "identity" && <KeyButton type="button" tone="green" compact disabled={!identityReady || busy} onClick={() => setStep("funding")}>Continue <ArrowRight size={13} /></KeyButton>}
          {step === "funding" && <KeyButton type="button" tone="green" compact disabled={!identityReady || !factoryReady || busy} onClick={() => void prepareLaunch()}>{busy ? "Preparing…" : "Prepare launch"} <ArrowRight size={13} /></KeyButton>}
          {step === "review" && !receipt && <KeyButton type="button" tone="green" compact disabled={!prepared || !budget || busy} onClick={() => void submitLaunch()}><Rocket size={13} />{busy ? "Confirming…" : "Launch token"}</KeyButton>}
          {step === "review" && receipt && !registrySaved && <KeyButton type="button" tone="green" compact disabled={busy} onClick={() => void retryRegistry()}><ShieldCheck size={13} />{busy ? "Verifying…" : "Retry registry"}</KeyButton>}
        </div>
      </footer>
    </section>
  );
}
