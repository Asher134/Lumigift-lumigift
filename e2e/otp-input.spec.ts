/**
 * e2e: OTP input — auto-advance, paste, backspace, and invalid submission
 *
 * Covers (issue #645):
 *  1. Paste '123456' into first input → all 6 boxes filled → form submittable
 *  2. Fill 3 boxes → backspace on 4th (empty) → focus moves to 3rd box
 *  3. Submit with invalid OTP → error message shown
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_PHONE = "+2348012345678";

// ─── Shared mock helpers ───────────────────────────────────────────────────────

async function setupMocks(page: Page, { otpValid = true } = {}) {
  await page.route("**/api/auth/send-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  );

  await page.route("**/api/auth/signin/credentials", (route) =>
    route.fulfill({
      status: otpValid ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify(
        otpValid ? { url: "/dashboard" } : { error: "Invalid OTP. Please try again." }
      ),
    })
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        otpValid
          ? {
              user: { id: "test-user-id", phone: TEST_PHONE },
              expires: new Date(Date.now() + 86_400_000).toISOString(),
            }
          : {}
      ),
    })
  );
}

/** Navigate to login and submit the phone number so OTP inputs are visible. */
async function goToOtpStep(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: /phone/i }).fill(TEST_PHONE);
  await page.getByRole("button", { name: /send otp|get code|continue/i }).click();
  // Wait for the first OTP digit input to appear
  await page.waitForSelector('input[aria-label="Digit 1 of 6"]', { timeout: 10_000 });
}

// ─── 1. Paste a 6-digit OTP → all boxes filled ────────────────────────────────
test("paste 6-digit OTP fills all boxes and enables submission", async ({ page }) => {
  await setupMocks(page, { otpValid: true });
  await goToOtpStep(page);

  // Paste into the first digit input
  const firstInput = page.locator('input[aria-label="Digit 1 of 6"]');
  await firstInput.focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "123456");
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true })
    );
  });

  // All 6 inputs should hold the corresponding digit
  for (let i = 1; i <= 6; i++) {
    await expect(
      page.locator(`input[aria-label="Digit ${i} of 6"]`)
    ).toHaveValue(String(i), { timeout: 5_000 });
  }

  // Submit button should become enabled
  await expect(
    page.getByRole("button", { name: /verify|confirm|sign in|submit/i })
  ).toBeEnabled({ timeout: 5_000 });
});

// ─── 2. Backspace from empty box → focus moves to previous box ────────────────
test("backspace on empty box moves focus to previous box", async ({ page }) => {
  await setupMocks(page);
  await goToOtpStep(page);

  // Fill first 3 boxes manually
  for (let i = 1; i <= 3; i++) {
    await page.locator(`input[aria-label="Digit ${i} of 6"]`).fill(String(i));
  }

  // Focus the 4th input (which is empty after filling 3)
  const fourthInput = page.locator('input[aria-label="Digit 4 of 6"]');
  await fourthInput.focus();

  // Press Backspace — focus should move back to the 3rd input
  await page.keyboard.press("Backspace");

  const thirdInput = page.locator('input[aria-label="Digit 3 of 6"]');
  await expect(thirdInput).toBeFocused({ timeout: 5_000 });
});

// ─── 3. Invalid OTP submission → error message ────────────────────────────────
test("submitting invalid OTP shows an error message", async ({ page }) => {
  await setupMocks(page, { otpValid: false });
  await goToOtpStep(page);

  // Type each digit of an invalid OTP
  for (let i = 1; i <= 6; i++) {
    await page.locator(`input[aria-label="Digit ${i} of 6"]`).fill("0");
  }

  await page.getByRole("button", { name: /verify|confirm|sign in|submit/i }).click();

  await expect(
    page.getByRole("alert").or(page.getByText(/invalid otp|incorrect|try again/i))
  ).toBeVisible({ timeout: 10_000 });
});
