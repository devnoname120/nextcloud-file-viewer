import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('frame communication requires a transferred MessagePort instead of iframe load readiness', async () => {
  const [mainSource, frameSource] = await Promise.all([
    readFile('src/main.js', 'utf8'),
    readFile('viewer/frame.js', 'utf8'),
  ]);

  assert.match(mainSource, /created\(\) \{[\s\S]*?window\.addEventListener\('message', this\.onFrameMessage\)/);
  assert.match(mainSource, /const ports = Array\.from\(event\.ports \|\| \[\]\)/);
  assert.match(mainSource, /this\.attachFramePort\(port\)/);
  assert.match(mainSource, /if \(this\.framePort\) \{[\s\S]*?port\.close\(\);[\s\S]*?return;[\s\S]*?FRAME_READY_MESSAGE/);
  assert.match(mainSource, /this\.framePort\.postMessage\(createFrameLoadMessage/);
  assert.match(mainSource, /this\.connectedFrameSandbox !== this\.frameSandbox/);
  assert.match(mainSource, /this\.destroyFrameConnection\(\);\s+this\.channel = createChannel\(\);[\s\S]*?this\.frameSandboxMode = nextSandbox/);
  assert.match(mainSource, /key: this\.channel/);
  assert.match(mainSource, /sandbox: this\.frameSandboxMode/);
  assert.match(mainSource, /onFrameLoad\(\)/);
  assert.match(mainSource, /EPUB_BOOTSTRAP_NAVIGATE_MESSAGE/);
  assert.match(mainSource, /event\.data\.type === FRAME_DOCUMENT_LOADED_MESSAGE/);
  assert.match(mainSource, /!this\.frameRuntimeReady[\s\S]*?!this\.frameDocumentLoaded/);
  assert.match(mainSource, /this\.frameNavigationArmed = true;[\s\S]*?this\.completeFrameConnection\(\)/);

  assert.match(frameSource, /var messageChannel = new MessageChannel\(\)/);
  assert.match(frameSource, /window\.__fileViewerBootstrap/);
  assert.match(frameSource, /post\('nextcloud-file-viewer:runtime-ready'\)/);
  assert.match(frameSource, /post\('nextcloud-file-viewer:document-loaded'\)/);
  assert.match(frameSource, /window\.setTimeout\(function \(\) \{[\s\S]*?document-loaded/);
  assert.match(frameSource, /postToParentWindow\('nextcloud-file-viewer:ready', null, \[messageChannel\.port2\]\)/);
  assert.match(frameSource, /parentPort\.postMessage\(createProtocolMessage/);
  assert.doesNotMatch(frameSource, /window\.addEventListener\('message'/);
});

test('parser workers are prepared and created inside the opaque frame', async () => {
  const [mainSource, frameSource, protocolSource] = await Promise.all([
    readFile('src/main.js', 'utf8'),
    readFile('viewer/frame.js', 'utf8'),
    readFile('src/frameProtocol.js', 'utf8'),
  ]);

  assert.doesNotMatch(mainSource, /createFrameWorkerBridge|workerBridge|FRAME_WORKER_/);
  assert.doesNotMatch(protocolSource, /FRAME_WORKER_|ALLOWED_FRAME_WORKER_PATHS|MAX_FRAME_WORKERS/);
  assert.match(frameSource, /await prepareSandboxWorker\(extension, size\)/);
  assert.match(frameSource, /var currentLoad = \+\+loadSequence/);
  assert.match(frameSource, /if \(currentLoad !== loadSequence\)/);
  assert.match(frameSource, /var size = file\.size/);
  assert.match(frameSource, /libarchiveClassicWorkerBlobs\.has\(object\)/);
  assert.doesNotMatch(frameSource, /pendingLibarchiveClassicWorkerUrls/);
  assert.match(frameSource, /signal: workerPreparationController \? workerPreparationController\.signal : undefined/);
  assert.match(frameSource, /disposed = true;\s+loadSequence \+= 1;/);
  assert.match(frameSource, /credentials: 'omit'/);
  assert.match(frameSource, /sandboxWorkerObjectUrls\.get\(requestedUrl\)/);
  assert.match(frameSource, /new NativeWorker\(objectUrl, workerOptions\)/);
  assert.match(frameSource, /activeSandboxWorkers\.delete\(worker\)/);
  assert.match(frameSource, /NativeRevokeObjectURL\(objectUrl\)/);
});
