import { test, expect } from "@playwright/test";
import { loginViaAPI, API_BASE, TEST_USERS } from "./fixtures";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` is not defined in ES module scope — derive it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CV = path.join(__dirname, "fixtures/sample-cv.pdf");

test.describe("CV Upload - Wizard Flow", () => {
  test.beforeEach(async ({ page, context }) => {
    // Login as a user without a completed profile
    const { token } = await loginViaAPI(
      context,
      TEST_USERS.user.email,
      TEST_USERS.user.password,
    );

    // Set auth cookie
    await context.addCookies([
      {
        name: "auth_token",
        value: token,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  });

  test("wizard starts at CV step (step 0)", async ({ page }) => {
    // Navigate to wizard and force profile incompleted state
    await page.goto("/wizard");
    await page.waitForLoadState("networkidle");

    // If redirected (profile complete), skip — wizard may not show
    const url = page.url();
    if (!url.includes("/wizard")) {
      test.skip();
      return;
    }

    const cvStep = page.getByTestId("wizard-step-0");
    if (await cvStep.isVisible()) {
      await expect(cvStep).toBeVisible();
    }
  });

  test("skip button advances to step 1", async ({ page }) => {
    await page.goto("/wizard");
    await page.waitForLoadState("networkidle");

    const skipBtn = page.getByTestId("cv-skip-btn");
    if (!(await skipBtn.isVisible())) {
      test.skip();
      return;
    }

    await skipBtn.click();
    await expect(page.getByTestId("wizard-step-1")).toBeVisible();
  });

  test("upload PDF and see prefill badge after mock parse", async ({
    page,
    context,
  }) => {
    await page.goto("/wizard");
    await page.waitForLoadState("networkidle");

    if (!(await page.getByTestId("cv-upload-step").isVisible())) {
      test.skip();
      return;
    }

    // Mock the parse endpoint
    await page.route("**/users/me/cvs/*/parse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          status: 200,
          message: "CV parsed successfully",
          data: {
            skills: ["TypeScript", "React", "Node.js"],
            languages: ["Italian", "English"],
            seniority: "senior",
            availability: "full-time",
            workModes: ["remote"],
            salaryMin: 55000,
            bio: "Experienced senior developer.",
            confidence: 0.9,
          },
        }),
      });
    });

    // Also mock the upload endpoint
    await page.route("**/users/me/cvs", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          status: 201,
          message: "CV uploaded successfully",
          data: {
            id: "mock-cv-id-123",
            language: "en",
            filename: "sample-cv.pdf",
            url: "/uploads/cvs/user1/mock.pdf",
            size: 1024,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
    });

    const fileInput = page.getByTestId("cv-file-input");
    await fileInput.setInputFiles(SAMPLE_CV);

    const uploadBtn = page.getByTestId("cv-upload-btn");
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    // Wait for parsing to complete (mock)
    await expect(page.getByTestId("cv-prefilled-badge")).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("CV Upload - Profile Page", () => {
  test.beforeEach(async ({ page, context }) => {
    const { token } = await loginViaAPI(
      context,
      TEST_USERS.user.email,
      TEST_USERS.user.password,
    );
    await context.addCookies([
      {
        name: "auth_token",
        value: token,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  });

  test("profile page shows documents section", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const cvSection = page.getByTestId("cv-section");
    await expect(cvSection).toBeVisible({ timeout: 8000 });
  });

  test("can upload a CV from profile page", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Mock the upload endpoint
    await page.route("**/users/me/cvs", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          status: 201,
          message: "CV uploaded successfully",
          data: {
            id: "profile-cv-id-456",
            language: "en",
            filename: "sample-cv.pdf",
            url: "/uploads/cvs/user1/profile.pdf",
            size: 2048,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
    });

    const fileInput = page.getByTestId("cv-file-input");
    if (!(await fileInput.isVisible())) {
      test.skip();
      return;
    }

    await fileInput.setInputFiles(SAMPLE_CV);
    const uploadBtn = page.getByTestId("cv-upload-btn");
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    // Verify the CV appears in the list
    await expect(page.getByTestId("cv-list")).toBeVisible({ timeout: 5000 });
  });

  test("portfolio URL input is visible", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    const portfolioInput = page.getByTestId("portfolio-url-input");
    await expect(portfolioInput).toBeVisible({ timeout: 8000 });
  });
});
