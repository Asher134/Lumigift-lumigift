// e2e/critical-send-gift.spec.ts
import { test, expect } from "@playwright/test";

/**
 * End‑to‑end test for the critical "send a gift" journey.
 * It fills the gift creation form, mocks the payment request, and verifies the
 * success page. No real network calls are performed.
 */

test.describe("Critical Send Gift Flow", () => {
  test("sender creates a gift with mocked payment", async ({ page }) => {
    // Navigate to the gift creation page.
    await page.goto("/gift/create");

    // Fill the form (adjust selectors to match the actual UI).
    await page.fill("input[name=recipientName]", "Alice Wonderland");
    await page.fill("input[name=recipientEmail]", "alice@example.com");
    await page.fill("input[name=amount]", "5000");
    await page.selectOption("select[name=currency]", "NGN");

    // Intercept the payment request and return a mocked success response.
    await page.route("**/api/payments/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          status: "success",
          transactionId: "mock-tx-123",
          paymentUrl: "https://mock.payment/checkout",
        },
      });
    });

    // Submit the form.
    await page.click("button[type=submit]");

    // Verify navigation to the success page and visible success message.
    await expect(page).toHaveURL(/\/gift\/success/);
    await expect(page.locator("text=Gift created successfully")).toBeVisible();
  });
});
