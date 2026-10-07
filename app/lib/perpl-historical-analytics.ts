import {
  attributeTakerFills,
  buildCompletedTrades,
  calculateRealizedMaxDrawdown,
  calculateTraderAnalytics,
  reconstructPositionLifecycles,
  type LifecycleEvent,
  type PositionSide,
  type TakerFill,
} from "./perpl-trade-reconstruction";

type BaseRow = {
  logIndex: number;
  blockNumber: string;
  timestamp: string;
  transactionHash: string;
};

type PositionBaseRow = BaseRow & {
  perpId: string;
  accountId: string;
  positionType: number;
};

export type HistoricalRows = {
  positionOpens: Array<
    PositionBaseRow & {
      leverageHdths: string;
      depositCNS: string;
      pricePNS: string;
      lotLNS: string;
      insFeeCNS: string;
      protFeeCNS: string;
    }
  >;
  positionIncreases: Array<
    PositionBaseRow & {
      leverageHdths: string;
      startDepositCNS: string;
      endDepositCNS: string;
      pricePNS: string;
      startLotLNS: string;
      endLotLNS: string;
      insFeeCNS: string;
      protFeeCNS: string;
    }
  >;
  positionDecreases: Array<
    PositionBaseRow & {
      startDepositCNS: string;
      endDepositCNS: string;
      startLotLNS: string;
      endLotLNS: string;
      deltaPnlCNS: string;
      fundingCNS: string;
    }
  >;
  positionCloses: Array<
    PositionBaseRow & {
      pricePNS: string;
      deltaPnlCNS: string;
      fundingCNS: string;
    }
  >;
  positionInverts: Array<
    PositionBaseRow & {
      leverageHdths: string;
      startDepositCNS: string;
      endDepositCNS: string;
      pricePNS: string;
      startLotLNS: string;
      endLotLNS: string;
      deltaPnlCNS: string;
      fundingCNS: string;
      insFeeCNS: string;
      protFeeCNS: string;
    }
  >;
  positionLiquidations: Array<
    PositionBaseRow & {
      deltaPnlCNS: string;
      fundingCNS: string;
    }
  >;
  takerOrderFills: Array<
    BaseRow & {
      entryPricePNS: string;
      collatPricePNS: string;
      pnlPricePNS: string;
      lotLNS: string;
      feeCNS: string;
      amountCNS: string;
      balanceCNS: string;
      builderId: string;
      builderFeeCNS: string;
    }
  >;
};

function side(value: number): PositionSide {
  if (value !== 0 && value !== 1) {
    throw new Error(`Invalid Perpl positionType: ${value}`);
  }

  return value;
}

function base(row: BaseRow) {
  return {
    blockNumber: BigInt(row.blockNumber),
    timestamp: BigInt(row.timestamp),
    transactionHash: row.transactionHash,
    logIndex: row.logIndex,
  };
}

export function historicalRowsToEngine(rows: HistoricalRows): {
  lifecycleEvents: LifecycleEvent[];
  takerFills: TakerFill[];
} {
  const lifecycleEvents: LifecycleEvent[] = [
    ...rows.positionOpens.map((row) => ({
      ...base(row),
      kind: "open" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      leverageHdths: BigInt(row.leverageHdths),
      depositCNS: BigInt(row.depositCNS),
      pricePNS: BigInt(row.pricePNS),
      lotLNS: BigInt(row.lotLNS),
      insFeeCNS: BigInt(row.insFeeCNS),
      protFeeCNS: BigInt(row.protFeeCNS),
    })),
    ...rows.positionIncreases.map((row) => ({
      ...base(row),
      kind: "increase" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      leverageHdths: BigInt(row.leverageHdths),
      startDepositCNS: BigInt(row.startDepositCNS),
      endDepositCNS: BigInt(row.endDepositCNS),
      pricePNS: BigInt(row.pricePNS),
      startLotLNS: BigInt(row.startLotLNS),
      endLotLNS: BigInt(row.endLotLNS),
      insFeeCNS: BigInt(row.insFeeCNS),
      protFeeCNS: BigInt(row.protFeeCNS),
    })),
    ...rows.positionDecreases.map((row) => ({
      ...base(row),
      kind: "decrease" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      startDepositCNS: BigInt(row.startDepositCNS),
      endDepositCNS: BigInt(row.endDepositCNS),
      startLotLNS: BigInt(row.startLotLNS),
      endLotLNS: BigInt(row.endLotLNS),
      deltaPnlCNS: BigInt(row.deltaPnlCNS),
      fundingCNS: BigInt(row.fundingCNS),
    })),
    ...rows.positionCloses.map((row) => ({
      ...base(row),
      kind: "close" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      pricePNS: BigInt(row.pricePNS),
      deltaPnlCNS: BigInt(row.deltaPnlCNS),
      fundingCNS: BigInt(row.fundingCNS),
    })),
    ...rows.positionInverts.map((row) => ({
      ...base(row),
      kind: "invert" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      leverageHdths: BigInt(row.leverageHdths),
      startDepositCNS: BigInt(row.startDepositCNS),
      endDepositCNS: BigInt(row.endDepositCNS),
      pricePNS: BigInt(row.pricePNS),
      startLotLNS: BigInt(row.startLotLNS),
      endLotLNS: BigInt(row.endLotLNS),
      deltaPnlCNS: BigInt(row.deltaPnlCNS),
      fundingCNS: BigInt(row.fundingCNS),
      insFeeCNS: BigInt(row.insFeeCNS),
      protFeeCNS: BigInt(row.protFeeCNS),
    })),
    ...rows.positionLiquidations.map((row) => ({
      ...base(row),
      kind: "liquidation" as const,
      perpId: BigInt(row.perpId),
      accountId: BigInt(row.accountId),
      positionType: side(row.positionType),
      deltaPnlCNS: BigInt(row.deltaPnlCNS),
      fundingCNS: BigInt(row.fundingCNS),
    })),
  ];

  const takerFills: TakerFill[] = rows.takerOrderFills.map((row) => ({
    ...base(row),
    entryPricePNS: BigInt(row.entryPricePNS),
    collatPricePNS: BigInt(row.collatPricePNS),
    pnlPricePNS: BigInt(row.pnlPricePNS),
    lotLNS: BigInt(row.lotLNS),
    feeCNS: BigInt(row.feeCNS),
    amountCNS: BigInt(row.amountCNS),
    balanceCNS: BigInt(row.balanceCNS),
    builderId: BigInt(row.builderId),
    builderFeeCNS: BigInt(row.builderFeeCNS),
  }));

  return { lifecycleEvents, takerFills };
}

export function buildHistoricalTraderAnalytics(rows: HistoricalRows) {
  const { lifecycleEvents, takerFills } =
    historicalRowsToEngine(rows);

  const lifecycles =
    reconstructPositionLifecycles(lifecycleEvents);

  const attributedFills =
    attributeTakerFills(lifecycleEvents, takerFills);

  const trades = buildCompletedTrades({
    lifecycles,
    lifecycleEvents,
    attributedFills,
  });

  return {
    trades,
    analytics: calculateTraderAnalytics(trades),
    realizedDrawdown: calculateRealizedMaxDrawdown(trades),
  };
}
