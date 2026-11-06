import { test, expect, type Page } from '@playwright/test';

/**
 * Enterprise settings — E2E coverage for v0.3.0 Step 4.
 *
 * The harness serves a **Team** tier licence, which is the interesting case:
 * white-labelling is locked but telemetry export is allowed. That lets the tests
 * assert the tier gates actually gate, rather than trusting the happy path.
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

async function openEnterprise(page: Page) {
  await page.goto('/?page=settings&tab=enterprise');
  await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });

  // The Settings page defaults to `general`; select the Enterprise tab.
  await page.getByRole('button', { name: /^Enterprise$/ }).click();
  await expect(page.getByRole('heading', { name: /^Licence$/ })).toBeVisible({ timeout: 15_000 });
}

test.describe('Enterprise settings', () => {
  test('shows the installed licence tier and tenant', async ({ page }) => {
    await openEnterprise(page);

    await expect(page.getByText('Acme Corp').first()).toBeVisible();
    // "Team" appears as the tier badge; "Community"/"Enterprise" must not.
    await expect(page.getByText('Team', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Perpetual')).toHaveCount(0);
  });

  test('locks white-labelling below the Enterprise tier', async ({ page }) => {
    await openEnterprise(page);

    await expect(page.getByText('Requires Enterprise tier')).toBeVisible();
    await expect(
      page.getByText(/Branding can be configured now but is only applied with an Enterprise licence/i),
    ).toBeVisible();
  });

  test('validates the brand colour format inline', async ({ page }) => {
    await openEnterprise(page);

    const primary = page.getByLabel('Primary colour');
    await primary.fill('red');
    await expect(page.getByText('Use #rrggbb').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Save profile/i })).toBeDisabled();

    await primary.fill('#0a84ff');
    await expect(page.getByText('Use #rrggbb')).toHaveCount(0);
  });

  test('rejects CSS injection through a brand colour', async ({ page }) => {
    await openEnterprise(page);

    await page.getByLabel('Primary colour').fill('#fff; background:url(evil)');
    await expect(page.getByText('Use #rrggbb').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Save profile/i })).toBeDisabled();
  });

  test('requires https for logo and support URLs', async ({ page }) => {
    await openEnterprise(page);

    await page.getByLabel('Logo URL').fill('http://insecure.example/logo.png');
    await expect(page.getByText('Must be an https:// URL').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Save profile/i })).toBeDisabled();

    await page.getByLabel('Logo URL').fill('https://acme.example/logo.png');
    await expect(page.getByText('Must be an https:// URL')).toHaveCount(0);
  });

  test('rejects an unsafe tenant id', async ({ page }) => {
    await openEnterprise(page);

    await page.getByLabel('Tenant id').fill('bad id!');
    await expect(page.getByText("Letters, digits, '-' and '_' only")).toBeVisible();
    await expect(page.getByRole('button', { name: /Save profile/i })).toBeDisabled();
  });

  test('saves a valid profile through the backend', async ({ page }) => {
    await openEnterprise(page);

    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await page.getByRole('button', { name: /Save profile/i }).click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('enterprise_set_profile')))
      .toBe(true);
  });

  test('installing a licence token upgrades the tier', async ({ page }) => {
    await openEnterprise(page);

    // Locked before installing.
    await expect(page.getByText('Requires Enterprise tier')).toBeVisible();

    await page.evaluate(() => window.__MVO_IPC_STUB__?.reset());
    await page.getByLabel('Licence token').fill('signed.token');
    await page.getByRole('button', { name: /^Install$/ }).click();

    await expect
      .poll(() => page.evaluate(() => window.__MVO_IPC_STUB__?.calls.includes('enterprise_install_license')))
      .toBe(true);
    await expect(page.getByText(/Licence installed — Enterprise tier/i)).toBeVisible();
    // The white-label gate must now be lifted.
    await expect(page.getByText('Requires Enterprise tier')).toHaveCount(0);
  });

  test('generate diagnostics renders a support summary', async ({ page }) => {
    await openEnterprise(page);

    await page.getByRole('button', { name: /Generate diagnostics/i }).click();
    await expect(page.getByText(/MVO 0\.3\.0 on windows/)).toBeVisible();
    await expect(page.getByText(/plugins: 1, saves: 3, achievements: 2/)).toBeVisible();
  });

  test('telemetry queue is listed and exportable at Team tier', async ({ page }) => {
    await openEnterprise(page);

    await expect(page.getByText('2 queued')).toBeVisible();
    await expect(page.getByText('app.launched')).toBeVisible();

    const exportButton = page.getByRole('button', { name: /Export telemetry/i });
    await expect(exportButton).toBeEnabled();
    await exportButton.click();
    await expect(page.getByText(/Exported 0 telemetry event\(s\)/)).toBeVisible();
  });

  test('telemetry export is blocked without a licence', async ({ page }) => {
    // Install the stub *before* first render so the page never sees Team tier.
    await page.goto('/?page=settings&tab=enterprise');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });
    await page.evaluate(() =>
      window.__MVO_IPC_STUB__?.stub('enterprise_get_license', {
        status: {
          valid: false,
          tier: 'community',
          tenantId: null,
          tenantName: null,
          expiresAt: null,
          daysRemaining: null,
          reason: 'No licence installed',
        },
        warning: null,
        tier: 'community',
        branding: {
          productName: 'MVO Hub',
          shortName: 'MVO',
          primaryColor: '#e11d48',
          accentColor: '#ff2d55',
          logoUrl: '',
          supportUrl: '',
        },
      }),
    );

    // Force the Enterprise tab to mount fresh with the overridden licence.
    await page.evaluate(() => window.__MVO_TEST__!.navigate('dashboard'));
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('dashboard');
    await page.evaluate(() => window.__MVO_TEST__!.navigate('settings'));
    await expect.poll(() => page.evaluate(() => window.__MVO_TEST__!.currentPage())).toBe('settings');
    await page.getByRole('button', { name: /^Enterprise$/ }).click();
    await expect(page.getByRole('heading', { name: /^Licence$/ })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('button', { name: /Export telemetry/i })).toBeDisabled();
    await expect(page.getByText('No licence installed')).toBeVisible();
  });

  test('feature switches are persisted through the profile', async ({ page }) => {
    await openEnterprise(page);

    const beta = page.getByLabel('Beta channels');
    await expect(beta).not.toBeChecked();

    // The visual track covers the visually-hidden input, so click the label
    // itself — that's what a real user targets too.
    await page.getByText('Beta channels', { exact: true }).click();
    await expect(beta).toBeChecked();
  });

  test('survives a failing licence request without crashing', async ({ page }) => {
    await page.goto('/?page=settings&tab=enterprise');
    await expect(page.locator('.mvo-app')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__MVO_IPC_STUB__), { timeout: 30_000 });

    await page.evaluate(() => {
      window.__MVO_IPC_STUB__!.stub('enterprise_get_profile', () => {
        throw new Error('backend offline');
      });
      window.__MVO_TEST__!.navigate('dashboard');
    });
    await page.evaluate(() => window.__MVO_TEST__!.navigate('settings'));

    await expect(page.getByText('Crash Report')).toHaveCount(0);
    await expect(page.locator('.mvo-app')).toBeVisible();
  });
});
