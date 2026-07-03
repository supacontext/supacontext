import type { PublicContextResult } from "./public-result.js";

export type WebhookPayload =
  | {
      id: string;
      status: "completed";
      result: PublicContextResult;
    }
  | {
      id: string;
      status: "failed";
      error: {
        code: string;
        message: string;
      };
    };

export interface WebhookSender {
  send(url: string, payload: WebhookPayload): Promise<void>;
}

export class HttpWebhookSender implements WebhookSender {
  async send(url: string, payload: WebhookPayload): Promise<void> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}.`);
    }
  }
}
