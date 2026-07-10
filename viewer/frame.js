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
  var NativeBlob = window.Blob;
  var NativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  var NativeCreateObjectURL = window.URL && typeof window.URL.createObjectURL === 'function'
    ? window.URL.createObjectURL.bind(window.URL)
    : null;
  var NativeRevokeObjectURL = window.URL && typeof window.URL.revokeObjectURL === 'function'
    ? window.URL.revokeObjectURL.bind(window.URL)
    : null;
  var libarchiveClassicWorkerUrls = new Set();
  var libarchiveClassicWorkerBlobs = new WeakSet();
  var libarchiveClassicWorkerSource = null;
  var sandboxWorkerObjectUrls = new Map();
  var sandboxWorkerPreparations = new Map();
  var activeSandboxWorkers = new Set();
  var parentPort = null;
  var parentPortConnected = false;
  var loadSequence = 0;
  var disposed = false;
  var workerPreparationController = typeof AbortController === 'function'
    ? new AbortController()
    : null;

  var CONNECTED_MESSAGE = 'nextcloud-file-viewer:connected';
  var CLOSE_REQUEST_MESSAGE = 'nextcloud-file-viewer:close-request';
  var DOCX_EXTENSIONS = new Set(['docx', 'docm', 'dotx', 'dotm']);
  var PRESENTATION_EXTENSIONS = new Set(['odp', 'otp', 'pot', 'potm', 'potx', 'pps', 'ppsm', 'ppsx', 'ppt', 'pptm', 'pptx']);
  var WORKER_PRESENTATION_EXTENSIONS = new Set(['potm', 'potx', 'ppsm', 'ppsx', 'pptm', 'pptx']);
  var SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xltx', 'xlsm', 'xlsb', 'xls', 'xlt', 'xltm', 'csv', 'ods', 'fods', 'numbers']);
  var SPREADSHEET_WORKER_THRESHOLD = 1024 * 1024;

  function createProtocolMessage(type, data) {
    return Object.assign({
      type: type,
      channel: channel,
    }, data || {});
  }

  function postToParentWindow(type, data, transfer) {
    if (!isEmbedded) {
      return;
    }

    window.parent.postMessage(createProtocolMessage(type, data), parentOrigin, transfer || []);
  }

  function post(type, data) {
    if (parentPort) {
      parentPort.postMessage(createProtocolMessage(type, data));
      return;
    }

    postToParentWindow(type, data);
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

  function patchWorkerSource(source, sourceUrl) {
    var patchedSource = String(source).replace(/\bimport\.meta\.url\b/g, JSON.stringify(sourceUrl));
    if (sourceUrl === resolveAssetUrl('vendor/pdf/pdf.worker.mjs')) {
      patchedSource = patchedSource.replace(/\nexport \{ WorkerMessageHandler \};\s*\n/, '\n');
    }
    return patchedSource;
  }

  function installLibarchiveWorkerCompatibility() {
    if (
      !NativeFetch
      || !NativeCreateObjectURL
      || !NativeRevokeObjectURL
      || typeof NativeBlob !== 'function'
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

      var response = await NativeFetch(input, Object.assign({}, init || {}, {
        credentials: 'omit',
      }));
      if (!response.ok) {
        return response;
      }

      var source = patchWorkerSource(await response.clone().text(), libarchiveWorkerUrl);
      libarchiveClassicWorkerSource = source;
      var headers = new Headers(response.headers);
      headers.set('content-type', 'text/javascript; charset=utf-8');
      headers.delete('content-security-policy');

      var patchedResponse = new Response(source, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
      });
      patchedResponse.text = async function () {
        return source;
      };
      return patchedResponse;
    };

    function SandboxBlob(parts, options) {
      var blob = new NativeBlob(parts, options);
      if (
        libarchiveClassicWorkerSource !== null
        && Array.isArray(parts)
        && parts.some(function (part) {
          return typeof part === 'string' && part === libarchiveClassicWorkerSource;
        })
      ) {
        libarchiveClassicWorkerBlobs.add(blob);
      }
      return blob;
    }

    SandboxBlob.prototype = NativeBlob.prototype;
    try {
      Object.setPrototypeOf(SandboxBlob, NativeBlob);
    } catch {
      // Older browsers can still construct tagged Blob instances.
    }
    window.Blob = SandboxBlob;

    window.URL.createObjectURL = function (object) {
      var objectUrl = NativeCreateObjectURL.apply(window.URL, arguments);
      if (
        libarchiveClassicWorkerBlobs.has(object)
        && /(?:java|ecma)script/i.test(object.type || '')
      ) {
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

  function resolveWorkerPath(extension, size) {
    if (DOCX_EXTENSIONS.has(extension)) {
      return 'vendor/docx/docx.worker.js';
    }
    if (extension === 'pdf') {
      return 'vendor/pdf/pdf.worker.mjs';
    }
    if (WORKER_PRESENTATION_EXTENSIONS.has(extension)) {
      return 'vendor/pptx/pptx.worker.js';
    }
    if (SPREADSHEET_EXTENSIONS.has(extension) && size >= SPREADSHEET_WORKER_THRESHOLD) {
      return 'vendor/xlsx/sheet.worker.js';
    }
    if (extension === 'dwg') {
      return 'wasm/cad/dwg-worker.js';
    }
    return '';
  }

  async function prepareSandboxWorker(extension, size) {
    if (disposed) {
      throw new Error('The sandboxed viewer document is no longer active.');
    }

    var workerPath = resolveWorkerPath(extension, size);
    if (!workerPath) {
      return;
    }

    if (
      !NativeFetch
      || !NativeCreateObjectURL
      || !NativeRevokeObjectURL
      || typeof NativeBlob !== 'function'
    ) {
      throw new Error('This browser cannot prepare an isolated parser worker.');
    }

    var sourceUrl = resolveAssetUrl(workerPath);
    if (sandboxWorkerObjectUrls.has(sourceUrl)) {
      return;
    }

    var preparation = sandboxWorkerPreparations.get(sourceUrl);
    if (!preparation) {
      preparation = (async function () {
        var response = await NativeFetch(sourceUrl, {
          credentials: 'omit',
          mode: 'cors',
          cache: 'force-cache',
          signal: workerPreparationController ? workerPreparationController.signal : undefined,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch parser worker: ' + response.status + ' ' + response.statusText);
        }

        var source = patchWorkerSource(await response.text(), sourceUrl);
        if (disposed) {
          throw new Error('The sandboxed viewer document is no longer active.');
        }
        var objectUrl = NativeCreateObjectURL(new NativeBlob([source], {
          type: 'text/javascript;charset=utf-8',
        }));
        sandboxWorkerObjectUrls.set(sourceUrl, objectUrl);
      }());
      sandboxWorkerPreparations.set(sourceUrl, preparation);
    }

    try {
      await preparation;
    } catch (reason) {
      sandboxWorkerPreparations.delete(sourceUrl);
      throw reason;
    }
  }

  function installSandboxWorkerFactory() {
    if (typeof NativeWorker !== 'function') {
      return;
    }

    function SandboxWorker(scriptUrl, options) {
      var requestedUrl;
      try {
        requestedUrl = new URL(String(scriptUrl), window.location.href).href;
      } catch {
        throw new TypeError('Invalid parser worker URL.');
      }

      var objectUrl = requestedUrl;
      var workerOptions = options;
      if (new URL(requestedUrl).protocol === 'blob:') {
        workerOptions = resolveNativeWorkerOptions(requestedUrl, options);
      } else {
        objectUrl = sandboxWorkerObjectUrls.get(requestedUrl);
        if (!objectUrl) {
          throw new Error('Parser worker was not prepared inside the sandbox: ' + requestedUrl);
        }
        if (
          requestedUrl === resolveAssetUrl('vendor/pdf/pdf.worker.mjs')
          || requestedUrl === resolveAssetUrl('vendor/pptx/pptx.worker.js')
          || requestedUrl === resolveAssetUrl('vendor/xlsx/sheet.worker.js')
          || requestedUrl === resolveAssetUrl('wasm/cad/dwg-worker.js')
        ) {
          // These self-contained bundles fail during module-worker startup
          // under an opaque sandbox origin, but are designed to run as classic
          // scripts too. Keep the workers opaque while selecting that mode here.
          workerOptions = Object.assign({}, options || {}, {
            type: 'classic',
          });
        }
      }

      var worker = new NativeWorker(objectUrl, workerOptions);
      worker.addEventListener('error', function (event) {
        console.error('[file-viewer] Isolated parser worker failed:', event.message || 'Worker error', event.filename || requestedUrl);
      });
      var nativeTerminate = worker.terminate.bind(worker);
      worker.terminate = function () {
        activeSandboxWorkers.delete(worker);
        return nativeTerminate();
      };
      activeSandboxWorkers.add(worker);
      return worker;
    }

    SandboxWorker.prototype = NativeWorker.prototype;
    try {
      Object.setPrototypeOf(SandboxWorker, NativeWorker);
    } catch {
      // Older browsers can still construct workers without the static prototype.
    }
    window.Worker = SandboxWorker;
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
    var currentLoad = ++loadSequence;
    if (!data.file) {
      throw new Error('No file was sent to the sandboxed viewer.');
    }

    var filename = resolveFilename(data.filename);
    var extension = resolveExtension(filename);
    var file = createNamedFile(data.file, filename, data.mime);
    var size = file.size;
    errorEl.dataset.visible = 'false';
    syncFrameMode(extension);
    try {
      await prepareSandboxWorker(extension, size);
    } catch (reason) {
      if (currentLoad !== loadSequence) {
        return;
      }
      throw reason;
    }
    if (currentLoad !== loadSequence) {
      return;
    }

    viewer.source = {
      file: file,
      filename: filename,
      type: extension,
      size: size,
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
    installSandboxWorkerFactory();
    fileViewer.setDefaultFullAssetBaseUrl(assetBase);
    fileViewer.defineFileViewerElement();
  } catch (reason) {
    showError(reason);
    return;
  }

  function onParentPortMessage(event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || data.channel !== channel) {
      return;
    }

    if (data.type === CONNECTED_MESSAGE) {
      parentPortConnected = true;
      return;
    }

    if (!parentPortConnected) {
      return;
    }

    if (data.type === 'nextcloud-file-viewer:load') {
      loadMessage(data).catch(showError);
      return;
    }

  }

  function announceReady() {
    if (typeof MessageChannel !== 'function') {
      showError('This browser cannot create a secure file viewer channel.');
      return;
    }

    var messageChannel = new MessageChannel();
    parentPort = messageChannel.port1;
    parentPort.addEventListener('message', onParentPortMessage);
    parentPort.start();
    postToParentWindow('nextcloud-file-viewer:ready', null, [messageChannel.port2]);
  }

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      post(CLOSE_REQUEST_MESSAGE);
    }
  }, true);

  window.addEventListener('pagehide', function (event) {
    if (event.persisted) {
      return;
    }

    disposed = true;
    loadSequence += 1;
    if (workerPreparationController) {
      workerPreparationController.abort();
    }
    activeSandboxWorkers.forEach(function (worker) {
      worker.terminate();
    });
    activeSandboxWorkers.clear();
    sandboxWorkerObjectUrls.forEach(function (objectUrl) {
      NativeRevokeObjectURL(objectUrl);
    });
    sandboxWorkerObjectUrls.clear();
    sandboxWorkerPreparations.clear();
    if (parentPort) {
      parentPort.close();
      parentPort = null;
    }
  });

  announceReady();
}());
