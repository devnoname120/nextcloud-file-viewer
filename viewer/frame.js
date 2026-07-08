(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var channel = params.get('channel') || '';
  var assetBase = resolveTrustedAssetBase(params.get('assetBase'));
  var parentOrigin = window.location.origin;
  var isEmbedded = window.parent && window.parent !== window;
  var viewer = document.getElementById('viewer');
  var errorEl = document.getElementById('error');
  var fileViewer = window.FlyfishFileViewerWebFull;
  var NativeWorker = window.Worker;
  var NativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  var NativeCreateObjectURL = window.URL && typeof window.URL.createObjectURL === 'function'
    ? window.URL.createObjectURL.bind(window.URL)
    : null;
  var NativeRevokeObjectURL = window.URL && typeof window.URL.revokeObjectURL === 'function'
    ? window.URL.revokeObjectURL.bind(window.URL)
    : null;
  var libarchiveClassicWorkerUrls = new Set();
  var pendingLibarchiveClassicWorkerUrls = 0;
  var workerSequence = 0;
  var workerProxies = new Map();

  var WORKER_CREATE_MESSAGE = 'nextcloud-file-viewer:worker:create';
  var WORKER_POST_MESSAGE = 'nextcloud-file-viewer:worker:post';
  var WORKER_TERMINATE_MESSAGE = 'nextcloud-file-viewer:worker:terminate';
  var WORKER_MESSAGE_MESSAGE = 'nextcloud-file-viewer:worker:message';
  var WORKER_ERROR_MESSAGE = 'nextcloud-file-viewer:worker:error';
  var WORKER_MESSAGE_ERROR_MESSAGE = 'nextcloud-file-viewer:worker:messageerror';
  var CLOSE_REQUEST_MESSAGE = 'nextcloud-file-viewer:close-request';
  var PRESENTATION_EXTENSIONS = new Set(['odp', 'otp', 'pot', 'potm', 'potx', 'pps', 'ppsm', 'ppsx', 'ppt', 'pptm', 'pptx']);

  function post(type, data) {
    if (!isEmbedded) {
      return;
    }

    window.parent.postMessage(Object.assign({
      type: type,
      channel: channel,
    }, data || {}), parentOrigin);
  }

  function showError(reason) {
    var error = serializeError(reason);
    errorEl.textContent = error.message;
    errorEl.dataset.visible = 'true';
    post('nextcloud-file-viewer:error', { error: error });
  }

  function serializeError(reason) {
    if (reason && typeof reason === 'object' && typeof reason.message === 'string') {
      return {
        name: reason.name || 'Error',
        message: reason.message,
      };
    }

    return {
      name: 'Error',
      message: String(reason),
    };
  }

  function resolveExtension(filename) {
    var name = String(filename || '').split('/').pop();
    var dot = name.lastIndexOf('.');
    if (dot === -1 || dot === name.length - 1) {
      return '';
    }
    return name.slice(dot + 1).toLowerCase();
  }

  function resolveFilename(filename) {
    var parts = String(filename || 'preview').replace(/\\/g, '/').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'preview';
  }

  function resolveAssetUrl(relativePath) {
    return new URL(relativePath, assetBase).href;
  }

  function resolveTrustedAssetBase(value) {
    var fallback = new URL('./file-viewer/', window.location.href).href;
    if (!value) {
      return fallback;
    }

    try {
      var url = new URL(value, window.location.href);
      if (
        url.origin === window.location.origin
        && /\/apps\/fileviewer\/assets\/$/.test(url.pathname)
      ) {
        return url.href;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  function isTrustedParentMessage(event) {
    return Boolean(
      isEmbedded
      && event.source === window.parent
      && event.origin === parentOrigin
    );
  }

  function syncFrameMode(extension) {
    document.documentElement.classList.toggle(
      'file-viewer-frame--presentation',
      PRESENTATION_EXTENSIONS.has(extension)
    );
  }

  function createViewerOptions(geo) {
    var options = {
      theme: 'system',
      // The iframe is already the isolation boundary. Spreadsheet rendering
      // depends on e-virt-table styles injected into this document, which do
      // not cross into a Flyfish shadow root.
      styleIsolation: 'none',
      toolbar: {
        position: 'bottom-right',
      },
      archive: {
        workerUrl: resolveAssetUrl('vendor/libarchive/worker-bundle.js'),
        wasmUrl: resolveAssetUrl('vendor/libarchive/libarchive.wasm'),
      },
      docx: {
        workerUrl: resolveAssetUrl('vendor/docx/docx.worker.js'),
        workerJsZipUrl: resolveAssetUrl('vendor/docx/jszip.min.js'),
      },
      pdf: {
        workerUrl: resolveAssetUrl('vendor/pdf/pdf.worker.mjs'),
        cMapUrl: resolveAssetUrl('vendor/pdf/cmaps/'),
        wasmUrl: resolveAssetUrl('vendor/pdf/wasm/'),
        standardFontDataUrl: resolveAssetUrl('vendor/pdf/standard_fonts/'),
      },
      presentation: {
        workerUrl: resolveAssetUrl('vendor/pptx/pptx.worker.js'),
        workerType: 'module',
      },
      spreadsheet: {
        workerUrl: resolveAssetUrl('vendor/xlsx/sheet.worker.js'),
      },
    };

    if (geo && typeof geo === 'object') {
      options.geo = geo;
    }

    return options;
  }

  function resolveFetchUrl(input) {
    try {
      if (typeof input === 'string' || input instanceof URL) {
        return new URL(String(input), window.location.href).href;
      }
      if (input && typeof input.url === 'string') {
        return new URL(input.url, window.location.href).href;
      }
    } catch {
      return '';
    }
    return '';
  }

  function resolveFetchMethod(input, init) {
    return String(
      init && init.method
        ? init.method
        : input && typeof input.method === 'string'
        ? input.method
        : 'GET'
    ).toUpperCase();
  }

  function patchLibarchiveClassicWorkerSource(source) {
    return String(source).replace(/\bimport\.meta\.url\b/g, JSON.stringify(resolveAssetUrl('vendor/libarchive/worker-bundle.js')));
  }

  function installLibarchiveWorkerCompatibility() {
    if (
      !NativeFetch
      || !NativeCreateObjectURL
      || !NativeRevokeObjectURL
      || typeof Response !== 'function'
      || typeof Headers !== 'function'
    ) {
      return;
    }

    var libarchiveWorkerUrl = resolveAssetUrl('vendor/libarchive/worker-bundle.js');
    window.fetch = async function (input, init) {
      var fetchUrl = resolveFetchUrl(input);
      if (
        fetchUrl !== libarchiveWorkerUrl
        || resolveFetchMethod(input, init) === 'HEAD'
      ) {
        return NativeFetch(input, init);
      }

      var response = await NativeFetch(input, init);
      if (!response.ok) {
        return response;
      }

      var source = patchLibarchiveClassicWorkerSource(await response.clone().text());
      var headers = new Headers(response.headers);
      headers.set('content-type', 'text/javascript; charset=utf-8');
      headers.delete('content-security-policy');

      var patchedResponse = new Response(source, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
      patchedResponse.text = async function () {
        pendingLibarchiveClassicWorkerUrls += 1;
        return source;
      };
      return patchedResponse;
    };

    window.URL.createObjectURL = function (object) {
      var objectUrl = NativeCreateObjectURL.apply(window.URL, arguments);
      if (
        pendingLibarchiveClassicWorkerUrls > 0
        && object instanceof Blob
        && /(?:java|ecma)script/i.test(object.type || '')
      ) {
        pendingLibarchiveClassicWorkerUrls -= 1;
        libarchiveClassicWorkerUrls.add(objectUrl);
      }
      return objectUrl;
    };

    window.URL.revokeObjectURL = function (objectUrl) {
      libarchiveClassicWorkerUrls.delete(String(objectUrl));
      return NativeRevokeObjectURL.apply(window.URL, arguments);
    };
  }

  function createNamedFile(blob, filename, mime) {
    if (typeof File === 'function') {
      return new File([blob], filename, {
        type: mime || blob.type || 'application/octet-stream',
      });
    }

    blob.name = filename;
    return blob;
  }

  function createWorkerEvent(type, payload) {
    if (type === 'message') {
      return new MessageEvent('message', {
        data: payload.message,
      });
    }

    if (typeof ErrorEvent === 'function') {
      return new ErrorEvent(type, {
        message: payload.message || 'Worker error',
        filename: payload.filename || '',
        lineno: payload.lineno || 0,
        colno: payload.colno || 0,
      });
    }

    var event = new Event(type);
    event.message = payload.message || 'Worker error';
    return event;
  }

  function dispatchWorkerEvent(proxy, eventType, payload) {
    var event = createWorkerEvent(eventType, payload || {});
    var handler = proxy['on' + eventType];
    if (typeof handler === 'function') {
      handler.call(proxy, event);
    }
    proxy.dispatchEvent(event);
  }

  function installParentWorkerProxy() {
    if (typeof NativeWorker !== 'function' || typeof EventTarget !== 'function') {
      return;
    }

    var ParentWorkerProxy = class extends EventTarget {
      constructor(scriptUrl, options) {
        super();
        if (isNativeWorkerUrl(scriptUrl)) {
          return new NativeWorker(scriptUrl, resolveNativeWorkerOptions(scriptUrl, options));
        }
        this.id = 'worker-' + (++workerSequence);
        this.onmessage = null;
        this.onerror = null;
        this.onmessageerror = null;
        this.terminated = false;
        workerProxies.set(this.id, this);
        post(WORKER_CREATE_MESSAGE, {
          workerId: this.id,
          url: String(scriptUrl),
          options: {
            type: options && options.type,
            credentials: options && options.credentials,
            name: options && options.name,
          },
        });
      }

      postMessage(message) {
        if (this.terminated) {
          return;
        }
        post(WORKER_POST_MESSAGE, {
          workerId: this.id,
          message: message,
        });
      }

      terminate() {
        if (this.terminated) {
          return;
        }
        this.terminated = true;
        workerProxies.delete(this.id);
        post(WORKER_TERMINATE_MESSAGE, {
          workerId: this.id,
        });
      }
    };

    window.Worker = ParentWorkerProxy;
  }

  function isNativeWorkerUrl(scriptUrl) {
    try {
      return new URL(String(scriptUrl), window.location.href).protocol === 'blob:';
    } catch {
      return false;
    }
  }

  function resolveNativeWorkerOptions(scriptUrl, options) {
    if (!libarchiveClassicWorkerUrls.has(String(scriptUrl))) {
      return options;
    }

    return Object.assign({}, options || {}, {
      type: 'classic',
    });
  }

  async function loadMessage(data) {
    if (!data.file) {
      throw new Error('No file was sent to the sandboxed viewer.');
    }

    var filename = resolveFilename(data.filename);
    var extension = resolveExtension(filename);
    var file = createNamedFile(data.file, filename, data.mime);
    errorEl.dataset.visible = 'false';
    syncFrameMode(extension);

    viewer.source = {
      file: file,
      filename: filename,
      type: extension,
      size: data.size || data.file.size,
      options: createViewerOptions(data.geo),
    };
  }

  if (!channel) {
    showError('Missing viewer channel.');
    return;
  }

  if (!isEmbedded) {
    showError('File Viewer frame must be embedded in Nextcloud Viewer.');
    return;
  }

  if (!fileViewer) {
    showError('Flyfish File Viewer did not load.');
    return;
  }

  viewer.addEventListener('viewer-ready', function () {
    post('nextcloud-file-viewer:loaded');
  });

  viewer.addEventListener('viewer-state-change', function (event) {
    var state = event.detail && event.detail.state ? event.detail.state : {};
    if (state.ready && !state.loading) {
      post('nextcloud-file-viewer:loaded');
    }
  });

  viewer.addEventListener('viewer-error', function (event) {
    showError(event.detail && event.detail.error ? event.detail.error : 'The viewer failed to render this file.');
  });

  try {
    installLibarchiveWorkerCompatibility();
    installParentWorkerProxy();
    fileViewer.setDefaultFullAssetBaseUrl(assetBase);
    fileViewer.defineFileViewerElement();
  } catch (reason) {
    showError(reason);
    return;
  }

  window.addEventListener('message', function (event) {
    if (!isTrustedParentMessage(event)) {
      return;
    }

    var data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== channel || data.type !== 'nextcloud-file-viewer:load') {
      return;
    }

    loadMessage(data).catch(showError);
  });

  window.addEventListener('message', function (event) {
    if (!isTrustedParentMessage(event)) {
      return;
    }

    var data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== channel || !data.workerId) {
      return;
    }

    var proxy = workerProxies.get(data.workerId);
    if (!proxy) {
      return;
    }

    if (data.type === WORKER_MESSAGE_MESSAGE) {
      dispatchWorkerEvent(proxy, 'message', data);
      return;
    }

    if (data.type === WORKER_ERROR_MESSAGE) {
      dispatchWorkerEvent(proxy, 'error', data);
      return;
    }

    if (data.type === WORKER_MESSAGE_ERROR_MESSAGE) {
      dispatchWorkerEvent(proxy, 'messageerror', data);
    }
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      post(CLOSE_REQUEST_MESSAGE);
    }
  }, true);

  post('nextcloud-file-viewer:ready');
}());
