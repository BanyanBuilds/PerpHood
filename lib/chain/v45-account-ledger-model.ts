export const V45ExecutionMode = { Normal: 0, CloseOnly: 1, Paused: 2 } as const;
export type V45ExecutionModeValue = (typeof V45ExecutionMode)[keyof typeof V45ExecutionMode];

export const V45SessionAction = { Invalid: 0, SpotBuy: 1, SpotSell: 2, OpenLong: 3, OpenShort: 4, CloseLong: 5, CloseShort: 6 } as const;
export type V45SessionActionValue = (typeof V45SessionAction)[keyof typeof V45SessionAction];

export type V45SessionAuthorizationModel = {
  owner: string;
  publicKeyHash: string;
  validUntil: number;
  nextNonce: number;
  maxNotionalWei: bigint;
  maxCumulativeNotionalWei: bigint;
  spentNotionalWei: bigint;
  actionBitmap: bigint;
  active: boolean;
};

const key = (value: string) => value.toLowerCase();
const tokenKey = (account: string, market: string) => `${key(account)}:${key(market)}`;

export class V45AccountLedgerModel {
  executionMode = V45ExecutionMode.Normal;
  routerEthWei = 0n;
  readonly routerTokenWad = new Map<string, bigint>();
  readonly wethBalanceWei = new Map<string, bigint>();
  readonly tokenBalanceWad = new Map<string, bigint>();
  totalWethLiabilityWei = 0n;
  readonly totalTokenLiabilityWad = new Map<string, bigint>();
  readonly sessions = new Map<string, V45SessionAuthorizationModel>();
  readonly consumedIntentHashes = new Set<string>();

  deposit(account: string, amountWei: bigint) {
    if (!account || amountWei <= 0n) throw new Error("Invalid deposit.");
    this.routerEthWei += amountWei;
    this.creditWeth(account, amountWei);
    this.assertWethSolvent();
  }

  withdraw(account: string, amountWei: bigint) {
    this.debitWeth(account, amountWei);
    if (this.routerEthWei < amountWei) throw new Error("Router ETH custody is insufficient.");
    this.routerEthWei -= amountWei;
    this.assertWethSolvent();
  }

  creditTradePayout(account: string, amountWei: bigint) {
    if (amountWei < 0n) throw new Error("Invalid payout.");
    this.routerEthWei += amountWei;
    this.creditWeth(account, amountWei);
    this.assertWethSolvent();
  }

  debitTradeCost(account: string, amountWei: bigint) {
    this.debitWeth(account, amountWei);
    if (this.routerEthWei < amountWei) throw new Error("Router ETH custody is insufficient.");
    this.routerEthWei -= amountWei;
    this.assertWethSolvent();
  }

  creditToken(account: string, market: string, amountWad: bigint) {
    if (amountWad <= 0n) throw new Error("Invalid token credit.");
    const marketId = key(market);
    const accountMarket = tokenKey(account, market);
    this.routerTokenWad.set(marketId, (this.routerTokenWad.get(marketId) ?? 0n) + amountWad);
    this.tokenBalanceWad.set(accountMarket, (this.tokenBalanceWad.get(accountMarket) ?? 0n) + amountWad);
    this.totalTokenLiabilityWad.set(marketId, (this.totalTokenLiabilityWad.get(marketId) ?? 0n) + amountWad);
    this.assertTokenSolvent(market);
  }

  debitToken(account: string, market: string, amountWad: bigint) {
    if (amountWad <= 0n) throw new Error("Invalid token debit.");
    const marketId = key(market);
    const accountMarket = tokenKey(account, market);
    const balance = this.tokenBalanceWad.get(accountMarket) ?? 0n;
    if (balance < amountWad) throw new Error("Internal token balance is too low.");
    const custody = this.routerTokenWad.get(marketId) ?? 0n;
    if (custody < amountWad) throw new Error("Router token custody is insufficient.");
    this.tokenBalanceWad.set(accountMarket, balance - amountWad);
    this.totalTokenLiabilityWad.set(marketId, (this.totalTokenLiabilityWad.get(marketId) ?? 0n) - amountWad);
    this.routerTokenWad.set(marketId, custody - amountWad);
    this.assertTokenSolvent(market);
  }

