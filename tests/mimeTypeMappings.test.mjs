import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createMimeTypeMappings } from '../scripts/mime-type-mappings.mjs';
import { SUPPORTED_EXTENSIONS } from '../src/supportedFormats.generated.js';

test('every supported extension has one canonical non-generic MIME mapping', () => {
	const mappings = createMimeTypeMappings(SUPPORTED_EXTENSIONS);

	assert.equal(mappings.size, SUPPORTED_EXTENSIONS.length);
	assert.deepEqual([...mappings.keys()], [...SUPPORTED_EXTENSIONS].sort());
	for (const [extension, mapping] of mappings) {
		assert.ok(mapping.length >= 1 && mapping.length <= 2, extension);
		assert.match(mapping[0], /^[^/]+\/[^/]+$/, extension);
		assert.notEqual(mapping[0], 'application/octet-stream', extension);
	}
});

test('canonical mappings resolve known extension ambiguities for the viewer formats', () => {
	const mappings = createMimeTypeMappings(SUPPORTED_EXTENSIONS);

	assert.deepEqual(mappings.get('mmd'), ['application/vnd.mermaid', 'text/plain']);
	assert.deepEqual(mappings.get('oas'), ['application/x-oasis-layout']);
	assert.deepEqual(mappings.get('xar'), ['application/x-xar']);
	assert.deepEqual(mappings.get('3dm'), ['model/vnd.3dm']);
	assert.deepEqual(mappings.get('dra'), ['application/x-orcad-drawing']);
	assert.deepEqual(mappings.get('ts'), ['text/x-typescript']);
	assert.deepEqual(mappings.get('rs'), ['text/x-rust']);
	assert.deepEqual(mappings.get('xyz'), ['model/x-xyz']);
	assert.deepEqual(mappings.get('http'), ['text/x-http']);
	assert.deepEqual(mappings.get('ppt'), ['application/vnd.ms-powerpoint']);
	assert.deepEqual(mappings.get('tsv'), ['text/tab-separated-values']);
});

test('registered and active formats receive safe response MIME alternatives', () => {
	const mappings = createMimeTypeMappings(SUPPORTED_EXTENSIONS);

	assert.deepEqual(mappings.get('wasm'), ['application/wasm', 'application/octet-stream']);
	assert.deepEqual(mappings.get('typ'), ['text/vnd.typst', 'text/plain']);
	assert.deepEqual(mappings.get('mermaid'), ['application/vnd.mermaid', 'text/plain']);
	assert.deepEqual(mappings.get('html'), ['text/html', 'text/plain']);
	assert.deepEqual(mappings.get('svg'), ['image/svg+xml', 'text/plain']);
});

test('generated PHP MIME inventory mirrors the JavaScript mapping source', async () => {
	const mappings = createMimeTypeMappings(SUPPORTED_EXTENSIONS);
	const phpSource = await readFile('lib/Generated/MimeTypeMappings.php', 'utf8');

	for (const extension of ['dotm', 'typ', 'mmd', 'woff2', 'wasm', 'geojson', 'sqlite', 'parquet', 'jxl', 'avif', 'gltf', 'ifc']) {
		const mapping = mappings.get(extension);
		assert.ok(mapping);
		assert.ok(phpSource.includes(`'${extension}' => [`));
		for (const mime of mapping) {
			assert.ok(phpSource.includes(`'${mime}'`));
		}
	}
});
