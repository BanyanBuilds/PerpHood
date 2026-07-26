export type SessionAuthorizationModel = {
  owner: string;
  publicKeyHash: string;
  validUntil: number;
  nextNonce: number;
  maxNotionalWad: bigint;
  actionBitmap: bigint;
  active: boolean;
};

export class SessionLedgerModel {
  readonly sessions = new Map<string, SessionAuthorizationModel>();
  readonly consumedIntentHashes = new Set<string>();

  authorize(input: {
    sessionId: string;
    owner: string;
    publicKeyHash: string;
    validUntil: number;
    maxNotionalWad: bigint;
    actionBitmap: bigint;
    now: number;
  }) {
    if (!input.sessionId || !input.owner || !input.publicKeyHash) throw new Error("Invalid session.");
    if (input.validUntil <= input.now || input.maxNotionalWad <= 0n || input.actionBitmap <= 0n) throw new Error("Invalid session limits.");
    const current = this.sessions.get(input.sessionId);
    if (current && current.owner.toLowerCase() !== input.owner.toLowerCase()) throw new Error("Session owner mismatch.");
    const next: SessionAuthorizationModel = {
      owner: input.owner.toLowerCase(),
      publicKeyHash: input.publicKeyHash.toLowerCase(),
      validUntil: input.validUntil,
      nextNonce: current?.nextNonce ?? 0,
      maxNotionalWad: input.maxNotionalWad,
      actionBitmap: input.actionBitmap,
      active: true,
    };
    this.sessions.set(input.sessionId, next);
    return next;
  }

  revoke(sessionId: string, owner: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== owner.toLowerCase()) throw new Error("Unauthorized revocation.");
    session.active = false;
  }

  consume(input: {
    sessionId: string;
    owner: string;
    nonce: number;
    action: number;
    notionalWad: bigint;
    deadline: number;
    intentHash: string;
    now: number;
  }) {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.owner !== input.owner.toLowerCase()) throw new Error("Invalid session owner.");
    if (!session.active) throw new Error("Session inactive.");
    if (input.now > session.validUntil || input.now > input.deadline) throw new Error("Session expired.");
    if (input.nonce !== session.nextNonce) throw new Error("Session nonce mismatch.");
    if ((session.actionBitmap & (1n << BigInt(input.action))) === 0n) throw new Error("Action not authorized.");
    if (input.notionalWad <= 0n || input.notionalWad > session.maxNotionalWad) throw new Error("Session limit exceeded.");
    if (this.consumedIntentHashes.has(input.intentHash)) throw new Error("Intent already consumed.");
    session.nextNonce += 1;
    this.consumedIntentHashes.add(input.intentHash);
  }
}
