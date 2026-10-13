import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMinimalEpubBuffer, createMinimalPptxBuffer, createZipBuffer,
  mountViewerComponent, mountSandboxedFrame, loadFileIntoSandbox,
  startStaticServer, waitForDeepText, waitForNextWorkerInfo,
} from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server;
test.beforeAll(async () => { server = await startStaticServer(root); });
test.afterAll(async () => { await server?.close(); });

test('production parent accepts cached direct-frame startup and blocks later navigation', async ({ page }) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const text = `startup regression ${attempt}`;
    const frame = await mountViewerComponent(page, server, {
      filename: 'startup.txt', mime: 'text/plain', text,
    });
    await waitForDeepText(frame, text);
    expect(await page.evaluate(() => ({
      blocked: window.__viewerComponent.frameBlocked,
      armed: window.__viewerComponent.frameNavigationArmed,
      loads: window.__viewerComponent.frameLoadCount,
    }))).toEqual({ blocked: false, armed: true, loads: 1 });
  }
  await page.evaluate(url => { document.getElementById('viewer-frame').src = url; },
    `${server.origin}/__playwright-parent.html?navigation=1`);
  await page.waitForFunction(() => window.__viewerComponent.frameBlocked);
  expect(await page.evaluate(() => window.__viewerComponent.framePort)).toBeNull();
});

test('production parent handles both EPUB startup documents before arming navigation', async ({ page }) => {
  const frame = await mountViewerComponent(page, server, {
    filename: 'startup.epub', mime: 'application/epub+zip',
    bytes: createMinimalEpubBuffer('Startup book', 'EPUB production parent regression'),
  });
  await expect.poll(() => frame.childFrames().length).toBe(1);
  await expect(frame.childFrames()[0].getByText('EPUB production parent regression', { exact: true })).toBeVisible();
  expect(frame.url()).toMatch(/^blob:null\//);
  expect(await frame.evaluate(() => self.origin)).toBe('null');
  expect(await page.evaluate(() => ({
    blocked: window.__viewerComponent.frameBlocked,
    armed: window.__viewerComponent.frameNavigationArmed,
    loads: window.__viewerComponent.frameLoadCount,
    phase: window.__viewerComponent.frameHandshakePhase,
  }))).toEqual({ blocked: false, armed: true, loads: 2, phase: 'connected' });
  await page.evaluate(url => { document.getElementById('viewer-frame').src = url; },
    `${server.origin}/__playwright-parent.html?epub-navigation=1`);
  await page.waitForFunction(() => window.__viewerComponent.frameBlocked);
});

test('PowerPoint opened inside an archive renders using an opaque sandbox-local worker', async ({ page }) => {
  const channel = `archive-member-${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);
  await loadFileIntoSandbox(page, channel, {
    filename: 'nested.zip', mime: 'application/zip',
    bytes: createZipBuffer([
      ['readme.txt', 'Archive worker regression'],
      ['nested.pptx', createMinimalPptxBuffer('Nested PowerPoint worker regression')],
    ]),
  });
  const entry = frame.locator('button.archive-entry').filter({ hasText: 'nested.pptx' });
  await expect(entry).toBeVisible();
  const worker = waitForNextWorkerInfo(page);
  await entry.click();
  await waitForDeepText(frame, 'Nested PowerPoint worker regression');
  expect(await worker).toMatchObject({ origin: 'null' });
  await expect(frame.locator('#error')).not.toHaveAttribute('data-visible', 'true');

  for (const workerPath of [
    'wasm/model/occt-worker.js',
    'wasm/cad/0.8.2/dwg-worker.js',
    'vendor/iwork/iwork.worker.js',
    'vendor/hangul/hangul.worker.js',
    'vendor/wordperfect/wordperfect.worker.js',
  ]) {
    const info = waitForNextWorkerInfo(page);
    await frame.evaluate(url => {
      window.__archiveWorkerProbe = new Worker(url);
    }, `${server.origin}/apps/fileviewer/assets/${workerPath}`);
    const result = await info;
    expect(result.origin).toBe('null');
    expect(result.url).toMatch(/^blob:null\//);
    await frame.evaluate(() => window.__archiveWorkerProbe.terminate());
  }
  expect(await frame.evaluate(() => {
    try { new Worker('https://example.invalid/unprepared.js'); return 'accepted'; }
    catch (error) { return error.message; }
  })).toContain('Parser worker was not prepared inside the sandbox');
});
