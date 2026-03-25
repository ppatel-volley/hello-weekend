import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const DISPLAY_URL = "http://localhost:3000?sessionId=dev-test";
const CONTROLLER_URL = "http://localhost:5174?sessionId=dev-test";
const PHASE_TIMEOUT = 15_000;
const QUESTIONS_PER_ROUND = 5;

/**
 * Question bank — mirrors apps/server/src/questions.ts.
 * Used to look up correct answers from the question text shown in the UI.
 */
const ANSWER_MAP: Record<string, string> = {
  "What day comes after Friday?": "saturday",
  "What colour is the sky on a clear day?": "blue",
  "How many days are in a week?": "seven",
  "What is the opposite of hot?": "cold",
  "What month comes after January?": "february",
  "What is 2 + 2?": "four",
  "What planet do we live on?": "earth",
  "What is the first day of the weekend?": "saturday",
  "How many legs does a dog have?": "four",
  "What colour are bananas?": "yellow",
};

async function getQuestion(page: Page): Promise<string> {
  const q = await page.locator("[data-question]").getAttribute("data-question");
  return q ?? "";
}

async function submitAnswer(page: Page, answer: string) {
  const input = page.locator("input[type='text']");
  await input.fill(answer);
  await page.locator("[data-action='submit-answer']").click();
  await page.waitForTimeout(1000);
}

const SERVER_URL = "http://127.0.0.1:8090";

/**
 * Force-reset the dev session on the server, then navigate both pages
 * so they connect to a fresh lobby state.
 */
async function resetAndNavigate(
  displayPage: Page,
  controllerPage: Page,
): Promise<void> {
  // Reset server session to clean lobby state
  await fetch(`${SERVER_URL}/api/reset-session`, { method: "POST" });

  // Small delay for the session to settle
  await new Promise((r) => setTimeout(r, 500));

  // Navigate both pages (or reload if already there)
  await displayPage.goto(DISPLAY_URL);
  await controllerPage.goto(CONTROLLER_URL);

  // Wait for lobby on both
  await expect(
    controllerPage.locator("[data-phase='lobby']"),
  ).toBeVisible({ timeout: PHASE_TIMEOUT });
  await expect(
    displayPage.locator("[data-phase='lobby']"),
  ).toBeVisible({ timeout: PHASE_TIMEOUT });
}

/**
 * Start a game and play through all questions with garbage answers
 * to reach gameOver. Returns pages still connected.
 */
async function playFullGame(
  displayPage: Page,
  controllerPage: Page,
): Promise<void> {
  await resetAndNavigate(displayPage, controllerPage);

  await controllerPage.locator("[data-action='start-game']").click();
  await expect(
    controllerPage.locator("[data-phase='playing']"),
  ).toBeVisible({ timeout: PHASE_TIMEOUT });

  for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
    const done = await controllerPage
      .locator("[data-phase='game-over']")
      .isVisible()
      .catch(() => false);
    if (done) break;
    await submitAnswer(controllerPage, "skip");
  }

  await expect(
    controllerPage.locator("[data-phase='game-over']"),
  ).toBeVisible({ timeout: PHASE_TIMEOUT });
}

