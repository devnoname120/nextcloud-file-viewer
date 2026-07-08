export const APP_ID = 'fileviewer';

export const FRAME_READY_MESSAGE = 'nextcloud-file-viewer:ready';
export const FRAME_LOAD_MESSAGE = 'nextcloud-file-viewer:load';
export const FRAME_LOADED_MESSAGE = 'nextcloud-file-viewer:loaded';
export const FRAME_ERROR_MESSAGE = 'nextcloud-file-viewer:error';
export const FRAME_CLOSE_REQUEST_MESSAGE = 'nextcloud-file-viewer:close-request';
export const FRAME_WORKER_CREATE_MESSAGE = 'nextcloud-file-viewer:worker:create';
export const FRAME_WORKER_POST_MESSAGE = 'nextcloud-file-viewer:worker:post';
export const FRAME_WORKER_TERMINATE_MESSAGE = 'nextcloud-file-viewer:worker:terminate';
export const FRAME_WORKER_MESSAGE_MESSAGE = 'nextcloud-file-viewer:worker:message';
export const FRAME_WORKER_ERROR_MESSAGE = 'nextcloud-file-viewer:worker:error';
export const FRAME_WORKER_MESSAGE_ERROR_MESSAGE = 'nextcloud-file-viewer:worker:messageerror';

export const DEFAULT_SANDBOX = [
  'allow-scripts',
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-presentation',
].join(' ');

export function addSandboxToken(sandbox, token) {
  const tokens = new Set(String(sandbox || '').split(/\s+/).filter(Boolean));
  tokens.add(token);
  return Array.from(tokens).join(' ');
}

export function resolveFrameSandbox(sandbox, extension) {
  if (String(extension || '').toLowerCase() === 'epub') {
    return addSandboxToken(sandbox, 'allow-same-origin');
  }

  return sandbox;
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
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
    };
  }

  return {
    name: 'Error',
    message: String(reason),
  };
}
