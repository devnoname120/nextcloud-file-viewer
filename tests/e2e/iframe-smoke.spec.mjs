import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DEFAULT_FRAME_SANDBOX,
  EPUB_BOOTSTRAP_SANDBOX,
  createEpubDocumentCsp,
  createViewerDocumentCsp,
  createMinimalDocxBuffer,
  createMinimalEpubBuffer,
  createMinimalPdfBytes,
  createMinimalPptxBuffer,
  createMinimalPptxSlidesBuffer,
  createMinimalPsdBytes,
  createScriptedEpubBuffer,
  createStyledEpubBuffer,
  createMinimalWasmBytes,
  createMinimalWavBytes,
  createMinimalXlsxBuffer,
  createZipBuffer,
  collectDeepText,
  getEpubHandshakeState,
  loadFileIntoSandbox,
  mountEpubSandboxedFrame,
  mountSandboxedFrame,
  startStaticServer,
  waitForDeepMatch,
  waitForDeepText,
  waitForNextWorkerInfo,
} from './helpers.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server;

test.beforeAll(async () => {
  server = await startStaticServer(rootDir);
});

test.afterAll(async () => {
  await server?.close();
});

test('serves the viewer document with a child-specific worker and EPUB stylesheet CSP', async ({ request }) => {
  const response = await request.get(`${server.origin}/viewer/index.html`);
  const expectedCsp = createViewerDocumentCsp(server.origin);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-security-policy']).toBe(expectedCsp);
  expect(expectedCsp).toMatch(/style-src [^;]* blob:/);
  expect(expectedCsp).toContain('worker-src blob:');
  expect(expectedCsp).not.toContain("worker-src 'self'");
});

test('serves a controller-equivalent EPUB bootstrap document and CSP', async ({ request }) => {
  const response = await request.get(`${server.origin}/viewer/epub-bootstrap`);
  const body = await response.text();
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-security-policy']).toBe(createEpubDocumentCsp(server.origin));
  expect(body).toContain('id="file-viewer-renderer-document"');
  expect(body).toContain('src="/viewer/epub-bootstrap.js"');
  expect(body).not.toContain('__FILE_VIEWER_RENDERER_DOCUMENT__');
});

test('commits the EPUB renderer to blob:null before restoring the strict outer sandbox', async ({ page, browserName }) => {
  test.skip(!['chromium', 'firefox'].includes(browserName), 'The readable-probe success path is engine-specific.');
  const channel = `iframe-epub-handshake-${Date.now()}`;
  const { frame, state } = await mountEpubSandboxedFrame(page, server, channel);

  expect(state.blocked).toBe(false);
  expect(state.phase).toBe('connected');
  expect(state.hasPort).toBe(true);
  expect(state.connectionSequence).toBe(1);
  expect(state.documentLoaded).toBe(true);
  expect(state.runtimeReady).toBe(true);
  expect(state.navigationArmed).toBe(true);
  expect(state.frameLoadCount).toBeGreaterThanOrEqual(1);
  expect(state.sandbox).toBe(EPUB_BOOTSTRAP_SANDBOX);
  expect(state.commands).toEqual([
    { transport: 'window', type: 'nextcloud-file-viewer:epub-bootstrap-navigate' },
    { transport: 'port', type: 'nextcloud-file-viewer:epub-sandbox-probe' },
    { transport: 'port', type: 'nextcloud-file-viewer:epub-renderer-start' },
    { transport: 'port', type: 'nextcloud-file-viewer:connected' },
  ]);
  expect(state.messages.map(message => message?.type).filter(Boolean)).toEqual(expect.arrayContaining([
    'nextcloud-file-viewer:epub-bootstrap-ready',
    'nextcloud-file-viewer:epub-renderer-gate-ready',
    'nextcloud-file-viewer:epub-sandbox-probe-result',
    'nextcloud-file-viewer:runtime-ready',
    'nextcloud-file-viewer:document-loaded',
  ]));
  expect(frame.url()).toMatch(/^blob:null\//);
  expect(await frame.evaluate(() => self.origin)).toBe('null');
  expect(await frame.evaluate(() => {
    try {
      void parent.document;
      return { readable: true };
    } catch (error) {
      return { readable: false, errorName: error.name };
    }
  })).toEqual({ readable: false, errorName: 'SecurityError' });
  await expect(page.locator('#viewer-frame')).toHaveAttribute('sandbox', EPUB_BOOTSTRAP_SANDBOX);
});

test('fails closed when WebKit cannot preserve readable EPUB chapters after sandbox restoration', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'This assertion covers WebKit secure fallback behavior.');
  const channel = `iframe-epub-webkit-probe-${Date.now()}`;
  const { frame, state } = await mountEpubSandboxedFrame(page, server, channel);

  expect(frame?.url()).toMatch(/^blob:null\//);
  expect(state.blocked).toBe(true);
  expect(state.phase).toBe('blocked');
  expect(state.hasPort).toBe(false);
  expect(state.connectionSequence).toBe(0);
  expect(state.documentLoaded).toBe(false);
  expect(state.runtimeReady).toBe(false);
  expect(state.navigationArmed).toBe(false);
  expect(state.frameLoadCount).toBeGreaterThanOrEqual(1);
  expect(state.sandbox).toBe(EPUB_BOOTSTRAP_SANDBOX);
  expect(state.error).toContain('cannot render EPUB files without weakening Nextcloud origin isolation');
  expect(state.messages).toContainEqual(expect.objectContaining({
    type: 'nextcloud-file-viewer:epub-sandbox-probe-result',
    channel,
    readable: false,
  }));
  expect(state.commands).not.toContainEqual(expect.objectContaining({
    type: 'nextcloud-file-viewer:epub-renderer-start',
  }));
  expect(state.commands).not.toContainEqual(expect.objectContaining({
    type: 'nextcloud-file-viewer:connected',
  }));
});

