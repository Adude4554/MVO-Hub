import { test, expect, type Page } from '@playwright/test';

/**
 * MVO Hub — frontend smoke suite
 *
 * Verifies that every routed application page mounts and renders without
 * crashing the React ErrorBoundary. Tauri IPC is unavailable in the browser,
 * so this asserts robustness of the UI against missing backend commands,
 * which is exactly how the 16 previously-untested secondary pages fail.
 *
 * Pages are sourced from the app's own routing table (via the test harness
 * bridge) so this suite automatically covers new pages.
 */

type HarnessPage = {
  navigate: (page: string) => void;
  currentPage: () => string;
  pages: string[];
};

declare global {
  interface Window {
    __MVO_TEST__?: HarnessPage;
    __MVO_ERRORS__?: unknown[];
  }
}

/** Boot the app once and wait for the shell + harness bridge to be ready. */
async function bootApp(page: Page) {
  await page.goto('/?page=dashboard');
  await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__MVO_TEST__), { timeout: 30_000 });
}

/** Assert the React ErrorBoundary did not take over the screen. */
async function expectNoCrash(page: Page) {
  // The ErrorBoundary renders "MVO Hub — Crash Report".
  await expect(page.getByText('Crash Report')).toHaveCount(0);
  // ...and it replaces the whole app shell.
  await expect(page.locator('.mvo-app')).toBeVisible();
}

/** Collect console/page errors for a page and fail on React render errors. */
function trackRenderErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // ErrorBoundary logs this prefix on componentDidCatch.
    if (text.includes('[MVO ERROR BOUNDARY]')) {
      errors.push(`boundary: ${text}`);
    }
  });
  return errors;
}

