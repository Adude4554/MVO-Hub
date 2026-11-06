import { test, expect, type Page } from '@playwright/test';

/**
 * Game Detail — E2E coverage for v0.3.0 Step 3.
 *
 * Runs against the browser test harness, whose IPC stub serves a configurable
 * game (`g1` / Test Game Alpha) with 2h of playtime and a saved launch-argument
 * string. This exercises the real user flows: argument validation, saving,
 * launching, ending a session, and the "no game selected" path.
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

async function openDetail(page: Page, gameId = 'g1') {
  await page.goto(`/?page=gamedetail&game=${gameId}`);
  await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });
  await expect(page.getByTestId('game-detail')).toBeVisible({ timeout: 30_000 });
}

test.describe('Game Detail', () => {
  test('renders the game header, playtime and launch options', async ({ page }) => {
    await openDetail(page);

    await expect(page.getByRole('heading', { name: 'Test Game Alpha' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Playtime/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Achievements/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Launch options/i })).toBeVisible();
  });

  test('formats playtime stats from the backend', async ({ page }) => {
    await openDetail(page);

    // 7200s = 2h, average 2400s = 40m.
    await expect(page.getByText('2h', { exact: true })).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    // "40m" appears as both the average and one session, so assert presence.
    await expect(page.getByText('40m', { exact: true }).first()).toBeVisible();
    // Three recorded sessions are listed.
    await expect(page.getByText('1h', { exact: true }).first()).toBeVisible();

    // The total must not be double-counted (regression: 2h + 2h = 4h).
    await expect(page.getByText('4h', { exact: true })).toHaveCount(0);
  });

  test('previews parsed launch arguments as tokens', async ({ page }) => {
    await openDetail(page);

    const input = page.getByLabel(/Launch arguments/i);
    await expect(input).toHaveValue('-windowed -novid');

    // Each token renders as its own chip.
    await expect(page.getByText('-windowed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('-novid', { exact: true }).first()).toBeVisible();
  });

  test('groups quoted values containing spaces into one token', async ({ page }) => {
    await openDetail(page);

    const input = page.getByLabel(/Launch arguments/i);
    await input.fill('-name "My Player"');

    // The whole quoted value is one chip, not two.
    await expect(page.getByText('My Player', { exact: true })).toBeVisible();
  });

  test('blocks saving when the arguments contain shell metacharacters', async ({ page }) => {
    await openDetail(page);

    const input = page.getByLabel(/Launch arguments/i);
    await input.fill('-a & calc');

    await expect(page.getByText(/Character '&' is not allowed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  test('blocks saving on unbalanced quotes', async ({ page }) => {
    await openDetail(page);

    await page.getByLabel(/Launch arguments/i).fill('-name "unterminated');
    await expect(page.getByText(/Unbalanced quotes/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  test('blocks saving on redirection characters', async ({ page }) => {
    await openDetail(page);

    await page.getByLabel(/Launch arguments/i).fill('> out.txt');
    await expect(page.getByText(/Redirection .* is not allowed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  test('saving valid arguments invokes update_game_config', async ({ page }) => {
    await openDetail(page);

    await page.getByLabel(/Launch arguments/i).fill('-windowed -high');
    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await page.getByRole('button', { name: /^Save$/ }).click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('update_game_config')))
      .toBe(true);
    await expect(page.getByText('Game settings saved.')).toBeVisible();
  });

  test('play launches through launch_game_with_args', async ({ page }) => {
    await openDetail(page);

    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await page.getByRole('button', { name: /^Play$/ }).click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('launch_game_with_args')))
      .toBe(true);
    await expect(page.getByText(/Launched with 2 arguments\./)).toBeVisible();
  });

  test('a running game offers "End session" instead of "Play"', async ({ page }) => {
    await openDetail(page);
    await page.evaluate(() => window.__MVO_IPC_STUB__?.stub('get_game_process_state', 'running'));

    // The badge polls every 4s; trigger it by reloading the poll.
    await page.getByRole('button', { name: /Refresh|Library/ }).first().hover().catch(() => {});

    await expect
      .poll(async () => page.getByRole('button', { name: /End session/i }).count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^Play$/ })).toHaveCount(0);
  });

  test('ending a session reports saved playtime', async ({ page }) => {
    await openDetail(page);
    await page.evaluate(() => window.__MVO_IPC_STUB__?.stub('get_game_process_state', 'running'));

    const endButton = page.getByRole('button', { name: /End session/i });
    await expect(endButton).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await endButton.click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('stop_game_session')))
      .toBe(true);
    await expect(page.getByText('Session ended and playtime saved.')).toBeVisible();
  });

  test('shows an empty state when no game is selected', async ({ page }) => {
    await page.goto('/?page=gamedetail');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText('No game selected')).toBeVisible();
    await expect(page.getByText('Crash Report')).toHaveCount(0);
  });

  test('survives a failing config request without crashing', async ({ page }) => {
    await page.goto('/?page=gamedetail&game=g1');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });

    await page.evaluate(() => {
      window.__MVO_IPC_STUB__!.stub('scan_custom_games', () => {
        throw new Error('scanner offline');
      });
      window.__MVO_TEST__!.navigate('dashboard');
    });
    await page.evaluate(() => window.__MVO_TEST__!.navigate('gamedetail'));

    await expect(page.getByText('Crash Report')).toHaveCount(0);
    await expect(page.locator('.mvo-app')).toBeVisible();
  });

  test('navigates from the dashboard without crashing', async ({ page }) => {
    await page.goto('/?page=dashboard');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__), { timeout: 30_000 });

    await page.evaluate(() => window.__MVO_TEST__!.navigate('gamedetail'));
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('gamedetail');
    await expect(page.getByText('Crash Report')).toHaveCount(0);
  });
});
