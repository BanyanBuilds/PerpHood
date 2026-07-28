import type { V85LiveEvent } from "./v85-live-data";

export type V87TokenSnapshot = {
  chainId: number;
  marketAddress: `0x${string}`;
  tokenAddress: `0x${string}` | null;
  creatorAddress: `0x${string}` | null;
  metadataHash: string | null;
  active: boolean;
  phase: number;
  lastPriceWad: string;
  marketCapEthWad: string;
  openInterestLongWei: string;
  openInterestShortWei: string;
  activePositions: string;
  tradeCount: number;
  buyVolumeWei: string;
  sellVolumeWei: string;
  lastBlockNumber: number;
  lastEventId: string;
  updatedAt: string;
};

export type V87PositionSnapshot = {
  chainId: number;
  marketAddress: `0x${string}`;
  positionId: string;
  ownerAddress: `0x${string}`;
  direction: "LONG" | "SHORT";
  leverage: number;
  collateralWei: string;
  notionalWei: string;
  entryPriceWad: string;
  liquidationPriceWad: string;
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
  payoutWei: string | null;
  pnlWei: string | null;
  badDebtWei: string | null;
  openedBlock: number;
  closedBlock: number | null;
  lastEventId: string;
  updatedAt: string;
};

export type V87LiveStateSnapshot = {
  chainId: number;
  markets: V87TokenSnapshot[];
  positions: V87PositionSnapshot[];
  cursor: string | null;
  generatedAt: string;
};

export function compareV87Events(left: V85LiveEvent, right: V85LiveEvent) {
  const block = (left.blockNumber ?? -1) - (right.blockNumber ?? -1);
  if (block !== 0) return block;
  return left.id.localeCompare(right.id);
}
