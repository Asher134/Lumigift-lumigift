/**
 * Visual regression tests for the gift reveal page (/gifts/[id]).
 *
 * Covers locked and unlocked states at mobile (375px) and desktop (1280px).
 *
 * Run: npx playwright test e2e/visual/gift-reveal.spec.ts --update-snapshots
 * CI:  npx playwright test e2e/visual/gift-reveal.spec.ts
 */

import { test, expect, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A gift ID whose unlock_time is in the FUTURE (locked state). */
const LOCKED_GIFT_ID = process.env.E2E_LOCKED_GIFT_ID ?? "test-locked-gift";

/** A gift ID whose unlock_time is in the PAST (unlocked state). */
const UNLOCKED_GIFT_ID =
  process.env.E2E_UNLOCKED_GIFT_ID ?? "test-unlocked-gift";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

async function gotoGiftPage(page: Page, giftId: string) {
  await page.goto(`/gifts/${giftId}`, { waitUntil: "networkidle" });
}

/** Wait for the reveal animation to reach a stable frame before snapping. */
async function waitForRevealStable(page: Page) {
  // Wait for the gift card container to be visible
  await page.locator('[data-testid="gift-reveal-card"]').waitFor({
    state: "visible",
    timeout: 10_000,
  });
  // Allow CSS transitions to settle
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`Gift reveal page — ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`locked state snapshot — ${viewport.name}`, async ({ page }) => {
      await gotoGiftPage(page, LOCKED_GIFT_ID);
      await waitForRevealStable(page);

      // The locked state should show the lock icon / countdown, not the gift content
      await expect(
        page.locator('[data-testid="gift-locked-state"]')
      ).toBeVisible();

      await expect(page).toHaveScreenshot(
        `gift-reveal-locked-${viewport.name}.png`,
        {
          maxDiffPixelRatio: 0.02,
          animations: "disabled",
        }
      );
    });

    test(`unlocked state snapshot — ${viewport.name}`, async ({ page }) => {
      await gotoGiftPage(page, UNLOCKED_GIFT_ID);
      await waitForRevealStable(page);

      // The unlocked state should reveal the gift content
      await expect(
        page.locator('[data-testid="gift-unlocked-state"]')
      ).toBeVisible();

      await expect(page).toHaveScreenshot(
        `gift-reveal-unlocked-${viewport.name}.png`,
        {
          maxDiffPixelRatio: 0.02,
          animations: "disabled",
        }
      );
    });

    test(`unlock animation start frame — ${viewport.name}`, async ({
      page,
    }) => {
      // Navigate to an unlocked gift but capture the very first animation frame
      await page.goto(`/gifts/${UNLOCKED_GIFT_ID}`);

      // Capture before networkidle so we see the animation entry state
      await page
        .locator('[data-testid="gift-reveal-card"]')
        .waitFor({ state: "visible" });

      await expect(page).toHaveScreenshot(
        `gift-reveal-animation-start-${viewport.name}.png`,
        {
          maxDiffPixelRatio: 0.05,
          animations: "allow",
        }
      );
    });
  });
}
