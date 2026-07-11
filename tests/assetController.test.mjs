import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('asset controller serves worker assets with a WebAssembly-capable CSP', async () => {
  const source = await readFile(new URL('../lib/Controller/AssetController.php', import.meta.url), 'utf8');

  assert.match(source, /ContentSecurityPolicy/);
  assert.match(source, /setContentSecurityPolicy/);
  assert.match(source, /addAllowedScriptDomain\('\\'unsafe-eval\\''\)/);
  assert.match(source, /addAllowedConnectDomain\('\\'self\\''\)/);
  assert.match(source, /addAllowedWorkerSrcDomain\('\\'self\\''\)/);
  assert.match(source, /allowEvalWasm/);
  assert.match(source, /'runtime\/epub-renderer-gate\.js' => .*viewer\/epub-renderer-gate\.js/);
  assert.match(source, /'runtime\/frame\.js' => .*viewer\/frame\.js/);
  assert.match(source, /addHeader\('Access-Control-Allow-Origin', '\*'\)/);
  assert.match(source, /addHeader\('Cross-Origin-Resource-Policy', 'cross-origin'\)/);
});
