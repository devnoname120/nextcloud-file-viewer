import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'mime-types';

import {
  DEFAULT_FRAME_SANDBOX,
  collectDeepText,
  createFileSampleFromPath,
  loadFileIntoSandbox,
  mountSandboxedFrame,
  startStaticServer,
  waitForDeepMatch,
  waitForNextWorkerInfo,
  waitForVisibleDeepText,
} from './helpers.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultExamplesDir = '/tmp/nextcloud-file-viewer-refs-file-viewer/apps/viewer-demo/public/example';
const examplesDir = path.resolve(process.env.FILE_VIEWER_EXAMPLES_DIR || defaultExamplesDir);
const hasExamples = existsSync(examplesDir);
let server;

const mimeOverrides = new Map([
  ['.3mf', 'model/3mf'],
  ['.doc', 'application/msword'],
  ['.dot', 'application/msword'],
  ['.dra', 'application/octet-stream'],
  ['.drawio', 'application/vnd.jgraph.mxfile'],
  ['.dwf', 'model/vnd.dwf'],
  ['.dwfx', 'model/vnd.dwfx+xps'],
  ['.dwg', 'image/vnd.dwg'],
  ['.dxf', 'image/vnd.dxf'],
  ['.excalidraw', 'application/vnd.excalidraw+json'],
  ['.fods', 'application/vnd.oasis.opendocument.spreadsheet-flat-xml'],
  ['.gds', 'application/octet-stream'],
  ['.gpx', 'application/gpx+xml'],
  ['.mmd', 'text/vnd.mermaid'],
  ['.oas', 'application/octet-stream'],
  ['.oasis', 'application/octet-stream'],
  ['.ofd', 'application/ofd'],
  ['.olb', 'application/octet-stream'],
  ['.plantuml', 'text/x-plantuml'],
  ['.psd', 'image/vnd.adobe.photoshop'],
  ['.sqlite', 'application/vnd.sqlite3'],
  ['.step', 'model/step'],
  ['.typ', 'text/vnd.typst'],
  ['.umd', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
  ['.xmind', 'application/vnd.xmind.workbook'],
]);

const exampleCases = [
  {
    name: 'Word OpenXML DOCX',
    file: 'word.docx',
    match: { selectors: ['.docx-fit-viewer', '.docx-page-frame', '.docx-flow-frame'] },
  },
  {
    name: 'Word binary DOC',
    file: 'test.doc',
    match: { selector: '.msdoc-zoom-viewer' },
  },
  {
    name: 'PowerPoint PPTX',
    file: 'ppt.pptx',
    match: { selector: '.pptx-viewer-shell' },
  },
  {
    name: 'OpenDocument ODT',
    file: 'document.odt',
    match: { selector: '.odf-viewer' },
  },
  {
    name: 'OpenDocument ODP',
    file: 'slides.odp',
    match: { selector: '.odf-viewer' },
  },
  {
    name: 'Spreadsheet XLSX',
    file: 'excel.xlsx',
    match: { selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'] },
  },
  {
    name: 'Spreadsheet XLS',
    file: 'excel.xls',
    match: { selectors: ['.excel-wrapper canvas', '.e-virt-table-canvas'] },
    visibleText: '总氨产量',
  },
  {
    name: 'PDF',
    file: 'pdf.pdf',
    match: { selector: 'canvas' },
  },
  {
    name: 'OFD',
    file: 'ofd.ofd',
    match: { selectors: ['.ofd-viewer', '.ofd-page-frame', '.ofd-page'] },
  },
  {
    name: 'Typst',
    file: 'report.typ',
    match: { selectors: ['canvas', 'svg'] },
  },
  {
    name: 'Archive ZIP',
    file: 'archive.zip',
    filename: '/File Viewer samples/11-archive.zip',
    match: { texts: ['sample.pdf', 'markdown.md'], selectors: ['.archive-shell', '.archive-entry'] },
    forbiddenText: 'The libarchive Worker could not start',
    forbiddenTextStableMs: 31000,
  },
  {
    name: 'Email EML',
    file: 'sample.eml',
    match: { selector: '.email-viewer' },
  },
  {
    name: 'Email MSG',
    file: 'sample.msg',
    match: { selector: '.email-viewer' },
  },
  {
    name: 'EDA GDS',
    file: 'layout.gds',
    match: { selectors: ['.eda-viewer', '.eda-layout-webgl'] },
  },
  {
    name: 'EDA OrCAD OLB',
    file: 'sample.olb',
    match: { selector: '.eda-viewer' },
  },
  {
    name: 'CAD DXF',
    file: 'drawing.dxf',
    match: { selectors: ['.cad-shell', '.cad-viewer-canvas'] },
  },
  {
    name: 'CAD DWG',
    file: 'sample.dwg',
    match: { selectors: ['.cad-shell', '.cad-viewer-canvas'] },
  },
  {
    name: '3D GLTF',
    file: 'model.gltf',
    match: { selectors: ['.model-viewer', '.model-viewer canvas'] },
  },
  {
    name: '3D STEP',
    file: 'model.step',
    match: { selector: '.model-viewer' },
  },
  {
    name: 'GeoJSON',
    file: 'map.geojson',
    match: { selector: '.geo-viewer' },
  },
  {
    name: 'KML',
    file: 'route.kml',
    match: { selector: '.geo-viewer' },
  },
  {
    name: 'Excalidraw',
    file: 'flow.excalidraw',
    match: { selector: '.drawing-viewer' },
  },
  {
    name: 'draw.io',
    file: 'process.drawio',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'Mermaid',
    file: 'architecture.mermaid',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'PlantUML',
    file: 'sequence.plantuml',
    match: { selectors: ['.drawing-viewer', '.drawing-diagram-svg'] },
  },
  {
    name: 'XMind',
    file: 'mindmap.xmind',
    match: { selector: '.xmind-viewer' },
  },
  {
    name: 'EPUB',
    file: 'book.epub',
    match: { selector: '.epub-viewer' },
  },
  {
    name: 'UMD',
    file: 'book.umd',
    match: { selector: '.umd-viewer' },
  },
  {
    name: 'Image PNG',
    file: 'pic.png',
    match: { selector: '.image-viewer' },
  },
  {
    name: 'Image SVG',
    file: 'vector.svg',
    match: { selector: '.image-viewer' },
  },
  {
    name: 'Markdown',
    file: 'markdown.md',
    match: { selector: '.markdown-viewer' },
  },
  {
    name: 'Code TypeScript',
    file: 'code.ts',
    match: { selector: '.code-viewer' },
  },
  {
    name: 'Video MP4',
    file: 'video.mp4',
    match: { selector: 'video' },
  },
  {
    name: 'Audio MP3',
    file: 'audio.mp3',
    match: { selector: 'audio' },
  },
  {
    name: 'Data Asset SQLite',
    file: 'sample.sqlite',
    match: { selector: '.data-viewer' },
  },
  {
    name: 'Data Asset WASM',
    file: 'module.wasm',
    match: { text: 'WebAssembly.Module' },
  },
  {
    name: 'PSD',
    file: 'design.psd',
    match: { selectors: ['.psd-viewer', '.data-viewer'] },
  },
];

test.describe('upstream Flyfish viewer examples', () => {
  test.skip(!hasExamples, `FILE_VIEWER_EXAMPLES_DIR does not exist: ${examplesDir}`);
  test.describe.configure({ timeout: 120000 });

  test.beforeAll(async () => {
    server = await startStaticServer(rootDir);
  });

  test.afterAll(async () => {
    await server?.close();
  });

  for (const exampleCase of exampleCases) {
    test(`renders ${exampleCase.name} example`, async ({ page }) => {
      const filePath = path.join(examplesDir, exampleCase.file);
      expect(existsSync(filePath), `${exampleCase.file} should exist in ${examplesDir}`).toBeTruthy();

      const channel = `upstream-${exampleCase.file.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
      const extension = path.extname(exampleCase.file).toLowerCase().slice(1);
      const frame = await mountSandboxedFrame(page, server, channel, {
        sandbox: extension === 'epub'
          ? `${DEFAULT_FRAME_SANDBOX} allow-same-origin`
          : DEFAULT_FRAME_SANDBOX,
      });
      const workerInfoPromise = exampleCase.name === 'CAD DWG'
        ? waitForNextWorkerInfo(page, 90000)
        : null;

      await loadFileIntoSandbox(page, channel, await createFileSampleFromPath(filePath, {
        filename: exampleCase.filename,
        mime: mimeForFile(filePath),
      }), 90000);
      await waitForDeepMatch(frame, exampleCase.match, 90000);
      if (exampleCase.visibleText) {
        await waitForVisibleDeepText(frame, exampleCase.visibleText, 90000);
      }
      if (exampleCase.forbiddenText) {
        if (exampleCase.forbiddenTextStableMs) {
          await frame.waitForTimeout(exampleCase.forbiddenTextStableMs);
        }
        expect(await collectDeepText(frame)).not.toContain(exampleCase.forbiddenText);
      }
      if (workerInfoPromise) {
        const workerInfo = await workerInfoPromise;
        expect(workerInfo.url).toMatch(/^blob:null\//);
        expect(workerInfo.origin).toBe('null');
        expect(await page.evaluate(() => window.__fileViewerWorkers.size)).toBe(0);
        expect(await collectDeepText(frame)).not.toContain('DWG worker failed');
      }
    });
  }
});

function mimeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return mimeOverrides.get(extension) || lookup(filePath) || 'application/octet-stream';
}
