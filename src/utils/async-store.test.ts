import { describe, test, expect } from "bun:test";
import { requestStore } from "./async-store";

describe("requestStore (AsyncLocalStorage)", () => {
  test("is an AsyncLocalStorage instance", () => {
    expect(requestStore).toBeDefined();
    expect(typeof requestStore.run).toBe("function");
    expect(typeof requestStore.getStore).toBe("function");
  });

  test("getStore returns undefined outside a run context", () => {
    expect(requestStore.getStore()).toBeUndefined();
  });

  test("provides store value within run callback", () => {
    const testStore = { nonce: "test-nonce-123" };
    let captured: { nonce?: string } | undefined;

    requestStore.run(testStore, () => {
      captured = requestStore.getStore();
    });

    expect(captured).toEqual(testStore);
    expect(captured?.nonce).toBe("test-nonce-123");
  });

  test("store is undefined again after run completes", () => {
    const testStore = { nonce: "abc" };
    requestStore.run(testStore, () => {});
    expect(requestStore.getStore()).toBeUndefined();
  });

  test("nested runs see the correct store", () => {
    const outerStore = { nonce: "outer" };
    const innerStore = { nonce: "inner" };
    let outerSeen: string | undefined;
    let innerSeen: string | undefined;

    requestStore.run(outerStore, () => {
      outerSeen = requestStore.getStore()?.nonce;
      requestStore.run(innerStore, () => {
        innerSeen = requestStore.getStore()?.nonce;
      });
    });

    expect(outerSeen).toBe("outer");
    expect(innerSeen).toBe("inner");
  });

  test("async callbacks see the correct store", async () => {
    const store = { nonce: "async-nonce" };
    let captured: { nonce?: string } | undefined;

    await new Promise<void>((resolve) => {
      requestStore.run(store, async () => {
        await Promise.resolve();
        captured = requestStore.getStore();
        resolve();
      });
    });

    expect(captured?.nonce).toBe("async-nonce");
  });
});
