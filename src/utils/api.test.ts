import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// api.ts imports isBrowser from @builder.io/qwik — in bun that is false (server).
// We test both the server path and mock-assisted branches.

// Store original globals
let origFetch: typeof globalThis.fetch;
let origWindow: Record<string, unknown> | undefined;

beforeEach(() => {
  origFetch = globalThis.fetch;
  origWindow = (globalThis as Record<string, unknown>)["window"] as
    | Record<string, unknown>
    | undefined;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  if (origWindow === undefined) {
    delete (globalThis as Record<string, unknown>)["window"];
  } else {
    (globalThis as Record<string, unknown>)["window"] = origWindow;
  }
});

function makeFetchMock(
  status: number,
  body: object,
  ok: boolean = status >= 200 && status < 300,
) {
  return mock(async () => ({
    status,
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe("request — server path (isBrowser=false)", () => {
  test("calls fetch with the original URL on server", async () => {
    const mockResponse = { status: 200, ok: true, json: async () => ({}) };
    const fetchMock = mock(async () => mockResponse) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const { request } = await import("./api");
    const res = await request("https://api.example.com/test");
    expect(res as unknown).toBe(mockResponse);
    // @ts-expect-error accessing mock internals
    const calls = fetchMock.mock.calls as unknown[][];
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("https://api.example.com/test");
  });

  test("server: URL starting with API_URL is NOT proxied (isBrowser=false)", async () => {
    // API_URL default is http://127.0.0.1:3001
    const fetchMock = makeFetchMock(200, {});
    globalThis.fetch = fetchMock;

    const { request } = await import("./api");
    await request("http://127.0.0.1:3001/jobs");
    // @ts-expect-error accessing mock internals
    const calls = fetchMock.mock.calls as unknown[][];
    // On server: URL is NOT rewritten to /api/proxy/…
    expect(calls[0][0]).toBe("http://127.0.0.1:3001/jobs");
  });

  test("passes RequestInit options to fetch", async () => {
    const fetchMock = makeFetchMock(200, {});
    globalThis.fetch = fetchMock;

    const { request } = await import("./api");
    const opts: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    };
    await request("https://api.example.com/submit", opts);
    // @ts-expect-error accessing mock internals
    const calls = fetchMock.mock.calls as unknown[][];
    expect(calls[0][1]).toMatchObject({ method: "POST" });
  });

  test("returns the response object", async () => {
    const fakeResponse = {
      status: 200,
      ok: true,
      json: async () => ({ x: 1 }),
    };
    globalThis.fetch = mock(
      async () => fakeResponse,
    ) as unknown as typeof fetch;

    const { request } = await import("./api");
    const res = await request("https://api.example.com/data");
    expect(res as unknown).toBe(fakeResponse);
  });

  test("throws when fetch rejects (network error)", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof fetch;

    const { request } = await import("./api");
    await expect(request("https://api.example.com/fail")).rejects.toThrow(
      "Network failure",
    );
  });

  test("handles non-2xx status without throwing", async () => {
    globalThis.fetch = makeFetchMock(404, { message: "not found" }, false);

    const { request } = await import("./api");
    const res = await request("https://api.example.com/missing");
    expect(res.status).toBe(404);
  });

  test("handles 401 on server (no window.dispatchEvent needed)", async () => {
    // Ensure window is absent so the dispatch branch is skipped
    delete (globalThis as Record<string, unknown>)["window"];
    globalThis.fetch = makeFetchMock(401, { message: "unauthorized" }, false);

    const { request } = await import("./api");
    // Should not throw — returns the response
    const res = await request("https://api.example.com/protected");
    expect(res.status).toBe(401);
  });

  test("handles 401 when window is present — dispatches event", async () => {
    const dispatched: Event[] = [];
    (globalThis as Record<string, unknown>)["window"] = {
      dispatchEvent: (e: Event) => dispatched.push(e),
      location: { pathname: "/current-page" },
    };
    globalThis.fetch = makeFetchMock(401, { message: "unauth" }, false);

    const { request } = await import("./api");
    const res = await request("https://api.example.com/auth");
    expect(res.status).toBe(401);
    // The dispatchEvent should have been called with a CustomEvent named "unauthorized"
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].type).toBe("unauthorized");
  });
});
