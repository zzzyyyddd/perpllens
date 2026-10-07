import { createPublicClient, formatUnits, http } from "viem";
import { monad } from "viem/chains";

export const PERPL_EXCHANGE =
  "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F" as const;

const client = createPublicClient({
  chain: monad,
  transport: http("https://rpc.monad.xyz"),
});

const accountAbi = [
  {
    type: "function",
    name: "getAccountByAddr",
    stateMutability: "view",
    inputs: [{ name: "accountAddress", type: "address" }],
    outputs: [
      {
        name: "accountInfo",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "balanceCNS", type: "uint256" },
          { name: "lockedBalanceCNS", type: "uint256" },
          { name: "frozen", type: "uint8" },
          { name: "accountAddr", type: "address" },
          {
            name: "positions",
            type: "tuple",
            components: [
              { name: "bank1", type: "uint256" },
              { name: "bank2", type: "uint256" },
              { name: "bank3", type: "uint256" },
              { name: "bank4", type: "uint256" },
            ],
          },
        ],
      },
    ],
  },
] as const;

type PositionBitmap = {
  bank1: bigint;
  bank2: bigint;
  bank3: bigint;
  bank4: bigint;
};

export function decodePositionBitmap(bitmap: PositionBitmap): number[] {
  const banks = [
    { offset: 0, bits: 253, value: bitmap.bank1 },
    { offset: 253, bits: 256, value: bitmap.bank2 },
    { offset: 509, bits: 256, value: bitmap.bank3 },
    { offset: 765, bits: 256, value: bitmap.bank4 },
  ];

  const perpetualIds: number[] = [];

  for (const bank of banks) {
    for (let bit = 0; bit < bank.bits; bit++) {
      if ((bank.value & (BigInt(1) << BigInt(bit))) !== BigInt(0)) {
        perpetualIds.push(bank.offset + bit);
      }
    }
  }

  return perpetualIds;
}

export async function getPerplAccountOnchain(address: `0x${string}`) {
  const account = await client.readContract({
    address: PERPL_EXCHANGE,
    abi: accountAbi,
    functionName: "getAccountByAddr",
    args: [address],
  });

  const activePerpetualIds = decodePositionBitmap(account.positions);
  const activePositions = await getPerplActivePositions(
    Number(account.accountId),
    activePerpetualIds
  );

  return {
    accountId: Number(account.accountId),
    address: account.accountAddr,
    balance: Number(formatUnits(account.balanceCNS, 6)),
    lockedBalance: Number(formatUnits(account.lockedBalanceCNS, 6)),
    availableBalance: Number(
      formatUnits(account.balanceCNS - account.lockedBalanceCNS, 6)
    ),
    frozen: Number(account.frozen),
    activePerpetualIds,
    activePositions,
  };
}

