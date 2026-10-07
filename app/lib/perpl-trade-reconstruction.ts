export type PositionSide = 0 | 1; // Perpl: Long=0, Short=1

export type EventBase = {
  blockNumber: bigint;
  timestamp: bigint;
  transactionHash: string;
  logIndex: number;
};

export type PositionOpenEvent = EventBase & {
  kind: "open";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  leverageHdths: bigint;
  depositCNS: bigint;
  pricePNS: bigint;
  lotLNS: bigint;
  insFeeCNS: bigint;
  protFeeCNS: bigint;
};

export type PositionIncreaseEvent = EventBase & {
  kind: "increase";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  leverageHdths: bigint;
  startDepositCNS: bigint;
  endDepositCNS: bigint;
  pricePNS: bigint;
  startLotLNS: bigint;
  endLotLNS: bigint;
  insFeeCNS: bigint;
  protFeeCNS: bigint;
};

export type PositionDecreaseEvent = EventBase & {
  kind: "decrease";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  startDepositCNS: bigint;
  endDepositCNS: bigint;
  startLotLNS: bigint;
  endLotLNS: bigint;
  deltaPnlCNS: bigint;
  fundingCNS: bigint;
};

export type PositionCloseEvent = EventBase & {
  kind: "close";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  pricePNS: bigint;
  deltaPnlCNS: bigint;
  fundingCNS: bigint;
};

export type PositionInvertEvent = EventBase & {
  kind: "invert";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  leverageHdths: bigint;
  startDepositCNS: bigint;
  endDepositCNS: bigint;
  pricePNS: bigint;
  startLotLNS: bigint;
  endLotLNS: bigint;
  deltaPnlCNS: bigint;
  fundingCNS: bigint;
  insFeeCNS: bigint;
  protFeeCNS: bigint;
};

export type PositionLiquidationEvent = EventBase & {
  kind: "liquidation";
  perpId: bigint;
  accountId: bigint;
  positionType: PositionSide;
  deltaPnlCNS: bigint;
  fundingCNS: bigint;
};

export type LifecycleEvent =
  | PositionOpenEvent
  | PositionIncreaseEvent
  | PositionDecreaseEvent
  | PositionCloseEvent
  | PositionInvertEvent
  | PositionLiquidationEvent;

export type RealizedSegment = {
  accountId: bigint;
  perpId: bigint;
  side: PositionSide;
  reason: "decrease" | "close" | "invert" | "liquidation";
  grossPnlCNS: bigint;
  fundingCNS: bigint;
  realizedAt: bigint;
  transactionHash: string;
  logIndex: number;
};

export function compareLifecycleEvents(
  a: LifecycleEvent,
  b: LifecycleEvent,
): number {
  if (a.blockNumber !== b.blockNumber) {
    return a.blockNumber < b.blockNumber ? -1 : 1;
  }

  return a.logIndex - b.logIndex;
}

export function extractRealizedSegments(
  events: readonly LifecycleEvent[],
): RealizedSegment[] {
  return [...events]
    .sort(compareLifecycleEvents)
    .flatMap((event): RealizedSegment[] => {
      if (
        event.kind !== "decrease" &&
        event.kind !== "close" &&
        event.kind !== "invert" &&
        event.kind !== "liquidation"
      ) {
        return [];
      }

      return [{
        accountId: event.accountId,
        perpId: event.perpId,
        side:
          event.kind === "invert"
            ? (event.positionType === 0 ? 1 : 0)
            : event.positionType,
        reason: event.kind,
        grossPnlCNS: event.deltaPnlCNS,
        fundingCNS: event.fundingCNS,
        realizedAt: event.timestamp,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
      }];
    });
}

export function sumGrossRealizedPnlCNS(
  segments: readonly RealizedSegment[],
): bigint {
  return segments.reduce(
    (total, segment) => total + segment.grossPnlCNS,
    BigInt(0),
  );
}

export function sumFundingCNS(
  segments: readonly RealizedSegment[],
): bigint {
  return segments.reduce(
    (total, segment) => total + segment.fundingCNS,
    BigInt(0),
  );
}

