import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startStaticServer } from './e2e/helpers.mjs';

function requestPath(origin, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${origin}${pathname}`, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ code: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
  });
}

test('test asset server confines assets and runtime aliases to fixed canonical roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fileviewer-test-assets-'));
  let server;
  try {
    await mkdir(join(root, 'viewer/file-viewer/nested'), { recursive: true });
    for (const name of ['index.html', 'epub-bootstrap.html', 'frame.js', 'epub-renderer-gate.js']) {
      await writeFile(join(root, 'viewer', name), `fixture ${name}`);
    }
    await writeFile(join(root, 'viewer/file-viewer/nested/runtime.js'), 'bundled fixture');
    await writeFile(join(root, 'private-config.txt'), 'private fixture');
    await symlink(join(root, 'private-config.txt'), join(root, 'viewer/file-viewer/outside.txt'));
    server = await startStaticServer(root);
    const allowed = await requestPath(server.origin, '/apps/fileviewer/assets/nested/runtime.js');
    assert.equal(allowed.code, 200);
    assert.equal(allowed.body, 'bundled fixture');
    assert.equal(allowed.headers['access-control-allow-origin'], 'null');
    assert.equal((await requestPath(server.origin, '/apps/fileviewer/assets/runtime/frame.js')).code, 200);
    assert.equal((await requestPath(server.origin, '/viewer/index.html')).code, 200);

    const denied = [
      '/private-config.txt',
      '/apps/fileviewer/assets/%2e%2e/%2e%2e/private-config.txt',
      '/apps/fileviewer/assets/%2fprivate-config.txt',
      '/apps/fileviewer/assets/%5cprivate-config.txt',
      '/apps/fileviewer/assets/%00runtime.js',
      '/apps/fileviewer/assets/%zz',
      '/apps/fileviewer/assets/outside.txt',
      '/viewer/%2e%2e/private-config.txt',
    ];
    for (const pathname of denied) {
      const result = await requestPath(server.origin, pathname);
      assert.ok([400, 403, 404].includes(result.code), `${pathname}: ${result.code}`);
      assert.ok(!result.body.includes('private fixture'));
      assert.equal(result.headers['access-control-allow-origin'], undefined);
    }
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