const positionAbi = [
  {
    type: "function",
    name: "getPositionV2",
    stateMutability: "view",
    inputs: [
      { name: "perpId", type: "uint256" },
      { name: "accountId", type: "uint256" },
    ],
    outputs: [
      {
        name: "positionInfo",
        type: "tuple",
        components: [
          { name: "accountId", type: "uint256" },
          { name: "nextNodeId", type: "uint256" },
          { name: "prevNodeId", type: "uint256" },
          { name: "positionType", type: "uint8" },
          { name: "depositCNS", type: "uint256" },
          { name: "pricePNS", type: "uint256" },
          { name: "lotLNS", type: "uint256" },
          { name: "entryBlock", type: "uint256" },
          { name: "pnlCNS", type: "int256" },
          { name: "deltaPnlCNS", type: "int256" },
          { name: "premiumPnlCNS", type: "int256" },
          { name: "priceResiduePNSQ16", type: "uint256" },
        ],
      },
      { name: "markPricePNS", type: "uint256" },
      { name: "markPriceValid", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getPerpetualInfoV2",
    stateMutability: "view",
    inputs: [{ name: "perpId", type: "uint256" }],
    outputs: [
      {
        name: "perpetualInfo",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "priceDecimals", type: "uint256" },
          { name: "lotDecimals", type: "uint256" },
          { name: "linkFeedId", type: "bytes32" },
          { name: "priceTolPer100K", type: "uint256" },
          { name: "marginTol", type: "uint256" },
          { name: "marginTolDecimals", type: "uint256" },
          { name: "refPriceMaxAgeSec", type: "uint256" },
          { name: "positionBalanceCNS", type: "uint256" },
          { name: "insuranceBalanceCNS", type: "uint256" },
          { name: "markPNS", type: "uint256" },
          { name: "markTimestamp", type: "uint256" },
          { name: "lastPNS", type: "uint256" },
          { name: "lastTimestamp", type: "uint256" },
          { name: "oraclePNS", type: "uint256" },
          { name: "oracleTimestampSec", type: "uint256" },
          { name: "longOpenInterestLNS", type: "uint256" },
          { name: "shortOpenInterestLNS", type: "uint256" },
          { name: "fundingStartBlock", type: "uint256" },
          { name: "fundingRatePct100k", type: "int16" },
          { name: "absFundingClampPctPer100K", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "basePricePNS", type: "uint256" },
          { name: "maxBidPriceONS", type: "uint256" },
          { name: "minBidPriceONS", type: "uint256" },
          { name: "maxAskPriceONS", type: "uint256" },
          { name: "minAskPriceONS", type: "uint256" },
          { name: "numOrders", type: "uint256" },
          { name: "ignOracle", type: "bool" },
          { name: "fundingSumScalingExp", type: "uint256" },
        ],
      },
    ],
  },
] as const;

function signedUnits(value: bigint, decimals = 6): number {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const converted = Number(formatUnits(absolute, decimals));
  return negative ? -converted : converted;
}

function effectiveEntryPrice(
  positionType: number,
  pricePNS: bigint,
  residue: bigint,
  priceDecimals: number
): number {
  const scale = 10 ** priceDecimals;

  if (residue === BigInt(0)) {
    return Number(pricePNS) / scale;
  }

  const q = 65536;
  let base = Number(pricePNS);

  // Official Perpl SDK:
  // LONG stores the rounded-up PNS value, so subtract one unit
  // before restoring the Q16 residue.
  if (positionType === 0 && base >= 1) {
    base -= 1;
  }

  return (base + Number(residue) / q) / scale;
}

export async function getPerplActivePositions(
  accountId: number,
  perpetualIds: number[]
) {
  return Promise.all(
    perpetualIds.map(async (perpId) => {
      const [positionResult, perpetual] = await Promise.all([
        client.readContract({
          address: PERPL_EXCHANGE,
          abi: positionAbi,
          functionName: "getPositionV2",
          args: [BigInt(perpId), BigInt(accountId)],
        }),
        client.readContract({
          address: PERPL_EXCHANGE,
          abi: positionAbi,
          functionName: "getPerpetualInfoV2",
          args: [BigInt(perpId)],
        }),
      ]);

      const [position, markPricePNS, markPriceValid] = positionResult;

      const priceDecimals = Number(perpetual.priceDecimals);
      const lotDecimals = Number(perpetual.lotDecimals);
      const positionType = Number(position.positionType);

      return {
        perpetualId: perpId,
        name: perpetual.name,
        symbol: perpetual.symbol,
        side:
          positionType === 0
            ? "LONG"
            : positionType === 1
              ? "SHORT"
              : "UNKNOWN",
        size: Number(formatUnits(position.lotLNS, lotDecimals)),
        collateral: Number(formatUnits(position.depositCNS, 6)),
        entryPrice: effectiveEntryPrice(
          positionType,
          position.pricePNS,
          position.priceResiduePNSQ16,
          priceDecimals
        ),
        markPrice: Number(formatUnits(markPricePNS, priceDecimals)),
        markPriceValid,
        pnl: signedUnits(position.pnlCNS),
        deltaPnl: signedUnits(position.deltaPnlCNS),
        premiumPnl: signedUnits(position.premiumPnlCNS),
        entryBlock: Number(position.entryBlock),
      };
    })
  );
}
