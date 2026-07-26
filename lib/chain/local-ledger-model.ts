export type LedgerBalance = { wethWad: bigint; tokenAmount: bigint };
export type LedgerDelta = { account: string; wethDeltaWad: bigint; tokenDelta: bigint };

export type LedgerFrame = {
  sequence: number;
  previousStateHash: string;
  stateHash: string;
  poolWethDeltaWad: bigint;
  poolTokenDelta: bigint;
  reservedWethWad: bigint;
  deltas: LedgerDelta[];
};

export class LocalLedgerModel {
  sequence = 0;
  stateHash = "genesis";
  poolWethWad: bigint;
  poolTokenAmount: bigint;
  reservedWethWad = 0n;
  totalUserWethWad = 0n;
  totalUserTokenAmount = 0n;
  physicalWethWad: bigint;
  physicalTokenAmount: bigint;
  balances = new Map<string, LedgerBalance>();

  constructor(poolWethWad: bigint, totalTokenAmount: bigint) {
    this.poolWethWad = poolWethWad;
    this.poolTokenAmount = totalTokenAmount;
    this.physicalWethWad = poolWethWad;
    this.physicalTokenAmount = totalTokenAmount;
    this.assertInvariants();
  }

  deposit(account: string, amountWad: bigint) {
    if (amountWad <= 0n) throw new Error("Deposit must be positive.");
    const balance = this.balance(account);
    balance.wethWad += amountWad;
    this.totalUserWethWad += amountWad;
    this.physicalWethWad += amountWad;
    this.assertInvariants();
  }

  withdrawWeth(account: string, amountWad: bigint) {
    const balance = this.balance(account);
    if (amountWad <= 0n || balance.wethWad < amountWad) throw new Error("Insufficient WETH.");
    balance.wethWad -= amountWad;
    this.totalUserWethWad -= amountWad;
    this.physicalWethWad -= amountWad;
    this.assertInvariants();
  }

  withdrawToken(account: string, amount: bigint) {
    const balance = this.balance(account);
    if (amount <= 0n || balance.tokenAmount < amount) throw new Error("Insufficient token balance.");
    balance.tokenAmount -= amount;
    this.totalUserTokenAmount -= amount;
    this.physicalTokenAmount -= amount;
    this.assertInvariants();
  }

  commit(frame: LedgerFrame) {
    if (frame.sequence !== this.sequence + 1) throw new Error("Stale or skipped frame sequence.");
    if (frame.previousStateHash !== this.stateHash) throw new Error("Previous state hash mismatch.");
    const wethConservation = frame.deltas.reduce((sum, delta) => sum + delta.wethDeltaWad, frame.poolWethDeltaWad);
    const tokenConservation = frame.deltas.reduce((sum, delta) => sum + delta.tokenDelta, frame.poolTokenDelta);
    if (wethConservation !== 0n || tokenConservation !== 0n) throw new Error("Unbalanced settlement delta.");

    const nextBalances = new Map(Array.from(this.balances, ([key, value]) => [key, { ...value }]));
    let userWethDelta = 0n;
    let userTokenDelta = 0n;
    for (const delta of frame.deltas) {
      const current = nextBalances.get(delta.account) ?? { wethWad: 0n, tokenAmount: 0n };
      const next = {
        wethWad: current.wethWad + delta.wethDeltaWad,
        tokenAmount: current.tokenAmount + delta.tokenDelta,
      };
      if (next.wethWad < 0n || next.tokenAmount < 0n) throw new Error("Negative user balance.");
      nextBalances.set(delta.account, next);
      userWethDelta += delta.wethDeltaWad;
      userTokenDelta += delta.tokenDelta;
    }

    const nextPoolWeth = this.poolWethWad + frame.poolWethDeltaWad;
    const nextPoolToken = this.poolTokenAmount + frame.poolTokenDelta;
    if (nextPoolWeth < 0n || nextPoolToken < 0n) throw new Error("Negative pool balance.");
    if (frame.reservedWethWad > nextPoolWeth) throw new Error("Reserved WETH exceeds pool WETH.");

    this.balances = nextBalances;
    this.poolWethWad = nextPoolWeth;
    this.poolTokenAmount = nextPoolToken;
    this.totalUserWethWad += userWethDelta;
    this.totalUserTokenAmount += userTokenDelta;
    this.reservedWethWad = frame.reservedWethWad;
    this.sequence = frame.sequence;
    this.stateHash = frame.stateHash;
    this.assertInvariants();
  }

  availablePoolWethWad() {
    return this.poolWethWad - this.reservedWethWad;
  }

  balance(account: string) {
    const current = this.balances.get(account) ?? { wethWad: 0n, tokenAmount: 0n };
    this.balances.set(account, current);
    return current;
  }

  assertInvariants() {
    if (this.reservedWethWad > this.poolWethWad) throw new Error("Pool is over-reserved.");
    if (this.physicalWethWad < this.poolWethWad + this.totalUserWethWad) throw new Error("Physical WETH does not cover claims.");
    if (this.physicalTokenAmount < this.poolTokenAmount + this.totalUserTokenAmount) throw new Error("Physical tokens do not cover claims.");
  }
}
