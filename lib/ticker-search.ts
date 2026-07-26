import type { Token } from "./types";

export function tokenFirstSeenAt(token: Token) {
  return token.metadataLockedAt ?? Date.now() - token.launchedMinutesAgo * 60_000;
}

export function normalizeTickerQuery(value: string) {
  return value.trim().replace(/^\$+/, "").toLowerCase();
}

export function searchTickerMarkets(tokens: Token[], query: string) {
  const normalized = normalizeTickerQuery(query);
  if (!normalized) return [];
  return tokens.filter((token) => {
    const symbol = token.symbol.toLowerCase();
    return symbol.includes(normalized)
      || token.name.toLowerCase().includes(normalized)
      || token.slug.toLowerCase().includes(normalized);
  });
}

export function sortTickerLineage(tokens: Token[]) {
  return [...tokens].sort((a, b) => {
    if (Boolean(a.isTickerOrigin) !== Boolean(b.isTickerOrigin)) return a.isTickerOrigin ? -1 : 1;
    return tokenFirstSeenAt(a) - tokenFirstSeenAt(b);
  });
}

export function sortMarketCapLeaders(tokens: Token[]) {
  return [...tokens].sort((a, b) => {
    if (b.cap !== a.cap) return b.cap - a.cap;
    return tokenFirstSeenAt(a) - tokenFirstSeenAt(b);
  });
}
