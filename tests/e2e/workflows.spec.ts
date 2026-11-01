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

test('map purchase location survives a photo upload, save, edit and reload', async ({
  page,
}, info) => {
  await page.goto('/');
  if (info.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Expand place list', exact: true }).click();
  await page.locator('.place-card-main').filter({ hasText: 'Boss Vintage' }).click();
  await page.getByRole('button', { name: /Found something good/ }).click();
  await expect(page.getByLabel('Source store', { exact: true })).toHaveValue('Boss Vintage');
  await expect(page.getByLabel('Purchase address (optional)', { exact: true })).toHaveValue(
    /10 S\.? Broadway/,
  );
  await page.locator('input[type=file]').last().setInputFiles('public/icon-192.png');
  await page.getByLabel('Item name', { exact: true }).fill('Location-tagged find');
  await expect(page.getByLabel('Source store', { exact: true })).toHaveValue('Boss Vintage');
  await page.getByLabel('I checked the item details').check();
  await page.getByRole('button', { name: 'Add to merchant inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  const card = page.locator('.inventory-card').filter({ hasText: 'Location-tagged find' });
  await expect(card).toContainText('Purchased at Boss Vintage');
  await card.getByRole('button', { name: 'Edit purchase location', exact: true }).click();
  await page.getByLabel('Purchase store or market', { exact: true }).fill('My local shop');
  await page.getByLabel('Purchase address', { exact: true }).fill('100 Main St, Littleton, CO');
  await page.getByRole('button', { name: 'Save purchase location', exact: true }).click();
  await page.reload();
  await expect(card).toContainText('Purchased at My local shop');
  await page.screenshot({ path: `test-results/purchase-location-${info.project.name}.png` });
  await expect(
    card.getByRole('link', { name: 'Directions to purchase location', exact: true }),
  ).toHaveAttribute('href', /100%20Main%20St/);
});

test('household purchase tags can be searched and cleared without retaining an old location', async ({
  page,
}) => {
  await page.goto('/#household');
  await nav(page, 'Scan').click();
  await page
    .getByLabel('Choose a purchase location', { exact: true })
    .selectOption('official:littleton-co:arc-littleton');
  await page.getByLabel('Item name', { exact: true }).fill('Household location find');
  await page.getByLabel('I checked the item details').check();
  await page.getByRole('button', { name: 'Add to household inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.getByRole('button', { name: /Household inventory/ }).click();
  await page.getByLabel('Search household inventory', { exact: true }).fill('Littleton');
  const card = page.locator('.inventory-card').filter({ hasText: 'Household location find' });
  await expect(card).toContainText('Purchased at arc Thrift — Littleton');
  await card.getByRole('button', { name: 'Edit purchase location', exact: true }).click();
  await page.getByLabel('Listed purchase location', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Save purchase location', exact: true }).click();
  await page.getByLabel('Search household inventory', { exact: true }).fill('');
  await expect(card).toContainText('Purchase location not recorded');
  await expect(
    card.getByRole('link', { name: 'Directions to purchase location', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Household inventory/ }).click();
  await expect(card).toContainText('Purchase location not recorded');
});
