import { expect, test } from '@playwright/test';

test('video embed badge renders on /demo', async ({ page }) => {
  await page.goto('/demo', { waitUntil: 'domcontentloaded' });

  const badge = page.locator('[data-phoenix-zero-embed] a');
  await expect(badge).toBeVisible();
  await expect(badge).not.toHaveText(/verificando/i);
  await expect(badge).toHaveAttribute('href', /\S+/);
});

test('image embed badge renders on /image-demo and /image-demo-wm', async ({ page }) => {
  await page.goto('/image-demo', { waitUntil: 'domcontentloaded' });
  const badge1 = page.locator('[data-phoenix-zero-image-embed] a');
  await expect(badge1).toBeVisible();
  await expect(badge1).not.toHaveText(/verificando/i);
  await expect(badge1).toHaveAttribute('href', /\S+/);

  const [imgRes] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/demo/assets/v2/image-wm.png') && res.status() === 200),
    page.goto('/image-demo-wm', { waitUntil: 'domcontentloaded' })
  ]);
  expect(imgRes.ok()).toBeTruthy();

  const badge2 = page.locator('[data-phoenix-zero-image-embed] a');
  await expect(badge2).toBeVisible();
  await expect(badge2).not.toHaveText(/verificando/i);
  await expect(badge2).toHaveAttribute('href', /\S+/);
});

test('live embed badge renders on /live-embed-demo (missing jobId)', async ({ page }) => {
  await page.goto('/live-embed-demo', { waitUntil: 'domcontentloaded' });
  const badge = page.locator('[data-phoenix-zero-live-embed] a');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/falta jobId/i);
});
