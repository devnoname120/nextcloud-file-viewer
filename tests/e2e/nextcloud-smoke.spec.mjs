import { expect, test } from '@playwright/test';

import {
  collectDeepText,
  createMinimalDocxBuffer,
  createMinimalPptxBuffer,
  createMinimalPsdBytes,
  createZipBuffer,
  waitForDeepMatch,
} from './helpers.mjs';

const baseURL = process.env.NEXTCLOUD_BASE_URL;
const username = process.env.NEXTCLOUD_USER || 'admin';
const password = process.env.NEXTCLOUD_PASSWORD || 'admin';

test.skip(!baseURL, 'NEXTCLOUD_BASE_URL is required for the live Nextcloud smoke test.');
test.describe.configure({ timeout: 90000 });

const liveCases = [
  {
    name: 'DOCX',
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createData: uniqueText => createMinimalDocxBuffer(uniqueText),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'PPTX',
    extension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    createData: uniqueText => createMinimalPptxBuffer(uniqueText),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'ZIP',
    extension: 'zip',
    mime: 'application/zip',
    createData: uniqueText => createZipBuffer([[`${uniqueText}.txt`, 'archive smoke payload']]),
    match: uniqueText => ({ text: `${uniqueText}.txt` }),
    forbiddenText: 'The libarchive Worker could not start',
    forbiddenTextStableMs: 31000,
  },
  {
    name: 'PSD',
    extension: 'psd',
    mime: 'application/x-photoshop',
    createData: () => createMinimalPsdBytes(),
    match: () => ({ selector: '.psd-viewer' }),
  },
];

for (const liveCase of liveCases) {
  test(`opens a ${liveCase.name} file through the real Nextcloud Viewer using fileviewer`, async ({ page, request }) => {
    const uniqueText = `Nextcloud File Viewer ${liveCase.name} smoke ${Date.now()}`;
    const fileName = `fileviewer-smoke-${Date.now()}.${liveCase.extension}`;
    const fileId = await uploadFileAndReadFileId(request, {
      fileName,
      mime: liveCase.mime,
      data: liveCase.createData(uniqueText),
    });

    await login(page);
    const frame = await openFileById(page, fileId, fileName);
    await waitForDeepMatch(frame, liveCase.match(uniqueText), 60000);
    if (liveCase.forbiddenText) {
      if (liveCase.forbiddenTextStableMs) {
        await frame.waitForTimeout(liveCase.forbiddenTextStableMs);
      }
      expect(await collectDeepText(frame)).not.toContain(liveCase.forbiddenText);
    }
  });
}

test('closes the real Nextcloud viewer when Escape is pressed inside the fileviewer iframe', async ({ page, request }) => {
  const uniqueText = `Nextcloud File Viewer Escape smoke ${Date.now()}`;
  const fileName = `fileviewer-escape-${Date.now()}.md`;
  const fileId = await uploadFileAndReadFileId(request, {
    fileName,
    mime: 'text/markdown',
    data: `# ${uniqueText}\n\nEscape should close the parent viewer.\n`,
  });

  await login(page);
  const frame = await openFileById(page, fileId, fileName);
  await waitForDeepMatch(frame, { text: uniqueText }, 60000);

  await frame.locator('body').click();
  await page.keyboard.press('Escape');

  await expect(page.locator('iframe[src*="/fileviewer/viewer/index.html"]')).toHaveCount(0, { timeout: 10000 });
  await expect.poll(() => page.url(), { timeout: 10000 }).not.toContain('openfile=true');
});

test('opens a public single-file share with the shared filename extension', async ({ page, request }) => {
  const uniqueText = `Nextcloud File Viewer public share smoke ${Date.now()}`;
  const fileName = `fileviewer-public-share-${Date.now()}.md`;
  await uploadFileAndReadFileId(request, {
    fileName,
    mime: 'text/markdown',
    data: `# ${uniqueText}\n\nPublic shares must keep the file extension.\n`,
  });

  const shareUrl = await createPublicShare(request, fileName);
  const publicUrl = new URL(shareUrl);
  publicUrl.searchParams.set('dir', '/');
  publicUrl.searchParams.set('editing', 'false');
  publicUrl.searchParams.set('openfile', 'true');

  await page.goto(publicUrl.href);
  const frame = await waitForFileViewerFrame(page, 45000);
  await waitForDeepMatch(frame, { text: uniqueText }, 60000);
  expect(await collectDeepText(frame)).not.toContain('cannot be previewed online');
});

async function uploadFileAndReadFileId(request, { fileName, mime, data }) {
  const fileUrl = `${baseURL}/remote.php/dav/files/${encodeURIComponent(username)}/${encodeURIComponent(fileName)}`;
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const upload = await request.put(fileUrl, {
    headers: {
      Authorization: authorization,
      'Content-Type': mime,
    },
    data,
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
  <d:prop>
    <oc:fileid />
  </d:prop>
</d:propfind>`,
  });
  expect(propfind.ok()).toBeTruthy();

  const body = await propfind.text();
  const match = body.match(/<(?:oc|nc):fileid>([^<]+)<\/(?:oc|nc):fileid>/);
  expect(match?.[1]).toBeTruthy();
  return match[1];
}

async function createPublicShare(request, fileName) {
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const response = await request.post(`${baseURL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
    headers: {
      Authorization: authorization,
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
    form: {
      path: `/${fileName}`,
      shareType: '3',
      permissions: '1',
    },
  });
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  expect(body.ocs?.meta?.statuscode).toBe(200);
  expect(body.ocs?.data?.url).toBeTruthy();
  return body.ocs.data.url;
}

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

async function openFileById(page, fileId, fileName) {
  const directUrl = new URL(`/apps/files/files/${encodeURIComponent(fileId)}`, baseURL);
  directUrl.searchParams.set('dir', '/');
  directUrl.searchParams.set('editing', 'false');
  directUrl.searchParams.set('openfile', 'true');
  await page.goto(directUrl.href);
  await dismissFirstRunWizard(page);

  const directFrame = await waitForFileViewerFrame(page, 20000).catch(() => null);
  if (directFrame) {
    return directFrame;
  }

  const filesUrl = new URL('/apps/files/files', baseURL);
  filesUrl.searchParams.set('dir', '/');
  await page.goto(filesUrl.href);
  await dismissFirstRunWizard(page);
  const row = page.locator([
    `[data-cy-files-list-row-name="${fileName}"]`,
    `[data-file="${fileName}"]`,
    `[role="row"]:has-text("${fileName}")`,
    `tr:has-text("${fileName}")`,
  ].join(', ')).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.dblclick();
  return waitForFileViewerFrame(page, 45000);
}

async function waitForFileViewerFrame(page, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = page.frames().find(candidate => candidate.url().includes('/fileviewer/viewer/index.html'));
    if (frame) {
      return frame;
    }
    await page.waitForTimeout(100);
  }

  const iframeUrls = await page.locator('iframe').evaluateAll(iframes => iframes.map(iframe => iframe.src));
  throw new Error(`Fileviewer iframe did not finish loading. iframe srcs: ${iframeUrls.join(', ') || '(none)'}`);
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
