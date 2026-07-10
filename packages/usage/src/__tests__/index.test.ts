import { describe, expect, it } from "vitest";
import { CREDIT_MICROS } from "@supacontext/core";
import { authorizeUsage, getEffortRank } from "../index.js";

const credits = (value: bigint): bigint => value * CREDIT_MICROS;

describe("usage reservation authorization", () => {
  it("ranks resolved efforts", () => {
    expect(getEffortRank("low")).toBeLessThan(getEffortRank("medium"));
    expect(getEffortRank("high")).toBeLessThan(getEffortRank("x_high"));
    expect(() => getEffortRank("auto" as never)).toThrow("Unknown resolved effort");
  });

  it("reserves the effort cap when no lower cap applies", () => {
    expect(
      authorizeUsage({
        effort: "medium",
        balanceCreditMicros: credits(100n),
      }),
    ).toEqual({
      allowed: true,
      reservationCreditMicros: credits(50n),
      minimumCreditMicros: credits(6n),
      effortCapCreditMicros: credits(50n),
    });
  });

  it("uses a lower caller cap without requiring the effort maximum", () => {
    expect(
      authorizeUsage({
        effort: "high",
        balanceCreditMicros: credits(200n),
        callerMaxCreditMicros: credits(20n),
      }),
    ).toMatchObject({
      allowed: true,
      reservationCreditMicros: credits(20n),
      minimumCreditMicros: credits(15n),
    });
  });

  it("uses the lower available balance or monthly remaining budget", () => {
    expect(
      authorizeUsage({
        effort: "medium",
        balanceCreditMicros: credits(10n),
      }),
    ).toMatchObject({
      allowed: true,
      reservationCreditMicros: credits(10n),
    });
    expect(
      authorizeUsage({
        effort: "medium",
        balanceCreditMicros: credits(100n),
        monthlyCreditLimitMicros: credits(40n),
        monthToDateCreditMicros: credits(25n),
      }),
    ).toMatchObject({
      allowed: true,
      reservationCreditMicros: credits(15n),
    });
  });

  it("allows an exact minimum reservation", () => {
    expect(
      authorizeUsage({
        effort: "x_high",
        balanceCreditMicros: credits(30n),
        callerMaxCreditMicros: credits(30n),
      }),
    ).toMatchObject({
      allowed: true,
      reservationCreditMicros: credits(30n),
    });
  });

  it("reports which cap prevents the effort minimum", () => {
    expect(
      authorizeUsage({
        effort: "medium",
        balanceCreditMicros: credits(100n),
        callerMaxCreditMicros: credits(5n),
      }),
    ).toMatchObject({
      allowed: false,
      reason: "caller_cap",
      effectiveReservationCreditMicros: credits(5n),
      minimumCreditMicros: credits(6n),
    });
    expect(
      authorizeUsage({
        effort: "low",
        balanceCreditMicros: credits(2n),
      }),
    ).toMatchObject({
      allowed: false,
      reason: "credits",
      effectiveReservationCreditMicros: credits(2n),
    });
    expect(
      authorizeUsage({
        effort: "high",
        balanceCreditMicros: credits(100n),
        monthlyCreditLimitMicros: credits(20n),
        monthToDateCreditMicros: credits(10n),
      }),
    ).toMatchObject({
      allowed: false,
      reason: "monthly_limit",
      effectiveReservationCreditMicros: credits(10n),
    });
  });

  it("enforces explicit API-key effort restrictions", () => {
    expect(
      authorizeUsage({
        effort: "high",
        balanceCreditMicros: credits(100n),
        apiKeyMaxEffort: "medium",
      }),
    ).toMatchObject({
      allowed: false,
      reason: "api_key_effort_restricted",
    });
  });

  it("caps Auto reservations to the API key maximum while keeping Auto routable", () => {
    expect(
      authorizeUsage({
        effort: "auto",
        balanceCreditMicros: credits(100n),
        apiKeyMaxEffort: "medium",
      }),
    ).toEqual({
      allowed: true,
      reservationCreditMicros: credits(50n),
      minimumCreditMicros: credits(8n),
      effortCapCreditMicros: credits(50n),
    });
  });

  it("requires bigint accounting inputs", () => {
    expect(() =>
      authorizeUsage({
        effort: "low",
        balanceCreditMicros: 10 as never,
      }),
    ).toThrow("bigint");
  });
});