async function expectSandboxLocalWorker(page, workerInfoPromise) {
  const workerInfo = await workerInfoPromise;
  expect(workerInfo.url).toMatch(/^blob:null\//);
  expect(workerInfo.origin).toBe('null');
  expect(await page.evaluate(() => window.__fileViewerWorkers.size)).toBe(0);
}

test('rejects file loads when the frame page is opened outside an iframe', async ({ page }) => {
  const channel = `top-level-frame-${Date.now()}`;
  const uniqueText = `top-level frame load ${Date.now()}`;
  const assetBase = `${server.origin}/apps/fileviewer/assets/`;
  await page.goto(`${server.origin}/viewer/index.html?channel=${channel}&assetBase=${encodeURIComponent(assetBase)}`);

  await page.evaluate(({ expectedChannel, text }) => {
    const blob = new Blob([text], { type: 'text/plain' });
    window.postMessage({
      type: 'nextcloud-file-viewer:load',
      channel: expectedChannel,
      file: blob,
      filename: 'top-level.txt',
      mime: 'text/plain',
      size: blob.size,
    }, '*');
  }, { expectedChannel: channel, text: uniqueText });

  await expect(page.locator('#error')).toContainText('embedded in Nextcloud Viewer');
  await page.waitForTimeout(1000);
  await expect(page.locator('body')).not.toContainText(uniqueText);
});

test('loads a text file in the strict sandboxed iframe', async ({ page }) => {
  const channel = `iframe-text-${Date.now()}`;
  const uniqueText = `iframe smoke text ${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);

  await loadFileIntoSandbox(page, channel, {
    filename: 'smoke.txt',
    mime: 'text/plain',
    text: uniqueText,
  });

  await waitForDeepText(frame, uniqueText);
});

test('ignores file loads sent as window messages after the secure channel is connected', async ({ page }) => {
  const channel = `iframe-window-message-${Date.now()}`;
  const uniqueText = `window message must not load ${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);

  await page.evaluate(({ expectedChannel, text }) => {
    const iframe = document.getElementById('viewer-frame');
    const blob = new Blob([text], { type: 'text/plain' });
    iframe.contentWindow.postMessage({
      type: 'nextcloud-file-viewer:load',
      channel: expectedChannel,
      file: blob,
      filename: 'window-message.txt',
      mime: 'text/plain',
      size: blob.size,
    }, '*');
  }, { expectedChannel: channel, text: uniqueText });

  await page.waitForTimeout(500);
  expect(await collectDeepText(frame)).not.toContain(uniqueText);
});

test('ignores a malformed ready message after the secure channel is connected', async ({ page }) => {
  const channel = `iframe-duplicate-ready-${Date.now()}`;
  const uniqueText = `channel remains usable ${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);

  await frame.evaluate(expectedChannel => {
    parent.postMessage({
      type: 'nextcloud-file-viewer:ready',
      channel: expectedChannel,
    }, '*');
  }, channel);

  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__fileViewerHandshakeErrors)).toBe(0);

  await loadFileIntoSandbox(page, channel, {
    filename: 'still-connected.txt',
    mime: 'text/plain',
    text: uniqueText,
  });
  await waitForDeepText(frame, uniqueText);
});

test('does not reconnect or expose file messages after the iframe navigates', async ({ page }) => {
  const channel = `iframe-navigation-${Date.now()}`;
  const uniqueText = `navigation secret ${Date.now()}`;
  await mountSandboxedFrame(page, server, channel);

  await page.evaluate(expectedChannel => {
    const iframe = document.getElementById('viewer-frame');
    iframe.srcdoc = `<!doctype html><script>
      const pair = new MessageChannel();
      pair.port1.addEventListener('message', event => {
        parent.postMessage({ type: 'navigation-port-message', payload: event.data }, '*');
      });
      pair.port1.start();
      parent.postMessage({
        type: 'nextcloud-file-viewer:ready',
        channel: ${JSON.stringify(expectedChannel)},
      }, '*', [pair.port2]);
      window.addEventListener('message', event => {
        parent.postMessage({ type: 'navigation-window-message', payload: event.data }, '*');
      });
      parent.postMessage({ type: 'navigation-probe-ready' }, '*');
    <\/script>`;
  }, channel);

  await page.waitForFunction(() => window.__fileViewerMessages.some(message => (
    message && message.type === 'navigation-probe-ready'
  )));

  await page.evaluate(({ expectedChannel, text }) => {
    const blob = new Blob([text], { type: 'text/plain' });
    window.__fileViewerPort.postMessage({
      type: 'nextcloud-file-viewer:load',
      channel: expectedChannel,
      file: blob,
      filename: 'navigation-secret.txt',
      mime: 'text/plain',
      size: blob.size,
    });
  }, { expectedChannel: channel, text: uniqueText });

  await page.waitForTimeout(500);
  const navigationMessages = await page.evaluate(() => window.__fileViewerMessages.filter(message => (
    message
    && (message.type === 'navigation-port-message' || message.type === 'navigation-window-message')
  )));
  expect(navigationMessages).toEqual([]);
});

test('loads a PDF file in the strict sandboxed iframe', async ({ page }) => {
  const channel = `iframe-pdf-${Date.now()}`;
  const uniqueText = `Iframe PDF smoke ${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);
  const workerInfoPromise = waitForNextWorkerInfo(page);

  await loadFileIntoSandbox(page, channel, {
    filename: 'smoke.pdf',
    mime: 'application/pdf',
    bytes: createMinimalPdfBytes(uniqueText),
  });

  await waitForDeepMatch(frame, {
    texts: [uniqueText],
    selectors: ['canvas'],
  });
  await expectSandboxLocalWorker(page, workerInfoPromise);
});

test('parses a large XLSX in an opaque sandbox-local worker', async ({ page }) => {
  const channel = `iframe-large-xlsx-${Date.now()}`;
  const uniqueText = `large XLSX worker ${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);
  const workerInfoPromise = waitForNextWorkerInfo(page);
  const bytes = createMinimalXlsxBuffer(uniqueText, 1050000);
  expect(bytes.length).toBeGreaterThanOrEqual(1024 * 1024);

  await loadFileIntoSandbox(page, channel, {
    filename: 'large-smoke.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  }, 45000);

  await waitForDeepMatch(frame, {
    selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'],
  }, 45000);
  await expectSandboxLocalWorker(page, workerInfoPromise);
});

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

    for (const iframe of findAllDeep(document, '.epub-stage iframe, .epub-view iframe, iframe')) {
      const rect = iframe.getBoundingClientRect();
      const frameStyle = getComputedStyle(iframe);
      if (
        rect.width <= 0
        || rect.height <= 0
        || frameStyle.display === 'none'
        || frameStyle.visibility === 'hidden'
      ) {
        continue;
      }

      try {
        const body = iframe.contentDocument && iframe.contentDocument.body;
        if (body && (body.innerText || '').includes(text)) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }, expected, { timeout });
}

test('renders styled EPUB chapter content after the opaque bootstrap handshake', async ({ page, browserName }) => {
  test.skip(!['chromium', 'firefox'].includes(browserName), 'WebKit fails the EPUB sandbox probe closed.');
  const channel = `iframe-styled-epub-${Date.now()}`;
  const uniqueText = `styled EPUB chapter ${Date.now()}`;
  const { frame } = await mountEpubSandboxedFrame(page, server, channel);

  await loadFileIntoSandbox(page, channel, {
    filename: 'styled-smoke.epub',
    mime: 'application/epub+zip',
    bytes: createStyledEpubBuffer('Styled EPUB smoke', uniqueText),
  }, 15000);

  await waitForVisibleEpubContent(frame, uniqueText, 15000);
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
    if (!chapterBody || !publisherStylesheet) {
      return null;
    }

    const style = getComputedStyle(chapterBody);
    return {
      publisherStylesheetLoaded: Boolean(publisherStylesheet.sheet),
      publisherStylesheetUsesBlob: publisherStylesheet.href.startsWith('blob:'),
      borderLeftWidth: style.borderLeftWidth,
      borderLeftStyle: style.borderLeftStyle,
      paddingLeft: style.paddingLeft,
    };
  }, uniqueText), { timeout: 15000 }).toEqual({
    publisherStylesheetLoaded: true,
    publisherStylesheetUsesBlob: true,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    paddingLeft: '16px',
  });
});

test('keeps scripted EPUB chapter content in a nested no-scripts sandbox', async ({ page, browserName }) => {
  test.skip(!['chromium', 'firefox'].includes(browserName), 'WebKit fails the EPUB sandbox probe closed.');
  const channel = `iframe-scripted-epub-${Date.now()}`;
  const uniqueText = `scripted EPUB security probe ${Date.now()}`;
  const { frame } = await mountEpubSandboxedFrame(page, server, channel);

  await page.evaluate(() => {
    window.__fileViewerEpubSecurityProbe = [];
  });
  await frame.evaluate(() => {
    window.__fileViewerEpubSecurityProbe = [];
  });

  await loadFileIntoSandbox(page, channel, {
    filename: 'scripted-security-smoke.epub',
    mime: 'application/epub+zip',
    bytes: createScriptedEpubBuffer('Scripted EPUB security smoke', uniqueText),
  }, 15000);

  await waitForVisibleEpubContent(frame, uniqueText, 15000);

  const chapterSandboxTokens = await frame.evaluate(expectedText => {
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

    if (!chapterFrame) {
      throw new Error('Rendered EPUB chapter iframe was not found.');
    }

    return (chapterFrame.getAttribute('sandbox') || '')
      .split(/\s+/)
      .filter(Boolean);
  }, uniqueText);

  expect(chapterSandboxTokens).toContain('allow-same-origin');
  expect(chapterSandboxTokens).not.toContain('allow-scripts');

  await page.waitForTimeout(250);
  await expect.poll(() => frame.evaluate(() => window.__fileViewerEpubSecurityProbe)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__fileViewerEpubSecurityProbe)).toEqual([]);
});

test('disconnects an EPUB channel after unexpected outer-frame navigation', async ({ page, browserName }) => {
  test.skip(!['chromium', 'firefox'].includes(browserName), 'WebKit is already blocked by the sandbox probe.');
  const channel = `iframe-epub-unexpected-navigation-${Date.now()}`;
  const { frame, state } = await mountEpubSandboxedFrame(page, server, channel);
  expect(state.phase).toBe('connected');

  await frame.evaluate(target => {
    location.replace(target);
  }, `${server.origin}/__playwright-parent.html?unexpected=1`);
  await page.waitForFunction(() => window.__fileViewerHandshakePhase === 'blocked');

  const blocked = await getEpubHandshakeState(page);
  expect(blocked.blocked).toBe(true);
  expect(blocked.hasPort).toBe(false);
  expect(blocked.phase).toBe('blocked');
  expect(blocked.frameLoadCount).toBe(state.frameLoadCount + 1);
  expect(blocked.error).toContain('navigated unexpectedly and was disconnected');
});

async function getPresentationLayoutInfo(frame) {
  return frame.evaluate(() => {
    function findDeep(node, selector) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
        return node;
      }

      if (node.shadowRoot) {
        const shadowMatch = findDeep(node.shadowRoot, selector);
        if (shadowMatch) {
          return shadowMatch;
        }
      }

      for (const child of node.childNodes) {
        const childMatch = findDeep(child, selector);
        if (childMatch) {
          return childMatch;
        }
      }

      return null;
    }

    const content = findDeep(document, '.file-viewer-web-content');
    const shell = findDeep(document, '.file-viewer-web-shell');
    const viewer = findDeep(document, 'flyfish-file-viewer');
    if (!content || !shell || !viewer) {
      return null;
    }

    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const viewerStyle = getComputedStyle(viewer);
    const style = getComputedStyle(shell);
    const contentStyle = getComputedStyle(content);

    return {
      backgrounds: {
        body: bodyStyle.backgroundColor,
        html: htmlStyle.backgroundColor,
        shell: style.backgroundColor,
        viewer: viewerStyle.backgroundColor,
      },
      content: {
        clientHeight: content.clientHeight,
        overflowY: contentStyle.overflowY,
        scrollHeight: content.scrollHeight,
      },
      frameClasses: [...document.documentElement.classList],
    };
  });
}

test('uses an opaque scrollable frame for multi-slide PPTX presentations in the strict sandboxed iframe', async ({ page }) => {
  const channel = `iframe-pptx-scroll-${Date.now()}`;
  const frame = await mountSandboxedFrame(page, server, channel);

  await loadFileIntoSandbox(page, channel, {
    filename: 'scroll-smoke.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bytes: createMinimalPptxSlidesBuffer([
      `First PPTX slide ${Date.now()}`,
      `Second PPTX slide ${Date.now()}`,
      `Third PPTX slide ${Date.now()}`,
    ]),
  }, 45000);

  await waitForDeepMatch(frame, { selector: '.pptx-viewer-shell' }, 45000);
  await frame.waitForFunction(() => {
    function findDeep(node, selector) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
        return node;
      }

      if (node.shadowRoot) {
        const shadowMatch = findDeep(node.shadowRoot, selector);
        if (shadowMatch) {
          return shadowMatch;
        }
      }

      for (const child of node.childNodes) {
        const childMatch = findDeep(child, selector);
        if (childMatch) {
          return childMatch;
        }
      }

      return null;
    }

    const content = findDeep(document, '.file-viewer-web-content');
    if (!content) {
      return false;
    }

    const style = getComputedStyle(content);
    return (
      content.scrollHeight > content.clientHeight + 8
      && style.overflowY !== 'hidden'
      && getComputedStyle(document.documentElement).backgroundColor !== 'rgba(0, 0, 0, 0)'
    );
  }, null, { timeout: 10000 });

  const layoutInfo = await getPresentationLayoutInfo(frame);
  expect(layoutInfo).not.toBeNull();
  expect(layoutInfo.frameClasses).toContain('file-viewer-frame--presentation');
  expect(layoutInfo.content.scrollHeight).toBeGreaterThan(layoutInfo.content.clientHeight + 8);
  expect(layoutInfo.content.overflowY).not.toBe('hidden');
  for (const background of Object.values(layoutInfo.backgrounds)) {
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
  }
});

const rendererCases = [
  {
    name: 'Word OpenXML DOCX',
    sample: uniqueText => ({
      filename: 'smoke.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: createMinimalDocxBuffer(uniqueText),
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'PowerPoint PPTX',
    sample: uniqueText => ({
      filename: 'smoke.pptx',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: createMinimalPptxBuffer(uniqueText),
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'Spreadsheet XLSX',
    sample: uniqueText => ({
      filename: 'smoke.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: createMinimalXlsxBuffer(uniqueText),
    }),
    match: () => ({ selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'] }),
  },
  {
    name: 'Open Document RTF',
    sample: uniqueText => ({
      filename: 'smoke.rtf',
      mime: 'application/rtf',
      text: `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Arial;}}\\f0\\fs24 ${uniqueText}\\par}`,
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'Typst',
    sample: uniqueText => ({
      filename: 'smoke.typ',
      mime: 'text/vnd.typst',
      text: `= ${uniqueText}\n\nThis file validates the Typst renderer in the sandbox.\n`,
    }),
    match: uniqueText => ({ texts: [uniqueText], selectors: ['canvas', 'svg'] }),
  },
  {
    name: 'Archive ZIP',
    sample: uniqueText => ({
      filename: 'smoke.zip',
      mime: 'application/zip',
      bytes: createZipBuffer([[`nested/${uniqueText}.txt`, 'archive payload']]),
    }),
    match: uniqueText => ({ text: `${uniqueText}.txt` }),
  },
  {
    name: 'Email EML',
    sample: uniqueText => ({
      filename: 'smoke.eml',
      mime: 'message/rfc822',
      text: `From: sender@example.test
