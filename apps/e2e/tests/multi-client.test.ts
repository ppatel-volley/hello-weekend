import { test, expect } from "@playwright/test";

const DISPLAY_URL = "http://127.0.0.1:3000?sessionId=dev-test";
const CONTROLLER_BASE_URL = "http://127.0.0.1:5174?sessionId=dev-test";
const PLAYER_COUNT = 4;

/** Timeout for VGF state sync. */
const SYNC_TIMEOUT = 15_000;

test("1 display + 4 controllers connect, all visible on display", async ({ browser }) => {
  const displayContext = await browser.newContext();
  const displayPage = await displayContext.newPage();

  const controllerContexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];

  try {
    // 1. Open display — verify lobby phase
    await displayPage.goto(DISPLAY_URL);
    await expect(displayPage.locator("[data-phase='lobby']")).toBeVisible({
      timeout: SYNC_TIMEOUT,
    });

    // 2. Open 4 controllers, each with a unique userId
    for (let i = 1; i <= PLAYER_COUNT; i++) {
      const ctx = await browser.newContext();
      controllerContexts.push(ctx);

      const page = await ctx.newPage();

      await page.goto(`${CONTROLLER_BASE_URL}&userId=player-${i}`);

      // Verify each controller reaches lobby phase
      await expect(page.locator("[data-phase='lobby']")).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });

      // Small delay between connections to let the dev session stabilise
      // (the dev session is re-created every 2s, so rapid connections can race)
      if (i < PLAYER_COUNT) {
        await page.waitForTimeout(500);
      }
    }

    // 3. Wait for display to show all 4 players
    //    The data-player-count attribute is on a <p> element in LobbyScene.
    //    We use a flexible check: player count >= 4 (in case the display itself counts).
    await expect(async () => {
      const countAttr = await displayPage
        .locator("[data-player-count]")
        .getAttribute("data-player-count");
      const count = Number(countAttr ?? "0");
      expect(count).toBeGreaterThanOrEqual(PLAYER_COUNT);
    }).toPass({ timeout: SYNC_TIMEOUT });
  } finally {
    for (const ctx of controllerContexts) {
      await ctx.close();
    }
    await displayContext.close();
  }
});
