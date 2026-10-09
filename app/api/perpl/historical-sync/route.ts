import { NextRequest, NextResponse } from "next/server";

import { runPerplSyncBatch } from "@/app/lib/perpl-sync-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expectedKey = process.env.PERPL_SYNC_API_KEY;

  if (!expectedKey) {
    return NextResponse.json(
      { status: "disabled" },
      { status: 503 },
    );
  }

  if (request.headers.get("x-perpl-sync-key") !== expectedKey) {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  const accountId =
    typeof body === "object" &&
    body !== null &&
    "accountId" in body &&
    typeof body.accountId === "string"
      ? body.accountId
      : "";

  if (!/^\d{1,20}$/.test(accountId)) {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const result = await runPerplSyncBatch(accountId);

    return NextResponse.json(result, {
      status: result.status === "busy" ? 202 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Historical sync failed:", error);

    return NextResponse.json(
      { status: "error", error: "Historical sync failed" },
      { status: 500 },
    );
  }
}
