/**
 * e2e: Group gift creation and multi-contributor flow
 *
 * Test 1: Sender creates a group gift and receives a contributor share link.
 * Test 2: Contributor visits the link, fills the form, and completes payment.
 * Test 3: Contributor sees a failure message when payment fails.
 *
 * Screenshots on failure are captured automatically by Playwright
 * (playwright.config.ts: screenshot: 'only-on-failure').
 * The staging CI workflow also uploads playwright-report/ on failure.
 */

import { test, expect } from "@playwright/test";

const TEST_TOKEN = "test-token-123";
const TEST_GIFT_ID = "group-gift-uuid-001";

const mockGroupGift = {
  id: TEST_GIFT_ID,
  token: TEST_TOKEN,
  recipientName: "Amara",
  recipientPhone: "+2348012345678",
  targetAmountNgn: 20000,
  collectedAmountNgn: 5000,
  message: "Happy Birthday Amara! 🎂",
  status: "open",
  contributions: [
    { id: "c1", contributorName: "Chidi", amountNgn: 5000, status: "success" },
  ],
};

test.describe("Group Gift Flow", () => {
  test("sender creates group gift and gets contributor link", { tag: ["@smoke"] }, async ({ page }) => {
    const shareUrl = `http://localhost:3000/contribute/${TEST_TOKEN}`;

    await page.route("**/api/gifts/group", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: TEST_GIFT_ID, shareUrl },
        }),
      });
    });

    await page.goto("/send/group");

    await page.fill('input[name="recipientName"]', "Amara");
    await page.fill('input[name="recipientPhone"]', "+2348012345678");
    await page.fill('input[name="targetAmountNgn"]', "20000");

    const future = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16);
    await page.fill('input[name="deadline"]', future);
    await page.fill('input[name="unlockAt"]', future);

    await page.click('button[type="submit"]');

    // After successful creation, the form shows the share link
    await expect(page.getByText("Group Gift Created!")).toBeVisible();
    const linkInput = page.locator('input[value*="/contribute/"]');
    await expect(linkInput).toBeVisible();
    await expect(linkInput).toHaveValue(shareUrl);
  });

  test("contributor visits link and completes payment", { tag: ["@smoke"] }, async ({ page }) => {
    // Mock the server-side data fetch that the page uses to render ContributeForm
    await page.route(`**/api/gifts/group/${TEST_GIFT_ID}/contribute`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { paymentUrl: "https://checkout.paystack.com/mock-access-code" },
        }),
      });
    });

    // Intercept the Paystack redirect and instead navigate to the thank-you page
    await page.route("https://checkout.paystack.com/**", (route) => {
      route.fulfill({
        status: 302,
        headers: { Location: `/contribute/${TEST_TOKEN}/thank-you` },
      });
    });

    // Mock the page SSR data — the contribute page calls getGroupGiftByToken server-side,
    // but in e2e we need the page to render. We seed the page by intercepting the Next.js
    // RSC / API fetch that would supply gift data. If the app makes an API call for the
    // gift, mock it; otherwise the SSR data is embedded in the HTML and no mock is needed.
    await page.goto(`/contribute/${TEST_TOKEN}`);

    // Fill in the contribution form
    await page.fill('input[name="contributorName"]', "Tunde");
    await page.fill('input[name="amountNgn"]', "2000");

    await page.click('button[type="submit"]');

    // The form POSTs to /api/gifts/group/:id/contribute and then window.location.href
    // is set to the paymentUrl. Our route mock redirects that to the thank-you page.
    await page.waitForURL(`**/contribute/${TEST_TOKEN}/thank-you`, { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/contribute/${TEST_TOKEN}/thank-you`));
  });

  test("contributor sees payment failed message on error", { tag: ["@smoke"] }, async ({ page }) => {
    await page.route(`**/api/gifts/group/${TEST_GIFT_ID}/contribute`, (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Payment initialisation failed" }),
      });
    });

    await page.goto(`/contribute/${TEST_TOKEN}`);

    await page.fill('input[name="contributorName"]', "Emeka");
    await page.fill('input[name="amountNgn"]', "1500");

    await page.click('button[type="submit"]');

    // ContributeForm renders the error string returned by the API
    await expect(page.getByText("Payment initialisation failed")).toBeVisible();
  });

  test("contributor sees payment failed message via URL param", { tag: ["@smoke"] }, async ({ page }) => {
    // The contribute page passes ?error=payment_failed when Paystack callback fails
    await page.goto(`/contribute/${TEST_TOKEN}?error=payment_failed`);

    await expect(page.getByText("Payment failed. Please try again.")).toBeVisible();
  });
});