To: receiver@example.test
Subject: ${uniqueText}
Content-Type: text/plain; charset=utf-8

${uniqueText}
`,
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'CAD DXF',
    sample: () => ({
      filename: 'smoke.dxf',
      mime: 'image/vnd.dxf',
      text: `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
30
0
11
100
21
100
31
0
0
ENDSEC
0
EOF
`,
    }),
    match: () => ({ selectors: ['canvas', '.cad-shell'] }),
  },
  {
    name: '3D OBJ',
    sample: () => ({
      filename: 'smoke.obj',
      mime: 'model/obj',
      text: `o SmokeTriangle
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`,
    }),
    match: () => ({ selectors: ['canvas'] }),
  },
  {
    name: 'GeoJSON',
    sample: uniqueText => ({
      filename: 'smoke.geojson',
      mime: 'application/geo+json',
      text: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: uniqueText },
          geometry: { type: 'Point', coordinates: [7.4474, 46.948] },
        }],
      }),
    }),
    match: uniqueText => ({ texts: [uniqueText], selectors: ['canvas', 'svg', '.geo-viewer'] }),
  },
  {
    name: 'Drawing Mermaid',
    sample: uniqueText => ({
      filename: 'smoke.mermaid',
      mime: 'text/vnd.mermaid',
      text: `graph TD
  A[${uniqueText}] --> B[Rendered]
