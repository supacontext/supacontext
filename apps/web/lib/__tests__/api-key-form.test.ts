import { describe, expect, it } from "vitest";
import { parseApiKeyForm } from "../api-key-form";

describe("parseApiKeyForm", () => {
  it("defaults monthly credit limit to unlimited and max depth can be deep", () => {
    expect(
      parseApiKeyForm({
        name: "Production",
        monthlyCreditLimit: "",
        maxDepth: "deep",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Production",
        monthlyCreditLimit: null,
        maxDepth: "deep",
      },
    });
  });

  it("parses a finite monthly credit limit", () => {
    expect(
      parseApiKeyForm({
        name: "CI",
        monthlyCreditLimit: "1500",
        maxDepth: "standard",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "CI",
        monthlyCreditLimit: 1500,
        maxDepth: "standard",
      },
    });
  });

  it("rejects invalid fields", () => {
    const result = parseApiKeyForm({
      name: " ",
      monthlyCreditLimit: "12.5",
      maxDepth: "expensive",
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map((error) => error.field)).toEqual([
      "name",
      "monthlyCreditLimit",
      "maxDepth",
    ]);
  });
});
