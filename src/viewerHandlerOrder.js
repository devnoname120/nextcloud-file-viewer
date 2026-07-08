export function promoteViewerHandler(viewer, handlerId) {
  const handlers = viewer?.availableHandlers;
  if (!Array.isArray(handlers) || !handlerId) {
    return false;
  }

  const index = handlers.findIndex(handler => handler?.id === handlerId);
  if (index === -1) {
    return false;
  }
  if (index === 0) {
    return true;
  }

  const [handler] = handlers.splice(index, 1);
  handlers.unshift(handler);
  return true;
}

export function registerAndPromoteViewerHandler(viewer, handler) {
  const handlers = viewer?.availableHandlers;
  if (!Array.isArray(handlers) || !handler?.id) {
    return false;
  }

  const isRegistered = handlers.some(candidate => candidate?.id === handler.id);
  if (!isRegistered && typeof viewer.registerHandler === 'function') {
    viewer.registerHandler(handler);
  }

  return promoteViewerHandler(viewer, handler.id);
}

export function installViewerHandlerPromotion(handler, win = window, options = {}) {
  const retryLimit = options.retryLimit ?? 100;
  const retryDelayMs = options.retryDelayMs ?? 50;
  let retryCount = 0;

  const promote = () => registerAndPromoteViewerHandler(win.OCA?.Viewer, handler);
  installViewerSetterPromotion(win, promote);

  const retry = () => {
    if (promote() || retryCount >= retryLimit || typeof win.setTimeout !== 'function') {
      return;
    }

    retryCount += 1;
    win.setTimeout(retry, retryDelayMs);
  };

  retry();

  if (win.document?.readyState === 'loading' && typeof win.document.addEventListener === 'function') {
    win.document.addEventListener('DOMContentLoaded', retry, { once: true });
  }
}

export function installViewerSetterPromotion(win, promote) {
  if (!win || typeof promote !== 'function') {
    return false;
  }

  win.OCA = win.OCA ?? {};
  const descriptor = Object.getOwnPropertyDescriptor(win.OCA, 'Viewer');
  if (descriptor && descriptor.configurable === false) {
    return promote();
  }

  let viewer = win.OCA.Viewer;
  Object.defineProperty(win.OCA, 'Viewer', {
    configurable: true,
    enumerable: true,
    get() {
      return viewer;
    },
    set(value) {
      viewer = value;
      promote();
    },
  });

  return promote();
}
