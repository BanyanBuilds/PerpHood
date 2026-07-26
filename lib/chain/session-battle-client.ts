import {
  decodeAddress,
  decodeBytes32,
  decodeUint,
  decodeWords,
  encodeAddress,
  encodeBytes32,
  encodeCall,
  encodeUint,
  type Hex,
} from "./abi.ts";
import {
  DEFAULT_LOCAL_RPC,
  ethCall,
  injectedProvider,
  rpcRequest,
  type Eip1193Provider,
} from "./local-battle-client.ts";
import type { SignedTradingIntent } from "./session-key.ts";
import {
  encodeAuthorizedSingleAccountSettlement,
  serializeAuthorizedSettlement,
  type AuthorizedSingleAccountSettlement,
} from "./settlement-frame.ts";

export const AUTHORIZE_SESSION_SIGNATURE = "authorizeSession(bytes32,bytes32,uint64,uint256,uint256)";
export const REVOKE_SESSION_SIGNATURE = "revokeSession(bytes32)";

export type OnChainSessionState = {
  owner: Hex;
  publicKeyHash: Hex;
  validUntil: number;
  nextNonce: number;
  maxNotionalWad: bigint;
  actionBitmap: bigint;
  active: boolean;
};

export async function readSessionState(
  sessionId: Hex,
  rpcUrl = DEFAULT_LOCAL_RPC,
  contractAddress?: string,
): Promise<OnChainSessionState> {
  if (!contractAddress) throw new Error("BattlePool contract address is not configured.");
  const result = await ethCall(rpcUrl, contractAddress, encodeCall("sessionState(bytes32)", [encodeBytes32(sessionId)]));
  const words = decodeWords(result);
  if (words.length < 7) throw new Error("Malformed sessionState response.");
  return {
    owner: decodeAddress(words[0]),
    publicKeyHash: decodeBytes32(words[1]),
    validUntil: Number(decodeUint(words[2])),
    nextNonce: Number(decodeUint(words[3])),
    maxNotionalWad: decodeUint(words[4]),
    actionBitmap: decodeUint(words[5]),
    active: decodeUint(words[6]) === 1n,
  };
}

export async function authorizeSession(
  input: {
    account: Hex;
    contractAddress: Hex;
    sessionId: Hex;
    publicKeyHash: Hex;
    validUntil: number;
    maxNotionalWad: bigint;
    actionBitmap: bigint;
  },
  provider: Eip1193Provider | null = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{
      from: input.account,
      to: input.contractAddress,
      data: encodeCall(AUTHORIZE_SESSION_SIGNATURE, [
        encodeBytes32(input.sessionId),
        encodeBytes32(input.publicKeyHash),
        encodeUint(input.validUntil),
        encodeUint(input.maxNotionalWad),
        encodeUint(input.actionBitmap),
      ]),
    }],
  });
}

export async function revokeSession(
  account: Hex,
  contractAddress: Hex,
  sessionId: Hex,
  provider: Eip1193Provider | null = injectedProvider(),
) {
  if (!provider) throw new Error("No injected EVM wallet was found.");
  return provider.request<Hex>({
    method: "eth_sendTransaction",
    params: [{ from: account, to: contractAddress, data: encodeCall(REVOKE_SESSION_SIGNATURE, [encodeBytes32(sessionId)]) }],
  });
}

export async function relaySponsoredSettlement(input: {
  signedIntent: SignedTradingIntent;
  settlement: AuthorizedSingleAccountSettlement;
}) {
  const response = await fetch("/api/v23/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signedIntent: input.signedIntent,
      settlement: serializeAuthorizedSettlement(input.settlement),
    }),
  });
  const payload = await response.json() as { ok?: boolean; transactionHash?: Hex; error?: string; relayLatencyMs?: number };
  if (!response.ok || !payload.ok || !payload.transactionHash) throw new Error(payload.error ?? "Sponsored relay rejected the intent.");
  return payload as { ok: true; transactionHash: Hex; relayLatencyMs: number };
}

export async function relayDirectFromUnlockedSequencer(input: {
  rpcUrl?: string;
  sequencerAccount: Hex;
  contractAddress: Hex;
  settlement: AuthorizedSingleAccountSettlement;
}) {
  return rpcRequest<Hex>(input.rpcUrl ?? DEFAULT_LOCAL_RPC, "eth_sendTransaction", [{
    from: input.sequencerAccount,
    to: input.contractAddress,
    data: encodeAuthorizedSingleAccountSettlement(input.settlement),
  }]);
}

export type SponsoredIntentRelayResult = {
  ok: true;
  finalized: true;
  action: number;
  actionLabel: string;
  transactionHash: Hex;
  relayLatencyMs: number;
  sequencerLatencyMs: number;
  chainFinalityMs: number;
  sequence: string;
  stateHash: Hex;
  grossWethWad: string;
  netWethWad: string;
  feeWad: string;
  tokenAmountWad: string;
  payoutWad: string;
  priceAfterWad: string;
  priceImpactBps: string;
  executionSteps: number;
  liquidationCount: number;
  position?: unknown;
  closedPositionId?: string;
};

export async function relaySponsoredIntent(signedIntent: SignedTradingIntent) {
  const response = await fetch("/api/v23/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedIntent }),
  });
  const payload = await response.json() as Partial<SponsoredIntentRelayResult> & { error?: string };
  if (!response.ok || !payload.ok || !payload.transactionHash) throw new Error(payload.error ?? "Sponsored relay rejected the intent.");
  return payload as SponsoredIntentRelayResult;
}
