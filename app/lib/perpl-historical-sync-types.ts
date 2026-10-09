import type { HistoricalRows } from "./perpl-historical-analytics";

export const HISTORICAL_EVENT_TYPES = [
  "PositionOpen",
  "PositionIncrease",
  "PositionDecrease",
  "PositionClose",
  "PositionInvert",
  "PositionLiquidation",
] as const;

export type HistoricalEventType =
  (typeof HISTORICAL_EVENT_TYPES)[number];

export type HistoricalCursor = {
  blockNumber: string;
  logIndex: number;
  id: string;
};

export type HistoricalIndexedEvent = {
  id: string;
  blockNumber: string;
  logIndex: number;
  transactionHash: string;
};

export type HistoricalSyncCheckpoint = {
  accountId: string;
  eventType: HistoricalEventType;
  cursor: HistoricalCursor | null;
  targetBlockNumber: string;
  completed: boolean;
};

export type HistoricalLifecycleKey =
  Exclude<keyof HistoricalRows, "takerOrderFills">;

export const HISTORICAL_EVENT_KEYS: Record<
  HistoricalEventType,
  HistoricalLifecycleKey
> = {
  PositionOpen: "positionOpens",
  PositionIncrease: "positionIncreases",
  PositionDecrease: "positionDecreases",
  PositionClose: "positionCloses",
  PositionInvert: "positionInverts",
  PositionLiquidation: "positionLiquidations",
};
