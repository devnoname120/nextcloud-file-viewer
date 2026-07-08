import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterEnabledMimes,
  normalizeDisabledMimes,
} from '../src/mimeSettings.js';

test('MIME settings normalize disabled MIME values against the supported list', () => {
  assert.deepEqual(
    normalizeDisabledMimes(
      ['application/pdf', 'unknown/type', ' text/markdown ', 'application/pdf', 123],
      ['text/markdown', 'application/pdf', 'image/png'],
    ),
    ['application/pdf', 'text/markdown'],
  );
});

test('MIME settings keep only enabled MIME values in registration order', () => {
  assert.deepEqual(
    filterEnabledMimes(
      ['text/markdown', 'application/pdf', 'image/png'],
      ['application/pdf', 'unknown/type'],
    ),
    ['text/markdown', 'image/png'],
  );
});

test('MIME settings can disable every supported MIME type', () => {
  assert.deepEqual(
    filterEnabledMimes(
      ['text/markdown', 'application/pdf'],
      ['application/pdf', 'text/markdown'],
    ),
    [],
  );
});
