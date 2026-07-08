import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFileSource, resolveFilename, resolveFileExtension } from '../src/sourceResolution.js';

test('source resolution prefers explicit viewer source, then DAV path, then path', () => {
  assert.equal(
    resolveFileSource({ source: '/index.php/apps/files/preview-service-worker', davPath: '/remote.php/dav/files/a/report.pdf' }),
    '/index.php/apps/files/preview-service-worker'
  );
  assert.equal(
    resolveFileSource({ davPath: '/remote.php/dav/files/a/report.pdf', path: '/files/report.pdf' }),
    '/remote.php/dav/files/a/report.pdf'
  );
  assert.equal(resolveFileSource({ path: '/files/report.pdf' }), '/files/report.pdf');
});

test('source resolution rejects missing file URLs', () => {
  assert.throws(() => resolveFileSource({}), /No usable file URL/);
});

test('filename and extension resolution use filename, basename, then URL path', () => {
  assert.equal(resolveFilename({ filename: 'Quarterly.PDF', source: '/ignored.docx' }), 'Quarterly.PDF');
  assert.equal(resolveFilename({ filename: '/File Viewer samples/11-archive.zip', source: '/ignored.docx' }), '11-archive.zip');
  assert.equal(resolveFilename({ basename: 'nested\\diagram.drawio', source: '/ignored.docx' }), 'diagram.drawio');
  assert.equal(resolveFilename({ basename: 'diagram.drawio', source: '/ignored.docx' }), 'diagram.drawio');
  assert.equal(resolveFilename({ source: '/remote.php/dav/files/u/folder/Report.docx?downloadStartSecret=1' }), 'Report.docx');
  assert.equal(resolveFileExtension('Quarterly.PDF'), 'pdf');
  assert.equal(resolveFileExtension('archive.tar.gz'), 'gz');
});

test('public file share root paths use the shared filename fallback', () => {
  assert.equal(
    resolveFilename({
      filename: '/',
      basename: '',
      source: 'http://nextcloud.test/public.php/dav/files/public-token/',
      davPath: 'http://nextcloud.test/public.php/dav/files/public-token/',
      fallbackFilename: 'shared-note.md',
    }),
    'shared-note.md'
  );
});