test.describe("play again flow", () => {
  test("can play two full games back-to-back", async ({ browser }) => {
    const displayCtx = await browser.newContext();
    const controllerCtx = await browser.newContext();
    const displayPage = await displayCtx.newPage();
    const controllerPage = await controllerCtx.newPage();

    try {
      // Game 1: play through to gameOver
      await playFullGame(displayPage, controllerPage);

      await expect(
        displayPage.locator("[data-phase='game-over']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });

      // Reset session to lobby (simulates Play Again)
      await resetAndNavigate(displayPage, controllerPage);

      // Game 2: start and verify playing phase works
      await controllerPage.locator("[data-action='start-game']").click();

      await expect(
        displayPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });
      await expect(
        controllerPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });

      // Submit all answers for game 2
      for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
        const done = await controllerPage
          .locator("[data-phase='game-over']")
          .isVisible()
          .catch(() => false);
        if (done) break;
        await submitAnswer(controllerPage, "skip");
      }

      // Game 2 reaches gameOver
      await expect(
        displayPage.locator("[data-phase='game-over']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });
    } finally {
      await displayCtx.close();
      await controllerCtx.close();
    }
  });
});

test.describe("score verification", () => {
  test("correct answers increment score, wrong answers do not", async ({
    browser,
  }) => {
    const displayCtx = await browser.newContext();
    const controllerCtx = await browser.newContext();
    const displayPage = await displayCtx.newPage();
    const controllerPage = await controllerCtx.newPage();

    try {
      await resetAndNavigate(displayPage, controllerPage);

      // Start game
      await controllerPage.locator("[data-action='start-game']").click();
      await expect(
        displayPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });
      await expect(
        controllerPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });

      // Question 1: submit CORRECT answer
      const q1 = await getQuestion(controllerPage);
      const correctAnswer = ANSWER_MAP[q1];
      expect(correctAnswer).toBeTruthy();
      await submitAnswer(controllerPage, correctAnswer!);

      // Display should show score = 1
      await expect(async () => {
        const score = await displayPage
          .locator("[data-score]")
          .getAttribute("data-score");
        expect(Number(score)).toBe(1);
      }).toPass({ timeout: PHASE_TIMEOUT });

      // Question 2: submit WRONG answer
      await submitAnswer(controllerPage, "absolutely-wrong-answer-xyzzy");

      // Score should still be 1 (wrong answer doesn't increment)
      await expect(async () => {
        const score = await displayPage
          .locator("[data-score]")
          .getAttribute("data-score");
        expect(Number(score)).toBe(1);
      }).toPass({ timeout: PHASE_TIMEOUT });

      // Finish remaining questions
      for (let i = 2; i < QUESTIONS_PER_ROUND; i++) {
        const done = await controllerPage
          .locator("[data-phase='game-over']")
          .isVisible()
          .catch(() => false);
        if (done) break;
        await submitAnswer(controllerPage, "skip");
      }

      // Should reach gameOver with final score = 1
      await expect(
        displayPage.locator("[data-phase='game-over']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });
      const finalScore = await displayPage
        .locator("[data-score]")
        .getAttribute("data-score");
      expect(Number(finalScore)).toBe(1);
    } finally {
      await displayCtx.close();
      await controllerCtx.close();
    }
  });
});

test.describe("display-controller sync", () => {
  test("display and controller show the same question", async ({
    browser,
  }) => {
    const displayCtx = await browser.newContext();
    const controllerCtx = await browser.newContext();
    const displayPage = await displayCtx.newPage();
    const controllerPage = await controllerCtx.newPage();

    try {
      await displayPage.goto(DISPLAY_URL);
      await controllerPage.goto(CONTROLLER_URL);
      await resetAndNavigate(displayPage, controllerPage);

      // Start game
      await controllerPage.locator("[data-action='start-game']").click();
      await expect(
        displayPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });
      await expect(
        controllerPage.locator("[data-phase='playing']"),
      ).toBeVisible({ timeout: PHASE_TIMEOUT });

      // Read question from both sides and verify they match
      const controllerQ = await getQuestion(controllerPage);
      expect(controllerQ).toBeTruthy();

      await expect(async () => {
        const displayQ = await displayPage
          .locator("[data-question]")
          .getAttribute("data-question");
        expect(displayQ).toBe(controllerQ);
      }).toPass({ timeout: PHASE_TIMEOUT });

      // Submit an answer and verify both sides advance to the same next question
      await submitAnswer(controllerPage, "skip");

      // Wait for a new question to appear (different from the first)
      await expect(async () => {
        const q2 = await getQuestion(controllerPage);
        expect(q2).toBeTruthy();
        expect(q2).not.toBe(controllerQ);
      }).toPass({ timeout: PHASE_TIMEOUT });

      const controllerQ2 = await getQuestion(controllerPage);

      await expect(async () => {
        const displayQ2 = await displayPage
          .locator("[data-question]")
          .getAttribute("data-question");
        expect(displayQ2).toBe(controllerQ2);
      }).toPass({ timeout: PHASE_TIMEOUT });
    } finally {
      await displayCtx.close();
      await controllerCtx.close();
    }
  });
});
