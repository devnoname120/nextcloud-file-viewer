(function () {
  'use strict';

  var GATE_READY_MESSAGE = 'nextcloud-file-viewer:epub-renderer-gate-ready';
  var SANDBOX_PROBE_MESSAGE = 'nextcloud-file-viewer:epub-sandbox-probe';
  var SANDBOX_PROBE_RESULT_MESSAGE = 'nextcloud-file-viewer:epub-sandbox-probe-result';
  var RENDERER_START_MESSAGE = 'nextcloud-file-viewer:epub-renderer-start';
  var runtimeScript = document.currentScript;
  var config = runtimeScript && runtimeScript.dataset ? runtimeScript.dataset : {};
  var channel = config.channel || '';
  var appOrigin = resolveAppOrigin(config.appOrigin);
  var assetBase = resolveAssetBase(config.assetBase, appOrigin);
  var flyfishRuntimeUrl = resolveRuntimeUrl(config.flyfishRuntimeUrl, assetBase);
  var frameRuntimeUrl = resolveRuntimeUrl(config.frameRuntimeUrl, assetBase);
  var lastProbeReadable = false;
  var parentPort = null;
  var probeInProgress = false;
  var rendererStarted = false;

  function createProtocolMessage(type, data) {
    return Object.assign({
      type: type,
      channel: channel,
    }, data || {});
  }

  function post(type, data) {
    if (parentPort) {
      parentPort.postMessage(createProtocolMessage(type, data));
      return;
    }
    window.parent.postMessage(createProtocolMessage(type, data), appOrigin || '*');
  }

  function resolveAppOrigin(value) {
    try {
      var url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      // Invalid bootstrap configuration is rejected below.
    }
    return '';
  }

  function resolveAssetBase(value, expectedOrigin) {
    if (!expectedOrigin) {
      return '';
    }
    try {
      var url = new URL(value);
      if (
        url.origin === expectedOrigin
        && /\/apps\/fileviewer\/assets\/$/.test(url.pathname)
      ) {
        return url.href;
      }
    } catch {
      // Invalid bootstrap configuration is rejected below.
    }
    return '';
  }

  function resolveRuntimeUrl(value, base) {
    if (!base) {
      return '';
    }
    try {
      var url = new URL(value, base);
      if (url.origin === new URL(base).origin && url.href.startsWith(base)) {
        return url.href;
      }
    } catch {
      // Invalid bootstrap configuration is rejected below.
    }
    return '';
  }

  function serializeError(reason) {
    return {
      name: reason && typeof reason.name === 'string' ? reason.name : 'Error',
      message: reason && typeof reason.message === 'string'
        ? reason.message
        : String(reason),
    };
  }

  function showError(reason) {
    var error = serializeError(reason);
    var errorEl = document.getElementById('error');
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.dataset.visible = 'true';
    }
    post('nextcloud-file-viewer:error', { error: error });
  }

  function runSandboxProbe() {
    if (probeInProgress || rendererStarted) {
      return;
    }
    probeInProgress = true;
    lastProbeReadable = false;

    var probe = document.createElement('iframe');
    var marker = 'epub-sandbox-' + Math.random().toString(16).slice(2);
    probe.hidden = true;
    probe.setAttribute('aria-hidden', 'true');
    probe.setAttribute('sandbox', 'allow-same-origin');
    probe.srcdoc = '<!doctype html><p id="epub-sandbox-marker">' + marker + '</p>';
    probe.addEventListener('load', function () {
      try {
        var markerNode = probe.contentDocument
          && probe.contentDocument.getElementById('epub-sandbox-marker');
        lastProbeReadable = Boolean(markerNode && markerNode.textContent === marker);
      } catch {
        lastProbeReadable = false;
      }

      probe.remove();
      probeInProgress = false;
      post(SANDBOX_PROBE_RESULT_MESSAGE, { readable: lastProbeReadable });
    }, { once: true });
    document.body.appendChild(probe);
  }

  function loadScript(url, id, data) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.id = id;
      script.src = url;
      Object.keys(data || {}).forEach(function (key) {
        script.dataset[key] = data[key];
      });
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', function () {
        reject(new Error('Failed to load the EPUB renderer runtime.'));
      }, { once: true });
      document.body.appendChild(script);
    });
  }

  async function startRenderer() {
    if (rendererStarted || probeInProgress || !lastProbeReadable) {
      return;
    }
    rendererStarted = true;
    parentPort.removeEventListener('message', onParentPortMessage);

    try {
      await loadScript(flyfishRuntimeUrl, 'file-viewer-flyfish-runtime');
      window.__fileViewerBootstrap = {
        channel: channel,
        parentPort: parentPort,
      };
      await loadScript(frameRuntimeUrl, 'file-viewer-frame-runtime', {
        channel: channel,
        assetBase: assetBase,
        appOrigin: appOrigin,
        parentTargetOrigin: appOrigin,
        epubOpaqueRenderer: 'true',
      });
      runtimeScript.remove();
    } catch (reason) {
      showError(reason);
    }
  }

  function onParentPortMessage(event) {
    if (!event.data || typeof event.data !== 'object' || event.data.channel !== channel) {
      return;
    }

    if (event.data.type === SANDBOX_PROBE_MESSAGE) {
      runSandboxProbe();
      return;
    }

    if (event.data.type === RENDERER_START_MESSAGE) {
      void startRenderer();
    }
  }

  if (!channel || !appOrigin || !assetBase || !flyfishRuntimeUrl || !frameRuntimeUrl) {
    showError('The EPUB renderer bootstrap configuration is invalid.');
    return;
  }

  var messageChannel = new MessageChannel();
  parentPort = messageChannel.port1;
  parentPort.addEventListener('message', onParentPortMessage);
  parentPort.start();
  window.parent.postMessage(
    createProtocolMessage(GATE_READY_MESSAGE),
    appOrigin,
    [messageChannel.port2]
  );
}());