export type PositionLifecycle = {
  accountId: bigint;
  perpId: bigint;
  side: PositionSide;
  openedAt: bigint | null;
  closedAt: bigint | null;
  openingTransactionHash: string | null;
  closingTransactionHash: string | null;
  openingLogIndex: number | null;
  closingLogIndex: number | null;
  entryPricePNS: bigint | null;
  initialLotLNS: bigint | null;
  finalReason: "close" | "invert" | "liquidation" | null;
  completeStart: boolean;
  completeEnd: boolean;
  realizedSegments: RealizedSegment[];
};

function lifecycleKey(
  accountId: bigint,
  perpId: bigint,
): string {
  return `${accountId.toString()}:${perpId.toString()}`;
}

export function reconstructPositionLifecycles(
  events: readonly LifecycleEvent[],
): PositionLifecycle[] {
  const ordered = [...events].sort(compareLifecycleEvents);
  const active = new Map<string, PositionLifecycle>();
  const completed: PositionLifecycle[] = [];

  function createIncomplete(event: LifecycleEvent): PositionLifecycle {
    return {
      accountId: event.accountId,
      perpId: event.perpId,
      side: event.positionType,
      openedAt: null,
      closedAt: null,
      openingTransactionHash: null,
      closingTransactionHash: null,
      openingLogIndex: null,
      closingLogIndex: null,
      entryPricePNS: null,
      initialLotLNS: null,
      finalReason: null,
      completeStart: false,
      completeEnd: false,
      realizedSegments: [],
    };
  }

  for (const event of ordered) {
    const key = lifecycleKey(event.accountId, event.perpId);

    if (event.kind === "open") {
      const previous = active.get(key);

      // Preserve an already-observed incomplete lifecycle rather than
      // silently merging it with a later, independently opened position.
      if (previous) {
        completed.push(previous);
      }

      active.set(key, {
        accountId: event.accountId,
        perpId: event.perpId,
        side: event.positionType,
        openedAt: event.timestamp,
        closedAt: null,
        openingTransactionHash: event.transactionHash,
        closingTransactionHash: null,
        openingLogIndex: event.logIndex,
        closingLogIndex: null,
        entryPricePNS: event.pricePNS,
        initialLotLNS: event.lotLNS,
        finalReason: null,
        completeStart: true,
        completeEnd: false,
        realizedSegments: [],
      });

      continue;
    }

    let lifecycle = active.get(key);

    if (!lifecycle) {
      lifecycle = createIncomplete(event);
      active.set(key, lifecycle);
    }

    if (event.kind === "increase") {
      lifecycle.side = event.positionType;
      continue;
    }

    if (event.kind === "decrease") {
      lifecycle.side = event.positionType;
      lifecycle.realizedSegments.push({
        accountId: event.accountId,
        perpId: event.perpId,
        side: event.positionType,
        reason: "decrease",
        grossPnlCNS: event.deltaPnlCNS,
        fundingCNS: event.fundingCNS,
        realizedAt: event.timestamp,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
      });
      continue;
    }

    lifecycle.realizedSegments.push({
      accountId: event.accountId,
      perpId: event.perpId,
      side:
        event.kind === "invert"
          ? lifecycle.side
          : event.positionType,
      reason: event.kind,
      grossPnlCNS: event.deltaPnlCNS,
      fundingCNS: event.fundingCNS,
      realizedAt: event.timestamp,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    });

    if (event.kind === "invert") {
      // Inversion realizes the old side and immediately establishes
      // a new position on the opposite side. Finish the old lifecycle.
      lifecycle.closedAt = event.timestamp;
      lifecycle.closingTransactionHash = event.transactionHash;
      lifecycle.closingLogIndex = event.logIndex;
      lifecycle.finalReason = "invert";
      lifecycle.completeEnd = true;

      completed.push(lifecycle);

      // positionType on PositionInverted represents the resulting side.
      active.set(key, {
        accountId: event.accountId,
        perpId: event.perpId,
        side: event.positionType,
        openedAt: event.timestamp,
        closedAt: null,
        openingTransactionHash: event.transactionHash,
        closingTransactionHash: null,
        openingLogIndex: event.logIndex,
        closingLogIndex: null,
        entryPricePNS: event.pricePNS,
        initialLotLNS: event.endLotLNS,
        finalReason: null,
        completeStart: true,
        completeEnd: false,
        realizedSegments: [],
      });

      continue;
    }

    lifecycle.closedAt = event.timestamp;
    lifecycle.closingTransactionHash = event.transactionHash;
    lifecycle.closingLogIndex = event.logIndex;
    lifecycle.finalReason = event.kind;
    lifecycle.completeEnd = true;

    completed.push(lifecycle);
    active.delete(key);
  }

  return [
    ...completed,
    ...active.values(),
  ];
}

