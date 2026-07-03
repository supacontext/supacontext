import type { ZodError } from "zod";

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden_depth"
  | "insufficient_credits"
  | "rate_limited"
  | "provider_error"
  | "model_error"
  | "invalid_model_output"
  | "job_not_found"
  | "idempotency_key_conflict"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function formatError(error: ApiError): {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
} {
  const body: {
    error: {
      code: ApiErrorCode;
      message: string;
      details?: unknown;
    };
  } = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details !== undefined) {
    body.error.details = error.details;
  }

  return body;
}

export function formatZodError(error: ZodError): ApiError {
  return new ApiError(
    400,
    "invalid_request",
    "Request validation failed.",
    error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}
