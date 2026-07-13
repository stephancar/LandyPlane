/**
 * Not a test per se: captures screenshots of the main screens for visual review.
 * Run with: npx playwright test e2e/screenshots.spec.ts
 */
import { test, expect } from '@playwright/test';

const OUT = 'test-results/shots';

test('capture main screens', async ({ page }) => {
  // Menu
  await page.goto('/');
  await expect(page.locator('#menu')).toBeVisible();
  await page.screenshot({ path: `${OUT}/1-menu.png` });

  // Trainer on approach
  await page.goto('/#trainer');
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/2-approach.png` });

  // Free flight on the runway, throttling up
  await page.goto('/#free');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/3-takeoff-roll.png` });
  await page.keyboard.up('KeyA');

  // Each aircraft on the trainer approach
  for (const ac of ['c172', 'cub', 'f16']) {
    await page.goto('/');
    await page.click(`#ac-${ac}`);
    await page.click('#level-trainer');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/ac-${ac}.png` });
  }
  await page.goto('/');
  await page.click('#ac-c172');

  // Crash + report card
  await page.goto('/#trainer');
  await page.evaluate(() => {
    (window as unknown as { __landy: { game: () => { timeWarp: number } } }).__landy.game().timeWarp = 4;
  });
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/4-diving.png` });
  await expect(page.locator('#report')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-crash-report.png` });
});
