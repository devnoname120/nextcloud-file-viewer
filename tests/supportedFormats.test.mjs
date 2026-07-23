import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	SUPPORTED_EXTENSIONS,
	SUPPORTED_FORMATS,
} from '../src/supportedFormats.generated.js';

test('supported extension list includes representative Flyfish renderer formats', () => {
  for (const extension of ['pdf', 'docx', 'xlsx', 'tsv', 'ppt', 'pptx', 'zip', 'dwg', 'epub', 'svg', 'mp4', 'mp3', 'md']) {
    assert.ok(SUPPORTED_EXTENSIONS.includes(extension), `${extension} should be supported`);
  }
});

test('every supported extension has one stable app-specific format definition', () => {
	assert.equal(SUPPORTED_FORMATS.length, SUPPORTED_EXTENSIONS.length);
	assert.equal(new Set(SUPPORTED_FORMATS.map(format => format.extension)).size, SUPPORTED_FORMATS.length);
	assert.equal(new Set(SUPPORTED_FORMATS.map(format => format.id)).size, SUPPORTED_FORMATS.length);

	for (const format of SUPPORTED_FORMATS) {
		assert.equal(format.id, `format:${format.extension}`);
		assert.ok(format.label);
		assert.ok(format.category);
		assert.ok(format.categoryLabel);
	}
});

test('representative aliases have human-readable labels while retaining distinct stable IDs', () => {
	const formatsByExtension = Object.fromEntries(
		SUPPORTED_FORMATS.map(format => [format.extension, format]),
	);

	assert.equal(formatsByExtension.jpg.label, 'JPEG');
	assert.equal(formatsByExtension.jpeg.label, 'JPEG');
	assert.equal(formatsByExtension.md.label, 'Markdown');
	assert.equal(formatsByExtension.markdown.label, 'Markdown');
	assert.equal(formatsByExtension.md.category, 'code');
	assert.equal(formatsByExtension.markdown.category, 'code');
	assert.equal(formatsByExtension.md.categoryLabel, 'Code and text');
	assert.equal(formatsByExtension.markdown.categoryLabel, 'Code and text');
	assert.equal(formatsByExtension.epub.label, 'EPUB');
	assert.equal(formatsByExtension.ppt.label, 'PPT');
	assert.equal(formatsByExtension.tsv.label, 'TSV');
	assert.notEqual(formatsByExtension.jpg.id, formatsByExtension.jpeg.id);
});

test('generated PHP supported format inventory mirrors the JavaScript definitions', async () => {
	const phpSource = await readFile('lib/Generated/SupportedFormats.php', 'utf8');

	for (const extension of ['pdf', 'jpg', 'jpeg', 'md', 'markdown', 'epub', 'ppt', 'tsv', 'dwg']) {
		assert.ok(phpSource.includes(`'id' => 'format:${extension}'`));
		assert.ok(phpSource.includes(`'extension' => '${extension}'`));
	}
	assert.doesNotMatch(phpSource, /application\/pdf|image\/jpeg|text\/markdown/);
});
