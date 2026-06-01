import { describe, test, expect, beforeEach, afterEach } from "bun:test";

// cookies.ts reads/writes document.cookie, so we need to stub document.
// In bun there is no DOM — we provide a minimal stub.

type DocStub = {
  cookie: string;
};

let origDocument: typeof globalThis.document | undefined;
let origWindow: typeof globalThis.window | undefined;

function installDocumentStub(): DocStub {
  origDocument = (globalThis as Record<string, unknown>)[
    "document"
  ] as typeof document;
  origWindow = (globalThis as Record<string, unknown>)[
    "window"
  ] as typeof window;

  // Simple cookie jar that mimics document.cookie get/set semantics
  const jar: Record<string, string> = {};
  const stub: DocStub = {
    get cookie() {
      return Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
    set cookie(val: string) {
      // Parse "name=value; options..."
      const parts = val.split(";");
      const [pair] = parts;
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) return;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();

      // Check if it's a deletion (expires in the past)
      const expiresPart = parts.find((p) =>
        p.trim().toLowerCase().startsWith("expires="),
      );
      if (expiresPart) {
        const expiresVal = expiresPart.split("=").slice(1).join("=").trim();
        const expiresDate = new Date(expiresVal);
        // Any date in the past (< now) means deletion
        if (expiresDate.getTime() < Date.now()) {
          delete jar[name];
          return;
        }
      }

      jar[name] = value;
    },
  };

  (globalThis as Record<string, unknown>)["document"] = stub;
  (globalThis as Record<string, unknown>)["window"] = {
    location: { hostname: "localhost" },
  };

  return stub;
}

function restoreDocument() {
  if (origDocument !== undefined) {
    (globalThis as Record<string, unknown>)["document"] = origDocument;
  } else {
    delete (globalThis as Record<string, unknown>)["document"];
  }
  if (origWindow !== undefined) {
    (globalThis as Record<string, unknown>)["window"] = origWindow;
  } else {
    delete (globalThis as Record<string, unknown>)["window"];
  }
}

describe("cookies", () => {
  beforeEach(() => {
    installDocumentStub();
  });

  afterEach(() => {
    restoreDocument();
  });

  test("setCookie stores a value retrievable by getCookie", async () => {
    const { setCookie, getCookie } = await import("./cookies");
    setCookie("test_key", "hello", 1);
    expect(getCookie("test_key")).toBe("hello");
  });

  test("getCookie returns null for missing key", async () => {
    const { getCookie } = await import("./cookies");
    expect(getCookie("nonexistent_cookie_xyz")).toBeNull();
  });

  test("setCookie URI-encodes special characters", async () => {
    const { setCookie, getCookie } = await import("./cookies");
    const jsonVal = JSON.stringify({ a: 1, b: "hello world" });
    setCookie("json_key", jsonVal, 1);
    expect(getCookie("json_key")).toBe(jsonVal);
  });

  test("setCookie with empty value stores and retrieves empty string", async () => {
    const { setCookie, getCookie } = await import("./cookies");
    setCookie("empty_key", "", 1);
    expect(getCookie("empty_key")).toBe("");
  });

  test("deleteCookie removes the cookie", async () => {
    const { setCookie, getCookie, deleteCookie } = await import("./cookies");
    setCookie("del_key", "to_delete", 1);
    expect(getCookie("del_key")).toBe("to_delete");
    deleteCookie("del_key");
    expect(getCookie("del_key")).toBeNull();
  });

  test("deleteCookie with subdomain domain attempts root-domain removal", async () => {
    // Provide a window with a subdomain hostname
    (globalThis as Record<string, unknown>)["window"] = {
      location: { hostname: "sub.example.com" },
    };
    const { setCookie, deleteCookie } = await import("./cookies");
    setCookie("sub_key", "val", 1);
    // Should not throw even with subdomain logic
    expect(() => deleteCookie("sub_key")).not.toThrow();
  });
});
