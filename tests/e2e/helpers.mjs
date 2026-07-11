import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

export const DEFAULT_FRAME_SANDBOX = 'allow-scripts allow-downloads allow-forms allow-modals allow-popups allow-presentation';
export const EPUB_BOOTSTRAP_SANDBOX = 'allow-scripts';
export const EPUB_RENDERER_SANDBOX = 'allow-scripts allow-same-origin';

export function createViewerDocumentCsp(origin) {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    `script-src 'self' ${origin} 'unsafe-eval' 'wasm-unsafe-eval'`,
    `style-src 'self' ${origin} 'unsafe-inline' blob:`,
    `img-src 'self' ${origin} data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org`,
    `font-src 'self' ${origin} data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org`,
    `connect-src 'self' ${origin} data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org`,
    `media-src 'self' ${origin} data: blob:`,
    `frame-src 'self' ${origin} blob:`,
    `frame-ancestors 'self' ${origin}`,
    'worker-src blob:',
    `form-action 'self' ${origin}`,
  ].join('; ');
}

export function createEpubDocumentCsp(origin) {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    `script-src 'self' ${origin} 'unsafe-eval' 'wasm-unsafe-eval'`,
    "style-src 'unsafe-inline' blob:",
    'img-src data: blob:',
    'font-src data: blob:',
    'connect-src data: blob:',
    'media-src data: blob:',
    "object-src 'none'",
    "frame-src 'self' blob:",
    `frame-ancestors 'self' ${origin}`,
    'worker-src blob:',
    "form-action 'none'",
  ].join('; ');
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

export async function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const [epubBootstrapTemplate, viewerDocument] = await Promise.all([
    readFile(path.join(root, 'viewer/epub-bootstrap.html'), 'utf8'),
    readFile(path.join(root, 'viewer/index.html'), 'utf8'),
  ]);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/__playwright-parent.html') {
        const body = '<!doctype html><html><body></body></html>';
        response.writeHead(200, {
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'text/html; charset=utf-8',
        });
        response.end(body);
        return;
      }

      if (url.pathname === '/viewer/epub-bootstrap') {
        const origin = `http://${request.headers.host}`;
        const body = epubBootstrapTemplate.replace(
          '__FILE_VIEWER_RENDERER_DOCUMENT__',
          Buffer.from(viewerDocument, 'utf8').toString('base64'),
        ).replace(
          'src="./epub-bootstrap.js"',
          'src="/viewer/epub-bootstrap.js"',
        );
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(body),
          'Content-Security-Policy': createEpubDocumentCsp(origin),
          'Content-Type': 'text/html; charset=utf-8',
        });
        response.end(body);
        return;
      }

      const assetPrefix = '/apps/fileviewer/assets/';
      const isCorsAsset = url.pathname.startsWith(assetPrefix);
      const assetPath = isCorsAsset
        ? decodeURIComponent(url.pathname.slice(assetPrefix.length))
        : '';
      const runtimePaths = new Map([
        ['runtime/frame.js', 'viewer/frame.js'],
        ['runtime/epub-renderer-gate.js', 'viewer/epub-renderer-gate.js'],
      ]);
      const relativePath = isCorsAsset
        ? runtimePaths.get(assetPath) || `viewer/file-viewer/${assetPath}`
        : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let filePath = path.resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      let fileInfo = await stat(filePath);
      if (fileInfo.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        fileInfo = await stat(filePath);
      }

      const headers = {
        'Content-Length': fileInfo.size,
        'Content-Type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream',
      };
      if (isCorsAsset) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
      }
      if (url.pathname === '/viewer/index.html') {
        headers['Content-Security-Policy'] = createViewerDocumentCsp(`http://${request.headers.host}`);
      }

      response.writeHead(200, headers);
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(error?.code === 'ENOENT' ? 404 : 500);
      response.end(error?.message || 'Error');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise(resolve => server.close(resolve));
    },
  };
}

