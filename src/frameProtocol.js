export const APP_ID = 'fileviewer';

export const FRAME_READY_MESSAGE = 'nextcloud-file-viewer:ready';
export const FRAME_RUNTIME_READY_MESSAGE = 'nextcloud-file-viewer:runtime-ready';
export const FRAME_DOCUMENT_LOADED_MESSAGE = 'nextcloud-file-viewer:document-loaded';
export const FRAME_CONNECTED_MESSAGE = 'nextcloud-file-viewer:connected';
export const EPUB_BOOTSTRAP_READY_MESSAGE = 'nextcloud-file-viewer:epub-bootstrap-ready';
export const EPUB_BOOTSTRAP_NAVIGATE_MESSAGE = 'nextcloud-file-viewer:epub-bootstrap-navigate';
export const EPUB_RENDERER_GATE_READY_MESSAGE = 'nextcloud-file-viewer:epub-renderer-gate-ready';
export const EPUB_SANDBOX_PROBE_MESSAGE = 'nextcloud-file-viewer:epub-sandbox-probe';
export const EPUB_SANDBOX_PROBE_RESULT_MESSAGE = 'nextcloud-file-viewer:epub-sandbox-probe-result';
export const EPUB_RENDERER_START_MESSAGE = 'nextcloud-file-viewer:epub-renderer-start';
export const FRAME_LOAD_MESSAGE = 'nextcloud-file-viewer:load';
export const FRAME_LOADED_MESSAGE = 'nextcloud-file-viewer:loaded';
export const FRAME_ERROR_MESSAGE = 'nextcloud-file-viewer:error';
export const FRAME_CLOSE_REQUEST_MESSAGE = 'nextcloud-file-viewer:close-request';

export const DEFAULT_FRAME_KIND = 'default';
export const EPUB_FRAME_KIND = 'epub';

export const DEFAULT_SANDBOX = [
  'allow-scripts',
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-presentation',
].join(' ');

export const EPUB_BOOTSTRAP_SANDBOX = 'allow-scripts';
export const EPUB_RENDERER_SANDBOX = 'allow-scripts allow-same-origin';

export function resolveFrameKind(extension) {
  return String(extension || '').toLowerCase() === 'epub'
    ? EPUB_FRAME_KIND
    : DEFAULT_FRAME_KIND;
}

export function resolveFrameSandbox(sandbox, extension) {
  return resolveFrameKind(extension) === EPUB_FRAME_KIND
    ? EPUB_BOOTSTRAP_SANDBOX
    : sandbox;
}

export function resolveRendererSandbox(sandbox, extension) {
  return resolveFrameKind(extension) === EPUB_FRAME_KIND
    ? EPUB_RENDERER_SANDBOX
    : sandbox;
}

export function createChannel() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createFrameLoadMessage({ channel, blob, filename, mime, size, geo }) {
  const message = {
    type: FRAME_LOAD_MESSAGE,
    channel,
    file: blob,
    filename,
    mime,
    size,
  };

  if (geo && typeof geo === 'object') {
    message.geo = geo;
  }

  return message;
}

export function isFrameMessage(data, channel) {
  return Boolean(
    data
    && typeof data === 'object'
    && data.channel === channel
    && typeof data.type === 'string'
  );
}

export function serializeError(reason) {
  if (reason && typeof reason === 'object' && typeof reason.message === 'string') {
    return {
      name: typeof reason.name === 'string' && reason.name ? reason.name : 'Error',
      message: reason.message,
    };
  }

  return {
    name: 'Error',
    message: String(reason),
  };
}
