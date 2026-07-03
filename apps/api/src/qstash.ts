import type { ContextDepth, Platform } from "@supacontext/core";
import { ApiError } from "./errors.js";

export type EnqueueContextJobInput = {
  requestId: string;
  workspaceId: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  webhookUrl?: string;
  metadata?: unknown;
};

export type EnqueueContextJobResult = {
  messageId: string;
};

export interface QstashClient {
  enqueueContextJob(input: EnqueueContextJobInput): Promise<EnqueueContextJobResult>;
}

export class NoopQstashClient implements QstashClient {
  async enqueueContextJob(input: EnqueueContextJobInput): Promise<EnqueueContextJobResult> {
    return {
      messageId: `dev_${input.requestId}`,
    };
  }
}

class LocalWorkerQstashClient implements QstashClient {
  constructor(private readonly workerUrl: string) {}

  async enqueueContextJob(input: EnqueueContextJobInput): Promise<EnqueueContextJobResult> {
    const destination = `${this.workerUrl.replace(/\/$/, "")}/v1/jobs/context`;

    try {
      const response = await fetch(destination, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        throw new Error(`Local worker returned status ${response.status}.`);
      }
    } catch {
      throw new ApiError(503, "QUEUE_UNAVAILABLE", "Could not enqueue context job.");
    }

    return {
      messageId: `local_${input.requestId}`,
    };
  }
}

class HttpQstashClient implements QstashClient {
  constructor(
    private readonly token: string,
    private readonly workerUrl: string,
  ) {}

  async enqueueContextJob(input: EnqueueContextJobInput): Promise<EnqueueContextJobResult> {
    const destination = `${this.workerUrl.replace(/\/$/, "")}/v1/jobs/context`;
    let response: Response;

    try {
      response = await fetch(
        `https://qstash.upstash.io/v2/publish/${encodeURIComponent(destination)}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      throw new ApiError(503, "QUEUE_UNAVAILABLE", "Could not enqueue context job.");
    }

    if (!response.ok) {
      throw new ApiError(503, "QUEUE_UNAVAILABLE", "Could not enqueue context job.");
    }

    const data = (await response.json()) as { messageId?: unknown };
    const messageId = typeof data.messageId === "string" ? data.messageId : `qstash_${input.requestId}`;

    return {
      messageId,
    };
  }
}

export function createQstashClient(input: {
  nodeEnv: string;
  qstashToken: string | undefined;
  workerUrl: string;
  warn?: (message: string) => void;
}): QstashClient {
  if (input.qstashToken) {
    return new HttpQstashClient(input.qstashToken, input.workerUrl);
  }

  if (input.nodeEnv === "production") {
    throw new Error("QSTASH_TOKEN must be configured in production.");
  }

  input.warn?.("QStash is not configured; dispatching context jobs directly to the local worker.");

  return new LocalWorkerQstashClient(input.workerUrl);
}
