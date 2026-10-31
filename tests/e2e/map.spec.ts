import { expect, test } from '@playwright/test';
import { samplePlaces } from '../../src/lib/discovery';
const publicPlace = {
  ...samplePlaces[0],
  id: 'osm:node:123',
  name: 'Public directory fixture',
  source: 'osm',
  address: 'Test public location',
  hours: '',
  sourceUrl: 'https://www.openstreetmap.org/node/123',
  website: '',
};
test('map is home, category and text filtering update pins, saved places and trips persist', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('region', { name: /Interactive map/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Good finds. Closer to you.' })).toBeVisible();
  await page.getByRole('button', { name: 'Thrift stores', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Found & Loved', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View The Weekend Market', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Search places', { exact: true }).fill('found');
  await page.getByLabel('Search places', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Found & Loved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Found & Loved', exact: true }).click();
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await page.getByRole('button', { name: 'Add to my trip' }).click();
  await page.getByRole('button', { name: /My little trip/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Real-world navigation is disabled');
  await expect(page.getByRole('link', { name: /Open trip in Google/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await page.reload();
  if (info.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Expand place list', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Found & Loved', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('real public directory results replace sample pins and support navigation; failures stay honest', async ({
  page,
}, info) => {
  await page.route('**/api/places?*', (route) =>
    route.fulfill({
      json: { places: [publicPlace], source: 'OpenStreetMap', fetchedAt: '2026-10-31T12:00:00Z' },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Search this area', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'View Public directory fixture', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Found & Loved', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'View Public directory fixture', exact: true }).click();
  await expect(page.getByRole('link', { name: /Get directions/ })).toHaveAttribute(
    'href',
    /https:\/\/www.google.com\/maps\/dir/,
  );
  await page.getByRole('button', { name: 'Add to my trip' }).click();
  await page.getByRole('button', { name: /My little trip/ }).click();
  await expect(page.getByRole('link', { name: /Open trip in Google Maps/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Back to places' }).click();
  await page.route('**/api/places?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Directory unavailable' } }),
  );
  await page.getByRole('button', { name: 'Search this area', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('directory is busy or unavailable');
  await page.getByRole('button', { name: 'Explore sample map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Found & Loved', exact: true })).toBeVisible();
});
test('seller pins are private, persist across reloads, and stay out of public directions', async ({
  page,
}) => {
  await page.goto('/#sell');
  await page.getByRole('button', { name: 'Create a seller pin' }).click();
  await page.getByLabel('Shop or stall name').fill('Test flower stall');
  await page.getByLabel('What kind of place?').selectOption('farm');
  await page.getByLabel('What can shoppers find?').fill('Locally grown flowers. Test data only.');
  await page.getByLabel('Public stall or shop address').fill('Sample public market stand');
  await page.getByRole('button', { name: 'Save private pin' }).click();
  await expect(page.getByRole('heading', { name: 'Test flower stall', exact: true })).toBeVisible();
  await expect(page.getByText('Other shoppers cannot see it.', { exact: false })).toBeVisible();
  await page.reload();
  await page.locator('.place-card-main').filter({ hasText: 'Test flower stall' }).click();
  await expect(page.getByRole('heading', { name: 'Test flower stall', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Get directions/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to my trip' }).click();
  await page.getByRole('button', { name: /My little trip/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Real-world navigation is disabled');
});
test('map fits mobile and desktop, handles denied location, and keeps tools accessible', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_yes: unknown, no: () => void) => no() },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  if (info.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Expand place list', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('denied or unavailable');
  await page.getByRole('button', { name: 'Your shopping tools' }).click();
  await page.getByRole('button', { name: 'Your household', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add person or pet' })).toBeVisible();
  for (const hash of ['', 'saved', 'sell', 'scan', 'household']) {
    await page.goto(`/#${hash}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto('/');
  // Presentation evidence only: external map tiles are best effort, not a CI dependency.
  await expect
    .poll(() => page.locator('.leaflet-tile-loaded').count(), { timeout: 5000 })
    .toBeGreaterThan(0)
    .catch(() => {});
  await page.screenshot({ path: `test-results/map-${info.project.name}.png` });
});
