/**
 * E2E tests for the admin panel (/admin).
 *
 * Covers:
 *  - Admin login → view gift list
 *  - View fraud flags → resolve a flag → verify status updated
 *  - Non-admin user cannot access /admin (redirected to /dashboard)
 *
 * Prerequisites:
 *  - DB seeded with admin fixture user (see e2e/fixtures/seed.ts)
 *  - At least one gift and one fraud flag in seed data
 *
 * Run: npx playwright test e2e/admin.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixture credentials (populated from DB seed)
// ---------------------------------------------------------------------------
const ADMIN = {
  phone: process.env.E2E_ADMIN_PHONE ?? "+2340000000001",
  otp: process.env.E2E_ADMIN_OTP ?? "123456",
};

const NON_ADMIN = {
  phone: process.env.E2E_USER_PHONE ?? "+2340000000002",
  otp: process.env.E2E_USER_OTP ?? "123456",
};

// ---------------------------------------------------------------------------
// Helper: log in via the OTP login form
// ---------------------------------------------------------------------------
async function loginAs(page: Page, phone: string, otp: string) {
  await page.goto("/auth/login");
  await page.getByLabel(/phone/i).fill(phone);
  await page.getByRole("button", { name: /send otp|get otp/i }).click();
  await page.getByLabel(/otp|code/i).fill(otp);
  await page.getByRole("button", { name: /verify|login|sign in/i }).click();
  // Wait for redirect away from login page
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Admin access tests
// ---------------------------------------------------------------------------

test.describe("Admin panel", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, ADMIN.phone, ADMIN.otp);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── Gift list ────────────────────────────────────────────────────────────

  test("admin can navigate to /admin", async () => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.getByRole("heading", { name: /admin/i })
    ).toBeVisible();
  });

  test("admin panel lists gifts", async () => {
    await page.goto("/admin");
    const giftList = page.locator('[data-testid="admin-gift-list"]');
    await expect(giftList).toBeVisible();
    // At least one gift row should be present from seed data
    const rows = giftList.locator('[data-testid="admin-gift-row"]');
    await expect(rows.first()).toBeVisible();
  });

  test("admin can view gift details", async () => {
    await page.goto("/admin");
    const firstRow = page
      .locator('[data-testid="admin-gift-row"]')
      .first();
    await firstRow.getByRole("link", { name: /view|details/i }).click();
    await expect(page.locator('[data-testid="gift-detail-panel"]')).toBeVisible();
  });

  // ── Fraud flags ──────────────────────────────────────────────────────────

  test("admin can view fraud flags tab", async () => {
    await page.goto("/admin");
    await page.getByRole("tab", { name: /fraud|flags/i }).click();
    const flagList = page.locator('[data-testid="admin-fraud-flag-list"]');
    await expect(flagList).toBeVisible();
  });

  test("admin can resolve a fraud flag", async () => {
    await page.goto("/admin");
    await page.getByRole("tab", { name: /fraud|flags/i }).click();

    // Find the first open/pending flag
    const firstFlag = page
      .locator('[data-testid="fraud-flag-row"][data-status="open"]')
      .first();
    await expect(firstFlag).toBeVisible();

    // Click resolve
    await firstFlag.getByRole("button", { name: /resolve/i }).click();

    // Confirm in dialog if present
    const confirmBtn = page.getByRole("button", { name: /confirm|yes/i });
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
    }

    // The flag row should now show resolved status
    await expect(firstFlag).toHaveAttribute("data-status", "resolved");
  });

  test("resolved flag status persists after page reload", async () => {
    // Navigate away and back to confirm server-side update persisted
    await page.goto("/admin/dashboard");
    await page.goto("/admin");
    await page.getByRole("tab", { name: /fraud|flags/i }).click();

    // Previously resolved flag should still be resolved
    const resolvedFlags = page.locator(
      '[data-testid="fraud-flag-row"][data-status="resolved"]'
    );
    await expect(resolvedFlags.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Access control tests
// ---------------------------------------------------------------------------

test.describe("Admin access control", () => {
  test("non-admin user is redirected away from /admin", async ({ page }) => {
    await loginAs(page, NON_ADMIN.phone, NON_ADMIN.otp);
    await page.goto("/admin");

    // Should be redirected to /dashboard (or login), never reach /admin
    await expect(page).not.toHaveURL(/\/admin($|\/)/);
    await expect(page).toHaveURL(/\/(dashboard|auth\/login)/);
  });

  test("unauthenticated user cannot access /admin", async ({ page }) => {
    // Fresh page — no session
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
