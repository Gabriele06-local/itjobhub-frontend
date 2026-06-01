import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  CANONICAL_VALUES,
  FALLBACK_ENUMS,
  fetchEnums,
  workModeToLegacy,
  workModeFromLegacy,
  employmentTypeToStored,
  employmentTypeFromStored,
} from "./enums";

// enums.ts uses the request() helper from utils/api.ts, which calls
// globalThis.fetch internally. We stub fetch to exercise every branch.

let origFetch: typeof globalThis.fetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

function makeFetchMock(
  status: number,
  body: unknown,
  ok: boolean = status >= 200 && status < 300,
) {
  return mock(async () => ({
    status,
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function makeThrowingFetch() {
  return mock(async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
}

// ── canonical constants ──────────────────────────────────────────────────────

describe("CANONICAL_VALUES", () => {
  test("matches the locked backend contract", () => {
    expect(CANONICAL_VALUES.role).toEqual(["user", "admin"]);
    expect(CANONICAL_VALUES.seniority).toEqual([
      "junior",
      "mid",
      "senior",
      "lead",
    ]);
    expect(CANONICAL_VALUES.workMode).toEqual(["remote", "hybrid", "onsite"]);
    expect(CANONICAL_VALUES.employmentType).toEqual([
      "full-time",
      "part-time",
      "contract",
      "freelance",
      "internship",
    ]);
    expect(CANONICAL_VALUES.availability).toEqual([
      "full-time",
      "part-time",
      "contract",
      "freelance",
      "internship",
      "busy",
    ]);
  });

  test("FALLBACK_ENUMS mirrors canonical values with value===label", () => {
    expect(FALLBACK_ENUMS.workMode).toEqual([
      { value: "remote", label: "remote" },
      { value: "hybrid", label: "hybrid" },
      { value: "onsite", label: "onsite" },
    ]);
    expect(FALLBACK_ENUMS.availability.map((o) => o.value)).toEqual(
      CANONICAL_VALUES.availability,
    );
  });
});

// ── boundary normalization helpers ───────────────────────────────────────────

describe("workMode boundary helpers", () => {
  test("workModeToLegacy maps onsite -> office, leaves others", () => {
    expect(workModeToLegacy("onsite")).toBe("office");
    expect(workModeToLegacy("remote")).toBe("remote");
    expect(workModeToLegacy("hybrid")).toBe("hybrid");
  });

  test("workModeFromLegacy maps office -> onsite, leaves others", () => {
    expect(workModeFromLegacy("office")).toBe("onsite");
    expect(workModeFromLegacy("remote")).toBe("remote");
    expect(workModeFromLegacy("hybrid")).toBe("hybrid");
    expect(workModeFromLegacy("")).toBe("");
  });

  test("round-trips onsite <-> office", () => {
    expect(workModeFromLegacy(workModeToLegacy("onsite"))).toBe("onsite");
  });
});

describe("employmentType boundary helpers", () => {
  test("employmentTypeToStored converts hyphen to underscore", () => {
    expect(employmentTypeToStored("full-time")).toBe("full_time");
    expect(employmentTypeToStored("part-time")).toBe("part_time");
    expect(employmentTypeToStored("contract")).toBe("contract");
  });

  test("employmentTypeFromStored converts underscore to hyphen", () => {
    expect(employmentTypeFromStored("full_time")).toBe("full-time");
    expect(employmentTypeFromStored("part_time")).toBe("part-time");
    expect(employmentTypeFromStored("freelance")).toBe("freelance");
  });

  test("round-trips hyphen <-> underscore", () => {
    expect(employmentTypeToStored(employmentTypeFromStored("full_time"))).toBe(
      "full_time",
    );
  });
});

// ── fetchEnums ───────────────────────────────────────────────────────────────

describe("fetchEnums", () => {
  test("returns localized options from a well-formed response", async () => {
    const body = {
      success: true,
      status: 200,
      message: "ok",
      data: {
        role: [
          { value: "user", label: "Utente" },
          { value: "admin", label: "Admin" },
        ],
        seniority: [
          { value: "junior", label: "Junior" },
          "mid",
          "senior",
          "lead",
        ],
        workMode: [{ value: "remote", label: "Da remoto" }, "hybrid", "onsite"],
        employmentType: [{ value: "full-time", label: "Tempo pieno" }],
        availability: [{ value: "busy", label: "Occupato" }],
      },
    };
    globalThis.fetch = makeFetchMock(200, body);

    const result = await fetchEnums("it");
    expect(result.role).toEqual([
      { value: "user", label: "Utente" },
      { value: "admin", label: "Admin" },
    ]);
    // Bare-string entries become {value, label} with label === value.
    expect(result.seniority).toEqual([
      { value: "junior", label: "Junior" },
      { value: "mid", label: "mid" },
      { value: "senior", label: "senior" },
      { value: "lead", label: "lead" },
    ]);
    expect(result.workMode[0]).toEqual({ value: "remote", label: "Da remoto" });
    expect(result.availability).toEqual([{ value: "busy", label: "Occupato" }]);
  });

  test("defaults Accept-Language to en when language omitted", async () => {
    const fetchMock = makeFetchMock(200, { success: true, data: {} });
    globalThis.fetch = fetchMock;

    await fetchEnums();

    const call = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    const options = call[1] as RequestInit;
    expect(
      (options.headers as Record<string, string>)["Accept-Language"],
    ).toBe("en");
  });

  test("falls back to canonical when a list is missing or not an array", async () => {
    globalThis.fetch = makeFetchMock(200, {
      success: true,
      data: { seniority: "not-an-array" },
    });

    const result = await fetchEnums("en");
    expect(result.seniority).toEqual(FALLBACK_ENUMS.seniority);
    expect(result.workMode).toEqual(FALLBACK_ENUMS.workMode);
  });

  test("falls back to canonical when list has only invalid entries", async () => {
    globalThis.fetch = makeFetchMock(200, {
      success: true,
      data: { role: [123, null, { noValue: true }] },
    });

    const result = await fetchEnums("en");
    expect(result.role).toEqual(FALLBACK_ENUMS.role);
  });

  test("returns full fallback on non-success body", async () => {
    globalThis.fetch = makeFetchMock(200, { success: false });
    const result = await fetchEnums("fr");
    expect(result).toEqual(FALLBACK_ENUMS);
  });

  test("returns full fallback on non-ok HTTP status", async () => {
    globalThis.fetch = makeFetchMock(
      500,
      { success: false, message: "boom" },
      false,
    );
    const result = await fetchEnums("de");
    expect(result).toEqual(FALLBACK_ENUMS);
  });

  test("returns full fallback when data is missing", async () => {
    globalThis.fetch = makeFetchMock(200, { success: true });
    const result = await fetchEnums("es");
    expect(result).toEqual(FALLBACK_ENUMS);
  });

  test("returns full fallback when fetch throws", async () => {
    globalThis.fetch = makeThrowingFetch();
    const result = await fetchEnums("en");
    expect(result).toEqual(FALLBACK_ENUMS);
  });
});
