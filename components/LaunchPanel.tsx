"use client";

/* eslint-disable @next/next/no-img-element -- local token artwork previews use a browser object/data URL. */

import {
  AlertTriangle,
  AtSign,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe2,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Upload,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { fingerprintImageFile, hammingSimilarity, tokenIdentityParts } from "@/lib/og";
import { ROBINHOOD_NETWORKS, creatorBuyEthFromBudget, formatEthWei, toMetadataHash } from "@/lib/chain/robinhood-v54";
import {
  launchV65Token,
  quoteV65LaunchBudget,
  type V65LaunchBudget,
  type V65LaunchReceipt,
} from "@/lib/chain/robinhood-v65";
import type { XLaunchDraft } from "@/lib/x-launch-feed";
import { KeyButton } from "./KeyButton";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";

const NETWORK_KEY = "mainnet" as const;
const AUTO_DESCRIPTION = "Launched on Leverage X.";
const MIN_TOTAL_LAUNCH_SPEND_ETH = 0.001;
const CANARY_MAX_TOTAL_LAUNCH_SPEND_ETH = 0.01;
const MAINNET_ENABLED = process.env.NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED === "true" || process.env.NEXT_PUBLIC_V56_MAINNET_ENABLED === "true";
const MAINNET_CANARY_CREATOR = process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS?.trim().toLowerCase() ?? "";
const MAINNET_CANARY_ONLY = /^0x[0-9a-f]{40}$/.test(MAINNET_CANARY_CREATOR);

const ALLOWED_ARTWORK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
const BUY_PRESETS = ["0.001", "0.005", "0.01"];

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

function compactAddress(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
}

function normalizeTicker(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function validHttpUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [artwork, setArtwork] = useState<ArtworkState>(null);
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [status, setStatus] = useState("Add a name, ticker, and image to launch.");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMetadata | null>(null);
  const [budget, setBudget] = useState<V65LaunchBudget | null>(null);
  const [walletAccount, setWalletAccount] = useState("");
  const [receipt, setReceipt] = useState<V65LaunchReceipt | null>(null);
  const [registrySaved, setRegistrySaved] = useState(false);
  const [buyPopupOpen, setBuyPopupOpen] = useState(false);
  const [launchSpendEth, setLaunchSpendEth] = useState("0.001");
  const appliedDraftRef = useRef("");

  const network = ROBINHOOD_NETWORKS[NETWORK_KEY];
  const factoryReady = /^0x[0-9a-fA-F]{40}$/.test(network.factoryAddress);
  const activeWallet = walletAccount || walletAddress || "";
  const canaryWalletMatches = !MAINNET_CANARY_ONLY || activeWallet.toLowerCase() === MAINNET_CANARY_CREATOR;
  const cleanName = name.trim();
  const cleanTicker = normalizeTicker(ticker);
  const canonicalDescription = description.trim() || AUTO_DESCRIPTION;
  const nameValid = cleanName.length >= 2 && cleanName.length <= 64;
  const tickerValid = /^[A-Z0-9]{1,12}$/.test(cleanTicker);
  const socialsValid = validHttpUrl(website);
  const formReady = connected && Boolean(activeWallet) && nameValid && tickerValid && Boolean(artwork) && socialsValid;
  const launchReady = formReady && factoryReady && MAINNET_ENABLED && canaryWalletMatches;
  const numericSpend = Number(launchSpendEth);
  const spendValid = Number.isFinite(numericSpend)
    && numericSpend >= MIN_TOTAL_LAUNCH_SPEND_ETH
    && numericSpend <= CANARY_MAX_TOTAL_LAUNCH_SPEND_ETH;

  useEffect(() => {
    if (walletAddress) setWalletAccount(walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (!initialDraft || appliedDraftRef.current === initialDraft.sourcePostId + initialDraft.ticker) return;
    appliedDraftRef.current = initialDraft.sourcePostId + initialDraft.ticker;
    setName(initialDraft.name.trim().slice(0, 64));
    setTicker(normalizeTicker(initialDraft.ticker));
    setDescription(initialDraft.description.trim().slice(0, 1_000));
    setWebsite(initialDraft.website.trim());
    setXHandle(initialDraft.xHandle.trim());
    setSocialsOpen(Boolean(initialDraft.website || initialDraft.xHandle));
    setStatus("X draft loaded. Add or confirm the image, name, and ticker.");
  }, [initialDraft]);

  useEffect(() => {
    if (!buyPopupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setBuyPopupOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buyPopupOpen, busy]);

  const resetPrepared = () => {
    setPrepared(null);
    setBudget(null);
    setReceipt(null);
    setRegistrySaved(false);
  };

  const updateName = (value: string) => {
    setName(value.slice(0, 64));
    resetPrepared();
  };

  const updateTicker = (value: string) => {
    setTicker(normalizeTicker(value));
    resetPrepared();
  };

  const ogPreview = useMemo(() => {
    if (!artwork || !nameValid || !tickerValid) return { exact: undefined, near: undefined };
    const identity = tokenIdentityParts({
      name: cleanName,
      symbol: cleanTicker,
      emoji: "",
      imageExactHash: artwork.imageExactHash,
      imagePerceptualHash: artwork.imagePerceptualHash,
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
  }, [artwork, cleanName, cleanTicker, nameValid, tickerValid, tokens]);

  const readArtwork = async (file?: File) => {
    if (!file) return;
    if (!ALLOWED_ARTWORK_TYPES.includes(file.type)) {
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
      setArtwork({ file, ...fingerprint, filename: file.name });
      resetPrepared();
      setStatus(`${file.type === "image/gif" ? "Animated GIF" : "Artwork"} attached. ${nameValid && tickerValid ? "Ready to launch." : "Add a valid name and ticker."}`);
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

  const uploadMetadataAndQuote = async (totalSpendEth: string) => {
    if (!artwork) throw new Error("Add token artwork first.");
    setStatus("Uploading artwork and calculating the creator buy…");
    const form = new FormData();
    form.set("name", cleanName);
    form.set("symbol", cleanTicker);
    form.set("description", canonicalDescription);
    form.set("website", website.trim());
    form.set("xHandle", xHandle.trim());
    form.set("telegram", telegram.trim());
    form.set("imageExactHash", artwork.imageExactHash);
    form.set("image", artwork.file);
    const metadataResponse = await fetch("/api/v65/metadata", { method: "POST", body: form });
    const metadataPayload = await metadataResponse.json() as PreparedMetadata & { error?: string };
    if (!metadataResponse.ok) throw new Error(metadataPayload.error || "Metadata upload failed.");
    const metadata: PreparedMetadata = {
      launchId: metadataPayload.launchId,
      imageUrl: metadataPayload.imageUrl,
      metadataUri: metadataPayload.metadataUri,
      metadataHash: metadataPayload.metadataHash,
    };
    const quote = await quoteV65LaunchBudget({
      name: cleanName,
      symbol: cleanTicker,
      metadataURI: metadata.metadataUri,
      metadataHash: toMetadataHash(metadata.metadataHash),
    }, NETWORK_KEY, undefined, totalSpendEth);
    setPrepared(metadata);
    setBudget(quote.budget);
    setWalletAccount(quote.account);
    return { metadata, quotedBudget: quote.budget, account: quote.account };
  };

  const registerConfirmedLaunch = async (launched: V65LaunchReceipt, metadataOverride?: PreparedMetadata) => {
    const metadata = metadataOverride ?? prepared;
    if (!metadata) throw new Error("Launch metadata is unavailable for registry verification.");
    const registryResponse = await fetch("/api/v65/launches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chainId: launched.chainId,
        network: launched.network,
        factoryAddress: launched.factoryAddress,
        poolAddress: launched.poolAddress,
        tokenAddress: launched.tokenAddress,
        creatorAddress: launched.creatorAddress,
        transactionHash: launched.transactionHash,
        blockNumber: launched.blockNumber,
        name: cleanName,
        symbol: cleanTicker,
        description: canonicalDescription,
        metadataUri: metadata.metadataUri,
        metadataHash: metadata.metadataHash,
        imageUrl: metadata.imageUrl,
        website: website.trim(),
        xHandle: xHandle.trim(),
        telegram: telegram.trim(),
        dexFactory: launched.dexFactory,
        pairToken: launched.pairToken,
        positionManager: launched.positionManager,
        liquidityLocker: launched.liquidityLocker,
        launchPositionId: launched.launchPositionId.toString(),
        poolFee: launched.poolFee,
        tokenIsToken0: launched.tokenIsToken0,
        creatorBuyWei: launched.creatorBuyWei.toString(),
        creatorTokensOutWad: launched.creatorTokensOutWad.toString(),
        marketCapEthWad: launched.marketCapEthWad.toString(),
        targetFdvEthWad: launched.targetFdvEthWad.toString(),
      }),
    });
    const registryPayload = await registryResponse.json() as { error?: string };
    if (!registryResponse.ok) throw new Error(registryPayload.error || "The on-chain launch confirmed, but registry verification failed.");
    setRegistrySaved(true);
    window.dispatchEvent(new CustomEvent("leveragex:v65-launch-confirmed", { detail: { tokenAddress: launched.tokenAddress } }));
    setStatus(`REAL TOKEN CONFIRMED · ${cleanTicker} minted at ${launched.tokenAddress}`);
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

  const openBuyPopup = () => {
    if (!connected) {
      toggleWallet();
      setStatus("Connect your wallet to launch a token.");
      return;
    }
    if (!formReady) {
      if (!artwork) setStatus("Attach a token image or GIF.");
      else if (!nameValid) setStatus("Token name must be 2–64 characters.");
      else if (!tickerValid) setStatus("Ticker must use 1–12 letters or numbers.");
      else if (!socialsValid) setStatus("Website must be a valid HTTP or HTTPS URL.");
      return;
    }
    setBuyPopupOpen(true);
    setStatus("Choose the total launch spend. Gas is included; the remainder buys your token.");
  };

  const submitLaunch = async () => {
    if (!formReady || !artwork) {
      setStatus("A connected wallet, token name, ticker, and image are required.");
      return;
    }
    if (!spendValid) {
      setStatus(`Launch spend must be between ${MIN_TOTAL_LAUNCH_SPEND_ETH.toFixed(3)} and ${CANARY_MAX_TOTAL_LAUNCH_SPEND_ETH.toFixed(2)} ETH during canary.`);
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
      const launchMetadata = prepared ?? (await uploadMetadataAndQuote(launchSpendEth)).metadata;
      setStatus("Confirm the launch transaction in your wallet.");
      const launched = await launchV65Token({
        name: cleanName,
        symbol: cleanTicker,
        metadataURI: launchMetadata.metadataUri,
        metadataHash: toMetadataHash(launchMetadata.metadataHash),
      }, NETWORK_KEY, undefined, launchSpendEth);
      setReceipt(launched);
      setWalletAccount(launched.account);
      setBuyPopupOpen(false);
      setStatus("Transaction confirmed. Registering the real token…");
      await registerConfirmedLaunch(launched, launchMetadata);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The launch failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`lx-launchpad lx-creator-launchpad ${compact ? "compact" : ""}`}>
      <header className="lx-launch-head lx-creator-launch-head">
        <div>
          <span className="lx-launch-kicker"><Zap size={13} /> LEVERAGE X LAUNCHPAD</span>
          <h2>Launch Token</h2>
          <p>Name it, add the ticker and artwork, then launch in seconds.</p>
        </div>
        <span className="lx-launch-network"><i />Robinhood Chain</span>
      </header>

      {initialDraft && (
        <div className="lx-launch-import">
          <AtSign size={15} />
          <span>X launch draft loaded. Check the details and attach artwork.</span>
          <button type="button" onClick={onClearDraft} aria-label="Clear launch draft"><X size={14} /></button>
        </div>
      )}

      <div className="lx-launch-body lx-creator-launch-body">
        {!receipt ? (
          <div className="lx-creator-launch-form">
            <section className="lx-creator-media-block">
              <label
                className={`lx-launch-dropzone lx-creator-dropzone ${artwork ? "has-image" : ""} ${dragging ? "dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={handleDrop}
              >
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(event) => void readArtwork(event.target.files?.[0])} />
                {artwork
                  ? <img src={artwork.imageDataUrl} alt="Selected token artwork" />
                  : <span><ImagePlus size={32} /><strong>Drop photo or GIF here</strong><small>or click to choose · required</small></span>}
                <em><Upload size={13} />{busy ? "Processing…" : artwork ? "Replace image" : "Choose image"}</em>
              </label>
            </section>

            <section className="lx-creator-fields">
              <div className="lx-creator-identity-row">
                <label>
                  <span>Token name <b>Required</b></span>
                  <input value={name} onChange={(event) => updateName(event.target.value)} maxLength={64} placeholder="Name your coin" autoComplete="off" />
                  {name.length > 0 && !nameValid && <small>Use 2–64 characters.</small>}
                </label>
                <label>
                  <span>Ticker <b>Required</b></span>
                  <div className="lx-ticker-input"><i>$</i><input value={ticker} onChange={(event) => updateTicker(event.target.value)} maxLength={12} placeholder="TICKER" autoCapitalize="characters" autoComplete="off" /></div>
                  {ticker.length > 0 && !tickerValid && <small>Letters and numbers only.</small>}
                </label>
              </div>

              <label className="lx-creator-description">
                <span>Description <b>Optional</b></span>
                <textarea value={description} onChange={(event) => { setDescription(event.target.value.slice(0, 1_000)); resetPrepared(); }} placeholder="Tell people what the meme is about" maxLength={1_000} />
                <small>{description.length}/1000</small>
              </label>

              <button type="button" className={`lx-socials-toggle ${socialsOpen ? "open" : ""}`} onClick={() => setSocialsOpen((open) => !open)}>
                <span><Globe2 size={15} /><b>Add social links</b><small>Optional · can’t be changed after launch</small></span>
                {socialsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {socialsOpen && (
                <div className="lx-creator-socials">
                  <label><span><Globe2 size={13} />Website</span><input value={website} onChange={(event) => { setWebsite(event.target.value); resetPrepared(); }} placeholder="https://yourcoin.com" /></label>
                  <label><span><AtSign size={13} />X / Twitter</span><input value={xHandle} onChange={(event) => { setXHandle(event.target.value); resetPrepared(); }} placeholder="https://x.com/yourcoin or @handle" /></label>
                  <label><span><MessageCircle size={13} />Telegram</span><input value={telegram} onChange={(event) => { setTelegram(event.target.value); resetPrepared(); }} placeholder="https://t.me/yourcoin" /></label>
                  {!socialsValid && <small className="lx-field-error">Website must begin with http:// or https://</small>}
                </div>
              )}
            </section>

            <section className="lx-creator-preview-strip">
              <div className="lx-creator-mini-preview">
                <div>{artwork ? <img src={artwork.imageDataUrl} alt="Token preview" /> : <ImagePlus size={20} />}</div>
                <span><small>PREVIEW</small><strong>{cleanName || "Your token"}</strong><b>{cleanTicker ? `$${cleanTicker}` : "$TICKER"}</b></span>
                {artwork && nameValid && tickerValid && <OgBadge token={{ slug: "preview", name: cleanName, symbol: cleanTicker, emoji: "", hue: 48, cap: 0, price: 0, change24h: 0, graduation: 0, longs: 50, volume24h: 0, openInterest: 0, funding: 0, launchedMinutesAgo: 0, description: canonicalDescription, ogStatus: ogPreview.exact ? "copy" : "og", firstSeenSlug: ogPreview.exact?.slug }} />}
              </div>
              <div className="lx-creator-fixed-facts">
                <span><small>Supply</small><b>1B</b></span>
                <span><small>Creator freebies</small><b>0</b></span>
                <span><small>GMGN-ready pool</small><b>From launch</b></span>
              </div>
            </section>

            {!factoryReady && <div className="lx-launch-warning lx-creator-warning"><AlertTriangle size={15} /><span>V65 mainnet factory is not deployed yet. You can finish the coin setup, but signing stays locked until the verified factory address is configured.</span></div>}
            {MAINNET_CANARY_ONLY && !canaryWalletMatches && <div className="lx-launch-warning lx-creator-warning"><ShieldCheck size={15} /><span>The first launch is restricted to <b>{compactAddress(MAINNET_CANARY_CREATOR)}</b>.</span></div>}
          </div>
        ) : (
          <section className="lx-launch-success">
            <div className="lx-launch-success-mark"><Check size={25} /></div>
            <span>{registrySaved ? "TOKEN LIVE" : "CONFIRMED ON-CHAIN"}</span>
            <h3>{cleanName}</h3>
            <b>${cleanTicker}</b>
            <p>{registrySaved ? "The canonical Uniswap V3 pool is registered and ready for external discovery." : "The chain transaction confirmed. Registry verification is still pending."}</p>
            <div>
              <a href={receipt.explorerTokenUrl} target="_blank" rel="noreferrer">Token <ExternalLink size={12} /></a>
              <a href={receipt.explorerMarketUrl} target="_blank" rel="noreferrer">Market <ExternalLink size={12} /></a>
              <a href={receipt.explorerTransactionUrl} target="_blank" rel="noreferrer">Transaction <ExternalLink size={12} /></a>
            </div>
          </section>
        )}
      </div>

      <footer className="lx-launch-footer lx-creator-launch-footer">
        <div className="lx-launch-status">{busy && <LoaderCircle size={13} className="v54-spin" />}<span>{status}</span></div>
        <div>
          {!receipt && <KeyButton type="button" tone="green" compact className={`lx-creator-launch-button ${formReady ? "ready" : ""}`} disabled={!formReady || busy} onClick={openBuyPopup}><Rocket size={13} />Launch token</KeyButton>}
          {receipt && !registrySaved && <KeyButton type="button" tone="green" compact disabled={busy} onClick={() => void retryRegistry()}><ShieldCheck size={13} />{busy ? "Verifying…" : "Retry registry"}</KeyButton>}
        </div>
      </footer>

      {buyPopupOpen && (
        <div className="lx-initial-buy-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setBuyPopupOpen(false); }}>
          <section className="lx-initial-buy-modal" role="dialog" aria-modal="true" aria-labelledby="lx-initial-buy-title">
            <header>
              <div className="lx-initial-buy-token">{artwork && <img src={artwork.imageDataUrl} alt="" />}</div>
              <span><small>FINAL STEP</small><h3 id="lx-initial-buy-title">Choose your initial buy</h3><b>{cleanName} · ${cleanTicker}</b></span>
              <button type="button" onClick={() => setBuyPopupOpen(false)} disabled={busy} aria-label="Close initial buy"><X size={16} /></button>
            </header>

            <div className="lx-initial-buy-content">
              <label>
                <span>Total launch spend</span>
                <div className="lx-initial-buy-input"><input value={launchSpendEth} inputMode="decimal" onChange={(event) => { setLaunchSpendEth(event.target.value.replace(/[^0-9.]/g, "")); setBudget(null); }} aria-describedby="lx-buy-helper" /><b>ETH</b></div>
              </label>
              <div className="lx-initial-buy-presets">{BUY_PRESETS.map((preset) => <button type="button" key={preset} className={launchSpendEth === preset ? "active" : ""} onClick={() => { setLaunchSpendEth(preset); setBudget(null); }}>{preset} ETH</button>)}</div>
              <p id="lx-buy-helper">This amount includes network gas. Whatever remains after the live gas reserve becomes your creator buy. Minimum total spend is 0.001 ETH.</p>

              <div className="lx-initial-buy-breakdown">
                <span><small>Total wallet cap</small><b>{spendValid ? `${numericSpend.toFixed(numericSpend < .01 ? 3 : 2)} ETH` : "—"}</b></span>
                <span><small>Estimated creator buy</small><b>{budget ? `${creatorBuyEthFromBudget(budget).toFixed(6)} ETH` : "Calculated live"}</b></span>
                <span><small>Maximum gas reserve</small><b>{budget ? formatEthWei(budget.maximumGasCostWei) : "Calculated live"}</b></span>
                <span><small>Live market</small><b>Uniswap V3 · instant</b></span>
              </div>

              {!spendValid && <div className="lx-initial-buy-error"><AlertTriangle size={14} />Enter 0.001–0.01 ETH for the controlled first launch.</div>}
              <div className="lx-initial-buy-security"><LockKeyhole size={14} /><span>Your wallet signs the real Robinhood Chain transaction locally. Leverage X never receives your private key.</span></div>
            </div>

            <footer>
              <button type="button" onClick={() => setBuyPopupOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className={launchReady && spendValid ? "ready" : ""} disabled={!launchReady || !spendValid || busy} onClick={() => void submitLaunch()}><Rocket size={14} />{busy ? "Preparing…" : "Confirm & launch"}</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
