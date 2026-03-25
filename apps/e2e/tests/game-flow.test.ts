import { test, expect } from "@playwright/test";

const DISPLAY_URL = "http://127.0.0.1:3000?sessionId=dev-test";
const CONTROLLER_URL = "http://127.0.0.1:5174?sessionId=dev-test";
const QUESTIONS_PER_ROUND = 5;

/** Timeout for waiting on VGF phase transitions (state sync has latency). */
const PHASE_TIMEOUT = 15_000;

test("full game flow: lobby → playing → game over", async ({ browser }) => {
  // Create separate browser contexts for display and controller
  const displayContext = await browser.newContext();
  const controllerContext = await browser.newContext();

  const displayPage = await displayContext.newPage();
  const controllerPage = await controllerContext.newPage();

  try {
    // 1. Open display — should show lobby phase
    await displayPage.goto(DISPLAY_URL);
    await expect(displayPage.locator("[data-phase='lobby']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });

    // 2. Open controller — should show lobby phase
    await controllerPage.goto(CONTROLLER_URL);
    await expect(controllerPage.locator("[data-phase='lobby']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });

    // 3. Click "Start Game" on the controller
    await controllerPage.locator("[data-action='start-game']").click();

    // 4. Verify both display and controller transition to playing phase
    await expect(displayPage.locator("[data-phase='playing']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });
    await expect(controllerPage.locator("[data-phase='playing']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });

    // 5. Submit answers for all questions via the text input fallback
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      // Wait for the playing phase to still be visible (ensures we haven't transitioned early)
      const playingLocator = controllerPage.locator("[data-phase='playing']");
      const gameOverLocator = controllerPage.locator("[data-phase='game-over']");

      // If we're already at game-over, break (can happen if fewer questions than expected)
      const isGameOver = await gameOverLocator.isVisible().catch(() => false);
      if (isGameOver) break;

      await expect(playingLocator).toBeVisible({ timeout: PHASE_TIMEOUT });

      // Type an answer and submit
      const input = controllerPage.locator("input[type='text']");
      await input.fill(`answer-${i + 1}`);
      await controllerPage.locator("[data-action='submit-answer']").click();

      // Brief wait for state to sync before next question
      await controllerPage.waitForTimeout(1000);
    }

    // 6. Verify display transitions to game over
    await expect(displayPage.locator("[data-phase='game-over']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });

    // 7. Verify controller transitions to game over
    await expect(controllerPage.locator("[data-phase='game-over']")).toBeVisible({
      timeout: PHASE_TIMEOUT,
    });
  } finally {
    await displayContext.close();
    await controllerContext.close();
  }
});
