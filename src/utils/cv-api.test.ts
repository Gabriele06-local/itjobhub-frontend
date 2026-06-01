import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// cv-api.ts uses both globalThis.fetch (for uploadCV) and the request() helper
// from api.ts (which also uses globalThis.fetch internally).

let origFetch: typeof globalThis.fetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
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
  })) as unknown as typeof fetch;
}

// ── uploadCV ─────────────────────────────────────────────────────────────────

describe("uploadCV", () => {
  test("returns CvRecord on success", async () => {
    const record = {
      id: "cv1",
      language: "it",
      filename: "cv.pdf",
      url: "/cvs/cv.pdf",
      size: 1024,
      uploadedAt: "2024-01-01T00:00:00Z",
    };
    globalThis.fetch = makeFetchMock(200, { success: true, data: record });

    const { uploadCV } = await import("./cv-api");
    const file = new File(["content"], "cv.pdf", { type: "application/pdf" });
    const result = await uploadCV("token123", file, "it");
    expect(result).toEqual(record);
  });

  test("throws when response is not ok", async () => {
    globalThis.fetch = makeFetchMock(
      400,
      { success: false, message: "Bad file" },
      false,
    );

    const { uploadCV } = await import("./cv-api");
    const file = new File(["content"], "bad.pdf", { type: "application/pdf" });
    await expect(uploadCV("tok", file, "en")).rejects.toThrow("Bad file");
  });

  test("throws when success=false even with 200 status", async () => {
    globalThis.fetch = makeFetchMock(200, {
      success: false,
      message: "Virus detected",
    });

    const { uploadCV } = await import("./cv-api");
    const file = new File([""], "v.pdf", { type: "application/pdf" });
    await expect(uploadCV("tok", file, "en")).rejects.toThrow("Virus detected");
  });

  test("throws with default message when no message field", async () => {
    globalThis.fetch = makeFetchMock(500, { success: false }, false);

    const { uploadCV } = await import("./cv-api");
    const file = new File([""], "v.pdf", { type: "application/pdf" });
    await expect(uploadCV("tok", file, "en")).rejects.toThrow("Upload failed");
  });
});

// ── listCVs ──────────────────────────────────────────────────────────────────

describe("listCVs", () => {
  test("returns array of CvRecords on success", async () => {
    const records = [
      {
        id: "cv1",
        language: "it",
        filename: "a.pdf",
        url: "/a.pdf",
        size: 512,
        uploadedAt: "2024-01-01T00:00:00Z",
      },
    ];
    globalThis.fetch = makeFetchMock(200, { success: true, data: records });

    const { listCVs } = await import("./cv-api");
    const result = await listCVs("token");
    expect(result).toEqual(records);
  });

  test("throws on non-ok response", async () => {
    globalThis.fetch = makeFetchMock(
      403,
      { success: false, message: "Forbidden" },
      false,
    );

    const { listCVs } = await import("./cv-api");
    await expect(listCVs("tok")).rejects.toThrow("Forbidden");
  });

  test("throws with fallback message", async () => {
    globalThis.fetch = makeFetchMock(500, { success: false }, false);

    const { listCVs } = await import("./cv-api");
    await expect(listCVs("tok")).rejects.toThrow("Failed to list CVs");
  });
});

// ── deleteCV ─────────────────────────────────────────────────────────────────

describe("deleteCV", () => {
  test("resolves without error on success", async () => {
    globalThis.fetch = makeFetchMock(200, { success: true });

    const { deleteCV } = await import("./cv-api");
    await expect(deleteCV("token", "cv123")).resolves.toBeUndefined();
  });

  test("throws on non-ok response", async () => {
    globalThis.fetch = makeFetchMock(
      404,
      { success: false, message: "Not found" },
      false,
    );

    const { deleteCV } = await import("./cv-api");
    await expect(deleteCV("tok", "bad_id")).rejects.toThrow("Not found");
  });

  test("throws with fallback message", async () => {
    globalThis.fetch = makeFetchMock(500, { success: false }, false);

    const { deleteCV } = await import("./cv-api");
    await expect(deleteCV("tok", "id")).rejects.toThrow("Failed to delete CV");
  });
});

// ── parseCV ──────────────────────────────────────────────────────────────────

describe("parseCV", () => {
  test("returns ExtractedProfile on success", async () => {
    const profile = {
      skills: ["TypeScript", "React"],
      languages: ["it", "en"],
      seniority: "senior",
      availability: "full-time",
      workModes: ["remote"],
      salaryMin: 50000,
      bio: "Experienced dev",
      confidence: 0.9,
    };
    globalThis.fetch = makeFetchMock(200, { success: true, data: profile });

    const { parseCV } = await import("./cv-api");
    const result = await parseCV("token", "cv_abc");
    expect(result as unknown).toEqual(profile);
  });

  test("throws with status attached on non-ok response", async () => {
    globalThis.fetch = makeFetchMock(
      429,
      { success: false, message: "Rate limited" },
      false,
    );

    const { parseCV } = await import("./cv-api");
    let err: (Error & { status?: number }) | undefined;
    try {
      await parseCV("tok", "cv_id");
    } catch (e) {
      err = e as Error & { status?: number };
    }
    expect(err).toBeDefined();
    expect(err?.message).toBe("Rate limited");
    expect(err?.status).toBe(429);
  });

  test("throws with fallback message and attaches status", async () => {
    globalThis.fetch = makeFetchMock(500, { success: false }, false);

    const { parseCV } = await import("./cv-api");
    let err: (Error & { status?: number }) | undefined;
    try {
      await parseCV("tok", "cv_id");
    } catch (e) {
      err = e as Error & { status?: number };
    }
    expect(err?.message).toBe("Failed to parse CV");
    expect(err?.status).toBe(500);
  });
});
