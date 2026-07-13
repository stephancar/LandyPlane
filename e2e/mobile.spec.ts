import { devices, expect, test } from '@playwright/test';

// Pixel 7: chromium-based descriptor with touch + coarse pointer.
test.use({ ...devices['Pixel 7'] });

test.describe('mobile', () => {
  test('menu is usable on a phone viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#level-trainer')).toBeVisible();
    await page.screenshot({ path: 'test-results/shots/m1-menu.png' });
  });

  test('touch controls appear in flight, keyboard help does not', async ({ page }) => {
    await page.goto('/#trainer');
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#touch-ui')).toBeVisible();
    await expect(page.locator('#help')).toBeHidden();
    await page.screenshot({ path: 'test-results/shots/m2-flight.png' });
  });

  test('holding the throttle button spools the engine up', async ({ page }) => {
    await page.goto('/#free');
    await expect(page.locator('#touch-ui')).toBeVisible();
    expect(await page.locator('#hud-throttle').textContent()).toBe('0%');

    const thr = page.locator('#t-thr-up');
    await thr.dispatchEvent('pointerdown');
    await expect(thr).toHaveClass(/active/);
    await page.waitForTimeout(2000);
    await thr.dispatchEvent('pointerup');
    await expect(thr).not.toHaveClass(/active/);

    const pct = parseInt((await page.locator('#hud-throttle').textContent()) ?? '0');
    expect(pct).toBeGreaterThan(40);
    await page.screenshot({ path: 'test-results/shots/m3-throttle.png' });
  });

  test('pitch buttons drive the elevator', async ({ page }) => {
    await page.goto('/#trainer');
    const pitch0 = parseFloat((await page.locator('#hud-pitch').textContent()) ?? '0');
    const up = page.locator('#t-pitch-up');
    await up.dispatchEvent('pointerdown');
    await page.waitForTimeout(900);
    await up.dispatchEvent('pointerup');
    const pitch1 = parseFloat((await page.locator('#hud-pitch').textContent()) ?? '0');
    expect(pitch1).toBeGreaterThan(pitch0 + 1);
  });

  test('brake button shows the brake pill on the ground', async ({ page }) => {
    await page.goto('/#free');
    const brakes = page.locator('#t-brakes');
    await brakes.dispatchEvent('pointerdown');
    await expect(page.locator('#brake-pill')).toBeVisible();
    await brakes.dispatchEvent('pointerup');
    await expect(page.locator('#brake-pill')).toBeHidden();
  });
});
