import { RESOLVED_EFFORTS, type ResolvedEffort } from "@supacontext/core";

export type ApiKeyFormInput = {
  name: unknown;
  monthlyCreditLimit?: unknown;
  maxEffort: unknown;
};

export type ParsedApiKeyForm = {
  name: string;
  monthlyCreditLimit: number | null;
  maxEffort: ResolvedEffort;
};

export type ApiKeyFormField = "name" | "monthlyCreditLimit" | "maxEffort";

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

function isResolvedEffort(value: unknown): value is ResolvedEffort {
  return typeof value === "string" && RESOLVED_EFFORTS.includes(value as ResolvedEffort);
}

export function parseApiKeyForm(input: ApiKeyFormInput): ApiKeyFormResult {
  const errors: ApiKeyFormError[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const limitValue = input.monthlyCreditLimit;
  const maxEffort = isResolvedEffort(input.maxEffort) ? input.maxEffort : null;
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
      !Number.isSafeInteger(parsedLimit) ||
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

  if (!maxEffort) {
    errors.push({
      field: "maxEffort",
      message: "Max effort level is invalid.",
    });
  }

  if (errors.length > 0 || !maxEffort) {
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
      maxEffort,
    },
  };
}
