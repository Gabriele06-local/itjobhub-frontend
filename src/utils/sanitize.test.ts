import { describe, test, expect } from "bun:test";

// sanitize.ts imports DOMPurify and isBrowser from @builder.io/qwik/build.
// In bun, isBrowser=false (server context), so sanitizeHtml returns the raw
// input without calling DOMPurify. We test the server path directly.

describe("sanitizeHtml — server path (isBrowser=false)", () => {
  test("returns the input string unchanged on server", async () => {
    const { sanitizeHtml } = await import("./sanitize");
    const html = "<script>alert('xss')</script><b>bold</b>";
    // On server isBrowser is false → input returned as-is
    expect(sanitizeHtml(html)).toBe(html);
  });

  test("returns empty string unchanged", async () => {
    const { sanitizeHtml } = await import("./sanitize");
    expect(sanitizeHtml("")).toBe("");
  });

  test("returns plain text unchanged", async () => {
    const { sanitizeHtml } = await import("./sanitize");
    const text = "Hello world";
    expect(sanitizeHtml(text)).toBe(text);
  });

  test("returns complex HTML unchanged", async () => {
    const { sanitizeHtml } = await import("./sanitize");
    const html =
      '<div class="foo"><a href="https://example.com">link</a></div>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});
