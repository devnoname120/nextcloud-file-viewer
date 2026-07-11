import { expect, test } from '@playwright/test';

const baseURL = process.env.NEXTCLOUD_BASE_URL;
const username = process.env.NEXTCLOUD_USER || 'admin';
const password = process.env.NEXTCLOUD_PASSWORD || 'admin';
const markdownMime = 'text/markdown';

test.skip(!baseURL, 'NEXTCLOUD_BASE_URL is required for the live Nextcloud settings test.');
test.describe.configure({ timeout: 90000 });

test('admin geospatial basemap saves on selection change', async ({ page }) => {
  await login(page);
  await openFileViewerSettings(page);

  const selectedBasemap = page.locator('#fileviewer-geo-settings-form .vs__selected').first();
  const originalLabel = (await selectedBasemap.textContent() || '').trim();
  const nextLabel = originalLabel === 'Offline empty basemap'
    ? 'OpenFreeMap Liberty'
    : 'Offline empty basemap';

  await selectBasemap(page, nextLabel);
  await expect(page.locator('#fileviewer-geo-settings-message')).toHaveText('Saved.', { timeout: 30000 });

  await page.reload();
  await expect(page.locator('#fileviewer-geo-settings-form')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#fileviewer-geo-settings-form .vs__selected').first()).toHaveText(nextLabel);

  await selectBasemap(page, originalLabel);
  await expect(page.locator('#fileviewer-geo-settings-message')).toHaveText('Saved.', { timeout: 30000 });
});

test('admin MIME setting removes disabled MIME types from the fileviewer handler', async ({ page }) => {
  await login(page);
  await openFileViewerSettings(page);

  const originalEnabled = await setMimeEnabled(page, markdownMime, true);
  await expect.poll(() => getRegisteredMimes(page), { timeout: 45000 }).toContain(markdownMime);

  await openFileViewerSettings(page);
  await setMimeEnabled(page, markdownMime, false);
  await expect.poll(() => getRegisteredMimes(page), { timeout: 45000 }).not.toContain(markdownMime);

  await openFileViewerSettings(page);
  await setMimeEnabled(page, markdownMime, originalEnabled);
});

async function login(page) {
  await page.goto(`${baseURL}/login`);
  if (!page.url().includes('/login')) {
    await dismissFirstRunWizard(page);
    return;
  }

  await page.locator('input[name="user"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 45000 });
  await dismissFirstRunWizard(page);
}

async function openFileViewerSettings(page) {
  await page.goto(`${baseURL}/settings/admin/fileviewer`);
  await dismissFirstRunWizard(page);
  await expect(page.getByRole('heading', { name: 'Universal File Viewer', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Universal File Viewer', exact: true })).toBeVisible();
  await expect(page.locator('#fileviewer-mime-settings-form')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Save MIME types' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save geospatial settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.locator('link[href*="/fileviewer/css/fileviewer-admin.css"]')).toHaveCount(1);
  await expect(page.locator('.settings-section').filter({ hasText: 'MIME types handled by Universal File Viewer' })).toBeVisible();
  await expect(page.locator('#fileviewer-mime-settings-form .checkbox-radio-switch').first()).toBeVisible();
  await expect(page.locator('#fileviewer-mime-settings-form .button-vue').first()).toBeVisible();
  await expect(page.locator('#fileviewer-mime-settings-form .input-field').first()).toBeVisible();
  await expectBulkButtonsToShareRow(page);
}

async function selectBasemap(page, label) {
  const basemap = page.locator('#fileviewer-geo-basemap');
  await basemap.click();
  await page.locator('[role="option"]').filter({ hasText: label }).click();
  await expect(page.locator('#fileviewer-geo-settings-form .vs__selected').first()).toHaveText(label);
}

async function setMimeEnabled(page, mime, enabled) {
  const filter = page.locator('#fileviewer-mime-filter');
  await filter.fill(mime);

  const row = page.locator(`[data-fileviewer-mime-row][data-mime="${mime}"]`);
  await expect(row).toBeVisible({ timeout: 10000 });
  const checkbox = row.locator('input.checkbox-radio-switch__input');
  const originalEnabled = await checkbox.isChecked();
  if (originalEnabled !== enabled) {
    await row.locator('.checkbox-radio-switch__content').click();
    await expect(page.locator('#fileviewer-mime-settings-message')).toHaveText('Saved.', { timeout: 30000 });
  }
  if (enabled) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }

  return originalEnabled;
}

async function getRegisteredMimes(page) {
  await page.goto(`${baseURL}/apps/files/files`);
  await dismissFirstRunWizard(page);
  await page.waitForFunction(() => (
    window.OCA?.Viewer?.availableHandlers?.some(handler => handler.id === 'fileviewer')
  ), null, { timeout: 30000 });

  return page.evaluate(() => (
    window.OCA.Viewer.availableHandlers.find(handler => handler.id === 'fileviewer')?.mimes || []
  ));
}

async function expectBulkButtonsToShareRow(page) {
  const enableButton = page.getByRole('button', { name: 'Enable visible MIME types' });
  const disableButton = page.getByRole('button', { name: 'Disable visible MIME types' });

  await expect(enableButton).toBeVisible();
  await expect(disableButton).toBeVisible();

  const [enableBox, disableBox] = await Promise.all([
    enableButton.boundingBox(),
    disableButton.boundingBox(),
  ]);

  expect(enableBox).not.toBeNull();
  expect(disableBox).not.toBeNull();
  expect(Math.abs(enableBox.y - disableBox.y)).toBeLessThanOrEqual(2);
  expect(disableBox.x).toBeGreaterThan(enableBox.x + enableBox.width);
}

async function dismissFirstRunWizard(page) {
  const wizard = page.locator('#firstrunwizard');
  if (!await wizard.isVisible({ timeout: 5000 }).catch(() => false)) {
    return;
  }

  await page.keyboard.press('Escape');
  if (!await wizard.isVisible({ timeout: 1000 }).catch(() => false)) {
    return;
  }

  const closeButton = wizard.getByRole('button', {
    name: /close|skip|start using|get started|later/i,
  }).first();
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click();
  }

  await expect(wizard).toBeHidden({ timeout: 10000 });
}
