import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// visitor.ts uses typeof window and localStorage — both absent in bun.
// We stub them and restore after each test.

type StorageStub = {
  store: Record<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

let origWindow: Record<string, unknown> | undefined;
let origLocalStorage: Record<string, unknown> | undefined;

function makeStorage(): StorageStub {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

function installBrowserStubs(storage: StorageStub) {
  origWindow = (globalThis as Record<string, unknown>)["window"] as
    | Record<string, unknown>
    | undefined;
  origLocalStorage = (globalThis as Record<string, unknown>)["localStorage"] as
    | Record<string, unknown>
    | undefined;
  // visitor.ts checks `typeof window === "undefined"` — provide it
  (globalThis as Record<string, unknown>)["window"] = {};
  (globalThis as Record<string, unknown>)["localStorage"] = storage;
}

function removeBrowserStubs() {
  if (origWindow === undefined) {
    delete (globalThis as Record<string, unknown>)["window"];
  } else {
    (globalThis as Record<string, unknown>)["window"] = origWindow;
  }
  if (origLocalStorage === undefined) {
    delete (globalThis as Record<string, unknown>)["localStorage"];
  } else {
    (globalThis as Record<string, unknown>)["localStorage"] = origLocalStorage;
  }
}

describe("getVisitorId — server (no window)", () => {
  test("returns empty string when window is undefined", async () => {
    // Ensure window is absent
    delete (globalThis as Record<string, unknown>)["window"];
    const { getVisitorId } = await import("./visitor");
    expect(getVisitorId()).toBe("");
  });
});

describe("getVisitorId — browser (window present)", () => {
  let storage: StorageStub;

  beforeEach(() => {
    storage = makeStorage();
    installBrowserStubs(storage);
  });

  afterEach(() => {
    removeBrowserStubs();
  });

  test("generates a UUID and stores it when no visitor_id exists", async () => {
    const { getVisitorId } = await import("./visitor");
    const id = getVisitorId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    // Standard UUID v4 format
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(storage.getItem("visitor_id")).toBe(id);
  });

  test("returns the same visitor_id on subsequent calls", async () => {
    const { getVisitorId } = await import("./visitor");
    const id1 = getVisitorId();
    const id2 = getVisitorId();
    expect(id1).toBe(id2);
  });

  test("returns an existing visitor_id from storage without regenerating", async () => {
    const existingId = "00000000-0000-4000-8000-000000000001";
    storage.setItem("visitor_id", existingId);
    const { getVisitorId } = await import("./visitor");
    expect(getVisitorId()).toBe(existingId);
  });
});
