import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPnlCalendar, summarizePnl } from "../lib/pnl.ts";
import type { ClosedTrade } from "../lib/types.ts";

const now = new Date(2026, 6, 24, 12, 0, 0).getTime();
const trades: ClosedTrade[] = [
  { id: "a", slug: "alpha", direction: "long", leverage: 10, entryCap: 10, exitCap: 12, collateral: 1, pnlEth: 0.2, roiPercent: 20, openedAt: now - 10000, closedAt: now - 5000, reason: "manual" },
  { id: "b", slug: "beta", direction: "short", leverage: 5, entryCap: 10, exitCap: 11, collateral: 1, pnlEth: -0.1, roiPercent: -10, openedAt: now - 9000, closedAt: now - 4000, reason: "liquidation" },
];
const emptyQuote = () => ({ pnlEth: 0, roiPercent: 0, payoutEth: 0, closeValueEth: 0, closeFeeEth: 0, priceImpactPercent: 0, allowed: true });
const summary = summarizePnl({ closedTrades: trades, positions: [], holdings: [], getPositionPnl: emptyQuote, getHoldingPnl: emptyQuote, period: "all", sessionStartedAt: 0, now });
assert.equal(summary.realizedEth, 0.1);
assert.equal(summary.trades, 2);
assert.equal(summary.wins, 1);
assert.equal(summary.losses, 1);
assert.equal(summary.winRate, 50);
const calendar = buildPnlCalendar(trades, 35, now);
assert.equal(calendar.length, 35);
assert.equal(calendar.at(-1)?.pnlEth, 0.1);

const widget = await readFile(new URL("../components/FloatingPnlWidget.tsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../components/ProfileMenu.tsx", import.meta.url), "utf8");
const hub = await readFile(new URL("../components/TerminalHub.tsx", import.meta.url), "utf8");
const provider = await readFile(new URL("../components/MarketProvider.tsx", import.meta.url), "utf8");
const share = await readFile(new URL("../lib/pnl-share.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

assert.match(widget, /Draggable executable PNL|Floating live PNL|Live PNL/);
assert.match(widget, /Reset session PNL/);
assert.match(widget, /Share to X/);
assert.match(profile, /External owner wallet/);
assert.match(profile, /Non-exportable, scoped, revocable/);
assert.match(profile, /Only one is active for trading/);
assert.match(profile, /35-day settled PNL calendar/);
assert.match(hub, /pnlWidgetOpen/);
assert.match(hub, /FloatingPnlWidget/);
assert.match(provider, /slice\(0, 10000\)/);
assert.match(share, /x\.com\/intent\/post/);
assert.match(share, /perphood-pnl\.png/);
assert.match(layout, /favicon\.ico/);
console.log("V32 floating PNL, all-time ledger, X sharing, wallet identity, and logo smoke passed.");
