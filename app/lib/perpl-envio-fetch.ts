import "server-only";
import { Agent, fetch } from "undici";

const ipv4Agent = new Agent({
  connect: {
    family: 4,
    timeout: 10000,
  },
});

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchPerplEnvio(
  endpoint: string,
  body: unknown,
  timeoutMs = 15000,
) {
  const startedAt = Date.now();
  const totalBudgetMs = Math.min(timeoutMs + 7000, 25000);

  for (let attempt = 0; attempt < 2; attempt++) {
    const remainingMs = totalBudgetMs - (Date.now() - startedAt);

    if (remainingMs <= 1000) {
      throw new Error("Envio request time budget exhausted");
    }

    const attemptTimeoutMs = Math.min(
      attempt === 0 ? timeoutMs : 6000,
      remainingMs,
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        dispatcher: ipv4Agent,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });

      if (
        RETRYABLE_STATUS.has(response.status) &&
        attempt === 0
      ) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === 1) throw error;

      console.warn(
        "Envio request failed; retrying once:",
        error instanceof Error ? error.message : String(error),
      );

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error("Envio request failed after retry");
}
