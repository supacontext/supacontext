import { describe, expect, it } from "vitest";
import { parseApiKeyForm } from "../api-key-form";

describe("parseApiKeyForm", () => {
  it("defaults monthly credit limit to unlimited and accepts x-high effort", () => {
    expect(
      parseApiKeyForm({
        name: "Production",
        monthlyCreditLimit: "",
        maxEffort: "x_high",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Production",
        monthlyCreditLimit: null,
        maxEffort: "x_high",
      },
    });
  });

  it("parses a finite monthly credit limit", () => {
    expect(
      parseApiKeyForm({
        name: "CI",
        monthlyCreditLimit: "1500",
        maxEffort: "medium",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "CI",
        monthlyCreditLimit: 1500,
        maxEffort: "medium",
      },
    });
  });

  it("rejects invalid fields", () => {
    const result = parseApiKeyForm({
      name: " ",
      monthlyCreditLimit: "12.5",
      maxEffort: "auto",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map((error) => error.field)).toEqual([
      "name",
      "monthlyCreditLimit",
      "maxEffort",
    ]);
  });

  it("rejects monthly limits that cannot be represented exactly", () => {
    const result = parseApiKeyForm({
      name: "Unsafe limit",
      monthlyCreditLimit: "9007199254740992",
      maxEffort: "high",
    });

    expect(result).toMatchObject({
      ok: false,
      errors: [{ field: "monthlyCreditLimit" }],
    });
  });
});
