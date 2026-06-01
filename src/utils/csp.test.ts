import { describe, test, expect } from "bun:test";
import { buildCsp } from "./csp";

describe("buildCsp", () => {
  test("returns an array of directives", () => {
    const result = buildCsp();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("contains default-src 'self'", () => {
    const result = buildCsp();
    expect(result.some((d) => d.startsWith("default-src"))).toBe(true);
  });

  test("script-src uses 'unsafe-eval' without nonce", () => {
    const result = buildCsp();
    const scriptSrc = result.find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("nonce-");
  });

  test("script-src includes nonce when provided", () => {
    const result = buildCsp("abc123");
    const scriptSrc = result.find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("'nonce-abc123'");
  });

  test("connect-src includes apiUrl when provided", () => {
    const result = buildCsp(undefined, "https://api.example.com");
    const connectSrc = result.find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toContain("https://api.example.com");
  });

  test("connect-src does not include apiUrl when omitted", () => {
    const result = buildCsp();
    const connectSrc = result.find((d) => d.startsWith("connect-src"));
    expect(connectSrc).not.toContain("api.example.com");
  });

  test("includes Clarity origins when clarityEnabled=true", () => {
    const result = buildCsp(undefined, undefined, true);
    const scriptSrc = result.find((d) => d.startsWith("script-src"));
    const connectSrc = result.find((d) => d.startsWith("connect-src"));
    expect(scriptSrc).toContain("https://scripts.clarity.ms");
    expect(connectSrc).toContain("https://c.clarity.ms");
  });

  test("does not include Clarity origins when clarityEnabled=false", () => {
    const result = buildCsp(undefined, undefined, false);
    const scriptSrc = result.find((d) => d.startsWith("script-src"));
    expect(scriptSrc).not.toContain("clarity.ms");
  });

  test("includes require-trusted-types-for directive", () => {
    const result = buildCsp();
    expect(result.some((d) => d.includes("require-trusted-types-for"))).toBe(
      true,
    );
  });

  test("includes frame-ancestors directive", () => {
    const result = buildCsp();
    expect(result.some((d) => d.startsWith("frame-ancestors"))).toBe(true);
  });

  test("includes object-src 'none'", () => {
    const result = buildCsp();
    expect(result.some((d) => d === "object-src 'none'")).toBe(true);
  });

  test("all parameters together produce a valid array", () => {
    const result = buildCsp("nonce123", "https://api.example.com", true);
    expect(result.length).toBeGreaterThan(10);
    const scriptSrc = result.find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("'nonce-nonce123'");
    expect(scriptSrc).toContain("https://scripts.clarity.ms");
    const connectSrc = result.find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toContain("https://api.example.com");
    expect(connectSrc).toContain("https://c.clarity.ms");
  });
});