export async function installMessageRecorder(page) {
  await page.evaluate(() => {
    window.__fileViewerMessages = [];
    window.addEventListener('message', event => {
      window.__fileViewerMessages.push(event.data);
    });
  });
}

export async function waitForViewerMessage(page, channel, type, timeout = 30000) {
  await page.waitForFunction(
    ({ expectedChannel, expectedType }) => window.__fileViewerMessages.some(message =>
      message
      && message.channel === expectedChannel
      && message.type === expectedType
    ),
    { expectedChannel: channel, expectedType: type },
    { timeout }
  );
}

export function waitForNextWorkerInfo(page, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('worker', onWorker);
      reject(new Error('Timed out waiting for an isolated parser worker.'));
    }, timeout);

    async function onWorker(worker) {
      page.off('worker', onWorker);
      clearTimeout(timer);
      const url = worker.url();
      try {
        resolve({
          url,
          origin: await worker.evaluate(() => self.origin),
        });
      } catch (error) {
        if (/^blob:null\//.test(url)) {
          resolve({ url, origin: 'null' });
          return;
        }
        reject(error);
      }
    }

    page.on('worker', onWorker);
  });
}

export async function mountSandboxedFrame(page, server, channel, options = {}) {
  const assetBase = `${server.origin}/apps/fileviewer/assets/`;
  const frameSandbox = options.sandbox || DEFAULT_FRAME_SANDBOX;
  await page.goto(`${server.origin}/__playwright-parent.html`);
  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0">
        <script>
          window.__fileViewerMessages = [];
          window.__fileViewerWorkers = new Map();
          window.__fileViewerPort = null;
          window.__fileViewerFrameWindow = null;
          window.__fileViewerConnectionSequence = 0;
          window.__fileViewerHandshakeErrors = 0;
          const expectedChannel = ${JSON.stringify(channel)};
          const handlePortMessage = event => {
            window.__fileViewerMessages.push(event.data);
          };

          window.addEventListener('message', event => {
            window.__fileViewerMessages.push(event.data);
            const data = event.data;
            const iframe = document.getElementById('viewer-frame');
            if (
              !iframe
              || event.source !== iframe.contentWindow
              || !data
              || data.channel !== expectedChannel
            ) {
              return;
            }

            if (window.__fileViewerPort) {
              if (event.source === window.__fileViewerFrameWindow) {
                for (const port of event.ports) {
                  port.close();
                }
                return;
              }
              window.__fileViewerPort.removeEventListener('message', handlePortMessage);
              window.__fileViewerPort.close();
              window.__fileViewerPort = null;
            }

            if (data.type !== 'nextcloud-file-viewer:ready') {
              return;
            }
            if (event.ports.length !== 1) {
              window.__fileViewerHandshakeErrors += 1;
              return;
            }

            window.__fileViewerPort = event.ports[0];
            window.__fileViewerFrameWindow = event.source;
            window.__fileViewerConnectionSequence += 1;
            window.__fileViewerPort.addEventListener('message', handlePortMessage);
            window.__fileViewerPort.start();
            window.__fileViewerPort.postMessage({
              type: 'nextcloud-file-viewer:connected',
              channel: expectedChannel,
            });
          });
        </script>
        <iframe
          id="viewer-frame"
          sandbox="${frameSandbox}"
          credentialless
          src="${server.origin}/viewer/index.html?channel=${channel}&assetBase=${encodeURIComponent(assetBase)}"
          style="width:1024px;height:768px;border:0"
        ></iframe>
      </body>
    </html>
  `);

  const frame = page.frames().find(candidate => candidate.url().includes(`/viewer/index.html?channel=${channel}`));
  if (!frame) {
    throw new Error(`Viewer iframe for channel ${channel} was not found`);
  }
  await waitForViewerMessage(page, channel, 'nextcloud-file-viewer:ready');
  await page.waitForFunction(() => Boolean(window.__fileViewerPort));
  await frame.waitForFunction(() => (
    document.readyState === 'complete'
    && Boolean(window.FlyfishFileViewerWebFull)
    && Boolean(document.querySelector('flyfish-file-viewer'))
  ));
  return frame;
}

export async function mountEpubSandboxedFrame(page, server, channel, options = {}) {
  const assetBase = `${server.origin}/apps/fileviewer/assets/`;
  const timeout = options.timeout || 30000;
  await page.goto(`${server.origin}/__playwright-parent.html`);
  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0">
        <script>
          window.__fileViewerMessages = [];
          window.__fileViewerParentCommands = [];
          window.__fileViewerPort = null;
          window.__fileViewerFrameWindow = null;
          window.__fileViewerConnectionSequence = 0;
          window.__fileViewerHandshakeErrors = 0;
          window.__fileViewerHandshakePhase = 'epub-bootstrap';
          window.__fileViewerFrameLoadCount = 0;
          window.__fileViewerFrameLoadPhases = [];
          window.__fileViewerDocumentLoaded = false;
          window.__fileViewerRuntimeReady = false;
          window.__fileViewerNavigationArmed = false;
          window.__fileViewerBlocked = false;
          window.__fileViewerError = null;
          const expectedChannel = ${JSON.stringify(channel)};
          const strictSandbox = ${JSON.stringify(EPUB_BOOTSTRAP_SANDBOX)};
          const rendererSandbox = ${JSON.stringify(EPUB_RENDERER_SANDBOX)};

          const recordCommand = (transport, type) => {
            window.__fileViewerParentCommands.push({ transport, type });
          };
          const closePort = () => {
            if (!window.__fileViewerPort) return;
            window.__fileViewerPort.removeEventListener('message', onPortMessage);
            window.__fileViewerPort.close();
            window.__fileViewerPort = null;
          };
          const block = message => {
            closePort();
            window.__fileViewerBlocked = true;
            window.__fileViewerHandshakePhase = 'blocked';
            window.__fileViewerError = message;
          };
          const postPortCommand = type => {
            if (!window.__fileViewerPort) {
              block('The EPUB security handshake was disconnected.');
              return;
            }
            recordCommand('port', type);
            window.__fileViewerPort.postMessage({ type, channel: expectedChannel });
          };
          const completeConnectionIfReady = () => {
            if (
              window.__fileViewerHandshakePhase !== 'epub-renderer'
              || !window.__fileViewerDocumentLoaded
              || !window.__fileViewerRuntimeReady
            ) {
              return;
            }

            window.__fileViewerNavigationArmed = true;
            window.__fileViewerHandshakePhase = 'connected';
            recordCommand('port', 'nextcloud-file-viewer:connected');
            window.__fileViewerPort.postMessage({
              type: 'nextcloud-file-viewer:connected',
              channel: expectedChannel,
            });
            window.__fileViewerConnectionSequence += 1;
          };
          const onPortMessage = event => {
            const data = event.data;
            window.__fileViewerMessages.push(data);
            if (!data || data.channel !== expectedChannel || typeof data.type !== 'string') {
              return;
            }

            if (data.type === 'nextcloud-file-viewer:epub-sandbox-probe-result') {
              if (
                window.__fileViewerHandshakePhase !== 'epub-sandbox-probe'
                || typeof data.readable !== 'boolean'
              ) {
                return;
              }
              if (!data.readable) {
                block('This browser cannot render EPUB files without weakening Nextcloud origin isolation.');
                return;
              }
              window.__fileViewerHandshakePhase = 'epub-renderer';
              postPortCommand('nextcloud-file-viewer:epub-renderer-start');
              return;
            }

            if (
              data.type === 'nextcloud-file-viewer:runtime-ready'
              && window.__fileViewerHandshakePhase === 'epub-renderer'
            ) {
              window.__fileViewerRuntimeReady = true;
              completeConnectionIfReady();
              return;
            }

            if (
              data.type === 'nextcloud-file-viewer:document-loaded'
              && window.__fileViewerHandshakePhase === 'epub-renderer'
            ) {
              window.__fileViewerDocumentLoaded = true;
              completeConnectionIfReady();
              return;
            }

            if (data.type === 'nextcloud-file-viewer:error') {
              block(data.error?.message || 'The sandboxed file viewer failed to initialize.');
            }
          };

          window.addEventListener('message', event => {
            window.__fileViewerMessages.push(event.data);
            const data = event.data;
            const iframe = document.getElementById('viewer-frame');
            if (
              !iframe
              || event.source !== iframe.contentWindow
              || event.origin !== 'null'
              || !data
              || data.channel !== expectedChannel
              || typeof data.type !== 'string'
            ) {
              for (const port of event.ports) port.close();
              return;
            }

            if (
              data.type === 'nextcloud-file-viewer:epub-bootstrap-ready'
              && window.__fileViewerHandshakePhase === 'epub-bootstrap'
              && event.ports.length === 0
            ) {
              iframe.setAttribute('sandbox', rendererSandbox);
              window.__fileViewerHandshakePhase = 'epub-gate';
              recordCommand('window', 'nextcloud-file-viewer:epub-bootstrap-navigate');
              iframe.contentWindow.postMessage({
                type: 'nextcloud-file-viewer:epub-bootstrap-navigate',
                channel: expectedChannel,
              }, '*');
              return;
            }

            if (
              data.type === 'nextcloud-file-viewer:epub-renderer-gate-ready'
              && window.__fileViewerHandshakePhase === 'epub-gate'
              && event.ports.length === 1
            ) {
              iframe.setAttribute('sandbox', strictSandbox);
              window.__fileViewerPort = event.ports[0];
              window.__fileViewerFrameWindow = event.source;
              window.__fileViewerPort.addEventListener('message', onPortMessage);
              window.__fileViewerPort.start();
              window.__fileViewerHandshakePhase = 'epub-sandbox-probe';
              postPortCommand('nextcloud-file-viewer:epub-sandbox-probe');
              return;
            }

            for (const port of event.ports) port.close();
          });

          const onFrameLoad = () => {
            window.__fileViewerFrameLoadCount += 1;
            window.__fileViewerFrameLoadPhases.push(window.__fileViewerHandshakePhase);
            if (window.__fileViewerNavigationArmed) {
              block('The sandboxed file viewer navigated unexpectedly and was disconnected.');
            }
          };
        </script>
        <iframe
          id="viewer-frame"
          sandbox="${EPUB_BOOTSTRAP_SANDBOX}"
          credentialless
          referrerpolicy="no-referrer"
          allow="fullscreen"
          src="${server.origin}/viewer/epub-bootstrap?channel=${channel}&assetBase=${encodeURIComponent(assetBase)}"
          style="width:1024px;height:768px;border:0"
          onload="onFrameLoad()"
        ></iframe>
      </body>
    </html>
  `);

  await page.waitForFunction(() => (
    window.__fileViewerHandshakePhase === 'connected'
    || window.__fileViewerHandshakePhase === 'blocked'
  ), null, { timeout });

  const state = await getEpubHandshakeState(page);
  const frame = page.frames().find(candidate => candidate.url().startsWith('blob:null/')) || null;
  if (!state.blocked && !frame) {
    throw new Error(`EPUB renderer frame for channel ${channel} was not found`);
  }
  return { frame, state };
}

