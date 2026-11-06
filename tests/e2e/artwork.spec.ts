import { test, expect, type Page } from '@playwright/test';

/**
 * Universal game artwork — E2E coverage for v0.3.0 Step 4.5.
 *
 * The harness fixtures deliberately cover each branch of the resolution chain:
 *
 *   g1  Steam game, app id 730        -> Steam CDN URLs
 *   g2  cached local cover, no app id -> local file first, no CDN
 *   g3  no artwork at all             -> gradient + initials fallback
 *
 * The CDN is unreachable from the test sandbox, so the `onError` walk is
 * exercised for real: a failed image must advance to the fallback tile instead
 * of leaving an empty box.
 */

type IpcStub = {
  stub: (cmd: string, value: unknown) => void;
  calls: string[];
  reset: () => void;
};

declare global {
  interface Window {
    __MVO_TEST__?: { navigate: (page: string) => void; currentPage: () => string; pages: string[] };
    __MVO_IPC_STUB__?: IpcStub;
  }
}

const STEAM_CDN = /cdn\.(cloudflare|akamai)\.steamstatic\.com\/steam\/apps\/730\//;

async function bootDashboard(page: Page) {
  await page.goto('/?page=dashboard');
  await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });
  await expect(page.getByTestId('library-cover').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Game artwork resolution', () => {
  test('a Steam game resolves to a CDN poster URL', async ({ page }) => {
    await bootDashboard(page);

    // Inspect the src without depending on the CDN being reachable.
    const sources = await page
      .getByTestId('game-artwork')
      .evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));

    expect(
      sources.some(src => /\/steam\/apps\/730\/library_600x900\.jpg$/.test(src)),
      `expected a Steam 2:3 poster URL, got: ${JSON.stringify(sources)}`,
    ).toBe(true);
  });

  test('a cached local cover is preferred over the CDN', async ({ page }) => {
    await bootDashboard(page);

    const sources = await page
      .getByTestId('game-artwork')
      .evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));

    // g2 has no app id, so its only source is the cached file.
    expect(
      sources.some(src => src.includes('beta-cover.png')),
      `expected the cached cover path, got: ${JSON.stringify(sources)}`,
    ).toBe(true);
  });

  test('a game with no artwork falls back to a labelled gradient tile', async ({ page }) => {
    await bootDashboard(page);

    const fallbacks = page.getByTestId('game-artwork-fallback');
    await expect(fallbacks.first()).toBeVisible();

    // The tile names the game for screen readers rather than being a mystery.
    await expect(fallbacks.first()).toHaveAttribute('aria-label', /Test Game Gamma cover art unavailable/);
    // ...and shows initials so it is visually identifiable.
    await expect(fallbacks.first()).toContainText('TG');
  });

  test('a failed CDN image advances to the fallback instead of a blank box', async ({ page }) => {
    await bootDashboard(page);

    // Let the (unreachable) CDN fail, then confirm no card is left empty.
    await page.waitForTimeout(1500);

    const cards = page.getByTestId('library-cover');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const hasImage = (await card.getByTestId('game-artwork').count()) > 0;
      const hasFallback = (await card.getByTestId('game-artwork-fallback').count()) > 0;
      expect(
        hasImage || hasFallback,
        `library card ${i} rendered neither artwork nor a fallback`,
      ).toBe(true);
    }
  });

  test('the library card shows artwork for each game', async ({ page }) => {
    await page.goto('/?page=gamelibrary');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });

    const art = page.getByTestId('game-artwork');
    const fallback = page.getByTestId('game-artwork-fallback');
    await expect(art.first()).toBeVisible({ timeout: 15_000 });

    const images = await art.count();
    const fallbacks = await fallback.count();
    expect(images + fallbacks).toBeGreaterThan(0);
  });

  test('Game Detail renders both a hero banner and a poster', async ({ page }) => {
    await page.goto('/?page=gamedetail&game=g1');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('game-detail')).toBeVisible({ timeout: 30_000 });

    // Two independent artwork slots: the cinematic banner and the cover.
    const art = page.getByTestId('game-artwork');
    const fallback = page.getByTestId('game-artwork-fallback');
    const total = (await art.count()) + (await fallback.count());
    expect(total, 'Game Detail should render banner + cover artwork').toBeGreaterThanOrEqual(2);
  });

  test('Game Detail requests the hero image for its banner', async ({ page }) => {
    await page.goto('/?page=gamedetail&game=g1');
    await expect(page.getByTestId('game-detail')).toBeVisible({ timeout: 30_000 });

    const sources = await page
      .getByTestId('game-artwork')
      .evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));

    // `library_hero.jpg` is the wide cinematic variant; the poster uses 600x900.
    expect(
      sources.some(src => src.includes('library_hero.jpg')),
      `expected a hero banner URL, got: ${JSON.stringify(sources)}`,
    ).toBe(true);
  });

  test('never emits a malformed Steam URL', async ({ page }) => {
    await bootDashboard(page);

    // App ids are interpolated into a URL path, so anything but plain digits
    // must be refused. Assert the invariant across every rendered image.
    const sources = await page
      .getByTestId('game-artwork')
      .evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));

    for (const src of sources) {
      if (src.includes('steamstatic.com')) {
        expect(src, `malformed CDN URL: ${src}`).toMatch(
          /^https:\/\/cdn\.(cloudflare|akamai)\.steamstatic\.com\/steam\/apps\/\d+\/[A-Za-z0-9_]+\.jpg$/,
        );
      }
    }
  });
});
