import assert from "node:assert/strict";
import { applyOgRegistry } from "../lib/og.ts";
import { searchTickerMarkets, sortMarketCapLeaders, sortTickerLineage } from "../lib/ticker-search.ts";
import type { Token } from "../lib/types.ts";

function token(slug: string, minutes: number, cap: number, image: string): Token {
  return {
    slug,
    symbol: "COIN",
    name: `Coin ${slug}`,
    emoji: image,
    hue: 120,
    cap,
    price: 0.000001,
    change24h: 1,
    graduation: 20,
    longs: 50,
    volume24h: 100,
    openInterest: 10,
    funding: 0,
    launchedMinutesAgo: minutes,
    description: "test",
    imageExactHash: image,
    imagePerceptualHash: image === "AAAA" ? "0".repeat(64) : "1".repeat(64),
  };
}

const registered = applyOgRegistry([
  token("new-pump", 5, 900_000, "BBBB"),
  token("old-origin", 500, 120_000, "AAAA"),
  token("middle-copy", 100, 300_000, "AAAA"),
]);
const matches = searchTickerMarkets(registered, "$coin");
const lineage = sortTickerLineage(matches);
const leaders = sortMarketCapLeaders(matches);

assert.equal(lineage[0]?.slug, "old-origin", "ticker origin must always be first");
assert.deepEqual(lineage.map((item) => item.slug), ["old-origin", "middle-copy", "new-pump"], "lineage must be oldest to newest");
assert.deepEqual(leaders.map((item) => item.slug), ["new-pump", "middle-copy", "old-origin"], "right column must rank market cap descending");
assert.equal(lineage[0]?.isTickerOrigin, true);
assert.equal(lineage[0]?.ogStatus, "og");
assert.equal(registered.find((item) => item.slug === "middle-copy")?.ogStatus, "copy");
assert.equal(registered.find((item) => item.slug === "new-pump")?.ogStatus, "og", "new artwork with an existing ticker earns its own ticker+art OG mark");

console.log("V25 dual ticker search passed oldest-first lineage, market-cap ranking, and ticker+art OG identity.");
