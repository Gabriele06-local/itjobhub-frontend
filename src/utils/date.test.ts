import { describe, test, expect } from "bun:test";
import { formatLocaleDate } from "./date";

describe("formatLocaleDate", () => {
  test("returns '-' for undefined input", () => {
    expect(formatLocaleDate(undefined)).toBe("-");
  });

  test("returns '-' for empty string", () => {
    expect(formatLocaleDate("")).toBe("-");
  });

  test("formats a valid date with default 'it' locale", () => {
    const result = formatLocaleDate("2024-01-15");
    // Intl.DateTimeFormat with it locale returns DD/MM/YYYY
    expect(result).toBe("15/01/2024");
  });

  test("formats a valid date with 'en-US' locale", () => {
    const result = formatLocaleDate("2024-01-15", "en-US");
    // en-US: MM/DD/YYYY
    expect(result).toBe("01/15/2024");
  });

  test("formats a valid date with 'de' locale", () => {
    const result = formatLocaleDate("2024-12-31", "de");
    expect(result).toBe("31.12.2024");
  });

  test("returns the original string for an invalid date", () => {
    const bad = "not-a-date";
    const result = formatLocaleDate(bad);
    expect(result).toBe(bad);
  });

  test("handles ISO timestamps (only date part matters)", () => {
    const result = formatLocaleDate("2023-06-01", "en-GB");
    expect(result).toBe("01/06/2023");
  });
});
