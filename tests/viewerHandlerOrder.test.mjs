import assert from 'node:assert/strict';
import test from 'node:test';

import {
  installViewerHandlerPromotion,
  installViewerSetterPromotion,
  promoteViewerHandler,
  registerAndPromoteViewerHandler,
} from '../src/viewerHandlerOrder.js';

test('local viewer handler registration queues handlers for Nextcloud Viewer', async () => {
  const registration = await import('../src/nextcloudViewerRegistration.js')
    .catch(error => ({ error }));

  assert.equal(registration.error, undefined, registration.error?.message);
  const { registerHandler } = registration;
  const win = {};
  const handler = {
    id: 'fileviewer',
    mimes: ['application/pdf'],
    component: {},
  };

  registerHandler(handler, win);

  assert.ok(win._oca_viewer_handlers instanceof Map);
  assert.equal(win._oca_viewer_handlers.get('fileviewer'), handler);
});

test('viewer handler promotion moves an existing handler ahead of built-in media handlers', () => {
  const viewer = {
    availableHandlers: [
      { id: 'images' },
      { id: 'videos' },
      { id: 'audios' },
      { id: 'fileviewer' },
    ],
  };

  assert.equal(promoteViewerHandler(viewer, 'fileviewer'), true);
  assert.deepEqual(viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
    'videos',
    'audios',
  ]);
});

test('live viewer registration adds fileviewer once and promotes it', () => {
  const calls = [];
  const fileviewerHandler = { id: 'fileviewer', mimes: ['image/png'] };
  const viewer = {
    availableHandlers: [
      { id: 'images' },
      { id: 'videos' },
      { id: 'audios' },
    ],
    registerHandler(handler) {
      calls.push(handler.id);
      this.availableHandlers.push(handler);
    },
  };

  assert.equal(registerAndPromoteViewerHandler(viewer, fileviewerHandler), true);
  assert.deepEqual(calls, ['fileviewer']);
  assert.deepEqual(viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
    'videos',
    'audios',
  ]);
});

test('live viewer registration does not duplicate an already queued handler', () => {
  const calls = [];
  const fileviewerHandler = { id: 'fileviewer', mimes: ['image/png'] };
  const viewer = {
    availableHandlers: [
      { id: 'images' },
      fileviewerHandler,
      { id: 'videos' },
    ],
    registerHandler(handler) {
      calls.push(handler.id);
      this.availableHandlers.push(handler);
    },
  };

  assert.equal(registerAndPromoteViewerHandler(viewer, fileviewerHandler), true);
  assert.deepEqual(calls, []);
  assert.deepEqual(viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
    'videos',
  ]);
});

test('installing handler promotion retries until OCA.Viewer is available', async () => {
  const fileviewerHandler = { id: 'fileviewer', mimes: ['image/png'] };
  const listeners = new Map();
  const timers = [];
  const win = {
    OCA: {},
    document: {
      readyState: 'loading',
      addEventListener(name, listener) {
        listeners.set(name, listener);
      },
    },
    setTimeout(listener) {
      timers.push(listener);
      return timers.length;
    },
  };

  installViewerHandlerPromotion(fileviewerHandler, win, {
    retryLimit: 3,
    retryDelayMs: 1,
  });

  assert.equal(timers.length, 1);
  win.OCA.Viewer = {
    availableHandlers: [{ id: 'images' }],
    registerHandler(handler) {
      this.availableHandlers.push(handler);
    },
  };

  timers.shift()();
  assert.deepEqual(win.OCA.Viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
  ]);

  listeners.get('DOMContentLoaded')();
  assert.deepEqual(win.OCA.Viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
  ]);
});

test('viewer setter promotion runs when Nextcloud assigns OCA.Viewer', () => {
  const fileviewerHandler = { id: 'fileviewer', mimes: ['image/png'] };
  const win = {};
  const promoted = [];

  assert.equal(installViewerSetterPromotion(win, () => {
    const viewer = win.OCA?.Viewer;
    if (!viewer) {
      return false;
    }

    promoted.push(viewer.availableHandlers.map(handler => handler.id).join(','));
    return registerAndPromoteViewerHandler(viewer, fileviewerHandler);
  }), false);

  win.OCA.Viewer = {
    availableHandlers: [
      { id: 'images' },
      { id: 'videos' },
    ],
    registerHandler(handler) {
      this.availableHandlers.push(handler);
    },
  };

  assert.deepEqual(promoted, ['images,videos']);
  assert.deepEqual(win.OCA.Viewer.availableHandlers.map(handler => handler.id), [
    'fileviewer',
    'images',
    'videos',
  ]);
});
