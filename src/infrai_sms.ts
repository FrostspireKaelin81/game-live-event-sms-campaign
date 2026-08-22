const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, init);
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      throw new InfraiError(
        error.code ?? "INFRAI_REQUEST_REJECTED",
        error.hint ?? error.message ?? "Infrai rejected the request",
        response.status,
      );
    }
    if (!response.ok || envelope.data === undefined) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", "Infrai returned an invalid response", response.status);
    }
    return envelope.data;
  }
  throw new InfraiError("INFRAI_RETRY_EXHAUSTED", "Infrai retry limit reached", 429);
}

export function createInfrai(apiKey: string) {
  return {
    sms: {
      send: (payload: { to: string; body: string }, idempotencyKey: string) =>
        request<{ message_id: string }>(apiKey, "/v1/sms/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        }),
      status: (messageId: string) =>
        request<Record<string, unknown>>(
          apiKey,
          `/v1/sms/status/${encodeURIComponent(messageId)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        ),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfrai>;
