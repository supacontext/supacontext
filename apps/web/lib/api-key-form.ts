import { CONTEXT_DEPTHS, type ContextDepth } from "@supacontext/core";

export type ApiKeyFormInput = {
  name: unknown;
  monthlyCreditLimit?: unknown;
  maxDepth: unknown;
};

export type ParsedApiKeyForm = {
  name: string;
  monthlyCreditLimit: number | null;
  maxDepth: ContextDepth;
};

export type ApiKeyFormField = "name" | "monthlyCreditLimit" | "maxDepth";

export type ApiKeyFormError = {
  field: ApiKeyFormField;
  message: string;
};

export type ApiKeyFormResult =
  | {
      ok: true;
      value: ParsedApiKeyForm;
    }
  | {
      ok: false;
      errors: ApiKeyFormError[];
    };

function isContextDepth(value: unknown): value is ContextDepth {
  return typeof value === "string" && CONTEXT_DEPTHS.includes(value as ContextDepth);
}

export function parseApiKeyForm(input: ApiKeyFormInput): ApiKeyFormResult {
  const errors: ApiKeyFormError[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const limitValue = input.monthlyCreditLimit;
  const maxDepth = isContextDepth(input.maxDepth) ? input.maxDepth : null;
  let monthlyCreditLimit: number | null = null;

  if (!name) {
    errors.push({
      field: "name",
      message: "Key name is required.",
    });
  } else if (name.length > 80) {
    errors.push({
      field: "name",
      message: "Key name must be 80 characters or fewer.",
    });
  }

  if (limitValue !== undefined && limitValue !== null && limitValue !== "") {
    const parsedLimit =
      typeof limitValue === "number" ? limitValue : Number.parseInt(String(limitValue), 10);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 0 ||
      String(limitValue).trim() !== String(parsedLimit)
    ) {
      errors.push({
        field: "monthlyCreditLimit",
        message: "Monthly credit limit must be a non-negative whole number.",
      });
    } else {
      monthlyCreditLimit = parsedLimit;
    }
  }

  if (!maxDepth) {
    errors.push({
      field: "maxDepth",
      message: "Max depth level is invalid.",
    });
  }

  if (errors.length > 0 || !maxDepth) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      name,
      monthlyCreditLimit,
      maxDepth,
    },
  };
}