export async function getEpubHandshakeState(page) {
  return page.evaluate(() => ({
    blocked: window.__fileViewerBlocked,
    commands: [...window.__fileViewerParentCommands],
    connectionSequence: window.__fileViewerConnectionSequence,
    documentLoaded: window.__fileViewerDocumentLoaded,
    error: window.__fileViewerError,
    frameLoadCount: window.__fileViewerFrameLoadCount,
    frameLoadPhases: [...window.__fileViewerFrameLoadPhases],
    hasPort: Boolean(window.__fileViewerPort),
    messages: [...window.__fileViewerMessages],
    navigationArmed: window.__fileViewerNavigationArmed,
    phase: window.__fileViewerHandshakePhase,
    runtimeReady: window.__fileViewerRuntimeReady,
    sandbox: document.getElementById('viewer-frame')?.getAttribute('sandbox') || '',
  }));
}

export async function loadFileIntoSandbox(page, channel, sample, timeout = 30000) {
  const normalizedSample = sample.bytes && !Array.isArray(sample.bytes)
    ? { ...sample, bytes: Array.from(sample.bytes) }
    : sample;
  const messageOffset = await page.evaluate(() => window.__fileViewerMessages.length);
  await page.evaluate(({ expectedChannel, fileSample }) => {
    const body = fileSample.bytesBase64
      ? Uint8Array.from(atob(fileSample.bytesBase64), character => character.charCodeAt(0))
      : fileSample.bytes
      ? new Uint8Array(fileSample.bytes)
      : fileSample.text;
    const blob = new Blob([body], { type: fileSample.mime });
    window.__fileViewerPort.postMessage({
      type: 'nextcloud-file-viewer:load',
      channel: expectedChannel,
      file: blob,
      filename: fileSample.filename,
      mime: fileSample.mime,
      size: blob.size,
    });
  }, { expectedChannel: channel, fileSample: normalizedSample });

  await page.waitForFunction(
    ({ expectedChannel, offset }) => {
      const messages = window.__fileViewerMessages.slice(offset).filter(message =>
        message
        && message.channel === expectedChannel
        && typeof message.type === 'string'
      );
      return messages.some(message =>
        message.type === 'nextcloud-file-viewer:loaded'
        || message.type === 'nextcloud-file-viewer:error'
      );
    },
    { expectedChannel: channel, offset: messageOffset },
    { timeout }
  );

  const errorMessage = await page.evaluate(({ expectedChannel, offset }) => {
    const message = window.__fileViewerMessages.slice(offset).find(candidate =>
      candidate
      && candidate.channel === expectedChannel
      && candidate.type === 'nextcloud-file-viewer:error'
    );
    return message?.error?.message || null;
  }, { expectedChannel: channel, offset: messageOffset });

  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

export async function waitForDeepText(frame, expected, timeout = 30000) {
  await frame.waitForFunction(text => {
    function collectText(node) {
      let value = '';
      if (node.nodeType === Node.TEXT_NODE) {
        value += node.nodeValue || '';
      }
      if (node.shadowRoot) {
        value += collectText(node.shadowRoot);
      }
      for (const child of node.childNodes) {
        value += collectText(child);
      }
      return value;
    }

    return collectText(document).includes(text);
  }, expected, { timeout });
}

export async function collectDeepText(frame) {
  return frame.evaluate(() => {
    function collectText(node) {
      let value = '';
      if (node.nodeType === Node.TEXT_NODE) {
        value += node.nodeValue || '';
      }
      if (node.shadowRoot) {
        value += collectText(node.shadowRoot);
      }
      for (const child of node.childNodes) {
        value += collectText(child);
      }
      return value;
    }

    return collectText(document);
  });
}

export async function waitForDeepElement(frame, selector, timeout = 30000) {
  await frame.waitForFunction(cssSelector => {
    function hasMatch(node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(cssSelector)) {
        return true;
      }
      if (node.shadowRoot && hasMatch(node.shadowRoot)) {
        return true;
      }
      return Array.from(node.childNodes).some(hasMatch);
    }

    return hasMatch(document);
  }, selector, { timeout });
}