  authorize(input: {
    sessionId: string;
    owner: string;
    publicKeyHash: string;
    validUntil: number;
    maxNotionalWei: bigint;
    maxCumulativeNotionalWei: bigint;
    actionBitmap: bigint;
    now: number;
  }) {
    if (!input.sessionId || !input.owner || !input.publicKeyHash) throw new Error("Invalid session.");
    if (input.validUntil <= input.now || input.maxNotionalWei <= 0n || input.maxCumulativeNotionalWei < input.maxNotionalWei || input.actionBitmap <= 0n) {
      throw new Error("Invalid session limits.");
    }
    const id = key(input.sessionId);
    const current = this.sessions.get(id);
    if (current && current.owner !== key(input.owner)) throw new Error("Session owner mismatch.");
    const next: V45SessionAuthorizationModel = {
      owner: key(input.owner),
      publicKeyHash: key(input.publicKeyHash),
      validUntil: input.validUntil,
      nextNonce: current?.nextNonce ?? 0,
      maxNotionalWei: input.maxNotionalWei,
      maxCumulativeNotionalWei: input.maxCumulativeNotionalWei,
      spentNotionalWei: current?.spentNotionalWei ?? 0n,
      actionBitmap: input.actionBitmap,
      active: true,
    };
    this.sessions.set(id, next);
    return next;
  }

  revoke(sessionId: string, owner: string) {
    const session = this.sessions.get(key(sessionId));
    if (!session || session.owner !== key(owner)) throw new Error("Unauthorized revocation.");
    session.active = false;
  }

  consume(input: {
    sessionId: string;
    owner: string;
    nonce: number;
    action: V45SessionActionValue;
    notionalWei: bigint;
    countsTowardLimit: boolean;
    deadline: number;
    intentHash: string;
    now: number;
  }) {
    const session = this.sessions.get(key(input.sessionId));
    if (!session || session.owner !== key(input.owner)) throw new Error("Invalid session owner.");
    if (!session.active) throw new Error("Session inactive.");
    if (input.now > session.validUntil || input.now > input.deadline) throw new Error("Session expired.");
    if (input.nonce !== session.nextNonce) throw new Error("Session nonce mismatch.");
    if ((session.actionBitmap & (1n << BigInt(input.action))) === 0n) throw new Error("Action not authorized.");
    if (!input.intentHash || this.consumedIntentHashes.has(key(input.intentHash))) throw new Error("Intent already consumed.");
    if (input.countsTowardLimit) {
      if (input.notionalWei <= 0n || input.notionalWei > session.maxNotionalWei) throw new Error("Per-intent limit exceeded.");
      const spentAfter = session.spentNotionalWei + input.notionalWei;
      if (spentAfter > session.maxCumulativeNotionalWei) throw new Error("Cumulative session limit exceeded.");
      session.spentNotionalWei = spentAfter;
    }
    session.nextNonce += 1;
    this.consumedIntentHashes.add(key(input.intentHash));
  }

  requireOpeningAllowed() {
    if (this.executionMode !== V45ExecutionMode.Normal) throw new Error("Opening actions are disabled.");
  }

  requireCloseAllowed() {
    if (this.executionMode === V45ExecutionMode.Paused) throw new Error("Market actions are paused.");
  }

  accountWeth(account: string) { return this.wethBalanceWei.get(key(account)) ?? 0n; }
  accountToken(account: string, market: string) { return this.tokenBalanceWad.get(tokenKey(account, market)) ?? 0n; }

  assertWethSolvent() {
    if (this.routerEthWei < this.totalWethLiabilityWei) throw new Error("WETH custody invariant failed.");
  }

  assertTokenSolvent(market: string) {
    const marketId = key(market);
    if ((this.routerTokenWad.get(marketId) ?? 0n) < (this.totalTokenLiabilityWad.get(marketId) ?? 0n)) {
      throw new Error("Token custody invariant failed.");
    }
  }

  private creditWeth(account: string, amountWei: bigint) {
    this.wethBalanceWei.set(key(account), this.accountWeth(account) + amountWei);
    this.totalWethLiabilityWei += amountWei;
  }

  private debitWeth(account: string, amountWei: bigint) {
    if (amountWei <= 0n || this.accountWeth(account) < amountWei) throw new Error("Internal WETH balance is too low.");
    this.wethBalanceWei.set(key(account), this.accountWeth(account) - amountWei);
    this.totalWethLiabilityWei -= amountWei;
  }
}
