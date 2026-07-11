(function () {
  'use strict';

  var BOOTSTRAP_READY_MESSAGE = 'nextcloud-file-viewer:epub-bootstrap-ready';
  var BOOTSTRAP_NAVIGATE_MESSAGE = 'nextcloud-file-viewer:epub-bootstrap-navigate';
  var params = new URLSearchParams(window.location.search);
  var channel = params.get('channel') || '';
  var appOrigin = window.location.origin;
  var assetBase = resolveTrustedAssetBase(params.get('assetBase'));
  var rendererDocument = createRendererDocument();
  var rendererUrl = rendererDocument
    ? URL.createObjectURL(new Blob([rendererDocument], { type: 'text/html;charset=utf-8' }))
    : '';
  var navigationCommitted = false;

  function createProtocolMessage(type, data) {
    return Object.assign({
      type: type,
      channel: channel,
    }, data || {});
  }

  function resolveTrustedAssetBase(value) {
    if (!value) {
      return '';
    }

    try {
      var url = new URL(value, window.location.href);
      if (
        url.origin === appOrigin
        && /\/apps\/fileviewer\/assets\/$/.test(url.pathname)
      ) {
        return url.href;
      }
    } catch {
      return '';
    }

    return '';
  }

  function decodeRendererDocument() {
    var source = document.getElementById('file-viewer-renderer-document');
    if (!source || !source.textContent) {
      throw new Error('The EPUB renderer document is missing.');
    }

    var binary = atob(source.textContent.trim());
    var bytes = Uint8Array.from(binary, function (character) {
      return character.charCodeAt(0);
    });
    return new TextDecoder().decode(bytes);
  }

  function createRendererDocument() {
    if (!channel || !assetBase) {
      return '';
    }

    try {
      var parsed = new DOMParser().parseFromString(decodeRendererDocument(), 'text/html');
      var flyfishScript = parsed.getElementById('file-viewer-flyfish-runtime');
      var frameScript = parsed.getElementById('file-viewer-frame-runtime');
      if (!flyfishScript || !frameScript) {
        throw new Error('The EPUB renderer runtime is incomplete.');
      }

      var flyfishRuntimeUrl = new URL(
        'flyfish-file-viewer-web-full.iife.js',
        assetBase
      ).href;
      var frameRuntimeUrl = new URL('runtime/frame.js', assetBase).href;
      flyfishScript.remove();
      frameScript.src = new URL('runtime/epub-renderer-gate.js', assetBase).href;
      frameScript.dataset.channel = channel;
      frameScript.dataset.assetBase = assetBase;
      frameScript.dataset.appOrigin = appOrigin;
      frameScript.dataset.flyfishRuntimeUrl = flyfishRuntimeUrl;
      frameScript.dataset.frameRuntimeUrl = frameRuntimeUrl;

      return '<!doctype html>\n' + parsed.documentElement.outerHTML;
    } catch (reason) {
      window.parent.postMessage(createProtocolMessage(
        'nextcloud-file-viewer:error',
        { error: serializeError(reason) }
      ), appOrigin);
      return '';
    }
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

  function onParentMessage(event) {
    if (
      navigationCommitted
      || event.source !== window.parent
      || event.origin !== appOrigin
      || !event.data
      || typeof event.data !== 'object'
      || event.data.type !== BOOTSTRAP_NAVIGATE_MESSAGE
      || event.data.channel !== channel
    ) {
      return;
    }

    navigationCommitted = true;
    window.removeEventListener('message', onParentMessage);
    location.replace(rendererUrl);
  }

  if (!channel) {
    window.parent.postMessage(createProtocolMessage(
      'nextcloud-file-viewer:error',
      { error: serializeError('Missing viewer channel.') }
    ), appOrigin);
    return;
  }

  if (!assetBase || !rendererUrl) {
    return;
  }

  window.addEventListener('message', onParentMessage);
  window.addEventListener('pagehide', function () {
    if (!navigationCommitted && rendererUrl) {
      URL.revokeObjectURL(rendererUrl);
    }
  }, { once: true });
  window.parent.postMessage(createProtocolMessage(BOOTSTRAP_READY_MESSAGE), appOrigin);
}());
