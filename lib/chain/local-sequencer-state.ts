import "server-only";

import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertBattlePool,
  createBattlePoolState,
  type BattlePoolState,
} from "../battle-pool.ts";
import type { Position } from "../types.ts";
import type { LocalBattleState } from "./local-battle-client.ts";
import type { Hex } from "./abi.ts";

const STATE_FILE = join(process.cwd(), ".perphood-v23-sequencer-state.json");

type PendingSequencerState = {
  expectedSequence: number;
  expectedPreviousStateHash: Hex;
  intentHash: Hex;
  positionsRoot: Hex;
  balancesRoot: Hex;
  pool: BattlePoolState;
  positions: Position[];
  stagedAt: number;
};

type PersistedSequencerState = {
  version: 23;
  contractAddress: Hex;
  chainSequence: number;
  chainStateHash: Hex;
  pool: BattlePoolState;
  positions: Position[];
  pending?: PendingSequencerState;
  updatedAt: number;
};

type SequencerRuntime = { cache: Map<string, PersistedSequencerState> };
const sequencerGlobal = globalThis as typeof globalThis & { __perphoodV23Sequencer?: SequencerRuntime };
const runtime = sequencerGlobal.__perphoodV23Sequencer ??= { cache: new Map() };

function key(address: string) {
  return address.toLowerCase();
}

function sameHex(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function bootstrap(chainState: LocalBattleState, contractAddress: Hex): PersistedSequencerState {
  if (chainState.sequence !== 0) throw new Error("Sequencer state is missing for a non-genesis contract. Restore the state file or redeploy the local pool.");
  const base = createBattlePoolState();
  const pool = assertBattlePool({
    ...base,
    realWethBalance: Number(chainState.poolWethWad) / 1e18,
  });
  return {
    version: 23,
    contractAddress,
    chainSequence: chainState.sequence,
    chainStateHash: chainState.stateHash,
    pool,
    positions: [],
    updatedAt: Date.now(),
  };
}

async function loadFile() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8")) as PersistedSequencerState;
  } catch {
    return null;
  }
}

async function writeState(state: PersistedSequencerState) {
  runtime.cache.set(key(state.contractAddress), state);
  const temporary = `${STATE_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(state), "utf8");
  await rename(temporary, STATE_FILE);
  return state;
}

async function reconcilePending(state: PersistedSequencerState, chainState: LocalBattleState) {
  const pending = state.pending;
  if (!pending) return state;

  if (chainState.sequence === state.chainSequence && sameHex(chainState.stateHash, state.chainStateHash)) {
    const cleared = { ...state, pending: undefined, updatedAt: Date.now() };
    return writeState(cleared);
  }

  if (
    chainState.sequence === pending.expectedSequence
    && sameHex(chainState.positionsRoot, pending.positionsRoot)
    && sameHex(chainState.balancesRoot, pending.balancesRoot)
  ) {
    const promoted: PersistedSequencerState = {
      version: 23,
      contractAddress: state.contractAddress,
      chainSequence: chainState.sequence,
      chainStateHash: chainState.stateHash,
      pool: assertBattlePool(pending.pool),
      positions: pending.positions,
      updatedAt: Date.now(),
    };
    return writeState(promoted);
  }

  return state;
}

export async function loadSequencerState(
  contractAddress: Hex,
  chainState: LocalBattleState,
): Promise<PersistedSequencerState> {
  const cacheKey = key(contractAddress);
  let state = runtime.cache.get(cacheKey) ?? null;
  if (!state) {
    const persisted = await loadFile();
    if (persisted?.version === 23 && key(persisted.contractAddress) === cacheKey) state = persisted;
  }
  if (!state) state = bootstrap(chainState, contractAddress);
  state = await reconcilePending(state, chainState);

  const chainPoolEth = Number(chainState.poolWethWad) / 1e18;
  const genesisSeedChanged = chainState.sequence === 0 && Math.abs(state.pool.realWethBalance - chainPoolEth) > 1e-12;
  if (state.chainSequence !== chainState.sequence || !sameHex(state.chainStateHash, chainState.stateHash) || genesisSeedChanged) {
    if (chainState.sequence === 0) {
      state = bootstrap(chainState, contractAddress);
      await writeState(state);
    } else {
      throw new Error("Sequencer state does not match the authoritative contract frame.");
    }
  }
  runtime.cache.set(cacheKey, state);
  return state;
}

export async function stageSequencerState(input: {
  contractAddress: Hex;
  chainState: LocalBattleState;
  intentHash: Hex;
  positionsRoot: Hex;
  balancesRoot: Hex;
  pool: BattlePoolState;
  positions: Position[];
}) {
  const current = await loadSequencerState(input.contractAddress, input.chainState);
  const staged: PersistedSequencerState = {
    ...current,
    pending: {
      expectedSequence: input.chainState.sequence + 1,
      expectedPreviousStateHash: input.chainState.stateHash,
      intentHash: input.intentHash,
      positionsRoot: input.positionsRoot,
      balancesRoot: input.balancesRoot,
      pool: assertBattlePool(input.pool),
      positions: input.positions,
      stagedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };
  return writeState(staged);
}

export async function persistSequencerState(input: {
  contractAddress: Hex;
  chainState: LocalBattleState;
  pool: BattlePoolState;
  positions: Position[];
}) {
  const state: PersistedSequencerState = {
    version: 23,
    contractAddress: input.contractAddress,
    chainSequence: input.chainState.sequence,
    chainStateHash: input.chainState.stateHash,
    pool: assertBattlePool(input.pool),
    positions: input.positions,
    updatedAt: Date.now(),
  };
  return writeState(state);
}
