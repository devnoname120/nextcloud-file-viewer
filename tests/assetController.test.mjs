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
});
