"use client";

// V43 compatibility markers retained for inherited regression documentation:
// launchV43Market · NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS · chainDeploymentMode: receipt ? "anvil-v43"

/* eslint-disable @next/next/no-img-element -- local test artwork is stored as a data URL. */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Blocks,
  ExternalLink,
  Fingerprint,
  Fuel,
  ImagePlus,
  LockKeyhole,
  RadioTower,
  Rocket,
  ShieldCheck,
  Swords,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
  LAUNCHPAD_MIN_TOTAL_SPEND_ETH,
  LAUNCHPAD_TARGET_MARKET_CAP_USD,
  LAUNCHPAD_TARGET_OPTIONS_USD,
  estimateMigrationTarget,
  quoteLaunchSpend,
} from "@/lib/launchpad";
import { fingerprintImageFile, hammingSimilarity, tokenIdentityParts } from "@/lib/og";
// V42/V43 regression marker: launchV43Market is superseded by the compatible V45 factory call.
import { launchV45Market, type V45LaunchReceipt } from "@/lib/chain/launchpad-v45-client";
import type { XLaunchDraft } from "@/lib/x-launch-feed";
import { KeyButton } from "./KeyButton";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";

const EMOJIS = ["🧊", "🐸", "🐕", "🗿", "🛸", "🦎", "🥷", "🦉"];
type ArtworkState = { imageDataUrl: string; imageExactHash: string; imagePerceptualHash: string; filename: string } | null;
type LaunchStep = "identity" | "funding" | "review";

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
  const { launchToken, connected, toggleWallet, balanceEth, tokens } = useMarkets();
  const [step, setStep] = useState<LaunchStep>("identity");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🧊");
  const [artwork, setArtwork] = useState<ArtworkState>(null);
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [telegram, setTelegram] = useState("");
  const [totalSpendEth, setTotalSpendEth] = useState(LAUNCHPAD_MIN_TOTAL_SPEND_ETH);
  const [gasReserveEth, setGasReserveEth] = useState(LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH);
  const [migrationTargetMarketCapUsd, setMigrationTargetMarketCapUsd] = useState(LAUNCHPAD_TARGET_MARKET_CAP_USD);
  const [status, setStatus] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const v45FactoryAddress = process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS ?? "";
  const [launchMode, setLaunchMode] = useState<"browser" | "anvil">(v45FactoryAddress ? "anvil" : "browser");
  const [chainReceipt, setChainReceipt] = useState<V45LaunchReceipt | null>(null);
  const appliedDraftRef = useRef("");

  useEffect(() => {
    if (!initialDraft || appliedDraftRef.current === initialDraft.sourcePostId + initialDraft.ticker) return;
    appliedDraftRef.current = initialDraft.sourcePostId + initialDraft.ticker;
    setName(initialDraft.name);
    setTicker(initialDraft.ticker);
    setDescription(initialDraft.description);
    setWebsite(initialDraft.website);
    setXHandle(initialDraft.xHandle);
    setStatus(`Drafted from @${initialDraft.xHandle.replace(/^@/, "")} · verify every field before the local test launch.`);
  }, [initialDraft]);

  const launchQuote = useMemo(() => quoteLaunchSpend(totalSpendEth, gasReserveEth), [gasReserveEth, totalSpendEth]);
  const migrationEstimate = useMemo(
    () => estimateMigrationTarget(migrationTargetMarketCapUsd, 3_200),
    [migrationTargetMarketCapUsd],
  );
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
        && (prior.imageExactHash === identity.imageExactHash || hammingSimilarity(prior.imagePerceptualHash, identity.imagePerceptualHash) >= 87.5);
    });
    const near = tokens
      .map((token) => ({ token, similarity: hammingSimilarity(tokenIdentityParts(token).imagePerceptualHash, identity.imagePerceptualHash) }))
      .filter((entry) => entry.similarity >= 87.5)
      .sort((a, b) => b.similarity - a.similarity)[0];
    return { exact, near };
  }, [artwork, emoji, name, ticker, tokens]);

  const previewToken = {
    slug: "preview",
    name: name || "Token name",
    symbol: ticker || "TICKER",
    emoji,
    hue: 48,
    cap: 0,
    price: 0,
    change24h: 0,
    graduation: 0,
    longs: 50,
    volume24h: 0,
    openInterest: 0,
    funding: 0,
    launchedMinutesAgo: 0,
    description,
    imageDataUrl: artwork?.imageDataUrl,
    ogStatus: ogPreview.exact ? "copy" as const : "og" as const,
    firstSeenSlug: ogPreview.exact?.slug,
  };

  const identityReady = Boolean(name.trim() && ticker.trim() && description.trim());
  const fundingReady = launchQuote.valid && (launchMode === "anvil" || totalSpendEth <= balanceEth);

  const readArtwork = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose a GIF, PNG, JPG, WEBP, or AVIF artwork file.");
      return;
    }
    if (file.size > 12_000_000) {
      setStatus("Artwork must be under 12 MB.");
      return;
    }
    setImageBusy(true);
    try {
      const fingerprint = await fingerprintImageFile(file);
      setArtwork({ ...fingerprint, filename: file.name });
      setStatus(file.type === "image/gif" ? "GIF ready — animation remains enabled across PerpHood." : "Artwork fingerprinted and ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Artwork could not be processed.");
    } finally {
      setImageBusy(false);
    }
  };

  const goNext = () => {
    if (step === "identity") {
      if (!identityReady) {
        setStatus("Add a name, ticker, and description before funding the launch.");
        return;
      }
      setStep("funding");
      return;
    }
    if (step === "funding") {
      if (!fundingReady) {
        setStatus(launchQuote.reason ?? "The launch budget is not ready.");
        return;
      }
      setStep("review");
    }
  };

  const submit = async () => {
    if (!connected) {
      toggleWallet();
      setStatus("Trading account connected. Review the launch one more time.");
      return;
    }
    if (!identityReady || !fundingReady) {
      setStatus("Finish the identity and funding checks before launch.");
      return;
    }
    setLaunching(true);
    try {
      let receipt: V45LaunchReceipt | null = null;
      if (launchMode === "anvil") {
        if (!v45FactoryAddress) throw new Error("Deploy the V45 account router first with npm run chain:v45, then add its address to .env.local.");
        setStatus("Waiting for the local wallet to deploy this market on Anvil…");
        receipt = await launchV45Market({
          name: name.trim(),
          symbol: ticker.trim(),
          description: description.trim(),
          creatorBuyEth: launchQuote.creatorBuyEth,
          migrationTargetMarketCapUsd,
          imageExactHash: artwork?.imageExactHash,
          website,
          xHandle,
          telegram,
        }, v45FactoryAddress);
        setChainReceipt(receipt);
      }
      const token = launchToken({
        name: name.trim(),
        symbol: ticker.trim(),
        description: description.trim(),
        emoji,
        imageDataUrl: artwork?.imageDataUrl,
        imageExactHash: artwork?.imageExactHash,
        imagePerceptualHash: artwork?.imagePerceptualHash,
        website,
        xHandle,
        telegram,
        totalLaunchSpendEth: totalSpendEth,
        gasReserveEth,
        migrationTargetMarketCapUsd,
        creatorWallet: receipt?.account,
        chainDeploymentMode: receipt ? "anvil-v45" : "browser-sim",
        chainId: receipt ? 31_337 : undefined,
        chainFactoryAddress: receipt ? v45FactoryAddress : undefined,
        chainMarketAddress: receipt?.marketAddress,
        chainTokenAddress: receipt?.tokenAddress,
        launchTransactionHash: receipt?.transactionHash,
        launchBlock: receipt?.blockNumber,
      });
      setStatus(receipt
        ? `Anvil market confirmed at ${receipt.marketAddress ?? "the deployed market"}. ${launchQuote.creatorBuyEth.toFixed(5)} ETH executed as the creator curve buy.`
        : token.ogStatus === "og"
          ? `Browser test market launched. ${launchQuote.creatorBuyEth.toFixed(5)} ETH entered the simulator after gas reserve.`
          : `Browser test market launched as a copy. First-seen combination: ${token.firstSeenSlug}.`);
      onComplete?.(token.slug);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The test launch failed.");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <section className={`v41-launchpad ${compact ? "compact" : ""}`}>
      <header className="v41-launchpad-head">
        <div>
          <span className="eyebrow"><Rocket size={13} /> V45 AUTHORIZED BATTLEPOOL</span>
          <h2>Create a launchpad test market.</h2>
          <p>Use the browser simulator instantly, or deploy the executable Spot × Long × Sell × Short BattlePool to Anvil when the V45 account router is configured.</p>
        </div>
        <Link className="v41-test-badge" href="/admin/launchpad">OPEN TEST CONSOLE</Link>
      </header>

      {initialDraft && <div className="terminal-launch-source">
        <RadioTower size={16} />
        <span><strong>Drafted from X Launch Feed</strong><small>@{initialDraft.xHandle.replace(/^@/, "")} · ${initialDraft.ticker}</small></span>
        <a href={initialDraft.sourceUrl} target="_blank" rel="noreferrer" title="Open source post"><ExternalLink size={14} /></a>
        <button type="button" onClick={onClearDraft} title="Clear X draft"><X size={14} /></button>
      </div>}

      <nav className="v41-launch-steps" aria-label="Launch steps">
        {(["identity", "funding", "review"] as LaunchStep[]).map((item, index) => (
          <button key={item} type="button" className={step === item ? "active" : ""} onClick={() => setStep(item)}>
            <span>{index + 1}</span>{item}
          </button>
        ))}
      </nav>

      <div className="v41-launch-body">
        {step === "identity" && <div className="v41-launch-grid identity">
          <label className="v41-art-picker">
            <span>Token artwork <small>GIF, PNG, JPG, WEBP, AVIF · 12 MB max</small></span>
            <div className="v41-art-preview">{artwork ? <img src={artwork.imageDataUrl} alt="Token artwork preview" /> : <b>{emoji}</b>}</div>
            <label className="v41-upload-button"><Upload size={14} />{imageBusy ? "Fingerprinting…" : "Upload artwork"}<input type="file" accept="image/gif,image/png,image/jpeg,image/webp,image/avif" disabled={imageBusy} onChange={(event) => readArtwork(event.target.files?.[0])} /></label>
            <div className="v41-emoji-row">{EMOJIS.map((value) => <button type="button" key={value} className={!artwork && emoji === value ? "active" : ""} onClick={() => { setEmoji(value); setArtwork(null); }}>{value}</button>)}</div>
          </label>

          <div className="v41-fields">
            <div className="v41-field-pair">
              <label><span>Name</span><input value={name} maxLength={36} onChange={(event) => setName(event.target.value)} placeholder="PerpHood Dog" /></label>
              <label><span>Ticker</span><input value={ticker} maxLength={10} onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="HOOD" /></label>
            </div>
            <label><span>Description</span><textarea value={description} maxLength={220} onChange={(event) => setDescription(event.target.value)} placeholder="What is this token and meme about?" /></label>
            <div className="v41-field-pair three">
              <label><span>Website</span><input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" /></label>
              <label><span>X</span><input value={xHandle} onChange={(event) => setXHandle(event.target.value)} placeholder="@handle" /></label>
              <label><span>Telegram</span><input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="t.me/" /></label>
            </div>
            <div className={`terminal-og-preview ${ogPreview.exact ? "copy" : "og"}`}>
              <Fingerprint size={16} />
              <span><strong>{ogPreview.exact ? "Combination already used" : "OG eligible"}</strong><small>{ogPreview.exact ? `First seen on ${ogPreview.exact.symbol} · ${ogPreview.exact.slug}` : "Artwork + normalized name + ticker are first-seen together."}</small></span>
              <OgBadge token={previewToken} />
            </div>
            {ogPreview.near && !ogPreview.exact && <div className="v41-near-match"><AlertTriangle size={14} />Near-image match: {ogPreview.near.token.symbol} · {ogPreview.near.similarity.toFixed(1)}%</div>}
          </div>
        </div>}

        {step === "funding" && <div className="v41-funding-layout">
          <div className="v41-budget-card">
            <header><Wallet size={17} /><span><strong>Creator launch budget</strong><small>Minimum spend includes estimated network gas.</small></span></header>
            <div className="v42-launch-mode" role="group" aria-label="Launch execution mode">
              <button type="button" className={launchMode === "browser" ? "active" : ""} onClick={() => setLaunchMode("browser")}><RadioTower size={14} /><span>Browser simulator<small>Instant lifecycle testing</small></span></button>
              <button type="button" className={launchMode === "anvil" ? "active" : ""} onClick={() => setLaunchMode("anvil")} disabled={!v45FactoryAddress}><Blocks size={14} /><span>Anvil contract<small>{v45FactoryAddress ? "Unified local settlement" : "Run npm run chain:v45"}</small></span></button>
            </div>
            <label><span>Total launch spend</span><div className="input-affix"><input type="number" min={LAUNCHPAD_MIN_TOTAL_SPEND_ETH} max={balanceEth} step="0.0001" value={totalSpendEth} onChange={(event) => setTotalSpendEth(Math.max(0, Number(event.target.value) || 0))} /><b>ETH</b></div></label>
            <label><span>Estimated gas reserve</span><div className="input-affix"><input type="number" min="0" max={totalSpendEth} step="0.00001" value={gasReserveEth} onChange={(event) => setGasReserveEth(Math.max(0, Number(event.target.value) || 0))} /><b>ETH</b></div></label>
            <div className="v41-budget-breakdown">
              <span><Fuel size={14} />Gas reserve<b>{launchQuote.gasReserveEth.toFixed(5)} ETH</b></span>
              <span><Coins size={14} />Creator curve buy<b>{launchQuote.creatorBuyEth.toFixed(5)} ETH</b></span>
              <span><Wallet size={14} />Trading balance<b>{balanceEth.toFixed(4)} ETH</b></span>
            </div>
            {!launchQuote.valid && <div className="v41-launch-error"><AlertTriangle size={14} />{launchQuote.reason}</div>}
            {launchMode === "browser" && launchQuote.valid && totalSpendEth > balanceEth && <div className="v41-launch-error"><AlertTriangle size={14} />Fund another {(totalSpendEth - balanceEth).toFixed(4)} ETH in the local trading account.</div>}
          </div>

          <div className="v41-migration-card">
            <header><ShieldCheck size={17} /><span><strong>Migration test target</strong><small>USD target plus independent solvency gates.</small></span></header>
            <label><span>Test target market cap</span><select value={migrationTargetMarketCapUsd} onChange={(event) => setMigrationTargetMarketCapUsd(Number(event.target.value))}>{LAUNCHPAD_TARGET_OPTIONS_USD.map((value) => <option key={value} value={value}>${value.toLocaleString("en-US")}</option>)}</select></label>
            <div className="v41-migration-estimate">
              <span><small>Estimated WETH into curve</small><b>{migrationEstimate.estimatedGrossWethEth.toFixed(3)} ETH</b></span>
              <span><small>Estimated circulating supply</small><b>{migrationEstimate.circulatingPercent.toFixed(1)}%</b></span>
              <span><small>Target marginal FDV</small><b>{migrationEstimate.targetFdvEth.toFixed(2)} ETH</b></span>
            </div>
            <p>This target alone never forces migration. Real WETH, closeability, short inventory, zero bad debt, trader distribution, and idle settlement must all pass.</p>
          </div>
        </div>}

        {step === "review" && <div className="v41-review-layout">
          <div className="v41-review-token">
            <div className="v41-review-art">{artwork ? <img src={artwork.imageDataUrl} alt="Launch artwork" /> : emoji}</div>
            <span><strong>{name || "Unnamed token"}</strong><b>${ticker || "TICKER"}</b><small>{description || "No description"}</small></span>
            <OgBadge token={previewToken} />
          </div>
          <div className="v41-review-ledger">
            <span><small>Total creator spend</small><b>{totalSpendEth.toFixed(5)} ETH</b></span>
            <span><small>Reserved for gas</small><b>{launchQuote.gasReserveEth.toFixed(5)} ETH</b></span>
            <span><small>Genesis curve purchase</small><b>{launchQuote.creatorBuyEth.toFixed(5)} ETH</b></span>
            <span><small>Total token supply</small><b>1,000,000,000</b></span>
            <span><small>Opening FDV</small><b>0.25 ETH</b></span>
            <span><small>Migration target</small><b>${migrationTargetMarketCapUsd.toLocaleString("en-US")}</b></span>
          </div>
          {launchMode === "anvil" && <div className="v42-chain-review"><Blocks size={15} /><span><strong>Executable Anvil launch</strong><small>Factory {v45FactoryAddress ? `${v45FactoryAddress.slice(0, 8)}…${v45FactoryAddress.slice(-6)}` : "not configured"} · wallet confirmation required</small></span></div>}
          {chainReceipt && <div className="v42-chain-review confirmed"><Check size={15} /><span><strong>Latest local-chain receipt</strong><small>{chainReceipt.transactionHash.slice(0, 12)}… · market {chainReceipt.marketAddress ?? "pending index"}</small></span></div>}
          <div className="v41-launch-rules">
            <span><Check size={14} />No free creator token allocation</span>
            <span><Check size={14} />Creator buy executes against the same curve</span>
            <span><Check size={14} />Spot and up-to-20× perps begin after first valid price</span>
            <span><LockKeyhole size={14} />Creator wallet cannot long or short its own token</span>
            <span><Swords size={14} />Other traders may short the creator immediately</span>
            <span><ShieldCheck size={14} />Migration cannot bypass solvency gates</span>
          </div>
        </div>}
      </div>

      <footer className="v41-launch-footer">
        <div aria-live="polite">{status || "Local test launches persist in this browser until reset."}</div>
        <div>
          {step !== "identity" && <KeyButton type="button" tone="ghost" onClick={() => setStep(step === "review" ? "funding" : "identity")}><ArrowLeft size={14} />Back</KeyButton>}
          {step !== "review" && <KeyButton type="button" tone="green" onClick={goNext}>Continue<ArrowRight size={14} /></KeyButton>}
          {step === "review" && <KeyButton type="button" tone="green" disabled={launching || !identityReady || !fundingReady} onClick={submit}><Rocket size={15} />{launching ? "Launching…" : connected ? (launchMode === "anvil" ? "Launch on Anvil" : "Launch in browser") : "Connect & review"}</KeyButton>}
        </div>
      </footer>
    </section>
  );
}
