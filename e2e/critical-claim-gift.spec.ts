// e2e/critical-claim-gift.spec.ts
import { test, expect } from "@playwright/test";

/**
 * End‑to‑end test for the critical "claim a gift" journey after the unlock time.
 * The test logs in as the recipient (mocked session), navigates to the claim page,
 * mocks the escrow state check, and verifies that the claim succeeds.
 */

test.describe("Critical Claim Gift Flow", () => {
  test("recipient claims an unlocked gift", async ({ page }) => {
    const giftId = "gift-abc"; // In CI this should be seeded via API/fixture.

    // Mock authentication by setting a session cookie.
    await page.context().addCookies([
      {
        name: "session",
        value: "mock-session-token",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    // Navigate to the claim page.
    await page.goto(`/gift/claim/${giftId}`);

    // Mock the escrow state endpoint to signal the gift is not yet claimed.
    await page.route("**/api/escrow/state/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: { claimed: false },
      });
    });

    // Click the claim button.
    await page.click("button.claim");

    // Verify the success message appears.
    await expect(page.locator("text=Gift claimed successfully")).toBeVisible();
  });
});
