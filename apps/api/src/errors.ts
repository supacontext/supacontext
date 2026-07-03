import type { ZodError } from "zod";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_API_KEY"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "DEPTH_NOT_ALLOWED"
  | "MONTHLY_CREDIT_LIMIT_EXCEEDED"
  | "INSUFFICIENT_CREDITS"
  | "RATE_LIMITED"
  | "CONCURRENCY_LIMIT_EXCEEDED"
  | "QUEUE_UNAVAILABLE"
  | "INTERNAL_ERROR";

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
    "INVALID_REQUEST",
    "Request validation failed.",
    error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}
