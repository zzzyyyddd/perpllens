import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getPerplAccountOnchain } from "@/app/lib/perpl-onchain";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawAddress = request.nextUrl.searchParams.get("address")?.trim();

  if (!rawAddress || !isAddress(rawAddress)) {
    return NextResponse.json(
      {
        status: "invalid_address",
        message: "A valid EVM wallet address is required.",
      },
      { status: 400 }
    );
  }

  const address = getAddress(rawAddress);

  try {
    const account = await getPerplAccountOnchain(address);

    return NextResponse.json(
      {
        status: "ok",
        source: "monad_mainnet",
        chainId: 143,
        account,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        },
      }
    );
  } catch (error) {
    console.error("Perpl onchain wallet lookup failed:", error);

    return NextResponse.json(
      {
        status: "account_unavailable",
        source: "monad_mainnet",
        chainId: 143,
        message:
          "No readable Perpl account was found for this address, or Monad RPC is temporarily unavailable.",
        updatedAt: new Date().toISOString(),
      },
      { status: 404 }
    );
  }
}
