import { test, expect, type Page } from '@playwright/test';

/**
 * Cloud & Achievements — E2E coverage for v0.3.0 Step 2.
 *
 * The suite runs against the browser test harness, whose IPC stub returns a
 * fixture set with one in-sync save, one diverged save (a conflict) and a mix
 * of locked/unlocked achievements. That lets us assert the real user-facing
 * behaviour: conflict surfacing, resolution wiring, filtering and status.
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
    __MVO_ERRORS__?: unknown[];
  }
}

async function openCloud(page: Page) {
  await page.goto('/?page=cloud');
  await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__MVO_TEST__), { timeout: 30_000 });
  await expect(page.getByTestId('cloud-achievements')).toBeVisible({ timeout: 30_000 });
}

test.describe('Cloud & Achievements', () => {
  test('renders sync status and achievement progress', async ({ page }) => {
    await openCloud(page);

    // Header + headline counts come straight from `cloud_get_status`.
    await expect(page.getByRole('heading', { name: /Cloud\s*&\s*Achievements/i })).toBeVisible();
    await expect(page.getByText('2 of 4 unlocked')).toBeVisible();
    await expect(page.getByText('50%')).toBeVisible();

    // The fixture has one diverged save, so the page must not claim "All clear".
    await expect(page.getByText('Action needed')).toBeVisible();
    await expect(page.getByText('All clear')).toHaveCount(0);
  });

  test('lists tracked saves with their sync state', async ({ page }) => {
    await openCloud(page);

    const saveFiles = page.getByText('Save files', { exact: true });
    await expect(saveFiles).toBeVisible();

    // Alpha is identical on both sides; Beta diverged.
    await expect(page.getByText('C:/Games/alpha/save/slot1.sav')).toBeVisible();
    await expect(page.getByText('C:/Games/beta/profile.sav').first()).toBeVisible();
    await expect(page.getByText('In sync').first()).toBeVisible();
  });

  test('surfaces a conflict with all three resolution choices', async ({ page }) => {
    await openCloud(page);

    const panel = page.getByText(/Save conflicts \(1\)/);
    await expect(panel).toBeVisible();
    await expect(
      page.getByText('Test Game Beta was modified both locally and in the cloud since the last sync'),
    ).toBeVisible();

    for (const label of ['Keep local', 'Keep cloud', 'Keep both']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('resolving a conflict invokes the backend with the chosen strategy', async ({ page }) => {
    await openCloud(page);

    await page.getByRole('button', { name: 'Keep local' }).click();

    // The command must be sent, attributed to the right game/path/strategy.
    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('cloud_resolve_conflict')))
      .toBe(true);

    await expect(page.getByText(/Resolved "Test Game Beta"/)).toBeVisible();
  });

  test('sync now flushes the queue and reports success', async ({ page }) => {
    await openCloud(page);

    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await page.getByRole('button', { name: 'Sync now' }).click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('cloud_sync_now')))
      .toBe(true);
    await expect(page.getByText('Uploads flushed to the cloud queue.')).toBeVisible();
  });

  test('achievement filters narrow the list', async ({ page }) => {
    await openCloud(page);

    // All four fixtures render.
    await expect(page.getByText('First Steps')).toBeVisible();
    await expect(page.getByText('Completionist')).toBeVisible();

    await page.getByRole('button', { name: 'unlocked', exact: true }).click();
    await expect(page.getByText('First Steps')).toBeVisible();
    await expect(page.getByText('Completionist')).toHaveCount(0);

    await page.getByRole('button', { name: 'locked', exact: true }).click();
    await expect(page.getByText('Completionist')).toBeVisible();
    await expect(page.getByText('First Steps')).toHaveCount(0);
  });

  test('unlocked achievements show their unlock timestamp', async ({ page }) => {
    await openCloud(page);
    await page.getByRole('button', { name: 'unlocked', exact: true }).click();

    await expect(page.getByText(/Unlocked /).first()).toBeVisible();
    // Scope to achievement rows: "Locked"/"unlocked" also appear in the filter
    // buttons, so a bare text query would match those too.
    const rowStatus = page.getByText(/^(Unlocked|Locked) /);
    await expect(rowStatus.first()).toBeVisible();
    const statuses = await rowStatus.allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every(s => s.startsWith('Unlocked '))).toBe(true);
  });

  test('survives a backend error without crashing the shell', async ({ page }) => {
    await page.goto('/?page=cloud');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });

    // Force the status call to reject, then remount the page.
    await page.evaluate(() => {
      window.__MVO_IPC_STUB__!.stub('cloud_get_status', () => {
        throw new Error('backend offline');
      });
      window.__MVO_TEST__!.navigate('dashboard');
    });
    await page.evaluate(() => window.__MVO_TEST__!.navigate('cloud'));

    await expect(page.getByText('Crash Report')).toHaveCount(0);
    await expect(page.locator('.mvo-app')).toBeVisible();
    await expect(page.getByTestId('cloud-achievements')).toBeVisible();
  });

  test('navigates from the dashboard without crashing', async ({ page }) => {
    await page.goto('/?page=dashboard');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__), { timeout: 30_000 });

    await page.evaluate(() => window.__MVO_TEST__!.navigate('cloud'));
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('cloud');
    await expect(page.getByText('Crash Report')).toHaveCount(0);
    await expect(page.getByTestId('cloud-achievements')).toBeVisible();
  });
});