export async function waitForVisibleDeepText(frame, expected, timeout = 30000) {
  await frame.waitForFunction(text => {
    function nodeHasText(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.nodeValue || '').includes(text);
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot && nodeHasText(node.shadowRoot)) {
        return true;
      }
      return Array.from(node.childNodes).some(nodeHasText);
    }

    function childElementHasText(element) {
      return Array.from(element.children).some(child => nodeHasText(child));
    }

    function isVisibleElement(element) {
      const style = getComputedStyle(element);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
      ) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth;
    }

    function hasVisibleText(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.shadowRoot && hasVisibleText(node.shadowRoot)) {
          return true;
        }

        const element = node;
        const children = Array.from(element.childNodes);
        if (children.some(hasVisibleText)) {
          return true;
        }

        if ((element.textContent || '').includes(text) && !childElementHasText(element)) {
          return isVisibleElement(element);
        }
      }

      return Array.from(node.childNodes).some(hasVisibleText);
    }

    return hasVisibleText(document);
  }, expected, { timeout });
}

export async function waitForDeepMatch(frame, options, timeout = 30000) {
  const texts = Array.isArray(options.texts)
    ? options.texts
    : options.text
    ? [options.text]
    : [];
  const selectors = Array.isArray(options.selectors)
    ? options.selectors
    : options.selector
    ? [options.selector]
    : [];

  await frame.waitForFunction(({ expectedTexts, cssSelectors }) => {
    function collectText(node) {
      let value = '';
      if (node.nodeType === Node.TEXT_NODE) {
        value += node.nodeValue || '';
      }
      if (node.shadowRoot) {
        value += collectText(node.shadowRoot);
      }
      for (const child of node.childNodes) {
        value += collectText(child);
      }
      return value;
    }

    function hasMatch(node, cssSelector) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches(cssSelector)) {
        return true;
      }
      if (node.shadowRoot && hasMatch(node.shadowRoot, cssSelector)) {
        return true;
      }
      return Array.from(node.childNodes).some(child => hasMatch(child, cssSelector));
    }

    const pageText = expectedTexts.length > 0 ? collectText(document) : '';
    return expectedTexts.some(text => pageText.includes(text))
      || cssSelectors.some(selector => hasMatch(document, selector));
  }, { expectedTexts: texts, cssSelectors: selectors }, { timeout });
}

