import { loadState } from '@nextcloud/initial-state';
import { generateFilePath, generateUrl } from '@nextcloud/router';

import {
	APP_ID,
  DEFAULT_SANDBOX,
  FRAME_CLOSE_REQUEST_MESSAGE,
  FRAME_ERROR_MESSAGE,
  FRAME_LOADED_MESSAGE,
  FRAME_READY_MESSAGE,
  FRAME_WORKER_CREATE_MESSAGE,
  FRAME_WORKER_ERROR_MESSAGE,
  FRAME_WORKER_MESSAGE_ERROR_MESSAGE,
  FRAME_WORKER_MESSAGE_MESSAGE,
  FRAME_WORKER_POST_MESSAGE,
  FRAME_WORKER_TERMINATE_MESSAGE,
  createChannel,
  createFrameLoadMessage,
  isFrameMessage,
  resolveFrameSandbox,
  serializeError,
} from './frameProtocol.js';
import { createViewerGeoOptions } from './geoSettings.js';
import { filterEnabledMimes } from './mimeSettings.js';
import { registerHandler } from './nextcloudViewerRegistration.js';
import { resolveFileExtension, resolveFileSource, resolveFilename } from './sourceResolution.js';
import { SUPPORTED_MIMES } from './supportedFormats.generated.js';
import { installViewerHandlerPromotion } from './viewerHandlerOrder.js';

const viewerFramePath = generateFilePath(APP_ID, '', 'viewer/index.html');
const viewerAssetBasePath = generateUrl('/apps/{APP_ID}/assets/', { APP_ID });
const sandbox = loadState(APP_ID, 'sandbox', DEFAULT_SANDBOX);
const geo = loadState(APP_ID, 'geo', createViewerGeoOptions());
const enabledMimes = filterEnabledMimes(SUPPORTED_MIMES, loadState(APP_ID, 'disabledMimes', []));
const publicShareFilename = loadState('files_sharing', 'filename', '');

const workerRequestMessages = new Set([
  FRAME_WORKER_CREATE_MESSAGE,
  FRAME_WORKER_POST_MESSAGE,
  FRAME_WORKER_TERMINATE_MESSAGE,
]);

function createFrameWorkerBridge({ frame, channel, assetBaseUrl }) {
  const workers = new Map();
  const assetBase = new URL(assetBaseUrl, window.location.href);

  function postToFrame(type, workerId, payload = {}) {
    frame.contentWindow?.postMessage({
      type,
      channel,
      workerId,
      ...payload,
    }, '*');
  }

  function isAllowedWorkerUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.href.startsWith(assetBase.href);
    } catch {
      return false;
    }
  }

  function normalizeWorkerOptions(options) {
    const normalized = {};
    if (options?.type === 'module' || options?.type === 'classic') {
      normalized.type = options.type;
    }
    if (options?.credentials === 'omit' || options?.credentials === 'same-origin' || options?.credentials === 'include') {
      normalized.credentials = options.credentials;
    }
    if (typeof options?.name === 'string') {
      normalized.name = options.name;
    }
    return normalized;
  }

  function createWorker(data) {
    if (!data.workerId || typeof data.url !== 'string' || !isAllowedWorkerUrl(data.url)) {
      throw new Error('Rejected sandbox worker request for an untrusted asset URL.');
    }

    const worker = new Worker(new URL(data.url, window.location.href).href, normalizeWorkerOptions(data.options));
    workers.set(data.workerId, worker);

    worker.addEventListener('message', event => {
      postToFrame(FRAME_WORKER_MESSAGE_MESSAGE, data.workerId, {
        message: event.data,
      });
    });
    worker.addEventListener('error', event => {
      postToFrame(FRAME_WORKER_ERROR_MESSAGE, data.workerId, {
        message: event.message || 'Worker error',
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
      });
    });
    worker.addEventListener('messageerror', () => {
      postToFrame(FRAME_WORKER_MESSAGE_ERROR_MESSAGE, data.workerId, {
        message: 'Worker message could not be cloned.',
      });
    });
  }

  return {
    handle(data) {
      try {
        if (data.type === FRAME_WORKER_CREATE_MESSAGE) {
          createWorker(data);
          return;
        }

        const worker = workers.get(data.workerId);
        if (!worker) {
          return;
        }

        if (data.type === FRAME_WORKER_POST_MESSAGE) {
          worker.postMessage(data.message);
          return;
        }

        if (data.type === FRAME_WORKER_TERMINATE_MESSAGE) {
          worker.terminate();
          workers.delete(data.workerId);
        }
      } catch (reason) {
        postToFrame(FRAME_WORKER_ERROR_MESSAGE, data.workerId || '', serializeError(reason));
      }
    },
    destroy() {
      workers.forEach(worker => worker.terminate());
      workers.clear();
    },
  };
}

