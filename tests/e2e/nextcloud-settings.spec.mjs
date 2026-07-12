import { expect, test } from '@playwright/test';

const baseURL = process.env.NEXTCLOUD_BASE_URL;
const username = process.env.NEXTCLOUD_USER || 'admin';
const password = process.env.NEXTCLOUD_PASSWORD || 'admin';
const markdownExtension = 'md';
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

test('admin format setting controls real fileviewer dispatch', async ({ page, request }) => {
	const probe = await uploadMarkdownProbe(request);
	let originalEnabled;

	await login(page);
	try {
		await openFileViewerSettings(page);
		originalEnabled = await setFormatEnabled(page, markdownExtension, true);
		await expect.poll(() => getRegisteredMimes(page), { timeout: 45000 }).toContain(markdownMime);
		await expectMarkdownDispatch(page, probe, true);

		await openFileViewerSettings(page);
		await setFormatEnabled(page, markdownExtension, false);
		await expect.poll(() => getRegisteredMimes(page), { timeout: 45000 }).not.toContain(markdownMime);
		await expectMarkdownDispatch(page, probe, false);
	} finally {
		if (originalEnabled !== undefined) {
			await openFileViewerSettings(page);
			await setFormatEnabled(page, markdownExtension, originalEnabled);
		}
	}
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
  await expect(page.getByRole('heading', {
    name: /^(?:Administration settings: )?Universal File Viewer$/,
  })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Universal File Viewer', exact: true })).toBeVisible();
	await expect(page.locator('#fileviewer-format-settings-form')).toBeVisible({ timeout: 30000 });
	await expect(page.getByRole('button', { name: 'Save file formats' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Save geospatial settings' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
	await expect(page.locator('link[href*="/fileviewer/css/fileviewer-admin.css"]')).toHaveCount(1);
	await expect(page.locator('.settings-section').filter({ hasText: 'File formats handled by Universal File Viewer' })).toBeVisible();
	await expect(page.locator('#fileviewer-format-settings-form .checkbox-radio-switch').first()).toBeVisible();
	await expect(page.locator('#fileviewer-format-settings-form .button-vue').first()).toBeVisible();
	await expect(page.locator('#fileviewer-format-settings-form .input-field').first()).toBeVisible();
	await expect(page.locator('#fileviewer-format-settings-form')).not.toContainText('application/');
	await expectBulkButtonsToShareRow(page);
}

async function selectBasemap(page, label) {
  const basemap = page.locator('#fileviewer-geo-basemap');
  await basemap.click();
  await page.locator('[role="option"]').filter({ hasText: label }).click();
  await expect(page.locator('#fileviewer-geo-settings-form .vs__selected').first()).toHaveText(label);
}

async function setFormatEnabled(page, extension, enabled) {
	const filter = page.locator('#fileviewer-format-filter');
	await filter.fill(`.${extension}`);

	const row = page.locator(`[data-fileviewer-format-group][data-extensions*="${extension}"]`).first();
	await expect(row).toBeVisible({ timeout: 10000 });
	const checkbox = row.locator('input.checkbox-radio-switch__input');
	const originalEnabled = await checkbox.isChecked();
	if (originalEnabled !== enabled) {
		await row.locator('.checkbox-radio-switch__content').click();
		await expect(page.locator('#fileviewer-format-settings-message')).toHaveText('Saved.', { timeout: 30000 });
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

async function uploadMarkdownProbe(request) {
	const uniqueText = `Universal File Viewer format toggle ${Date.now()}`;
	const fileName = `fileviewer-format-toggle-${Date.now()}.md`;
	const fileUrl = `${baseURL}/remote.php/dav/files/${encodeURIComponent(username)}/${encodeURIComponent(fileName)}`;
	const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
	const upload = await request.put(fileUrl, {
		headers: {
			Authorization: authorization,
			'Content-Type': markdownMime,
		},
		data: `# ${uniqueText}\n\nThis file verifies real Viewer dispatch.\n`,
	});
	expect([201, 204]).toContain(upload.status());

	const propfind = await request.fetch(fileUrl, {
		method: 'PROPFIND',
		headers: {
			Authorization: authorization,
			Depth: '0',
			'Content-Type': 'application/xml; charset=utf-8',
		},
		data: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:prop><oc:fileid /></d:prop>
</d:propfind>`,
	});
	expect(propfind.ok()).toBeTruthy();
	const responseBody = await propfind.text();
	const fileId = responseBody.match(/<(?:oc|nc):fileid>([^<]+)<\/(?:oc|nc):fileid>/)?.[1];
	expect(fileId).toBeTruthy();

	return { fileId, fileName, uniqueText };
}

async function expectMarkdownDispatch(page, probe, expected) {
	const directUrl = new URL(`/apps/files/files/${encodeURIComponent(probe.fileId)}`, baseURL);
	directUrl.searchParams.set('dir', '/');
	directUrl.searchParams.set('editing', 'false');
	directUrl.searchParams.set('openfile', 'true');
	await page.goto(directUrl.href);
	await dismissFirstRunWizard(page);
	await page.waitForLoadState('networkidle').catch(() => {});

	const frame = page.locator('iframe[src*="/fileviewer/viewer/frame"]');
	if (expected) {
		await expect(frame).toHaveCount(1, { timeout: 45000 });
		await expect(page.frameLocator('iframe[src*="/fileviewer/viewer/frame"]')
			.getByRole('heading', { name: probe.uniqueText, exact: true }))
			.toBeVisible({ timeout: 45000 });
		return;
	}

	await expect(frame).toHaveCount(0);
	await expect(page.getByText(probe.fileName, { exact: true }).first()).toBeVisible({ timeout: 30000 });
}

async function expectBulkButtonsToShareRow(page) {
	const enableButton = page.getByRole('button', { name: 'Enable visible formats' });
	const disableButton = page.getByRole('button', { name: 'Disable visible formats' });

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