export async function createFileSampleFromPath(filePath, options = {}) {
  const bytes = await readFile(filePath);
  return {
    filename: options.filename || path.basename(filePath),
    mime: options.mime || 'application/octet-stream',
    bytesBase64: bytes.toString('base64'),
  };
}

export function createMinimalPdfBytes(text) {
  const escapedText = text.replace(/[\\()]/g, value => `\\${value}`);
  const stream = `BT
/F1 24 Tf
72 720 Td
(${escapedText}) Tj
ET
`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>
stream
${stream}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n 
`;
  });
  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  return [...Buffer.from(pdf, 'latin1')];
}

export function createMinimalDocxBuffer(text) {
  return createZipBuffer([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`],
  ]);
}

export function createMinimalXlsxBuffer(text, paddingSize = 0) {
  const escapedText = escapeXml(text);
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Smoke" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>${escapedText}</t></is></c>
    </row>
  </sheetData>
</worksheet>`],
  ];
  if (paddingSize > 0) {
    files.push(['xl/file-viewer-padding.bin', Buffer.alloc(paddingSize, 0x5a)]);
  }
  return createZipBuffer(files);
}

function createMinimalPptxSlideXml(text) {
  const escapedText = escapeXml(text);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>${escapedText}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

export function createMinimalPptxSlidesBuffer(texts) {
  const slideTexts = Array.isArray(texts) && texts.length > 0 ? texts : [''];
  const slideOverrides = slideTexts.map((_, index) =>
    `  <Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n');
  const slideIds = slideTexts.map((_, index) =>
    `    <p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`
  ).join('\n');
  const slideRelationships = slideTexts.map((_, index) =>
    `  <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
  ).join('\n');
  const slideParts = slideTexts.map((text, index) => [
    `ppt/slides/slide${index + 1}.xml`,
    createMinimalPptxSlideXml(text),
  ]);

  return createZipBuffer([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slideOverrides}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`],
    ['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
${slideIds}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slideRelationships}
</Relationships>`],
    ...slideParts,
  ]);
}

export function createMinimalPptxBuffer(text) {
  return createMinimalPptxSlidesBuffer([text]);
}

export function createMinimalEpubBuffer(title, text) {
  return createZipBuffer([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`],
    ['OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:fileviewer-smoke</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`],
    ['OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter.xhtml">Chapter</a></li>
      </ol>
    </nav>
  </body>
</html>`],
    ['OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <h1>${escapeXml(title)}</h1>
    <p>${escapeXml(text)}</p>
  </body>
</html>`],
  ]);
}

