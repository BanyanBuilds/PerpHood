export type V47IndexedSession = {
  session_id: string;
  owner_address: string;
  valid_until: number;
  next_nonce: string;
  spent_notional_wei: string;
  max_cumulative_notional_wei: string;
  action_bitmap: string;
  active: number;
  source_block: number;
};

export type V47IndexedAccountSnapshot = {
  head: { chainId: number; blockNumber: number; finalizedBlock: number; updatedAt: number } | null;
  account: { weth_balance_wei: string; source_block: number } | null;
  tokens: Array<{ market_address: string; token_balance_wad: string; source_block: number }>;
  sessions: V47IndexedSession[];
  positions: Array<Record<string, unknown>>;
};

export async function readV47IndexedAccount(owner: string, market?: string) {
  const query = new URLSearchParams({ owner, ...(market ? { market } : {}) });
  const response = await fetch(`/api/v47/snapshot?${query}`, { cache: "no-store" });
  const payload = await response.json() as { ok?: boolean; snapshot?: V47IndexedAccountSnapshot; error?: string };
  if (!response.ok || !payload.ok || !payload.snapshot) throw new Error(payload.error ?? "V47 indexed account is unavailable.");
  return payload.snapshot;
}
