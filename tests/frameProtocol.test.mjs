import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SANDBOX,
  FRAME_CLOSE_REQUEST_MESSAGE,
  FRAME_LOAD_MESSAGE,
  FRAME_READY_MESSAGE,
  createFrameLoadMessage,
  isFrameMessage,
  resolveFrameSandbox,
  serializeError,
} from '../src/frameProtocol.js';

test('default iframe sandbox keeps the child in an opaque origin', () => {
  assert.match(DEFAULT_SANDBOX, /allow-scripts/);
  assert.doesNotMatch(DEFAULT_SANDBOX, /allow-same-origin/);
});

test('EPUB sandbox adds same-origin access for epub.js chapter iframes', () => {
  const resolvedSandbox = resolveFrameSandbox(DEFAULT_SANDBOX, 'epub');

  assert.match(resolvedSandbox, /allow-scripts/);
  assert.match(resolvedSandbox, /allow-same-origin/);
});

test('non-EPUB sandbox remains unchanged', () => {
  assert.equal(resolveFrameSandbox(DEFAULT_SANDBOX, 'pdf'), DEFAULT_SANDBOX);
});

test('sandbox resolver does not duplicate same-origin token', () => {
  const resolvedSandbox = resolveFrameSandbox(`${DEFAULT_SANDBOX} allow-same-origin`, 'epub');

  assert.equal(resolvedSandbox.match(/allow-same-origin/g)?.length, 1);
});

test('frame load message carries only the explicit channel and file metadata', () => {
  const blob = new Blob(['hello'], { type: 'application/pdf' });
  const message = createFrameLoadMessage({
    channel: 'abc123',
    blob,
    filename: 'report.pdf',
    mime: 'application/pdf',
    size: 5,
  });

  assert.equal(message.type, FRAME_LOAD_MESSAGE);
  assert.equal(message.channel, 'abc123');
  assert.equal(message.file, blob);
  assert.equal(message.filename, 'report.pdf');
  assert.equal(message.mime, 'application/pdf');
  assert.equal(message.size, 5);
  assert.deepEqual(Object.keys(message).sort(), [
    'channel',
    'file',
    'filename',
    'mime',
    'size',
    'type',
  ]);
});

test('frame load message carries geo renderer options when configured', () => {
  const blob = new Blob(['route'], { type: 'application/vnd.google-earth.kml+xml' });
  const geo = {
    basemap: 'openfreemap-liberty',
  };
  const message = createFrameLoadMessage({
    channel: 'geo123',
    blob,
    filename: 'route.kml',
    mime: 'application/vnd.google-earth.kml+xml',
    size: 5,
    geo,
  });

  assert.equal(message.type, FRAME_LOAD_MESSAGE);
  assert.equal(message.geo, geo);
});

test('frame message guard requires the matching channel', () => {
  assert.equal(isFrameMessage({ type: FRAME_READY_MESSAGE, channel: 'abc123' }, 'abc123'), true);
  assert.equal(isFrameMessage({ type: FRAME_CLOSE_REQUEST_MESSAGE, channel: 'abc123' }, 'abc123'), true);
  assert.equal(isFrameMessage({ type: FRAME_READY_MESSAGE, channel: 'other' }, 'abc123'), false);
  assert.equal(isFrameMessage({ type: FRAME_READY_MESSAGE }, 'abc123'), false);
  assert.equal(isFrameMessage(null, 'abc123'), false);
});

test('structured-cloned frame errors preserve their name and message', () => {
  assert.deepEqual(serializeError({
    name: 'ParserError',
    message: 'The parser rejected the file.',
  }), {
    name: 'ParserError',
    message: 'The parser rejected the file.',
  });
  assert.deepEqual(serializeError({ message: 'No error name.' }), {
    name: 'Error',
    message: 'No error name.',
  });
});
