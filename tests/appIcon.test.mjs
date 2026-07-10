import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { DOMParser } from '@xmldom/xmldom';

const ALLOWED_ELEMENTS = new Set(['svg', 'path']);

function parseSvg(source) {
  const errors = [];
  const document = new DOMParser({
    onError: (level, message) => errors.push(`${level}: ${message}`),
  }).parseFromString(source, 'image/svg+xml');

  assert.deepEqual(errors, []);
  assert.equal(document.documentElement.localName, 'svg');
  return document;
}

test('app icon remains compatible with Nextcloud icon rendering', async () => {
  const source = await readFile('img/app.svg', 'utf8');
  const document = parseSvg(source);
  const root = document.documentElement;
  const elements = [...document.getElementsByTagName('*')];

  assert.ok(Buffer.byteLength(source) < 1024, 'app icon should remain a compact glyph');
  assert.equal(root.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(root.getAttribute('fill'), '#fff');
  assert.equal(document.getElementsByTagName('path').length, 1);
  assert.deepEqual(
    [...new Set(elements.map((element) => element.localName))],
    ['svg', 'path'],
  );
  assert.ok(elements.every((element) => ALLOWED_ELEMENTS.has(element.localName)));
  assert.ok(elements.every((element) => !element.hasAttribute('style')));
  assert.ok(elements.every((element) => !element.hasAttribute('stroke')));

  const nextcloud33Sidebar = source.replaceAll(
    /fill="#(fff|ffffff)([a-z0-9]{1,2})?"/ig,
    'fill="currentColor"',
  );
  assert.equal(parseSvg(nextcloud33Sidebar).documentElement.getAttribute('fill'), 'currentColor');

  const nextcloud34List = source
    .replaceAll(/(?<=[";])fill:\s?(#fff(fff)?|white)(;|(?="))/gi, '')
    .replaceAll(/(?<=\s)fill="[^"]+"/gi, '')
    .replaceAll(/(?<=\s)color="[^"]+"/gi, '');
  const nextcloud34Document = parseSvg(nextcloud34List);
  assert.equal(nextcloud34Document.documentElement.hasAttribute('fill'), false);
  assert.equal(nextcloud34Document.getElementsByTagName('path').length, 1);
});

test('admin settings icon uses the same glyph in a dark source color', async () => {
  const [appSource, adminSource] = await Promise.all([
    readFile('img/app.svg', 'utf8'),
    readFile('img/app-dark.svg', 'utf8'),
  ]);
  const appDocument = parseSvg(appSource);
  const adminDocument = parseSvg(adminSource);

  assert.equal(adminDocument.documentElement.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(adminDocument.documentElement.getAttribute('fill'), '#000');
  assert.equal(
    adminDocument.getElementsByTagName('path')[0].getAttribute('d'),
    appDocument.getElementsByTagName('path')[0].getAttribute('d'),
  );
});