`,
    }),
    match: uniqueText => ({ texts: [uniqueText], selectors: ['svg'] }),
  },
  {
    name: 'EPUB',
    sample: uniqueText => ({
      filename: 'smoke.epub',
      mime: 'application/epub+zip',
      bytes: createMinimalEpubBuffer(uniqueText, `Chapter body ${uniqueText}`),
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'Image SVG',
    sample: uniqueText => ({
      filename: 'smoke.svg',
      mime: 'image/svg+xml',
      text: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="20" y="90">${uniqueText}</text></svg>`,
    }),
    match: () => ({ selectors: ['img', 'svg'] }),
  },
  {
    name: 'Markdown',
    sample: uniqueText => ({
      filename: 'smoke.md',
      mime: 'text/markdown',
      text: `# ${uniqueText}\n\nMarkdown body for renderer smoke.\n`,
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'Code JS',
    sample: uniqueText => ({
      filename: 'smoke.js',
      mime: 'text/javascript',
      text: `export const smoke = ${JSON.stringify(uniqueText)};\n`,
    }),
    match: uniqueText => ({ text: uniqueText }),
  },
  {
    name: 'Video MP4',
    sample: () => ({
      filename: 'smoke.mp4',
      mime: 'video/mp4',
      bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32],
    }),
    match: () => ({ selector: 'video' }),
  },
  {
    name: 'Audio WAV',
    sample: () => ({
      filename: 'smoke.wav',
      mime: 'audio/wav',
      bytes: createMinimalWavBytes(),
    }),
    match: () => ({ selector: 'audio' }),
  },
  {
    name: 'Data Asset WASM',
    sample: () => ({
      filename: 'smoke.wasm',
      mime: 'application/wasm',
      bytes: createMinimalWasmBytes(),
    }),
    match: () => ({ text: 'WebAssembly.Module' }),
  },
  {
    name: 'Data Asset PSD',
    sample: () => ({
      filename: 'smoke.psd',
      mime: 'application/x-photoshop',
      bytes: createMinimalPsdBytes(),
    }),
    match: () => ({ selector: '.psd-viewer' }),
  },
];

for (const rendererCase of rendererCases) {
  test(`renders ${rendererCase.name} in the strict sandboxed iframe`, async ({ page, browserName }) => {
    const channel = `iframe-${rendererCase.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const uniqueText = `smoke-${rendererCase.name.replace(/[^A-Za-z0-9]+/g, '-')}-${Date.now()}`;
    if (rendererCase.name === 'EPUB') {
      test.skip(!['chromium', 'firefox'].includes(browserName), 'WebKit fails the EPUB sandbox probe closed.');
    }
    const frame = rendererCase.name === 'EPUB'
      ? (await mountEpubSandboxedFrame(page, server, channel)).frame
      : await mountSandboxedFrame(page, server, channel);
    const workerInfoPromise = (
      rendererCase.name === 'Word OpenXML DOCX'
      || rendererCase.name === 'PowerPoint PPTX'
    ) ? waitForNextWorkerInfo(page) : null;

    await loadFileIntoSandbox(page, channel, rendererCase.sample(uniqueText), 45000);
    await waitForDeepMatch(frame, rendererCase.match(uniqueText), 45000);
    if (workerInfoPromise) {
      await expectSandboxLocalWorker(page, workerInfoPromise);
    }
  });
}
