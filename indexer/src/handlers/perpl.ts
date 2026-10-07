import { indexer } from "envio";

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionOpenedV2" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionOpen.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.accountId,
      positionType: Number(p.positionType),
      leverageHdths: p.leverageHdths,
      depositCNS: p.depositCNS,
      pnlCollateralizedCNS: p.pnlCollateralizedCNS,
      pricePNS: p.pricePNS,
      lotLNS: p.lotLNS,
      insFeeCNS: p.insFeeCNS,
      protFeeCNS: p.protFeeCNS,
      priceResiduePNSQ16: p.priceResiduePNSQ16,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionClosed" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionClose.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.accountId,
      positionType: Number(p.positionType),
      pricePNS: p.pricePNS,
      deltaPnlCNS: p.deltaPnlCNS,
      fundingCNS: p.fundingCNS,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionIncreasedV2" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionIncrease.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.accountId,
      positionType: Number(p.positionType),
      leverageHdths: p.leverageHdths,
      startDepositCNS: p.startDepositCNS,
      endDepositCNS: p.endDepositCNS,
      pnlCollateralizedCNS: p.pnlCollateralizedCNS,
      premiumPnlSettledCNS: p.premiumPnlSettledCNS,
      maxNegPnlCollatBPS: p.maxNegPnlCollatBPS,
      pricePNS: p.pricePNS,
      startLotLNS: p.startLotLNS,
      endLotLNS: p.endLotLNS,
      insFeeCNS: p.insFeeCNS,
      protFeeCNS: p.protFeeCNS,
      priceResiduePNSQ16: p.priceResiduePNSQ16,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionDecreased" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionDecrease.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.accountId,
      positionType: Number(p.positionType),
      startDepositCNS: p.startDepositCNS,
      endDepositCNS: p.endDepositCNS,
      startLotLNS: p.startLotLNS,
      endLotLNS: p.endLotLNS,
      deltaPnlCNS: p.deltaPnlCNS,
      fundingCNS: p.fundingCNS,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionInverted" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionInvert.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.accountId,
      positionType: Number(p.positionType),
      leverageHdths: p.leverageHdths,
      startDepositCNS: p.startDepositCNS,
      endDepositCNS: p.endDepositCNS,
      pnlCollateralizedCNS: p.pnlCollateralizedCNS,
      pricePNS: p.pricePNS,
      startLotLNS: p.startLotLNS,
      endLotLNS: p.endLotLNS,
      deltaPnlCNS: p.deltaPnlCNS,
      fundingCNS: p.fundingCNS,
      insFeeCNS: p.insFeeCNS,
      protFeeCNS: p.protFeeCNS,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);

indexer.onEvent(
  { contract: "PerplExchange", event: "PositionLiquidated" },
  async ({ event, context }) => {
    const p = event.params;

    context.PositionLiquidation.set({
      id: `${event.chainId}-${event.transaction.hash}-${event.logIndex}`,
      perpId: p.perpId,
      accountId: p.posAccountId,
      positionType: Number(p.positionType),
      markPricePNS: p.markPricePNS,
      liqPricePNS: p.liqPricePNS,
      liqLotLNS: p.liqLotLNS,
      posLotLNS: p.posLotLNS,
      deltaPnlCNS: p.deltaPnlCNS,
      fundingCNS: p.fundingCNS,
      posAmountCNS: p.posAmountCNS,
      posDepositCNS: p.posDepositCNS,
      accAmountCNS: p.accAmountCNS,
      accBalanceCNS: p.accBalanceCNS,
      onOrderBook: p.onOrderBook,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  }
);