export function isCompleteLifecycle(
  lifecycle: PositionLifecycle,
): boolean {
  return lifecycle.completeStart && lifecycle.completeEnd;
}

export function holdingTimeSeconds(
  lifecycle: PositionLifecycle,
): bigint | null {
  if (
    !isCompleteLifecycle(lifecycle) ||
    lifecycle.openedAt === null ||
    lifecycle.closedAt === null
  ) {
    return null;
  }

  return lifecycle.closedAt - lifecycle.openedAt;
}

export type TakerFill = EventBase & {
  entryPricePNS: bigint;
  collatPricePNS: bigint;
  pnlPricePNS: bigint;
  lotLNS: bigint;
  feeCNS: bigint;
  amountCNS: bigint;
  balanceCNS: bigint;
  builderId: bigint;
  builderFeeCNS: bigint;
};

export type AttributedTakerFill = {
  lifecycleEvent: LifecycleEvent;
  fill: TakerFill;
  totalFeeCNS: bigint;
};

function sameTransaction(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function attributeTakerFills(
  lifecycleEvents: readonly LifecycleEvent[],
  fills: readonly TakerFill[],
): AttributedTakerFill[] {
  const fillsByTransaction = new Map<string, TakerFill[]>();

  for (const fill of fills) {
    const key = fill.transactionHash.toLowerCase();
    const existing = fillsByTransaction.get(key) ?? [];
    existing.push(fill);
    fillsByTransaction.set(key, existing);
  }

  const attributed: AttributedTakerFill[] = [];

  for (const event of lifecycleEvents) {
    const candidates =
      fillsByTransaction.get(event.transactionHash.toLowerCase()) ?? [];

    const exact = candidates.filter(
      (fill) =>
        sameTransaction(fill.transactionHash, event.transactionHash) &&
        fill.logIndex === event.logIndex + 1,
    );

    // Fail closed: never guess if ordering is missing or ambiguous.
    if (exact.length !== 1) {
      continue;
    }

    const fill = exact[0];

    attributed.push({
      lifecycleEvent: event,
      fill,
      totalFeeCNS: fill.feeCNS + fill.builderFeeCNS,
    });
  }

  return attributed;
}

export function sumAttributedTakerFeesCNS(
  attributed: readonly AttributedTakerFill[],
): bigint {
  return attributed.reduce(
    (total, item) => total + item.totalFeeCNS,
    BigInt(0),
  );
}

export function calculateNetRealizedPnlCNS(args: {
  grossPnlCNS: bigint;
  fundingCNS: bigint;
  takerFeesCNS: bigint;
}): bigint {
  return args.grossPnlCNS + args.fundingCNS - args.takerFeesCNS;
}

export type CompletedTrade = {
  accountId: bigint;
  perpId: bigint;
  side: PositionSide;
  openedAt: bigint;
  closedAt: bigint;
  holdingTimeSeconds: bigint;
  grossPnlCNS: bigint;
  fundingCNS: bigint;
  takerFeesCNS: bigint;
  netPnlCNS: bigint;
  outcome: "win" | "loss" | "breakeven";
  finalReason: "close" | "invert" | "liquidation";
};

function eventIdentity(event: LifecycleEvent): string {
  return [
    event.transactionHash.toLowerCase(),
    event.logIndex.toString(),
  ].join(":");
}

export function buildCompletedTrades(args: {
  lifecycles: readonly PositionLifecycle[];
  lifecycleEvents: readonly LifecycleEvent[];
  attributedFills: readonly AttributedTakerFill[];
}): CompletedTrade[] {
  const eventByIdentity = new Map<string, LifecycleEvent>();

  for (const event of args.lifecycleEvents) {
    eventByIdentity.set(eventIdentity(event), event);
  }

  const feeByEvent = new Map<string, bigint>();

  for (const attributed of args.attributedFills) {
    const key = eventIdentity(attributed.lifecycleEvent);
    feeByEvent.set(
      key,
      (feeByEvent.get(key) ?? BigInt(0)) + attributed.totalFeeCNS,
    );
  }

  const completed: CompletedTrade[] = [];

  for (const lifecycle of args.lifecycles) {
    const hold = holdingTimeSeconds(lifecycle);

    if (
      !isCompleteLifecycle(lifecycle) ||
      lifecycle.openedAt === null ||
      lifecycle.closedAt === null ||
      lifecycle.openingTransactionHash === null ||
      lifecycle.finalReason === null ||
      hold === null
    ) {
      continue;
    }

    const openedAt = lifecycle.openedAt;
    const closedAt = lifecycle.closedAt;

    const relevantEvents = args.lifecycleEvents.filter((event) => {
      if (
        event.accountId !== lifecycle.accountId ||
        event.perpId !== lifecycle.perpId
      ) {
        return false;
      }

      if (
        event.timestamp < openedAt ||
        event.timestamp > closedAt
      ) {
        return false;
      }

      const isOpeningBoundary =
        lifecycle.openingTransactionHash !== null &&
        lifecycle.openingLogIndex !== null &&
        sameTransaction(
          event.transactionHash,
          lifecycle.openingTransactionHash,
        ) &&
        event.logIndex === lifecycle.openingLogIndex;

      const isClosingBoundary =
        lifecycle.closingTransactionHash !== null &&
        lifecycle.closingLogIndex !== null &&
        sameTransaction(
          event.transactionHash,
          lifecycle.closingTransactionHash,
        ) &&
        event.logIndex === lifecycle.closingLogIndex;

      // PositionInverted is one action that closes the old lifecycle and
      // establishes the new side. Its taker fee belongs to the lifecycle
      // whose PnL is realized by the inversion, so do not charge the same
      // inversion event again as the new lifecycle's opening fee.
      if (
        isOpeningBoundary &&
        event.kind === "invert"
      ) {
        return false;
      }

      if (
        event.timestamp === openedAt &&
        lifecycle.openingLogIndex !== null &&
        !isOpeningBoundary &&
        event.logIndex < lifecycle.openingLogIndex
      ) {
        return false;
      }

      if (
        event.timestamp === closedAt &&
        lifecycle.closingLogIndex !== null &&
        !isClosingBoundary &&
        event.logIndex > lifecycle.closingLogIndex
      ) {
        return false;
      }

      return true;
    });

    // A complete lifecycle must have a deterministically attributed taker
    // fill for every trade-mutating lifecycle event. Otherwise fail closed.
    const feeBearingEvents = relevantEvents.filter(
      (event) =>
        event.kind === "open" ||
        event.kind === "increase" ||
        event.kind === "decrease" ||
        event.kind === "close" ||
        event.kind === "invert",
    );

    if (
      feeBearingEvents.some(
        (event) => !feeByEvent.has(eventIdentity(event)),
      )
    ) {
      continue;
    }

    const takerFeesCNS = feeBearingEvents.reduce(
      (total, event) =>
        total + (feeByEvent.get(eventIdentity(event)) ?? BigInt(0)),
      BigInt(0),
    );

    const grossPnlCNS = sumGrossRealizedPnlCNS(
      lifecycle.realizedSegments,
    );

    const fundingCNS = sumFundingCNS(
      lifecycle.realizedSegments,
    );

    const netPnlCNS = calculateNetRealizedPnlCNS({
      grossPnlCNS,
      fundingCNS,
      takerFeesCNS,
    });

    completed.push({
      accountId: lifecycle.accountId,
      perpId: lifecycle.perpId,
      side: lifecycle.side,
      openedAt: lifecycle.openedAt,
      closedAt: lifecycle.closedAt,
      holdingTimeSeconds: hold,
      grossPnlCNS,
      fundingCNS,
      takerFeesCNS,
      netPnlCNS,
      outcome:
        netPnlCNS > BigInt(0)
          ? "win"
          : netPnlCNS < BigInt(0)
            ? "loss"
            : "breakeven",
      finalReason: lifecycle.finalReason,
    });
  }

  return completed.sort((a, b) => {
    if (a.closedAt === b.closedAt) return 0;
    return a.closedAt < b.closedAt ? -1 : 1;
  });
}

export type TraderAnalytics = {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalNetPnlCNS: bigint;
  grossProfitCNS: bigint;
  grossLossCNS: bigint;
  profitFactor: number | null;
  bestTradeCNS: bigint | null;
  worstTradeCNS: bigint | null;
  averageHoldingTimeSeconds: number | null;
  longestWinningStreak: number;
  longestLosingStreak: number;
};

export function calculateTraderAnalytics(
  trades: readonly CompletedTrade[],
): TraderAnalytics {
  const ordered = [...trades].sort((a, b) => {
    if (a.closedAt === b.closedAt) return 0;
    return a.closedAt < b.closedAt ? -1 : 1;
  });

  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  let totalNetPnlCNS = BigInt(0);
  let grossProfitCNS = BigInt(0);
  let grossLossCNS = BigInt(0);
  let totalHoldingSeconds = BigInt(0);

  let bestTradeCNS: bigint | null = null;
  let worstTradeCNS: bigint | null = null;

  let currentWinningStreak = 0;
  let currentLosingStreak = 0;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;

  for (const trade of ordered) {
    totalNetPnlCNS += trade.netPnlCNS;
    totalHoldingSeconds += trade.holdingTimeSeconds;

    if (
      bestTradeCNS === null ||
      trade.netPnlCNS > bestTradeCNS
    ) {
      bestTradeCNS = trade.netPnlCNS;
    }

    if (
      worstTradeCNS === null ||
      trade.netPnlCNS < worstTradeCNS
    ) {
      worstTradeCNS = trade.netPnlCNS;
    }

    if (trade.netPnlCNS > BigInt(0)) {
      wins += 1;
      grossProfitCNS += trade.netPnlCNS;

      currentWinningStreak += 1;
      currentLosingStreak = 0;

      longestWinningStreak = Math.max(
        longestWinningStreak,
        currentWinningStreak,
      );
    } else if (trade.netPnlCNS < BigInt(0)) {
      losses += 1;
      grossLossCNS += -trade.netPnlCNS;

      currentLosingStreak += 1;
      currentWinningStreak = 0;

      longestLosingStreak = Math.max(
        longestLosingStreak,
        currentLosingStreak,
      );
    } else {
      breakeven += 1;
      currentWinningStreak = 0;
      currentLosingStreak = 0;
    }
  }

  const decisiveTrades = wins + losses;

  return {
    totalTrades: ordered.length,
    wins,
    losses,
    breakeven,
    winRate:
      decisiveTrades === 0
        ? null
        : wins / decisiveTrades,
    totalNetPnlCNS,
    grossProfitCNS,
    grossLossCNS,
    profitFactor:
      grossLossCNS === BigInt(0)
        ? grossProfitCNS > BigInt(0)
          ? Number.POSITIVE_INFINITY
          : null
        : Number(grossProfitCNS) / Number(grossLossCNS),
    bestTradeCNS,
    worstTradeCNS,
    averageHoldingTimeSeconds:
      ordered.length === 0
        ? null
        : Number(totalHoldingSeconds) / ordered.length,
    longestWinningStreak,
    longestLosingStreak,
  };
}

export type RealizedDrawdown = {
  maxDrawdownCNS: bigint;
  peakEquityCNS: bigint;
  troughEquityCNS: bigint;
};

export function calculateRealizedMaxDrawdown(
  trades: readonly CompletedTrade[],
): RealizedDrawdown {
  const ordered = [...trades].sort((a, b) => {
    if (a.closedAt === b.closedAt) return 0;
    return a.closedAt < b.closedAt ? -1 : 1;
  });

  let equity = BigInt(0);
  let peak = BigInt(0);

  let maxDrawdownCNS = BigInt(0);
  let maxDrawdownPeak = BigInt(0);
  let maxDrawdownTrough = BigInt(0);

  for (const trade of ordered) {
    equity += trade.netPnlCNS;

    if (equity > peak) {
      peak = equity;
    }

    const drawdown = peak - equity;

    if (drawdown > maxDrawdownCNS) {
      maxDrawdownCNS = drawdown;
      maxDrawdownPeak = peak;
      maxDrawdownTrough = equity;
    }
  }

  return {
    maxDrawdownCNS,
    peakEquityCNS: maxDrawdownPeak,
    troughEquityCNS: maxDrawdownTrough,
  };
}
