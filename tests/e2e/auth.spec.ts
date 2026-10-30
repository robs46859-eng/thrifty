import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const unique = (prefix: string, project: string) => `${prefix}-${project}@example.com`;
async function mailCode(email: string) {
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
  return code;
}
async function login(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByText('A six-digit code has been sent.', { exact: false })).toBeVisible();
  await page.getByLabel('Six-digit sign-in code').fill(await mailCode(email));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('button', { name: 'Manage account' })).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Manage account' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible();
}
test('email sign-in protects scanning, displays limits, survives reload and logs out', async ({
  page,
}, info) => {
  await page.goto('/');
  const cloudChoice = page.getByRole('checkbox', { name: /Send new photos/ });
  await expect(cloudChoice).toBeDisabled();
  await login(page, unique('scan', info.project.name));
  await expect(cloudChoice).toBeEnabled();
  await expect(page.getByText('10 of 10 cloud scans left today · 3/min')).toBeVisible();
  await cloudChoice.check();
  for (let i = 0; i < 3; i++) {
    await page.locator('input[type=file]').first().setInputFiles('public/icon-192.png');
    await expect(page.getByText('Fleece jacket', { exact: true })).toBeVisible();
    await expect(page.getByText(`${9 - i} of 10 cloud scans left today · 3/min`)).toBeVisible();
  }
  await page.locator('input[type=file]').first().setInputFiles('public/icon-192.png');
  await expect(page.getByRole('alert')).toContainText('3 cloud scans per minute');
  await page.reload();
  await expect(page.getByText('7 of 10 cloud scans left today · 3/min')).toBeVisible();
  await signOut(page);
  await expect(page.getByRole('checkbox', { name: /Send new photos/ })).toBeDisabled();
});
test('verified admin sees unlimited usage and workspaces stay separate on account changes', async ({
  page,
}) => {
  await page.goto('/');
  await login(page, 'rob@virtuapet.com');
  await expect(page.getByText('Admin · unlimited cloud scans')).toBeVisible();
  await page.getByLabel('Item name', { exact: true }).fill('Private administrator find');
  await page.getByLabel('I checked the item details').check();
  await page.getByRole('button', { name: 'Add to merchant inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Open inventory' }).click();
  await expect(page.getByRole('heading', { name: 'Private administrator find' })).toBeVisible();
  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Private administrator find' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await expect(
    page.getByText('Free accounts include 10 cloud scans per day and 3 per minute.', {
      exact: false,
    }),
  ).toBeVisible();
});
test('Google button exchanges a nonce-bound identity and cannot set admin from the browser', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google={accounts:{id:{initialize:function(c){this.c=c},renderButton:function(el){const b=document.createElement('button');b.textContent='Sign in with Google test';b.onclick=()=>this.c.callback({credential:JSON.stringify({sub:'browser-google-user',email:'google-test@gmail.com',email_verified:true,nonce:this.c.nonce})});el.appendChild(b)},disableAutoSelect:function(){}}}};`,
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign in with Google test' }).click();
  await expect(page.getByRole('button', { name: 'Manage account' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage account' }).click();
  await expect(page.getByText('Free account', { exact: true })).toBeVisible();
  await expect(page.getByText('google-test@gmail.com', { exact: true })).toBeVisible();
});
test('missing sign-in configuration stays visibly locked', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        authenticated: false,
        configured: false,
        user: null,
        csrf: null,
        nonce: null,
        googleClientId: null,
        emailEnabled: false,
        usage: null,
        limits: { daily: 10, minute: 3 },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await expect(
    page.getByText('The site owner hasn’t enabled sign-in yet.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0);
});
