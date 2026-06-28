// e2e/critical-otp-login.spec.ts
import { test, expect } from "@playwright/test";

/**
 * End‑to‑end test for the OTP login flow.
 * The test visits the login page, enters a phone number, mocks the OTP send
 * endpoint, provides a known OTP, mocks the verification endpoint, and asserts
 * successful navigation to the dashboard.
 */

test.describe("Critical OTP Login Flow", () => {
  test("user logs in via OTP", async ({ page }) => {
    await page.goto("/login");

    // Fill in phone number.
    await page.fill("input[name=phone]", "+2348000000000");
    await page.click("button[type=submit]");

    // Mock the OTP send endpoint.
    await page.route("**/api/auth/otp/send**", async (route) => {
      await route.fulfill({ status: 200, json: { success: true } });
    });

    // Fill the OTP input (the UI will request it after the send).
    await page.fill("input[name=otp]", "123456");

    // Mock the OTP verification endpoint.
    await page.route("**/api/auth/otp/verify**", async (route) => {
      await route.fulfill({ status: 200, json: { token: "mock-jwt-token" } });
    });

    await page.click("button.verify");

    // Expect to land on the protected dashboard.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("text=Welcome")).toBeVisible();
  });
});
