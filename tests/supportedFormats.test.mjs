import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MIMES_BY_EXTENSION,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIMES,
  UNREGISTERED_EXTENSIONS,
} from '../src/supportedFormats.generated.js';

test('supported extension list includes representative Flyfish renderer formats', () => {
  for (const extension of ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'dwg', 'epub', 'svg', 'mp4', 'mp3', 'md']) {
    assert.ok(SUPPORTED_EXTENSIONS.includes(extension), `${extension} should be supported`);
  }
});

test('registered MIME list covers representative Flyfish-supported formats', () => {
  for (const mime of [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'image/vnd.dwg',
    'application/epub+zip',
    'image/svg+xml',
    'video/mp4',
    'audio/mpeg',
    'text/markdown',
    'application/octet-stream',
  ]) {
    assert.ok(SUPPORTED_MIMES.includes(mime), `${mime} should be registered`);
  }
});

test('registration includes the generic MIME Nextcloud assigns to unknown supported extensions', () => {
  assert.equal(SUPPORTED_MIMES.includes('application/octet-stream'), true);
  assert.deepEqual(UNREGISTERED_EXTENSIONS, []);
});

test('TypeScript is registered as code, not MPEG transport stream video', () => {
  assert.deepEqual(MIMES_BY_EXTENSION.ts, [
    'text/x-typescript',
    'application/typescript',
  ]);
  assert.equal(SUPPORTED_MIMES.includes('video/mp2t'), false);
});

test('PSD registration includes the MIME assigned by Nextcloud', () => {
  assert.ok(SUPPORTED_EXTENSIONS.includes('psd'));
  assert.ok(SUPPORTED_MIMES.includes('application/x-photoshop'));
  assert.ok(MIMES_BY_EXTENSION.psd.includes('application/x-photoshop'));
});

test('generated PHP supported MIME class mirrors the JS registration list', async () => {
  const phpSource = await readFile('lib/Service/SupportedMimes.php', 'utf8');

  for (const mime of ['application/pdf', 'text/markdown', 'application/octet-stream']) {
    assert.ok(phpSource.includes(`'${mime}'`), `${mime} should be present in the PHP MIME list`);
  }
});
