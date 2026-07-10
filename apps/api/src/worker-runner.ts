import type { PublicContextResponse } from "@supacontext/core";
import { ApiError } from "./errors.js";

export type ContextJobRunResult =
  | {
      id: string;
      status: "completed";
      result: Omit<PublicContextResponse, "id" | "query" | "effort" | "status">;
    }
  | {
      id: string;
      status: "failed";
      error: {
        code: string;
        message: string;
      };
    }
  | {
      id: string;
      status: "skipped";
      reason: string;
    };

export interface ContextJobRunner {
  runContextJob(requestId: string): Promise<ContextJobRunResult>;
}

export class HttpContextJobRunner implements ContextJobRunner {
  constructor(
    private readonly workerUrl: string,
    private readonly internalToken?: string,
  ) {}

  async runContextJob(requestId: string): Promise<ContextJobRunResult> {
    const destination = `${this.workerUrl.replace(/\/$/, "")}/v1/jobs/context/${encodeURIComponent(requestId)}`;
    let response: Response;

    try {
      response = await fetch(destination, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.internalToken ? { "x-supacontext-worker-token": this.internalToken } : {}),
        },
        body: JSON.stringify({ requestId }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ApiError(
        500,
        "internal_error",
        "Context worker did not respond before the request timeout.",
      );
    }

    if (!response.ok) {
      throw new ApiError(500, "internal_error", "Context worker failed to process the request.");
    }

    return (await response.json()) as ContextJobRunResult;
  }
}

export function mapWorkerFailureToApiError(error: { code: string; message: string }): ApiError {
  if (error.code === "provider_error") {
    return new ApiError(502, "provider_error", error.message);
  }

  if (error.code === "invalid_model_output") {
    return new ApiError(502, "invalid_model_output", error.message);
  }

  if (error.code === "job_not_found") {
    return new ApiError(404, "job_not_found", "Context job not found.");
  }

  if (error.code === "budget_exhausted") {
    return new ApiError(402, "budget_exhausted", error.message);
  }

  return new ApiError(502, "model_error", "The research model could not compile context.");
}
