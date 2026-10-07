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
