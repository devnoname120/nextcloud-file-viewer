import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as protocol from '../src/frameProtocol.js';

const source = process.env.FILE_VIEWER_COMPONENT_REF
  ? execFileSync('git', ['show', `${process.env.FILE_VIEWER_COMPONENT_REF}:src/main.js`], { encoding: 'utf8' })
  : readFileSync('src/main.js', 'utf8');
const start = source.indexOf('const FileViewerComponent = {');
const end = source.indexOf('\n};', start) + 3;
assert.ok(start >= 0 && end > start, 'The production Viewer component must be available');
const options = vm.runInNewContext(`${source.slice(start, end)}; FileViewerComponent`, protocol);

function port() {
  return { closed: false, close() { this.closed = true; }, removeEventListener() {}, postMessage() {} };
}

function component() {
  const instance = Object.assign(options.data(), {
    frameKindMode: protocol.DEFAULT_FRAME_KIND,
    frameHandshakePhase: 'connected',
    frameKind: protocol.DEFAULT_FRAME_KIND,
    frameSandbox: protocol.DEFAULT_SANDBOX,
    frameProfileSandboxMode: protocol.DEFAULT_SANDBOX,
    framePort: port(),
    $refs: { frame: {} },
    $emit() {},
  });
  for (const [name, method] of Object.entries(options.methods)) instance[name] = method.bind(instance);
  instance.loadFileIntoFrame = () => {};
  return instance;
}

function documentLoaded(instance) {
  instance.onFramePortMessage({
    target: instance.framePort,
    data: { type: protocol.FRAME_DOCUMENT_LOADED_MESSAGE, channel: instance.channel },
  });
}

function load(instance) {
  instance.onFrameLoad({ target: instance.$refs.frame });
}

for (const order of ['load-first', 'message-first']) {
  test(`initial frame load succeeds with ${order} delivery and later navigation disconnects`, () => {
    const instance = component();
    const originalPort = instance.framePort;
    if (order === 'load-first') { load(instance); documentLoaded(instance); }
    else { documentLoaded(instance); load(instance); }
    assert.equal(instance.frameBlocked, false);
    assert.equal(instance.error, null);
    assert.equal(instance.frameNavigationArmed, true);
    load(instance);
    assert.equal(instance.frameBlocked, true);
    assert.equal(instance.framePort, null);
    assert.equal(originalPort.closed, true);
    assert.match(instance.error.message, /navigated unexpectedly/);
  });
}

for (const reset of ['sandbox-switch', 'blocked-file-reopen']) {
  test(`a new frame after ${reset} receives its own initial-load allowance`, () => {
    const instance = component();
    load(instance);
    documentLoaded(instance);
    if (reset === 'sandbox-switch') {
      instance.frameKindMode = protocol.EPUB_FRAME_KIND;
      assert.equal(instance.ensureFrameSandbox(), true);
    } else {
      instance.blockFrame('Previous frame disconnected');
      instance.onFileChanged();
    }
    instance.framePort = port();
    instance.frameHandshakePhase = 'connected';
    documentLoaded(instance);
    load(instance);
    assert.equal(instance.frameBlocked, false);
    load(instance);
    assert.equal(instance.frameBlocked, true);
  });
}

test('a load from a replaced iframe cannot consume the new frame load allowance', () => {
  const instance = component();
  documentLoaded(instance);
  instance.onFrameLoad({ target: {} });
  load(instance);
  assert.equal(instance.frameBlocked, false);
  load(instance);
  assert.equal(instance.frameBlocked, true);
});

test('EPUB bootstrap navigation waits for its initial iframe load', () => {
  const instance = component();
  instance.framePort = null;
  instance.frameKindMode = protocol.EPUB_FRAME_KIND;
  instance.frameHandshakePhase = 'epub-bootstrap';
  instance.rendererSandbox = protocol.EPUB_RENDERER_SANDBOX;
  const commands = [];
  const attributes = new Map();
  instance.$refs.frame = {
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    contentWindow: { postMessage(message) { commands.push(message.type); } },
  };
  instance.handleEpubBootstrapReady(instance.$refs.frame, { ports: [] });
  assert.equal(commands.length, 0);
  load(instance);
  assert.deepEqual(commands, [protocol.EPUB_BOOTSTRAP_NAVIGATE_MESSAGE]);
  assert.equal(instance.frameHandshakePhase, 'epub-gate');
});

test('direct file transfer waits for both the initial load and the document handshake', () => {
  const instance = component();
  let loads = 0;
  instance.loadFileIntoFrame = () => { loads += 1; };
  instance.completeFrameConnection();
  assert.equal(loads, 0);
  documentLoaded(instance);
  assert.equal(loads, 0);
  load(instance);
  assert.equal(loads, 1);
  assert.equal(instance.frameNavigationArmed, true);
});

for (const order of ['load-first', 'message-first']) {
  test(`EPUB allows its final renderer load with ${order} delivery, then blocks navigation`, () => {
    const instance = component();
    instance.frameKindMode = protocol.EPUB_FRAME_KIND;
    instance.frameHandshakePhase = 'epub-renderer';
    instance.frameRuntimeReady = true;
    let connections = 0;
    instance.completeFrameConnection = () => {
      connections += 1;
      instance.frameHandshakePhase = 'connected';
    };
    load(instance); // The trusted HTTP bootstrap document.
    if (order === 'message-first') {
      documentLoaded(instance);
      assert.equal(connections, 0, 'The renderer load is still pending');
      load(instance);
    } else {
      load(instance);
      documentLoaded(instance);
    }
    assert.equal(instance.frameBlocked, false);
    assert.equal(connections, 1);
    assert.equal(instance.frameNavigationArmed, true);
    load(instance);
    assert.equal(instance.frameBlocked, true);
  });
}
