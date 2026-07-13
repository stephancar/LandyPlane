import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __landy?: { game: () => { timeWarp: number; phase: string } | null; startLevel: (id: string) => void };
  }
}

async function readSpeedKt(page: Page): Promise<number> {
  const text = await page.locator('#hud-speed').textContent();
  return parseFloat(text ?? '0');
}

test.describe('menu', () => {
  test('boots to the level select with correct lock state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#menu h1')).toContainText('Landy');
    await expect(page.locator('.level-btn')).toHaveCount(5);
    await expect(page.locator('#level-trainer')).toBeEnabled();
    await expect(page.locator('#level-shortfield')).toBeDisabled();
    await expect(page.locator('#btn-free')).toBeVisible();
  });

  test('passing score unlocks the next level (persisted)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'landyplane.v2',
        JSON.stringify({ bestScores: { 'trainer@c172': 80 }, muted: false, invertPitch: false, aircraft: 'c172' }),
      );
    });
    await page.reload();
    await expect(page.locator('#level-shortfield')).toBeEnabled();
    await expect(page.locator('#level-trainer .lvl-best')).toContainText('best 80');
    await expect(page.locator('#level-gusty')).toBeDisabled();
  });

  test('progression is per aircraft and the picker persists', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'landyplane.v2',
        JSON.stringify({ bestScores: { 'trainer@c172': 80 }, muted: false, invertPitch: false, aircraft: 'c172' }),
      );
    });
    await page.reload();
    await expect(page.locator('#ac-c172')).toHaveClass(/selected/);
    await expect(page.locator('#level-shortfield')).toBeEnabled();

    // Switching to the F-16 relocks level 2 (no F-16 trainer score yet).
    await page.click('#ac-f16');
    await expect(page.locator('#ac-f16')).toHaveClass(/selected/);
    await expect(page.locator('#level-shortfield')).toBeDisabled();

    await page.reload();
    await expect(page.locator('#ac-f16')).toHaveClass(/selected/);
  });

  test('selected aircraft shows up in the flight HUD', async ({ page }) => {
    await page.goto('/');
    await page.click('#ac-f16');
    await page.click('#level-trainer');
    await expect(page.locator('#hud-level')).toHaveText('Trainer — F-16');
  });
});

test.describe('flight', () => {
  test('starting the trainer shows the HUD and a live airspeed', async ({ page }) => {
    await page.goto('/');
    await page.click('#level-trainer');
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hud-level')).toHaveText('Trainer — Cessna 172');
    await expect(page.locator('#aero-card')).toBeHidden();
    await page.waitForTimeout(300);
    expect(await readSpeedKt(page)).toBeGreaterThan(40); // starts on approach at ~64 kt
  });

  test('free flight: throttle key spools up and the plane accelerates', async ({ page }) => {
    await page.goto('/#free');
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#aero-card')).toBeVisible();
    const thr0 = await page.locator('#hud-throttle').textContent();
    expect(thr0).toBe('0%');

    await page.keyboard.down('KeyA');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyA');

    const thrText = (await page.locator('#hud-throttle').textContent()) ?? '0';
    expect(parseInt(thrText)).toBeGreaterThan(50);
    expect(await readSpeedKt(page)).toBeGreaterThan(5);
  });

  test('diving into the ground crashes and shows the report card', async ({ page }) => {
    await page.goto('/#trainer');
    await expect(page.locator('#hud')).toBeVisible();
    // Speed the sim up so the dive lands quickly.
    await page.evaluate(() => {
      const g = window.__landy!.game()!;
      g.timeWarp = 4;
    });
    await page.keyboard.down('ArrowDown');
    await expect(page.locator('#report')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.up('ArrowDown');
    await expect(page.locator('#report-tier')).toContainText('Crashed');
    await expect(page.locator('#report-crash')).toBeVisible();
    await expect(page.locator('#report-score')).toHaveText('0');
  });

  test('retry from the report restarts the level', async ({ page }) => {
    await page.goto('/#trainer');
    await page.evaluate(() => {
      const g = window.__landy!.game()!;
      g.timeWarp = 4;
    });
    await page.keyboard.down('ArrowDown');
    await expect(page.locator('#report')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.up('ArrowDown');

    await page.click('#btn-retry');
    await expect(page.locator('#report')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    expect(await readSpeedKt(page)).toBeGreaterThan(40);
  });

  test('Escape opens the level menu mid-flight', async ({ page }) => {
    await page.goto('/#trainer');
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
  });
});

test.describe('settings', () => {
  test('mute toggles and persists across reload', async ({ page }) => {
    await page.goto('/#free');
    await expect(page.locator('#btn-mute')).toHaveText('🔊');
    await page.click('#btn-mute');
    await expect(page.locator('#btn-mute')).toHaveText('🔇');
    await page.reload();
    await expect(page.locator('#btn-mute')).toHaveText('🔇');
  });
});
