import "server-only";
import { Agent, fetch } from "undici";

const ipv4Agent = new Agent({
  connect: {
    family: 4,
    timeout: 10000,
  },
});

export async function fetchPerplEnvio(
  endpoint: string,
  body: unknown,
  timeoutMs = 15000,
) {
  return fetch(endpoint, {
    method: "POST",
    dispatcher: ipv4Agent,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
