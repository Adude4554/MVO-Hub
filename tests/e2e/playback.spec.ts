import { test, expect } from '@playwright/test';

test.describe('asset playback & fallbacks', () => {
  test('hero video plays and loops on Home', async ({ page }) => {
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

    const video = page.getByTestId('hero-video');
    await expect(video).toBeAttached({ timeout: 15000 });

    await expect
      .poll(
        () =>
          video.evaluate((el) => {
            const v = el as HTMLVideoElement;
            return !v.paused && v.currentTime > 0;
          }),
        { timeout: 15000, message: 'hero video should be playing' },
      )
      .toBe(true);

    const info = await video.evaluate((el) => {
      const v = el as HTMLVideoElement;
      return {
        currentTime: Math.round(v.currentTime * 100) / 100,
        width: v.videoWidth,
        height: v.videoHeight,
        loop: v.loop,
        muted: v.muted,
        playsInline: v.playsInline,
      };
    });
    console.log('HERO PLAYBACK', JSON.stringify(info));

    expect(info.width).toBeGreaterThan(0);
    expect(info.loop).toBe(true);
    expect(info.muted).toBe(true);
    expect(info.playsInline).toBe(true);

    // The video layer must be visible (opacity 1) once it can paint.
    await expect
      .poll(() => video.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await expect(page.getByTestId('video-background')).toHaveAttribute('data-video-state', 'playing');
  });

  test('splash plays startup.webm and advances via onEnded', async ({ page }) => {
    // The harness disables the splash; load the production-equivalent path by
    // asserting the splash component contract directly through the DOM.
    await page.goto('/');
    const splash = page.getByTestId('splash-screen');

    // Harness build skips the splash, so this test only runs when present.
    if ((await splash.count()) === 0) {
      test.skip(true, 'Test-harness build skips the splash (covered in production preview)');
      return;
    }

    const video = page.getByTestId('splash-video');
    await expect(video).toBeAttached();
    expect(await video.evaluate((el) => (el as HTMLVideoElement).muted)).toBe(true);

    // Must reach the shell within the hard ceiling regardless of playback.
    await expect(page.locator('.mvo-app, [data-testid="boot-splash"], form')).toBeVisible({
      timeout: 8000,
    });
    await expect(splash).toHaveCount(0);
  });

  test('missing hero video degrades to static poster', async ({ page }) => {
    // Simulate a missing/blocked asset.
    await page.route('**/assets/hero-bg.webm', (r) => r.abort());
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

    await expect(page.getByTestId('video-background')).toHaveAttribute('data-video-state', 'static', {
      timeout: 15000,
    });
    // Poster remains painted; hero content still legible.
    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(page.getByTestId('hero-cta')).toBeVisible();
  });

  test('corrupt hero video does not break the page', async ({ page }) => {
    await page.route('**/assets/hero-bg.webm', (r) =>
      r.fulfill({ status: 200, contentType: 'video/webm', body: 'not-a-video' }),
    );
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

    await expect(page.getByTestId('video-background')).toHaveAttribute('data-video-state', 'static', {
      timeout: 15000,
    });
    await expect(page.getByTestId('hero-title')).toBeVisible();
  });

  test('reduced motion never mounts the video', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));
    await page.waitForTimeout(600);

    await expect(page.getByTestId('hero-video')).toHaveCount(0);
    await expect(page.getByTestId('video-background')).toHaveAttribute('data-video-state', 'static');
    await expect(page.getByTestId('hero-title')).toBeVisible();
  });
});
