import { billingErrorToResponse, processCreemWebhook } from "../../../../../lib/server/billing";

const maxWebhookBytes = 64 * 1024;

function readSignature(request: Request): string | null {
  return (
    request.headers.get("creem-signature") ??
    request.headers.get("x-creem-signature") ??
    request.headers.get("webhook-signature")
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > maxWebhookBytes) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "Webhook payload is too large.",
        },
      },
      { status: 413 },
    );
  }

  const signature = readSignature(request);

  if (!signature) {
    return Response.json(
      {
        error: {
          code: "unauthorized",
          message: "Missing Creem webhook signature.",
        },
      },
      { status: 401 },
    );
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > maxWebhookBytes) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "Webhook payload is too large.",
        },
      },
      { status: 413 },
    );
  }

  try {
    const result = await processCreemWebhook(rawBody, signature);

    return Response.json({
      received: true,
      event_type: result.eventType,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return billingErrorToResponse(error);
  }
}
