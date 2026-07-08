import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORMAT_GROUPS,
  createMimeGroups,
  filterMimeGroups,
  flattenMimeGroups,
} from '../src/formatGroups.js';
import {
  MIMES_BY_EXTENSION,
  SUPPORTED_MIMES,
} from '../src/supportedFormats.generated.js';

test('format groups use Flyfish categories with legacy Word merged into Word', () => {
  assert.deepEqual(FORMAT_GROUPS.map(group => group.label), [
    'Word',
    'Compatible documents',
    'Excel',
    'Excel-compatible',
    'PowerPoint',
    'PDF',
    'OFD',
    'Typst',
    'Archives',
    'Email',
    'EDA',
    'CAD',
    'Geospatial data',
    '3D models',
    'XMind mind maps',
    'Excalidraw',
    'draw.io',
    'Mermaid',
    'PlantUML',
    'EPUB',
    'UMD ebook',
    'Markdown',
    'Images',
    'Source and text',
    'Audio',
    'Video',
    'Fonts, design assets, and data',
  ]);

  assert.deepEqual(FORMAT_GROUPS.find(group => group.label === 'Word')?.extensions, [
    'docx',
    'docm',
    'dotx',
    'dotm',
    'doc',
    'dot',
  ]);
});

test('MIME groups cover every supported MIME once', () => {
  const groups = createMimeGroups(SUPPORTED_MIMES, MIMES_BY_EXTENSION);
  const flattenedMimes = flattenMimeGroups(groups);

  assert.deepEqual([...flattenedMimes].sort(), [...SUPPORTED_MIMES].sort());
  assert.equal(new Set(flattenedMimes).size, flattenedMimes.length);

  assert.ok(groups.find(group => group.label === 'PDF')?.mimes.includes('application/pdf'));
  assert.ok(groups.find(group => group.label === 'Word')?.mimes.includes('application/msword'));
  assert.ok(groups.find(group => group.label === 'CAD')?.mimes.includes('image/vnd.dwg'));
  assert.ok(groups.find(group => group.label === 'Source and text')?.mimes.includes('text/x-typescript'));
  assert.ok(groups.find(group => group.label === 'Generic fallback')?.mimes.includes('application/octet-stream'));
});

test('MIME group filtering matches category names, extensions, and MIME values', () => {
  const groups = createMimeGroups(SUPPORTED_MIMES, MIMES_BY_EXTENSION);

  assert.deepEqual(filterMimeGroups(groups, 'geospatial').map(group => group.label), ['Geospatial data']);
  assert.ok(flattenMimeGroups(filterMimeGroups(groups, 'dwg')).includes('image/vnd.dwg'));
  assert.ok(flattenMimeGroups(filterMimeGroups(groups, 'application/pdf')).includes('application/pdf'));
  assert.ok(flattenMimeGroups(filterMimeGroups(groups, 'typescript')).includes('text/x-typescript'));
});
