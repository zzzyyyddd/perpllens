import crypto from "node:crypto";
import * as ed from "@noble/ed25519";

const BASE_URL = "https://app.perpl.xyz/api";
const CHAIN_ID = "143";

export class PerplApiError extends Error {
  status: number;
  responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`Perpl API ${status}: ${responseBody}`);
    this.name = "PerplApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

function getCredentials() {
  const apiKey = process.env.PERPL_API_KEY;
  const secret = process.env.PERPL_API_KEY_SECRET?.replace(/^0x/, "");

  if (!apiKey || !secret) {
    throw new Error("Perpl API credentials are not configured");
  }

  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error("Invalid Perpl API secret");
  }

  return { apiKey, secret };
}

export async function perplAuthenticatedGet(path: string) {
  if (!path.startsWith("/")) {
    throw new Error("Perpl API path must start with /");
  }

  const { apiKey, secret } = getCredentials();

  const method = "GET";
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const bodyHash = crypto
    .createHash("sha256")
    .update("")
    .digest("hex");

  const canonical = [
    CHAIN_ID,
    method,
    path,
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");

  const signatureBytes = await ed.signAsync(
    new TextEncoder().encode(canonical),
    Buffer.from(secret, "hex")
  );

  const signature = Buffer.from(signatureBytes).toString("base64url");

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-API-Key": apiKey,
      "X-API-Timestamp": timestamp,
      "X-API-Nonce": nonce,
      "X-API-Signature": signature,
    },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new PerplApiError(response.status, text);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Perpl API returned invalid JSON");
  }
}
