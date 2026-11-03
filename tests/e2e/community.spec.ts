import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function login(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Email me a code', exact: true }).click();
  const file = path.resolve(
    'test-results/mail',
    `${createHash('sha256').update(email).digest('hex')}.json`,
  );
  let code = '';
  await expect
    .poll(async () => {
      try {
        code = JSON.parse(await readFile(file, 'utf8')).code;
        return !!code;
      } catch {
        return false;
      }
    })
    .toBe(true);
  await page.getByLabel('Six-digit sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage account' })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Manage account' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible();
}
async function openPlace(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Expand place list', exact: true }).click();
  await page.locator('.place-card-main').filter({ hasText: name }).click();
  await expect(
    page.getByRole('region', { name: `Community updates for ${name}`, exact: true }),
  ).toBeVisible();
}
async function publish(page: Page, details: string) {
  await page.getByLabel('What did you notice?', { exact: true }).fill(details);
  await page.getByRole('checkbox', { name: /I observed this/ }).check();
  await page.getByRole('button', { name: 'Publish community update', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Share a community update', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.community-feed').getByText(details, { exact: true })).toBeVisible();
}
test('members share restock observations, others confirm and flag them, and admin moderates', async ({
  page,
}, info) => {
  const mobile = info.project.name.includes('mobile'),
    details = `Fixture restock observation ${info.project.name}`;
  await page.goto('/');
  await login(page, `community-author-${info.project.name}@example.com`);
  await openPlace(page, 'Boss Vintage', mobile);
  await page.getByRole('button', { name: 'Share an update', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Tuesday', exact: true }).check();
  await page.getByLabel('Time window (optional)', { exact: true }).fill('Mornings, ask staff');
  await publish(page, details);
  await page.reload();
  await openPlace(page, 'Boss Vintage', mobile);
  const report = page.locator('.community-feed .community-report').filter({ hasText: details });
  await expect(report).toContainText('Tuesday');
  await expect(report).toContainText('You');
  await logout(page);
  await login(page, `community-reader-${info.project.name}@example.com`);
  await openPlace(page, 'Boss Vintage', mobile);
  await report.getByRole('button', { name: 'Still accurate (0)', exact: true }).click();
  await expect(
    report.getByRole('button', { name: 'Still accurate (1)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await report.getByRole('button', { name: 'Flag for review', exact: true }).click();
  await page.getByLabel('Reason for flag', { exact: true }).selectOption('inaccurate');
  await page.getByRole('button', { name: 'Submit flag', exact: true }).click();
  await expect(
    report.getByRole('button', { name: 'Flagged for review', exact: true }),
  ).toBeDisabled();
  await logout(page);
  // Only the isolated browser fixture accepts this nonce-bound test identity.
  const bootstrap = await (await page.request.get('/api/auth/session')).json();
  const admin = await page.request.post('/api/auth/google', {
    headers: { Origin: 'http://127.0.0.1:4321', 'X-CSRF-Token': bootstrap.csrf },
    data: {
      credential: JSON.stringify({
        email: 'rob@virtuapet.com',
        email_verified: true,
        sub: 'community-browser-admin',
        hd: 'virtuapet.com',
        nonce: bootstrap.nonce,
      }),
    },
  });
  expect(admin.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Manage account' })).toBeVisible();
  await openPlace(page, 'Boss Vintage', mobile);
  await page.getByRole('button', { name: 'Review flagged updates', exact: true }).click();
  const queued = page
    .locator('.community-moderation .community-report')
    .filter({ hasText: details });
  await expect(queued).toBeVisible();
  await queued.getByRole('button', { name: 'Hide update', exact: true }).click();
  await expect(report).toHaveCount(0);
  await queued.getByRole('button', { name: 'Restore update', exact: true }).click();
  await expect(report).toBeVisible();
  await page.screenshot({ path: `test-results/community-${info.project.name}.png` });
});
test('category prices, ratings and nearby finds surface on the map with public-report labels', async ({
  page,
}, info) => {
  const mobile = info.project.name.includes('mobile'),
    suffix = info.project.name;
  await page.goto('/');
  await login(page, `community-finds-${suffix}@example.com`);
  await openPlace(page, 'Goldmine Vintage', mobile);
  await page.getByRole('button', { name: 'Share an update', exact: true }).click();
  await page.getByLabel('Update type', { exact: true }).selectOption('prices');
  await page.getByLabel('Item category', { exact: true }).selectOption('Home');
  await page.getByLabel('Lower price ($)', { exact: true }).fill('5');
  await page.getByLabel('Upper price ($)', { exact: true }).fill('20');
  await publish(page, `Fixture category prices ${suffix}`);
  await expect(
    page.locator('.community-report').filter({ hasText: `Fixture category prices ${suffix}` }),
  ).toContainText('$5–$20');
  await page.getByRole('button', { name: 'Share an update', exact: true }).click();
  await page.getByLabel('Update type', { exact: true }).selectOption('find');
  await page.getByLabel('Find name', { exact: true }).fill(`Fixture ceramic bowl ${suffix}`);
  await page.getByLabel('Item category', { exact: true }).selectOption('Home');
  await page.getByLabel('Price spotted ($, optional)', { exact: true }).fill('12');
  await publish(page, `Fixture nearby find ${suffix}`);
  await page.getByRole('button', { name: 'Share an update', exact: true }).click();
  await page.getByLabel('Update type', { exact: true }).selectOption('rating');
  await page.getByLabel('Your store rating', { exact: true }).selectOption('4');
  await publish(page, `Fixture shop rating ${suffix}`);
  await expect(page.getByText('4/5', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to places', exact: true }).click();
  await page.getByRole('button', { name: 'Recent finds', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(1);
  await expect(page.locator('.place-card')).toContainText('Goldmine Vintage');
  await expect(page.locator('.place-card')).toContainText('Recent community find');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('shoppers draw, move and publish a store floor plan for other visitors', async ({
  page,
}, info) => {
  const mobile = info.project.name.includes('mobile');
  const store = mobile ? 'Boss Vintage' : 'Goldmine Vintage';
  await page.goto('/');
  await login(page, `layout-${info.project.name}@example.com`);
  await openPlace(page, store, mobile);
  await page.getByRole('button', { name: 'Draw floor plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sketch the store floor plan' });
  await dialog.getByLabel('Section or landmark').selectOption('Entrance');
  await dialog.getByRole('button', { name: 'A7 empty', exact: true }).click();
  await dialog.getByLabel('Section or landmark').selectOption('custom');
  await dialog.getByLabel('Custom section name').fill('Sewing supplies');
  await dialog.getByRole('button', { name: 'A1 empty', exact: true }).click();
  await dialog.getByRole('button', { name: 'A1 Sewing supplies', exact: true }).click();
  await dialog.getByRole('button', { name: 'B1 empty', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /I observed this/ }).check();
  await dialog.getByRole('button', { name: 'Publish floor plan' }).click();
  await expect(dialog).toHaveCount(0);
  await logout(page);
  await page.reload();
  await openPlace(page, store, mobile);
  await page.getByRole('button', { name: 'View floor plan', exact: true }).click();
  const plan = page.locator('.floor-plan-callout');
  await expect(plan.getByRole('button', { name: 'B1 Sewing supplies', exact: true })).toBeVisible();
  await expect(plan.getByRole('button', { name: 'A7 Entrance', exact: true })).toBeVisible();
  await expect(plan.getByRole('button', { name: 'A1 Sewing supplies', exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