const FileViewerComponent = {
  name: 'NextcloudFileViewerComponent',
  props: {
    path: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      default: '',
    },
    davPath: {
      type: String,
      default: '',
    },
    filename: {
      type: String,
      default: '',
    },
    basename: {
      type: String,
      default: '',
    },
    mime: {
      type: String,
      default: '',
    },
    size: {
      type: Number,
      default: undefined,
    },
  },
  data() {
    return {
      channel: createChannel(),
      error: null,
      frameIsReady: false,
      requestController: null,
      workerBridge: null,
    };
  },
  computed: {
    assetBaseUrl() {
      return new URL(viewerAssetBasePath, window.location.href).href;
    },
    frameUrl() {
      const url = new URL(viewerFramePath, window.location.href);
      url.searchParams.set('channel', this.channel);
      url.searchParams.set('assetBase', this.assetBaseUrl);
      return url.href;
    },
    resolvedSource() {
      return resolveFileSource(this.$props);
    },
    resolvedFilename() {
      return resolveFilename({
        ...this.$props,
        fallbackFilename: publicShareFilename,
      });
    },
    resolvedExtension() {
      return resolveFileExtension(this.resolvedFilename);
    },
    frameSandbox() {
      return resolveFrameSandbox(sandbox, this.resolvedExtension);
    },
  },
  mounted() {
    window.addEventListener('message', this.onFrameMessage);
  },
  beforeDestroy() {
    window.removeEventListener('message', this.onFrameMessage);
    this.abortRequest();
    this.destroyWorkerBridge();
  },
  methods: {
    ensureWorkerBridge() {
      if (!this.workerBridge) {
        this.workerBridge = createFrameWorkerBridge({
          frame: this.$refs.frame,
          channel: this.channel,
          assetBaseUrl: this.assetBaseUrl,
        });
      }
      return this.workerBridge;
    },
    destroyWorkerBridge() {
      if (this.workerBridge) {
        this.workerBridge.destroy();
        this.workerBridge = null;
      }
    },
    abortRequest() {
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
    },
    async loadFileIntoFrame() {
      if (!this.frameIsReady) {
        return;
      }

      this.abortRequest();
      this.destroyWorkerBridge();
      const requestController = new AbortController();
      this.requestController = requestController;

      try {
        const response = await fetch(this.resolvedSource, {
          credentials: 'same-origin',
          signal: requestController.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        if (requestController.signal.aborted) {
          return;
        }

        const frame = this.$refs.frame;
        if (!frame?.contentWindow) {
          throw new Error('File viewer iframe is not available');
        }

        frame.contentWindow.postMessage(
          createFrameLoadMessage({
            channel: this.channel,
            blob,
            filename: this.resolvedFilename,
            mime: this.mime || blob.type,
            size: this.size || blob.size,
            geo,
          }),
          '*'
        );
      } catch (reason) {
        if (reason?.name === 'AbortError') {
          return;
        }
        this.handleError(reason);
      }
    },
    handleError(reason) {
      this.error = serializeError(reason);
      this.$emit('update:loaded', true);
    },
    markFrameReady() {
      const wasReady = this.frameIsReady;
      this.frameIsReady = true;
      if (!wasReady) {
        void this.loadFileIntoFrame();
      }
    },
    onFrameLoad() {
      this.markFrameReady();
    },
    closeViewer() {
      if (window.OCA?.Viewer && typeof window.OCA.Viewer.close === 'function') {
        window.OCA.Viewer.close();
      }
    },
    onFrameMessage(event) {
      const frame = this.$refs.frame;
      if (!frame || event.source !== frame.contentWindow || !isFrameMessage(event.data, this.channel)) {
        return;
      }

      if (workerRequestMessages.has(event.data.type)) {
        this.ensureWorkerBridge().handle(event.data);
        return;
      }

      if (event.data.type === FRAME_READY_MESSAGE) {
        this.markFrameReady();
        return;
      }

      if (event.data.type === FRAME_LOADED_MESSAGE) {
        this.error = null;
        this.$emit('update:loaded', true);
        return;
      }

      if (event.data.type === FRAME_CLOSE_REQUEST_MESSAGE) {
        this.closeViewer();
        return;
      }

      if (event.data.type === FRAME_ERROR_MESSAGE) {
        this.handleError(event.data.error || 'The sandboxed file viewer failed to load the file.');
      }
    },
  },
  watch: {
    source() {
      void this.loadFileIntoFrame();
    },
    davPath() {
      void this.loadFileIntoFrame();
    },
    path() {
      void this.loadFileIntoFrame();
    },
    filename() {
      void this.loadFileIntoFrame();
    },
    basename() {
      void this.loadFileIntoFrame();
    },
  },
  render(h) {
    const children = [
      h('iframe', {
        ref: 'frame',
        attrs: {
          src: this.frameUrl,
          sandbox: this.frameSandbox,
          referrerpolicy: 'no-referrer',
          credentialless: 'true',
          allow: 'fullscreen',
          title: this.resolvedFilename,
        },
        on: {
          load: this.onFrameLoad,
        },
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        },
      }),
    ];

    if (this.error) {
      children.push(h('div', {
        attrs: {
          role: 'alert',
        },
        style: {
          position: 'absolute',
          inset: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'var(--color-main-background)',
          color: 'var(--color-main-text)',
          textAlign: 'center',
        },
      }, this.error.message));
    }

    return h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: '0',
        minHeight: '0',
      },
    }, children);
  },
};

if (enabledMimes.length > 0) {
	const handler = {
		id: APP_ID,
		mimes: enabledMimes,
		component: FileViewerComponent,
	};

  registerHandler(handler);
  installViewerHandlerPromotion(handler);
}
