import { loadState } from '@nextcloud/initial-state';
import { generateUrl } from '@nextcloud/router';

import {
	APP_ID,
  DEFAULT_SANDBOX,
  FRAME_CLOSE_REQUEST_MESSAGE,
  FRAME_CONNECTED_MESSAGE,
  FRAME_ERROR_MESSAGE,
  FRAME_LOADED_MESSAGE,
  FRAME_READY_MESSAGE,
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

const viewerFramePath = generateUrl('/apps/{APP_ID}/viewer/frame', { APP_ID });
const viewerAssetBasePath = generateUrl('/apps/{APP_ID}/assets/', { APP_ID });
const sandbox = loadState(APP_ID, 'sandbox', DEFAULT_SANDBOX);
const geo = loadState(APP_ID, 'geo', createViewerGeoOptions());
const enabledMimes = filterEnabledMimes(SUPPORTED_MIMES, loadState(APP_ID, 'disabledMimes', []));
const publicShareFilename = loadState('files_sharing', 'filename', '');

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
      connectedFrameSandbox: null,
      error: null,
      frameIsReady: false,
      framePort: null,
      frameSandboxMode: null,
      requestController: null,
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
  created() {
    this.frameSandboxMode = this.frameSandbox;
    window.addEventListener('message', this.onFrameMessage);
  },
  beforeDestroy() {
    this.destroyComponent();
  },
  beforeUnmount() {
    this.destroyComponent();
  },
  methods: {
    destroyComponent() {
      window.removeEventListener('message', this.onFrameMessage);
      this.abortRequest();
      this.destroyFrameConnection();
    },
    attachFramePort(port) {
      if (this.framePort) {
        port.close();
        return;
      }

      this.framePort = port;
      this.connectedFrameSandbox = this.frameSandboxMode;
      port.addEventListener('message', this.onFramePortMessage);
      port.start();
      port.postMessage({
        type: FRAME_CONNECTED_MESSAGE,
        channel: this.channel,
      });
      this.markFrameReady();
    },
    destroyFrameConnection() {
      if (this.framePort) {
        this.framePort.removeEventListener('message', this.onFramePortMessage);
        this.framePort.close();
        this.framePort = null;
      }
      this.frameIsReady = false;
      this.connectedFrameSandbox = null;
    },
    ensureFrameSandbox() {
      const nextSandbox = this.frameSandbox;
      if (this.frameSandboxMode === nextSandbox) {
        return false;
      }

      // Sandbox flags are fixed for the lifetime of the active document.
      // Rotate the channel and key so Vue replaces the iframe before the new
      // file can cross the EPUB same-origin boundary in either direction.
      this.abortRequest();
      this.destroyFrameConnection();
      this.channel = createChannel();
      this.frameSandboxMode = nextSandbox;
      this.error = null;
      return true;
    },
    onFileChanged() {
      if (!this.ensureFrameSandbox()) {
        void this.loadFileIntoFrame();
      }
    },
    abortRequest() {
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
    },
    async loadFileIntoFrame() {
      if (
        !this.frameIsReady
        || this.connectedFrameSandbox !== this.frameSandbox
      ) {
        return;
      }

      this.abortRequest();
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

        if (!this.framePort) {
          throw new Error('The secure file viewer channel is not connected.');
        }

        this.framePort.postMessage(createFrameLoadMessage({
          channel: this.channel,
          blob,
          filename: this.resolvedFilename,
          mime: this.mime || blob.type,
          size: blob.size,
          geo,
        }));
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

      if (this.framePort) {
        for (const port of event.ports || []) {
          port.close();
        }
        return;
      }

      if (event.data.type === FRAME_READY_MESSAGE) {
        const port = event.ports?.length === 1 ? event.ports[0] : null;
        if (!port) {
          this.handleError('The sandboxed file viewer did not provide a secure communication channel.');
          return;
        }
        this.attachFramePort(port);
        return;
      }

      if (event.data.type === FRAME_ERROR_MESSAGE) {
        this.handleError(event.data.error || 'The sandboxed file viewer failed to initialize.');
      }
    },
    onFramePortMessage(event) {
      if (event.target !== this.framePort || !isFrameMessage(event.data, this.channel)) {
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
      this.onFileChanged();
    },
    davPath() {
      this.onFileChanged();
    },
    path() {
      this.onFileChanged();
    },
    filename() {
      this.onFileChanged();
    },
    basename() {
      this.onFileChanged();
    },
  },
  render(h) {
    const children = [
      h('iframe', {
        key: this.channel,
        ref: 'frame',
        attrs: {
          src: this.frameUrl,
          sandbox: this.frameSandboxMode,
          referrerpolicy: 'no-referrer',
          credentialless: 'true',
          allow: 'fullscreen',
          title: this.resolvedFilename,
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
