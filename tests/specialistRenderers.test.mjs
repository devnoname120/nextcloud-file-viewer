import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EXPECTED_SPECIALISTS = Object.freeze({
  chm: ['chm'],
  binary: ['bin', 'hex', 'elf', 'exe', 'dll', 'class', 'macho'],
  design: ['psd', 'psb', 'pdd', 'psdt', 'ai', 'ait', 'eps', 'ps', 'idml', 'icml', 'idms', 'inx', 'fla', 'xfl', 'xd', 'indd', 'indt', 'ase', 'aco', 'abr', 'csh', 'pat', 'grd', 'asl'],
  dicom: ['dcm', 'dicom'],
  rtf: ['rtf'],
  signature: ['p7m', 'p7s', 'p7c', 'p7b', 'pkcs7', 'cms', 'cmsc', 'tsd', 'tst', 'tsq', 'tsr', 'asics', 'scs', 'asice', 'sce', 'ers', 'asc', 'sig', 'pgp', 'gpg', 'jws'],
});

test('frame lazily extends web-full for every specialist renderer family', async () => {
  const frameSource = await readFile('viewer/frame.js', 'utf8');

  assert.match(frameSource, /rendererMode\s*=\s*specialistRendererMode\s*===\s*'replace'\s*\?\s*'replace'\s*:\s*'extend'/);
  assert.match(frameSource, /renderers\s*=\s*\[specialistRenderer\]/);

  for (const [family, extensions] of Object.entries(EXPECTED_SPECIALISTS)) {
    assert.ok(frameSource.includes(`specialists/${family}.mjs`), family);
    for (const extension of extensions) {
      assert.match(frameSource, new RegExp(`['"]${extension}['"]`), `${family}:${extension}`);
    }
  }
});

test('specialist renderer build has one explicit entry per family', async () => {
  const viteConfig = await readFile('vite.specialist.config.js', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  for (const family of Object.keys(EXPECTED_SPECIALISTS)) {
    assert.ok(viteConfig.includes(`${family}:`), family);
    assert.ok(viteConfig.includes(`src/specialistRenderers/${family}.js`), family);
  }
  assert.match(viteConfig, /preserveEntrySignatures:\s*'strict'/);
  assert.match(viteConfig, /worker:\s*\{/);
  assert.match(viteConfig, /entryFileNames:\s*'assets\/\[name\]\.js'/);
  assert.match(packageJson.scripts.build, /build:specialists/);
});

test('specialist module workers are preloaded into opaque sandbox-local blobs', async () => {
  const frameSource = await readFile('viewer/frame.js', 'utf8');

  for (const workerPath of [
    'vendor/chm/chm.worker.js',
    'specialists/assets/binary.worker.js',
    'specialists/assets/decode-worker.js',
    'specialists/assets/signature.worker.js',
    'specialists/assets/container.worker.js',
    'vendor/design/photoshop.worker.js',
    'vendor/design/illustrator-pgf.worker.js',
    'vendor/design/adobe-container.worker.js',
    'vendor/design/adobe-resource.worker.js',
    'vendor/design/postscript.worker.js',
    'vendor/design/idml.worker.js',
  ]) {
    assert.ok(frameSource.includes(workerPath), workerPath);
  }

  assert.match(frameSource, /prepareSandboxWorkerPath/);
  assert.doesNotMatch(frameSource, /isTrustedSpecialistModuleWorker/);
});
