import { expect, test } from '@playwright/test';
const nav = (page: import('@playwright/test').Page, name: string | RegExp) =>
  page
    .getByRole('navigation', { name: /Main navigation|Mobile navigation/ })
    .getByRole('button', { name, exact: true })
    .filter({ visible: true });
test('scan, review, save, draft, sale and persistence work end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#scan');
  await expect(page.getByRole('heading', { name: 'Good finds. Better decisions.' })).toBeVisible();
  await expect(page.getByText('Demo example', { exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'Add to merchant inventory', exact: true });
  await expect(add).toBeDisabled();
  await page.getByLabel('I checked the item details').check();
  await add.click();
  await page.getByRole('button', { name: 'Open inventory' }).click();
  await page.getByRole('button', { name: 'Create listing draft' }).click();
  await page.getByLabel('Listing price ($)', { exact: true }).fill('49');
  await page.getByRole('button', { name: 'Save local draft' }).click();
  await nav(page, /Pricing/).click();
  await expect(page.getByRole('heading', { name: /Listing drafts/ })).toBeVisible();
  await expect(page.getByText('$49.00', { exact: false })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('thrifty-ebay-draft.txt');
  await page.reload();
  await expect(page.getByText('Local draft', { exact: true })).toBeVisible();
  await nav(page, /Merchant studio|Shop/).click();
  await page.getByRole('button', { name: 'Record a sale' }).click();
  await page.getByLabel('Sold for ($)').fill('48');
  await page.getByLabel('All other actual expenses ($)').fill('12');
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await page.getByLabel('Include sold').check();
  await expect(page.getByText('Sold', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Recorded net profit')).toBeVisible();
  expect(errors).toEqual([]);
});
test('uploaded photos require manual identification and custom comparable evidence', async ({
  page,
}) => {
  await page.goto('/#scan');
  await page.locator('input[type=file]').first().setInputFiles('public/icon-192.png');
  await expect(page.getByText('Your photo', { exact: true })).toBeVisible();
  await expect(page.getByText('Unidentified find', { exact: true })).toBeVisible();
  await expect(page.getByText('No estimate', { exact: true })).toBeVisible();
  await page.getByLabel('Item name', { exact: true }).fill('Wool hiking layer');
  await page.getByLabel('Brand', { exact: true }).fill('Real label');
  await page.getByRole('button', { name: 'Add comp', exact: true }).click();
  await page.getByLabel('Marketplace', { exact: true }).fill('eBay');
  await page.getByLabel('Price ($)', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Save comparable' }).click();
  await expect(page.getByText('$40.00–$40.00')).toBeVisible();
  await expect(page.getByText('User-entered ·', { exact: false })).toBeVisible();
});
test('household goal editing, child profiles and duplicate-aware inventory persist', async ({
  page,
}) => {
  await page.goto('/#household');
  await page.getByRole('button', { name: 'Add person or pet' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Milo');
  await page.getByLabel('Profile type').selectOption('Child');
  await page.getByLabel('Sizes / measurements').fill('6T');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('button', { name: 'Add a shopping goal' }).click();
  await page.getByLabel('What are you looking for?').fill('Milo’s winter coat');
  await page.getByLabel('For', { exact: true }).selectOption({ label: 'Milo · Child' });
  await page.getByLabel('Size / dimensions').fill('6T');
  await page.getByLabel('Purpose', { exact: true }).fill('Snow days');
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Milo’s winter coat' })).toBeVisible();
  await nav(page, /Scan a find|Scan/).click();
  await page.getByLabel('I checked the item details').check();
  await page.getByRole('button', { name: 'Add to household inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Open inventory' }).click();
  await page.getByRole('button', { name: /Household inventory/ }).click();
  await expect(page.getByRole('heading', { name: 'Vintage fleece pullover' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Household inventory/ }).click();
  await expect(page.getByRole('heading', { name: 'Vintage fleece pullover' })).toBeVisible();
});
test('offline app shell reloads and allows local work', async ({ page, context }) => {
  await page.goto('/#scan');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good finds. Better decisions.' })).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pet gear', exact: true }).click();
  await page.getByLabel('I checked the item details').check();
  await page.getByRole('button', { name: 'Add to merchant inventory', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to inventory' })).toBeVisible();
  await context.setOffline(false);
});
test('connection status is honest and layouts fit the viewport', async ({ page }) => {
  await page.goto('/#connections');
  await expect(page.getByText('Disconnected', { exact: true })).toHaveCount(9);
  await expect(page.getByText('Publishing & price sync unavailable')).toHaveCount(9);
  for (const hash of ['scan', 'household', 'merchant', 'pricing', 'connections']) {
    await page.goto(`/#${hash}`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
