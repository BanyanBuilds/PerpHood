import type { PnlSummary } from "./pnl";

export type PnlSharePayload = {
  title: string;
  subtitle: string;
  summary: PnlSummary;
  periodLabel: string;
};

function cardCanvas(payload: PnlSharePayload) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const positive = payload.summary.totalEth >= 0;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, "#171717");
  gradient.addColorStop(1, "#333333");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 675);
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 1140, 615);
  ctx.fillStyle = "#f3c941";
  ctx.font = "800 44px Arial";
  ctx.fillText("LEVERAGE X", 74, 105);
  ctx.fillStyle = "#9ca39e";
  ctx.font = "600 24px Arial";
  ctx.fillText(payload.subtitle, 74, 145);
  ctx.fillStyle = positive ? "#62ef7d" : "#ff7474";
  ctx.font = "900 92px Arial";
  ctx.fillText(`${payload.summary.totalEth >= 0 ? "+" : ""}${payload.summary.totalEth.toFixed(4)} ETH`, 74, 285);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 30px Arial";
  ctx.fillText(payload.title, 74, 345);
  ctx.fillStyle = "#a7ada9";
  ctx.font = "600 24px Arial";
  ctx.fillText(`${payload.periodLabel} · ${payload.summary.trades} settled trades · ${payload.summary.winRate.toFixed(1)}% win rate`, 74, 390);
  const rows = [
    ["Realized", payload.summary.realizedEth],
    ["Live executable", payload.summary.unrealizedEth],
    ["Best trade", payload.summary.bestTradeEth],
  ] as const;
  rows.forEach(([label, value], index) => {
    const x = 74 + index * 355;
    ctx.fillStyle = "#767d78";
    ctx.font = "700 19px Arial";
    ctx.fillText(label.toUpperCase(), x, 490);
    ctx.fillStyle = value >= 0 ? "#62ef7d" : "#ff7474";
    ctx.font = "850 31px Arial";
    ctx.fillText(`${value >= 0 ? "+" : ""}${value.toFixed(4)} ETH`, x, 534);
  });
  ctx.fillStyle = "#6e756f";
  ctx.font = "600 18px Arial";
  ctx.fillText("Executable PNL from one Spot × Long × Sell × Short BattlePool", 74, 602);
  return canvas;
}

export async function sharePnlToX(payload: PnlSharePayload) {
  const text = `${payload.title}: ${payload.summary.totalEth >= 0 ? "+" : ""}${payload.summary.totalEth.toFixed(4)} ETH on @Leverage X\n${payload.periodLabel} · ${payload.summary.trades} trades · ${payload.summary.winRate.toFixed(1)}% win rate\n\nSpot × Long × Sell × Short. One BattlePool.`;
  const canvas = cardCanvas(payload);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not generate card")), "image/png"));
  const file = new File([blob], "leveragex-pnl.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (navigator.share && nav.canShare?.({ files: [file] })) {
    await navigator.share({ title: payload.title, text, files: [file] });
    return "shared" as const;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "leveragex-pnl.png";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  return "downloaded" as const;
}
