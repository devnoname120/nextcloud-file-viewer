import { expect, test } from '@playwright/test';

import {
  collectDeepText,
  createMinimalDocxBuffer,
  createMinimalPptxBuffer,
  createMinimalPsdBytes,
  createStyledEpubBuffer,
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
    const uniqueText = `Universal File Viewer ${liveCase.name} smoke ${Date.now()}`;
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

test('renders EPUB from an opaque Blob without exposing the Nextcloud origin', async ({ page, request, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit cannot create readable EPUB.js chapter frames after strict sandbox restoration.');

  const uniqueText = `Universal File Viewer opaque EPUB ${Date.now()}`;
  const fileName = `fileviewer-opaque-${Date.now()}.epub`;
  const fileId = await uploadFileAndReadFileId(request, {
    fileName,
    mime: 'application/epub+zip',
    data: createStyledEpubBuffer('Opaque EPUB smoke', uniqueText),
  });

  await login(page);
  const frame = await openFileById(page, fileId, fileName);
  await waitForVisibleEpubContent(frame, uniqueText, 60000);

  expect(frame.url()).toMatch(/^blob:null\//);
  expect(await frame.evaluate(() => self.origin)).toBe('null');
  expect(await frame.evaluate(() => {
    try {
      void parent.document.body;
      return false;
    } catch (error) {
      return error?.name === 'SecurityError';
    }
  })).toBe(true);

  const outer = page.locator('iframe[src*="/fileviewer/viewer/epub-bootstrap"]').first();
  await expect(outer).toHaveAttribute('sandbox', 'allow-scripts');
  await expect.poll(() => frame.evaluate(expectedText => {
    function findAllDeep(node, selector, matches = []) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
        matches.push(node);
      }
      if (node.shadowRoot) {
        findAllDeep(node.shadowRoot, selector, matches);
      }
      for (const child of node.childNodes) {
        findAllDeep(child, selector, matches);
      }
      return matches;
    }

    const chapterFrame = findAllDeep(document, '.epub-stage iframe, .epub-view iframe, iframe')
      .find(iframe => {
        try {
          return (iframe.contentDocument?.body?.innerText || '').includes(expectedText);
        } catch {
          return false;
        }
      });
    const chapterDocument = chapterFrame?.contentDocument;
    const chapterBody = chapterDocument?.querySelector('.chapter-body');
    const publisherStylesheet = chapterDocument?.querySelector('link[rel="stylesheet"]');
    if (!chapterFrame || !chapterBody || !publisherStylesheet) {
      return null;
    }

    const style = getComputedStyle(chapterBody);
    return {
      chapterSandbox: chapterFrame.getAttribute('sandbox'),
      publisherStylesheetLoaded: Boolean(publisherStylesheet.sheet),
      publisherStylesheetUsesBlob: publisherStylesheet.href.startsWith('blob:'),
      borderLeftWidth: style.borderLeftWidth,
      borderLeftStyle: style.borderLeftStyle,
      paddingLeft: style.paddingLeft,
    };
  }, uniqueText), { timeout: 60000 }).toEqual({
    chapterSandbox: 'allow-same-origin',
    publisherStylesheetLoaded: true,
    publisherStylesheetUsesBlob: true,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    paddingLeft: '16px',
  });

  await frame.evaluate(target => {
    location.replace(target);
  }, new URL('/apps/files/', baseURL).href);
  await expect(page.getByRole('alert').filter({
    hasText: 'navigated unexpectedly and was disconnected',
  })).toBeVisible({ timeout: 15000 });
  await expect(outer).toHaveCount(0);
});

test('fails closed when an engine cannot preserve EPUB chapter isolation', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'webkit', 'The compatibility failure is specific to current WebKit.');

  const fileName = `fileviewer-webkit-isolation-${Date.now()}.epub`;
  const fileId = await uploadFileAndReadFileId(request, {
    fileName,
    mime: 'application/epub+zip',
    data: createStyledEpubBuffer('WebKit isolation probe', 'This content must not be transferred.'),
  });

  await login(page);
  const directUrl = new URL(`/apps/files/files/${encodeURIComponent(fileId)}`, baseURL);
  directUrl.searchParams.set('dir', '/');
  directUrl.searchParams.set('editing', 'false');
  directUrl.searchParams.set('openfile', 'true');
  await page.goto(directUrl.href);
  await dismissFirstRunWizard(page);

  await expect(page.getByRole('alert').filter({
    hasText: 'cannot render EPUB files without weakening Nextcloud origin isolation',
  })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('iframe[src*="/fileviewer/viewer/epub-bootstrap"]')).toHaveCount(0);
});

test('closes the real Nextcloud viewer when Escape is pressed inside the fileviewer iframe', async ({ page, request }) => {
  const uniqueText = `Universal File Viewer Escape smoke ${Date.now()}`;
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

  await expect(page.locator('iframe[src*="/fileviewer/viewer/frame"]')).toHaveCount(0, { timeout: 10000 });
  await expect.poll(() => page.url(), { timeout: 10000 }).not.toContain('openfile=true');
});

test('opens a public single-file share with the shared filename extension', async ({ page, request }) => {
  const uniqueText = `Universal File Viewer public share smoke ${Date.now()}`;
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
    const handles = await page.locator([
      'iframe[src*="/fileviewer/viewer/frame"]',
      'iframe[src*="/fileviewer/viewer/epub-bootstrap"]',
    ].join(', ')).elementHandles();
    for (const handle of handles) {
      const frame = await handle.contentFrame();
      if (frame && frame.url() !== 'about:blank') {
        return frame;
      }
    }
    await page.waitForTimeout(100);
  }

  const iframeUrls = await page.locator('iframe').evaluateAll(iframes => iframes.map(iframe => iframe.src));
  throw new Error(`Fileviewer iframe did not finish loading. iframe srcs: ${iframeUrls.join(', ') || '(none)'}`);
}

async function waitForVisibleEpubContent(frame, expected, timeout = 30000) {
  await frame.waitForFunction(text => {
    function findAllDeep(node, selector, matches = []) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
        matches.push(node);
      }
      if (node.shadowRoot) {
        findAllDeep(node.shadowRoot, selector, matches);
      }
      for (const child of node.childNodes) {
        findAllDeep(child, selector, matches);
      }
      return matches;
    }

    return findAllDeep(document, '.epub-stage iframe, .epub-view iframe, iframe')
      .some(iframe => {
        try {
          return (iframe.contentDocument?.body?.innerText || '').includes(text);
        } catch {
          return false;
        }
      });
  }, expected, { timeout });
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