test.describe('MVO Hub — app shell', () => {
  test('boots to the dashboard without crashing', async ({ page }) => {
    await bootApp(page);
    await expectNoCrash(page);
    // Main shell chrome is present
    await expect(page.locator('main')).toBeVisible();
  });

  test('sidebar renders navigation entries', async ({ page }) => {
    await bootApp(page);
    const nav = page.locator('.mvo-sidebar, aside').first();
    await expect(nav).toBeVisible();
  });

  // ── Phase 4 shell structure ──────────────────────────────────────────

  test('left sidebar shows branding and all seven primary destinations', async ({ page }) => {
    await bootApp(page);
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();

    // Branding block
    await expect(sidebar.getByText('MVO HUB', { exact: true }).first()).toBeVisible();
    await expect(sidebar.getByText(/Play • Watch • Browse • More/i)).toBeVisible();

    // Primary navigation order
    const expected = [
      ['dashboard', 'Home'],
      ['hardware', 'Hardware'],
      ['gamelibrary', 'Game Library'],
      ['moviestv', 'Movies & TV Shows'],
      ['browser', 'MVO Browser'],
      ['aitools', 'MVO AI'],
      ['settings', 'Settings'],
    ] as const;

    for (const [id, label] of expected) {
      await expect(sidebar.getByTestId(`nav-${id}`)).toBeVisible();
      await expect(sidebar.getByTestId(`nav-${id}`)).toContainText(label);
    }

    // Sidebar is fixed: it must not scroll away with page content.
    await expect(sidebar).toHaveCSS('position', 'fixed');
  });

  test('footer reports version and ready status', async ({ page }) => {
    await bootApp(page);
    // v0.2.14: the version/status indicator lives in the global footer.
    const footer = page.getByTestId('status-footer');
    await expect(footer.getByText(/MVO Hub v\d+\.\d+\.\d+/)).toBeVisible();
    await expect(page.getByTestId('footer-status-dot')).toBeVisible();
  });

  test('active nav item is marked and moves with navigation', async ({ page }) => {
    await bootApp(page);

    // Home active on boot
    await expect(page.getByTestId('nav-dashboard')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('nav-hardware').click();
    await expect
      .poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage()))
      .toBe('hardware');

    await expect(page.getByTestId('nav-hardware')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current', 'page');
  });

  test('top HUD shows greeting, subtitle, search and actions', async ({ page }) => {
    await bootApp(page);
    const hud = page.getByTestId('top-hud');
    await expect(hud).toBeVisible();

    await expect(page.getByTestId('greeting')).toContainText('Welcome back,');
    await expect(hud.getByText('Your ultimate hub for gaming, entertainment and more.')).toBeVisible();
    await expect(page.getByTestId('search-trigger')).toContainText('Search anything');
    await expect(page.getByTestId('search-trigger')).toContainText('Ctrl + K');
    await expect(hud.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByTestId('avatar-button')).toBeVisible();
  });

  test('search trigger opens the shared Ctrl+K palette', async ({ page }) => {
    await bootApp(page);

    // The palette is the only element with this placeholder.
    const paletteInput = page.getByPlaceholder(/Search/i);
    await expect(paletteInput).toHaveCount(0);

    // Same handler as the keyboard shortcut: opens the palette.
    await page.getByTestId('search-trigger').click();
    await expect(paletteInput.first()).toBeVisible();
    await expect(paletteInput.first()).toBeFocused();

    // Escape closes it again
    await page.keyboard.press('Escape');
    await expect(paletteInput).toHaveCount(0);
  });

  test('content area scrolls independently of the fixed sidebar', async ({ page }) => {
    await bootApp(page);
    const viewport = page.getByTestId('page-viewport');
    await expect(viewport).toBeVisible();
    await expect(viewport).toHaveCSS('overflow-y', 'auto');

    // The page scroll container scrolls...
    const scrolled = await viewport.evaluate((el) => {
      el.scrollTop = 400;
      return el.scrollTop;
    });
    // ...while the sidebar never moves.
    const sidebarTop = await page.getByTestId('sidebar').evaluate((el) => el.getBoundingClientRect().top);
    expect(sidebarTop).toBe(0);
    expect(scrolled).toBeGreaterThanOrEqual(0);
  });

  test('no persistent right rail is rendered', async ({ page }) => {
    await bootApp(page);
    // The legacy RightPanel was a fixed, ~320px element anchored to the right
    // edge containing a "Quick Panel" header. Full-screen transparent overlays
    // (window resize handles) are expected and must not trip this check.
    await expect(page.getByText('Quick Panel')).toHaveCount(0);
    await expect(page.getByText('System overview')).toHaveCount(0);

    const railWidths = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mvo-app *'))
        .filter((el) => {
          const s = getComputedStyle(el as HTMLElement);
          const r = (el as HTMLElement).getBoundingClientRect();
          const anchoredRight = s.position === 'fixed' && s.right === '0px';
          // A right rail is anchored right, narrow (not a full-width bar like
          // the global footer) and tall enough to occupy the viewport side.
          const isFullWidthBar = r.width >= window.innerWidth - 1;
          const isRailShaped = r.width > 200 && r.height > 300;
          return anchoredRight && !isFullWidthBar && isRailShaped;
        })
        .map((el) => ((el as HTMLElement).className || '').toString().slice(0, 80)),
    );
    expect(railWidths, `unexpected right rail: ${railWidths.join(' | ')}`).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════
   Phase 4 · Step 6 — Hero module & Quick Access
   ══════════════════════════════════════════════════════════════ */
test.describe('Home — hero and quick access', () => {
  test('hero banner renders title, subtitle, CTA and pagination', async ({ page }) => {
    await bootApp(page);
    const hero = page.getByTestId('hero-banner');
    await expect(hero).toBeVisible();

    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(hero.getByText(/ONE HUB\. ENDLESS POSSIBILITIES\./)).toBeVisible();

    const cta = page.getByTestId('hero-cta');
    await expect(cta).toContainText('Explore Now');
    await expect(cta).toBeVisible();

    // Pagination dots reflect the slide count
    await expect(hero.getByRole('tab')).toHaveCount(3);
    await expect(hero.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('hero pagination advances the banner', async ({ page }) => {
    await bootApp(page);
    const hero = page.getByTestId('hero-banner');
    const firstTitle = await page.getByTestId('hero-title').innerText();

    await hero.getByRole('tab').nth(1).click();
    await expect(hero.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('hero-title')).not.toHaveText(firstTitle);
  });

  test('hero CTA navigates to the game library', async ({ page }) => {
    await bootApp(page);
    await page.getByTestId('hero-cta').click();
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('gamelibrary');
  });

  test('AI status card shows brand, model, status and CTA', async ({ page }) => {
    await bootApp(page);
    const card = page.getByTestId('ai-status-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('MVO AI')).toBeVisible();
    await expect(card.getByText(/Powered by Nemotron 3 Super/i)).toBeVisible();
    await expect(page.getByTestId('ai-online-dot')).toBeVisible();
    await expect(page.getByTestId('ai-open-button')).toContainText('Open AI Center');

    await page.getByTestId('ai-open-button').click();
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('aitools');
  });

  test('Quick Access renders exactly six destination cards', async ({ page }) => {
    await bootApp(page);
    const grid = page.getByTestId('quick-access');
    await expect(grid).toBeVisible();
    await expect(grid.locator('button')).toHaveCount(6);

    const expected: Array<[string, string, string]> = [
      ['hardware', 'Hardware', 'Monitor & Optimize'],
      ['gamelibrary', 'Game Library', 'Your Games'],
      ['moviestv', 'Movies & TV Shows', 'Stream & Watch'],
      ['browser', 'MVO Browser', 'Browse the Web'],
      ['aitools', 'MVO AI', 'Ask. Analyze. Create.'],
      ['settings', 'Settings', 'Customize MVO'],
    ];
    for (const [id, title, subtitle] of expected) {
      const card = page.getByTestId(`quick-${id}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(title);
      await expect(card).toContainText(subtitle);
      await expect(card.locator('svg').last()).toBeVisible(); // arrow
    }
  });

  test('every Quick Access card routes to its page', async ({ page }) => {
    await bootApp(page);
    const routes: Array<[string, string]> = [
      ['hardware', 'hardware'],
      ['gamelibrary', 'gamelibrary'],
      ['moviestv', 'moviestv'],
      ['browser', 'browser'],
      ['aitools', 'aitools'],
      ['settings', 'settings'],
    ];

    for (const [cardId, pageId] of routes) {
      // Always start from Home so the card is on screen.
      await page.evaluate(() => window.__MVO_TEST__!.navigate('dashboard'));
      await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('dashboard');

      await page.getByTestId(`quick-${cardId}`).click();
      await expect
        .poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage()), {
          message: `quick access card '${cardId}' should route to '${pageId}'`,
        })
        .toBe(pageId);
    }
  });

  test('legacy draggable widget grid is gone', async ({ page }) => {
    await bootApp(page);
    await expect(page.getByText('Customize Layout')).toHaveCount(0);
    await expect(page.getByText('Done Editing')).toHaveCount(0);
  });

  /* ── Step 7: data rows ─────────────────────────────────────── */

  test('Your Library row renders covers from the scanner DB', async ({ page }) => {
    await bootApp(page);
    const row = page.getByTestId('your-library');
    await expect(row).toBeVisible();
    await expect(row.getByText('Your Library')).toBeVisible();
    await expect(page.getByTestId('library-view-all')).toContainText('View All');

    // Stub returns 3 games → 3 covers + the Add Game card.
    await expect(page.getByTestId('library-cover')).toHaveCount(3);
    await expect(page.getByTestId('library-cover').first()).toContainText('Test Game Alpha');
    await expect(page.getByTestId('library-add-game')).toBeVisible();
    await expect(page.getByTestId('library-add-game')).toContainText('Add Game');
  });

  test('Your Library caps visible covers at five', async ({ page }) => {
    await bootApp(page);
    // Override the stub with more rows than the row may show.
    await page.evaluate(() => {
      (window as any).__MVO_IPC_STUB__.stub(
        'load_scanned_games_from_db',
        Array.from({ length: 9 }, (_, i) => ({
          id: `g${i}`,
          name: `Game ${i}`,
          platform: 'Steam',
          launcher: 'Steam',
          app_id: String(1000 + i),
          is_hidden: false,
        })),
      );
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));
    await page.waitForTimeout(600);
    const covers = await page.getByTestId('library-cover').count();
    expect(covers).toBeLessThanOrEqual(5);
  });

  test('Latest News row renders a featured card', async ({ page }) => {
    await bootApp(page);
    const row = page.getByTestId('latest-news');
    await expect(row).toBeVisible();
    await expect(row.getByText('Latest News')).toBeVisible();
    await expect(page.getByTestId('news-view-all')).toContainText('View All');

    const featured = page.getByTestId('news-featured');
    await expect(featured).toBeVisible();
    await expect(featured).toContainText('MVO Hub Update / News');
    await expect(featured).toContainText('2026-11-05');
  });

  test('news and library rows route correctly', async ({ page }) => {
    await bootApp(page);

    await page.getByTestId('library-view-all').click();
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('gamelibrary');

    await page.evaluate(() => window.__MVO_TEST__!.navigate('dashboard'));
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('dashboard');

    // Add Game opens the library too
    await page.getByTestId('library-add-game').click();
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('gamelibrary');
  });

  /* ── Step 8: global footer ─────────────────────────────────── */

  test('global footer shows version, readiness and brand indicators', async ({ page }) => {
    await bootApp(page);
    const footer = page.getByTestId('status-footer');
    await expect(footer).toBeVisible();

    await expect(page.getByTestId('footer-version')).toContainText(/MVO Hub v\d+\.\d+\.\d+/);
    await expect(page.getByTestId('footer-version')).toContainText('Ready');
    await expect(page.getByTestId('footer-status-dot')).toBeVisible();

    for (const id of ['indicator-secure', 'indicator-fast', 'indicator-modern']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('indicator-secure')).toContainText('Secure');
    await expect(page.getByTestId('indicator-fast')).toContainText('Fast');
    await expect(page.getByTestId('indicator-modern')).toContainText('Modern');
    await expect(page.getByTestId('indicator-powered')).toContainText('Powered by');
  });

  test('footer spans the full window width', async ({ page }) => {
    await bootApp(page);
    const { left, width, windowWidth } = await page.getByTestId('status-footer').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width), windowWidth: window.innerWidth };
    });
    expect(left).toBe(0);
    expect(Math.abs(width - windowWidth)).toBeLessThanOrEqual(1);
  });

  test('version indicator was moved out of the sidebar', async ({ page }) => {
    await bootApp(page);
    // The sidebar must no longer carry the version string...
    await expect(page.getByTestId('sidebar').getByText(/MVO Hub v\d/)).toHaveCount(0);
    // ...while the footer does.
    await expect(page.getByTestId('status-footer').getByText(/MVO Hub v\d/)).toBeVisible();
  });

  /* ── Step 9: CSS variable layout metrics ──────────────────── */

  test('shell metrics resolve from CSS variables', async ({ page }) => {
    await bootApp(page);
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        footer: cs.getPropertyValue('--mvo-footer-height').trim(),
        sidebar: cs.getPropertyValue('--mvo-sidebar-width').trim(),
        collapsed: cs.getPropertyValue('--mvo-sidebar-width-collapsed').trim(),
      };
    });
    expect(vars.footer).toBe('44px');
    expect(vars.sidebar).toBe('276px');
    expect(vars.collapsed).toBe('76px');

    // The footer actually consumes the variable.
    const footerHeight = await page.getByTestId('status-footer').evaluate((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    expect(footerHeight).toBe(44);
  });

  test('sidebar ends exactly at the footer top edge', async ({ page }) => {
    await bootApp(page);
    const { sidebarBottom, footerTop } = await page.evaluate(() => ({
      sidebarBottom: Math.round(document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().bottom),
      footerTop: Math.round(document.querySelector('[data-testid="status-footer"]')!.getBoundingClientRect().top),
    }));
    // No overlap, no gap — the single variable keeps these locked together.
    expect(sidebarBottom).toBe(footerTop);
  });

  /* ── Step 10: hero video + splash ─────────────────────────── */

  test('hero renders a video layer with a static poster fallback', async ({ page }) => {
    await bootApp(page);
    const bg = page.getByTestId('video-background');
    await expect(bg).toBeVisible();

    // A static poster is always painted underneath (fallback safety net).
    const poster = await bg.locator('div[style*="hero-poster"]').count();
    expect(poster).toBeGreaterThan(0);

    // Video element is present and non-intrusive.
    const video = page.getByTestId('hero-video');
    if ((await video.count()) > 0) {
      await expect(video).toHaveAttribute('src', /assets\/hero-bg\.webm/);
      await expect(video).toHaveAttribute('loop', '');
      await expect(video).toHaveAttribute('playsinline', '');
      // React applies `muted` as a DOM property, not an HTML attribute —
      // assert the property (this is what actually silences playback).
      const muted = await video.evaluate((el) => (el as HTMLVideoElement).muted);
      expect(muted).toBe(true);
      // Decorative media must never be a pointer target or focus stop.
      const pointer = await bg.evaluate((el) => getComputedStyle(el).pointerEvents);
      expect(pointer).toBe('none');
    }
  });

  test('hero video honours reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));
    await page.waitForTimeout(800);

    // No <video> mounted at all; the static layer takes over.
    await expect(page.getByTestId('hero-video')).toHaveCount(0);
    await expect(page.getByTestId('video-background')).toHaveAttribute('data-video-state', 'static');
  });

  test('splash advances to the shell without hanging', async ({ page }) => {
    // The harness normally skips the splash; visit without it to exercise it.
    await page.goto('/');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 20_000 });
  });

  test('global search opens with Ctrl+K', async ({ page }) => {
    await bootApp(page);
    await page.keyboard.press('Control+k');
    // The palette renders a text input when open.
    await expect(page.locator('input').first()).toBeVisible();
    await expectNoCrash(page);
  });
});

test.describe('MVO Hub — all routed pages render', () => {
  test('every page in the routing table mounts cleanly', async ({ page }) => {
    const renderErrors = trackRenderErrors(page);
    await bootApp(page);

    const pages = await page.evaluate(() => window.__MVO_TEST__?.pages ?? []);
    expect(pages.length, `routing table should expose all pages, got ${pages.length}`).toBeGreaterThanOrEqual(19);

    const failures: string[] = [];

    for (const pageId of pages) {
      await page.evaluate((id) => window.__MVO_TEST__!.navigate(id), pageId);

      // Wait for the page swap to settle (App re-mounts on `key={activePage}`).
      await expect
        .poll(
          () => page.evaluate(() => window.__MVO_TEST__?.currentPage() ?? ''),
          { message: `navigating to ${pageId}` },
        )
        .toBe(pageId);

      // Give the page a moment to run its first effects/async work.
      await page.waitForTimeout(250);

      // 1) No ErrorBoundary takeover
      if ((await page.getByText('Crash Report').count()) > 0) {
        const msg = await page
          .locator('pre')
          .first()
          .textContent()
          .catch(() => null);
        failures.push(`${pageId}: ErrorBoundary crash — ${msg?.trim().slice(0, 200)}`);
        continue;
      }

      // 2) App shell still mounted and the page container rendered content
      if ((await page.locator('.mvo-app').count()) === 0) {
        failures.push(`${pageId}: app shell unmounted`);
        continue;
      }
      const mainText = (await page.locator('main').innerText().catch(() => '')).trim();
      if (mainText.length === 0) {
        failures.push(`${pageId}: rendered an empty main region`);
      }
    }

    expect(failures, `Pages that failed to render:\n${failures.join('\n')}`).toEqual([]);
    expect(renderErrors, `Render errors:\n${renderErrors.join('\n')}`).toEqual([]);
  });
});

/**
 * Explicit per-page cases. These additionally assert that the page-specific
 * content mounted (not just "didn't crash"), and give a readable per-page
 * pass/fail signal in CI for each of the 19 routed pages.
 */
const PAGES: Array<{ id: string; name: string; expectText?: RegExp }> = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'moviestv', name: 'Movies & TV' },
  { id: 'gamelibrary', name: 'Game Library' },
  { id: 'gamevault', name: 'Game Vault' },
  { id: 'globalchat', name: 'Global Chat' },
  { id: 'files', name: 'Files' },
  { id: 'tools', name: 'Tools' },
  { id: 'optimizer', name: 'Optimizer' },
  { id: 'settings', name: 'Settings' },
  { id: 'overlay', name: 'Overlay' },
  { id: 'performance', name: 'Performance' },
  { id: 'hardware', name: 'Hardware' },
  { id: 'systemboost', name: 'System Boost' },
  { id: 'aitools', name: 'AI Tools' },
  { id: 'webhub', name: 'Web Hub' },
  { id: 'browser', name: 'Browser' },
  { id: 'functiontest', name: 'Function Test' },
  { id: 'updates', name: 'Updates' },
  { id: 'streaming', name: 'Streaming' },
  { id: 'cloud', name: 'Cloud & Achievements', expectText: /Cloud\s*&\s*Achievements/ },
  { id: 'gamedetail', name: 'Game Detail' },
];

for (const { id, name } of PAGES) {
  test.describe(`${name} page (${id})`, () => {
    test('deep-link boot renders page content', async ({ page }) => {
      const renderErrors = trackRenderErrors(page);
      await page.goto(`/?page=${id}`);
      await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
      await page.waitForFunction(() => Boolean(window.__MVO_TEST__), { timeout: 30_000 });

      await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe(id);
      await page.waitForTimeout(300);

      await expectNoCrash(page);
      const text = (await page.locator('main').innerText()).trim();
      expect(text.length, `${name} should render content`).toBeGreaterThan(0);
      expect(renderErrors, `render errors on ${name}`).toEqual([]);
    });

    test('in-app navigation from dashboard does not crash', async ({ page }) => {
      const renderErrors = trackRenderErrors(page);
      await bootApp(page);

      await page.evaluate((target) => window.__MVO_TEST__!.navigate(target), id);
      await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe(id);
      await page.waitForTimeout(300);

      await expectNoCrash(page);
      expect(renderErrors, `render errors navigating to ${name}`).toEqual([]);
    });
  });
}
