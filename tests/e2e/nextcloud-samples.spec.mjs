import { expect, test } from '@playwright/test';
import { DOMParser } from '@xmldom/xmldom';

import {
  collectDeepText,
  waitForDeepMatch,
  waitForVisibleDeepText,
} from './helpers.mjs';

const baseURL = process.env.NEXTCLOUD_BASE_URL;
const username = process.env.NEXTCLOUD_USER || 'admin';
const password = process.env.NEXTCLOUD_PASSWORD || 'admin';
const sampleDir = '/File Viewer samples';

test.skip(!baseURL, 'NEXTCLOUD_BASE_URL is required for the live Nextcloud sample test.');
test.describe.configure({ timeout: 120000 });

const sampleCases = [
  {
    name: 'README Markdown',
    fileName: '00-README.md',
    match: { selector: '.markdown-viewer' },
  },
  {
    name: 'Word OpenXML DOCX',
    fileName: '01-word-openxml.docx',
    match: { selectors: ['.docx-fit-viewer', '.docx-page-frame', '.docx-flow-frame'] },
  },
  {
    name: 'Word binary DOC',
    fileName: '02-word-binary.doc',
    match: { selector: '.msdoc-zoom-viewer' },
  },
  {
    name: 'PowerPoint PPTX',
    fileName: '03-presentation.pptx',
    match: { selector: '.pptx-viewer-shell' },
  },
  {
    name: 'OpenDocument ODT',
    fileName: '04-opendocument-text.odt',
    match: { selector: '.odf-viewer' },
  },
  {
    name: 'OpenDocument ODP',
    fileName: '05-opendocument-presentation.odp',
    match: { selector: '.odf-viewer' },
  },
  {
    name: 'Spreadsheet XLSX',
    fileName: '06-spreadsheet.xlsx',
    match: { selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'] },
  },
  {
    name: 'Spreadsheet XLS',
    fileName: '07-spreadsheet-binary.xls',
    match: { selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'] },
    visibleText: '总氨产量',
  },
  {
    name: 'PDF',
    fileName: '08-pdf.pdf',
    match: { selector: 'canvas' },
  },
  {
    name: 'OFD',
    fileName: '09-ofd.ofd',
    match: { selectors: ['.ofd-viewer', '.ofd-page-frame', '.ofd-page'] },
  },
  {
    name: 'Typst',
    fileName: '10-typst.typ',
    match: { selectors: ['canvas', 'svg'] },
  },
  {
    name: 'Archive ZIP',
    fileName: '11-archive.zip',
    match: { texts: ['sample.pdf', 'markdown.md'], selectors: ['.archive-shell', '.archive-entry'] },
    forbiddenText: 'The libarchive Worker could not start',
    forbiddenTextStableMs: 31000,
  },
  {
    name: 'Email EML',
    fileName: '12-email.eml',
    match: { selector: '.email-viewer' },
  },
  {
    name: 'Email MSG',
    fileName: '13-email-msg.msg',
    match: { selector: '.email-viewer' },
  },
  {
    name: 'EDA GDS',
    fileName: '14-eda-gds.gds',
    match: { selectors: ['.eda-viewer', '.eda-layout-webgl'] },
  },
  {
    name: 'EDA OrCAD OLB',
    fileName: '15-eda-orcad.olb',
    match: { selector: '.eda-viewer' },
  },
  {
    name: 'CAD DXF',
    fileName: '16-cad-dxf.dxf',
    match: { selectors: ['.cad-shell', '.cad-viewer-canvas'] },
  },
  {
    name: 'CAD DWG',
    fileName: '17-cad-dwg.dwg',
    match: { selectors: ['.cad-shell', '.cad-viewer-canvas', '.cad-state[hidden]'] },
    forbiddenText: 'Failed to initialize LibreDWG WebAssembly',
    forbiddenTextStableMs: 5000,
  },
  {
    name: '3D GLTF',
    fileName: '18-model-gltf.gltf',
    match: { selectors: ['.model-viewer', '.model-viewer canvas'] },
  },
  {
    name: '3D STEP',
    fileName: '19-model-step.step',
    match: { selector: '.model-viewer' },
  },
  {
    name: 'GeoJSON',
    fileName: '20-geojson.geojson',
    match: { selector: '.geo-viewer' },
  },
  {
    name: 'KML',
    fileName: '21-kml.kml',
    match: { selector: '.geo-viewer' },
  },
  {
    name: 'Excalidraw',
    fileName: '22-excalidraw.excalidraw',
    match: { selector: '.drawing-viewer' },
  },
  {
    name: 'draw.io',
    fileName: '23-drawio.drawio',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'Mermaid',
    fileName: '24-mermaid.mermaid',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'PlantUML',
    fileName: '25-plantuml.plantuml',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'XMind',
    fileName: '26-xmind.xmind',
    match: { selector: '.xmind-viewer' },
  },
  {
    name: 'EPUB',
    fileName: '27-epub.epub',
    match: { selector: '.epub-viewer' },
  },
  {
    name: 'UMD',
    fileName: '28-umd.umd',
    match: { selector: '.umd-viewer' },
  },
  {
    name: 'Image PNG',
    fileName: '29-image-png.png',
    match: { selector: '.image-viewer' },
  },
  {
    name: 'Image SVG',
    fileName: '30-image-svg.svg',
    match: { selector: '.image-viewer' },
  },
  {
    name: 'Markdown',
    fileName: '31-markdown.md',
    match: { selector: '.markdown-viewer' },
  },
  {
    name: 'Code TypeScript',
    fileName: '32-code-typescript.ts',
    match: { selector: '.code-viewer' },
  },
  {
    name: 'Video MP4',
    fileName: '33-video.mp4',
    match: { selector: 'video' },
  },
  {
    name: 'Audio MP3',
    fileName: '34-audio.mp3',
    match: { selector: 'audio' },
  },
  {
    name: 'Data Asset SQLite',
    fileName: '35-data-sqlite.sqlite',
    match: { selector: '.data-viewer' },
  },
  {
    name: 'Data Asset WASM',
    fileName: '36-data-wasm.wasm',
    match: { text: 'WebAssembly.Module' },
  },
  {
    name: 'PSD',
    fileName: '37-psd.psd',
    match: { selector: '.psd-viewer' },
  },
];

let samplesByName;

test.beforeAll(async ({ request }) => {
  samplesByName = await listSamples(request);
});

for (const sampleCase of sampleCases) {
  test(`opens ${sampleCase.name} sample through fileviewer`, async ({ page }) => {
    const sample = samplesByName.get(sampleCase.fileName);
    expect(sample, `${sampleCase.fileName} should exist in ${sampleDir}`).toBeTruthy();

    await login(page);
    const frame = await openSampleById(page, sample.fileId);
    await waitForDeepMatch(frame, sampleCase.match, 90000);

    if (sampleCase.visibleText) {
      await waitForVisibleDeepText(frame, sampleCase.visibleText, 90000);
    }

    if (sampleCase.forbiddenText) {
      if (sampleCase.forbiddenTextStableMs) {
        await frame.waitForTimeout(sampleCase.forbiddenTextStableMs);
      }
      expect(await collectDeepText(frame)).not.toContain(sampleCase.forbiddenText);
    }
  });
}

async function listSamples(request) {
  const sampleUrl = `${baseURL}/remote.php/dav/files/${encodeURIComponent(username)}${sampleDir.split('/').map(encodeURIComponent).join('/')}/`;
  const response = await request.fetch(sampleUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: authorizationHeader(),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:prop>
    <d:getcontenttype />
    <d:getcontentlength />
    <oc:fileid />
  </d:prop>
</d:propfind>`,
  });
  expect(response.ok()).toBeTruthy();

  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const samples = new Map();
  for (const item of Array.from(xml.getElementsByTagNameNS('DAV:', 'response'))) {
    const href = getText(item, 'DAV:', 'href');
    if (!href || href.endsWith('/')) {
      continue;
    }

    const fileName = decodeURIComponent(href.split('/').pop() || '');
    const fileId = getText(item, 'http://owncloud.org/ns', 'fileid');
    if (!fileName || !fileId) {
      continue;
    }

    samples.set(fileName, {
      fileId,
      mime: getText(item, 'DAV:', 'getcontenttype'),
      size: Number(getText(item, 'DAV:', 'getcontentlength') || 0),
    });
  }

  return samples;
}

function getText(element, namespace, localName) {
  const node = element.getElementsByTagNameNS(namespace, localName).item(0);
  return node?.textContent || '';
}

function authorizationHeader() {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
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

async function openSampleById(page, fileId) {
  const directUrl = new URL(`/apps/files/files/${encodeURIComponent(fileId)}`, baseURL);
  directUrl.searchParams.set('dir', sampleDir);
  directUrl.searchParams.set('editing', 'false');
  directUrl.searchParams.set('openfile', 'true');
  await page.goto(directUrl.href);
  await dismissFirstRunWizard(page);
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
