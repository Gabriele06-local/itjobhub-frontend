import { describe, test, expect } from "bun:test";
import { API_URL, SITE_URL, GOOGLE_MAPS_KEY } from "./constants";

describe("constants", () => {
  test("API_URL is a non-empty string", () => {
    expect(typeof API_URL).toBe("string");
    expect(API_URL.length).toBeGreaterThan(0);
  });

  test("API_URL falls back to localhost when PUBLIC_API_URL is not set", () => {
    // In bun test env PUBLIC_API_URL is not set → fallback
    expect(API_URL).toBe("http://127.0.0.1:3001");
  });

  test("SITE_URL is a valid URL string", () => {
    expect(typeof SITE_URL).toBe("string");
    // either the env value or the hardcoded fallback
    expect(SITE_URL.startsWith("http")).toBe(true);
  });

  test("GOOGLE_MAPS_KEY is a string", () => {
    expect(typeof GOOGLE_MAPS_KEY).toBe("string");
  });
});
