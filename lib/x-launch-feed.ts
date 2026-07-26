export type XLaunchAuthor = {
  id: string;
  name: string;
  username: string;
  profileImageUrl?: string;
  verified?: boolean;
};

export type XLaunchMedia = {
  type: "photo" | "video" | "animated_gif";
  url?: string;
  previewImageUrl?: string;
};

export type XLaunchPost = {
  id: string;
  text: string;
  createdAt: string;
  author: XLaunchAuthor;
  metrics: {
    likes: number;
    reposts: number;
    replies: number;
    quotes: number;
  };
  media: XLaunchMedia[];
  urls: string[];
  matchedRule?: string;
};

export type XLaunchFeedResponse = {
  configured: boolean;
  mode: "recent-search" | "stream-cache" | "unconfigured";
  posts: XLaunchPost[];
  query?: string;
  newestId?: string;
  rateLimit?: {
    remaining?: number;
    resetAt?: number;
  };
  message?: string;
};

export type XLaunchDraft = {
  sourcePostId: string;
  sourceUrl: string;
  sourceText: string;
  name: string;
  ticker: string;
  description: string;
  xHandle: string;
  website: string;
};

const STOPWORDS = new Set([
  "THE", "AND", "FOR", "WITH", "THIS", "THAT", "FROM", "YOUR", "YOU", "ARE", "OUR", "NEW", "NOW", "LIVE", "JUST", "TOKEN", "COIN", "LAUNCH", "LAUNCHING", "MEME", "MEMECOIN", "CRYPTO", "ROBINHOOD", "CHAIN", "TRENCHES", "OFFICIAL", "ETH", "WETH", "SOL", "USD", "USDC", "CA", "CONTRACT", "ADDRESS", "BUY", "SELL", "LONG", "SHORT", "ON", "IN", "TO", "OF", "AT", "IS", "IT", "BE", "AS", "WE", "I", "A", "AN",
]);

export function sanitizeXUsername(value: string) {
  return value.trim().replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
}

export function normalizeTicker(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

export function detectEvmAddresses(text: string) {
  return [...new Set(text.match(/\b0x[a-fA-F0-9]{40}\b/g) ?? [])];
}

export function extractCashtags(text: string) {
  const matches = text.match(/\$[A-Za-z][A-Za-z0-9]{1,9}\b/g) ?? [];
  return [...new Set(matches.map((value) => normalizeTicker(value.slice(1))).filter(Boolean))];
}

export function buildXSearchQuery(accounts: string[], keywords: string) {
  const cleanAccounts = [...new Set(accounts.map(sanitizeXUsername).filter(Boolean))].slice(0, 20);
  const accountClause = cleanAccounts.length ? `(${cleanAccounts.map((account) => `from:${account}`).join(" OR ")})` : "";
  const trimmedKeywords = keywords.trim().slice(0, 280);
  const topicClause = trimmedKeywords || '(launch OR launching OR memecoin OR "contract address" OR cashtag)';
  return [accountClause, `(${topicClause})`, "-is:retweet"].filter(Boolean).join(" ");
}

function pushTicker(output: string[], value: string) {
  const ticker = normalizeTicker(value);
  if (ticker.length < 2 || ticker.length > 10 || STOPWORDS.has(ticker) || output.includes(ticker)) return;
  output.push(ticker);
}

export function suggestTickers(post: Pick<XLaunchPost, "text" | "author">, limit = 5) {
  const output: string[] = [];
  extractCashtags(post.text).forEach((value) => pushTicker(output, value));

  const hashtags = post.text.match(/#[A-Za-z][A-Za-z0-9_]{1,20}/g) ?? [];
  hashtags.forEach((value) => pushTicker(output, value.slice(1)));

  const uppercaseWords = post.text.match(/\b[A-Z][A-Z0-9]{1,9}\b/g) ?? [];
  uppercaseWords.forEach((value) => pushTicker(output, value));

  const meaningfulWords = post.text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#$][A-Za-z0-9_]+/g, " ")
    .split(/\s+/)
    .map((value) => value.replace(/[^A-Za-z0-9]/g, ""))
    .filter((value) => value.length >= 3 && value.length <= 10);
  meaningfulWords.forEach((value) => pushTicker(output, value));

  pushTicker(output, post.author.username);
  const initials = post.author.name.split(/\s+/).map((value) => value[0] ?? "").join("");
  pushTicker(output, initials);

  const base = normalizeTicker(post.author.username) || "HOOD";
  [base.slice(0, 6), `${base.slice(0, 6)}X`, `${base.slice(0, 5)}AI`, "HOOD", "PERP"].forEach((value) => pushTicker(output, value));
  return output.slice(0, limit);
}

export function buildLaunchDraft(post: XLaunchPost, tickerValue: string): XLaunchDraft {
  const ticker = normalizeTicker(tickerValue) || "HOOD";
  const sourceUrl = `https://x.com/${post.author.username}/status/${post.id}`;
  const website = post.urls.find((url) => !/^(https?:\/\/)?(x\.com|twitter\.com)\//i.test(url)) ?? "";
  const cleanText = post.text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  const titleWord = cleanText
    .replace(/[$#@]/g, "")
    .split(/\s+/)
    .find((word) => /^[A-Za-z][A-Za-z0-9]{2,20}$/.test(word) && !STOPWORDS.has(word.toUpperCase()));
  const name = (titleWord ? `${titleWord} ${ticker}` : `${post.author.name} ${ticker}`).slice(0, 36);
  return {
    sourcePostId: post.id,
    sourceUrl,
    sourceText: post.text,
    name,
    ticker,
    description: cleanText.slice(0, 220),
    xHandle: `@${post.author.username}`,
    website,
  };
}

export function formatPostAge(createdAt: string, now = Date.now()) {
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  if (elapsed < 60_000) return `${Math.max(1, Math.floor(elapsed / 1000))}s`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}