export function createStyledEpubBuffer(title, text) {
  return createZipBuffer([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`],
    ['OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:fileviewer-styled-smoke</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="styles" href="styles/book.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`],
    ['OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <link rel="stylesheet" type="text/css" href="styles/book.css"/>
  </head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter.xhtml">Styled chapter</a></li>
      </ol>
    </nav>
  </body>
</html>`],
    ['OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles/book.css"/>
  </head>
  <body>
    <h1>${escapeXml(title)}</h1>
    <p class="chapter-body">${escapeXml(text)}</p>
  </body>
</html>`],
    ['OEBPS/styles/book.css', `
html, body {
  margin: 0;
  padding: 0;
}

body {
  color: #1f2937;
  font-family: serif;
  line-height: 1.6;
}

.chapter-body {
  border-left: 4px solid #2563eb;
  padding-left: 1rem;
}
`],
  ]);
}

export function createScriptedEpubBuffer(title, text) {
  return createZipBuffer([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`],
    ['OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:fileviewer-scripted-security-smoke</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`],
    ['OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter.xhtml">Security probe chapter</a></li>
      </ol>
    </nav>
  </body>
</html>`],
    ['OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeXml(title)}</title>
    <script type="text/javascript"><![CDATA[
      try { parent.__fileViewerEpubSecurityProbe.push('script'); } catch (error) {}
      try { top.__fileViewerEpubSecurityProbe.push('script'); } catch (error) {}
    ]]></script>
  </head>
  <body onload="try { parent.__fileViewerEpubSecurityProbe.push('body-onload'); } catch (error) {}; try { top.__fileViewerEpubSecurityProbe.push('body-onload'); } catch (error) {}">
    <h1>${escapeXml(title)}</h1>
    <p>${escapeXml(text)}</p>
    <img src="missing-security-probe.png" alt="" onerror="try { parent.__fileViewerEpubSecurityProbe.push('image-onerror'); } catch (error) {}; try { top.__fileViewerEpubSecurityProbe.push('image-onerror'); } catch (error) {}"/>
    <svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" onload="try { parent.__fileViewerEpubSecurityProbe.push('svg-onload'); } catch (error) {}; try { top.__fileViewerEpubSecurityProbe.push('svg-onload'); } catch (error) {}">
      <title>SVG security probe</title>
    </svg>
  </body>
</html>`],
  ]);
}

export function createMinimalWavBytes(durationSeconds = 0.2, frequency = 440) {
  const sampleRate = 8000;
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.floor(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 0x3fff);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  return [...buffer];
}

export function createMinimalWasmBytes() {
  return [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
}

export function createMinimalPsdBytes() {
  const bytes = [];
  const pushAscii = value => {
    for (const char of value) {
      bytes.push(char.charCodeAt(0));
    }
  };
  const pushU16 = value => bytes.push((value >> 8) & 0xff, value & 0xff);
  const pushU32 = value => bytes.push(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  );

  pushAscii('8BPS');
  pushU16(1);
  bytes.push(0, 0, 0, 0, 0, 0);
  pushU16(3);
  pushU32(1);
  pushU32(1);
  pushU16(8);
  pushU16(3);
  pushU32(0);
  pushU32(0);
  pushU32(0);
  pushU16(0);
  bytes.push(0xff, 0x00, 0x00);

  return Buffer.from(bytes);
}

export function createZipBuffer(files) {
  const localEntries = [];
  const centralEntries = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localEntries.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralEntries.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localEntries, centralDirectory, end]);
}

function crc32(data) {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});
