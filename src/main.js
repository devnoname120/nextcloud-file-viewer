import { loadState } from '@nextcloud/initial-state';
import { generateUrl } from '@nextcloud/router';

import {
  APP_ID,
  DEFAULT_SANDBOX,
  EPUB_BOOTSTRAP_NAVIGATE_MESSAGE,
  EPUB_BOOTSTRAP_READY_MESSAGE,
  EPUB_FRAME_KIND,
  EPUB_RENDERER_GATE_READY_MESSAGE,
  EPUB_RENDERER_START_MESSAGE,
  EPUB_SANDBOX_PROBE_MESSAGE,
  EPUB_SANDBOX_PROBE_RESULT_MESSAGE,
  FRAME_CLOSE_REQUEST_MESSAGE,
  FRAME_CONNECTED_MESSAGE,
  FRAME_ERROR_MESSAGE,
  FRAME_DOCUMENT_LOADED_MESSAGE,
  FRAME_LOADED_MESSAGE,
  FRAME_READY_MESSAGE,
  FRAME_RUNTIME_READY_MESSAGE,
  createChannel,
  createFrameLoadMessage,
  isFrameMessage,
  resolveFrameKind,
  resolveFrameSandbox,
  resolveRendererSandbox,
  serializeError,
} from './frameProtocol.js';
import { normalizeEnabledMimes } from './formatSettings.js';
import { createViewerGeoOptions } from './geoSettings.js';
import { registerHandler } from './nextcloudViewerRegistration.js';
import { resolveFileExtension, resolveFileSource, resolveFilename } from './sourceResolution.js';
import { installViewerHandlerPromotion } from './viewerHandlerOrder.js';

const viewerFramePath = generateUrl('/apps/{APP_ID}/viewer/frame', { APP_ID });
const epubBootstrapFramePath = generateUrl('/apps/{APP_ID}/viewer/epub-bootstrap', { APP_ID });
const viewerAssetBasePath = generateUrl('/apps/{APP_ID}/assets/', { APP_ID });
const sandbox = loadState(APP_ID, 'sandbox', DEFAULT_SANDBOX);
const geo = loadState(APP_ID, 'geo', createViewerGeoOptions());
const enabledMimes = normalizeEnabledMimes(loadState(APP_ID, 'enabledMimes', []));
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
      connectedFrameKind: null,
      connectedFrameSandbox: null,
      error: null,
      frameBlocked: false,
      frameHandshakePhase: null,
      frameDocumentLoaded: false,
      frameIsReady: false,
      frameKindMode: null,
      frameNavigationArmed: false,
      framePort: null,
      frameProfileSandboxMode: null,
      frameSandboxMode: null,
      frameRuntimeReady: false,
      requestController: null,
    };
  },
  computed: {
    assetBaseUrl() {
      return new URL(viewerAssetBasePath, window.location.href).href;
    },
    frameUrl() {
      const framePath = this.frameKindMode === EPUB_FRAME_KIND
        ? epubBootstrapFramePath
        : viewerFramePath;
      const url = new URL(framePath, window.location.href);
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
    frameKind() {
      return resolveFrameKind(this.resolvedExtension);
    },
    frameSandbox() {
      return resolveFrameSandbox(sandbox, this.resolvedExtension);
    },
    rendererSandbox() {
      return resolveRendererSandbox(sandbox, this.resolvedExtension);
    },
  },
  created() {
    this.frameKindMode = this.frameKind;
    this.frameProfileSandboxMode = this.frameSandbox;
    this.frameSandboxMode = this.frameSandbox;
    this.frameHandshakePhase = this.initialFrameHandshakePhase(this.frameKindMode);
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
    attachFramePort(port, connect = true) {
      if (this.framePort) {
        port.close();
        return;
      }

      this.framePort = port;
      this.connectedFrameKind = this.frameKindMode;
      this.connectedFrameSandbox = this.frameProfileSandboxMode;
      port.addEventListener('message', this.onFramePortMessage);
      port.start();
      if (connect) {
        this.completeFrameConnection();
      }
    },
    completeFrameConnection() {
      if (!this.framePort) {
        return;
      }

      this.frameHandshakePhase = 'connected';
      this.framePort.postMessage({
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
      this.frameDocumentLoaded = false;
      this.frameNavigationArmed = false;
      this.frameRuntimeReady = false;
      this.connectedFrameKind = null;
      this.connectedFrameSandbox = null;
    },
    initialFrameHandshakePhase(frameKind) {
      return frameKind === EPUB_FRAME_KIND ? 'epub-bootstrap' : 'viewer';
    },
    ensureFrameSandbox() {
      const nextKind = this.frameKind;
      const nextSandbox = this.frameSandbox;
      if (
        this.frameKindMode === nextKind
        && this.frameProfileSandboxMode === nextSandbox
      ) {
        return false;
      }

      // Sandbox flags are fixed for the lifetime of the active document.
      // Rotate the channel and key so Vue replaces the iframe before a file
      // can cross between the direct and EPUB bootstrap security profiles.
      this.abortRequest();
      this.destroyFrameConnection();
      this.channel = createChannel();
      this.frameBlocked = false;
      this.frameKindMode = nextKind;
      this.frameDocumentLoaded = false;
      this.frameNavigationArmed = false;
      this.frameRuntimeReady = false;
      this.frameProfileSandboxMode = nextSandbox;
      this.frameSandboxMode = nextSandbox;
      this.frameHandshakePhase = this.initialFrameHandshakePhase(nextKind);
      this.error = null;
      return true;
    },
    onFileChanged() {
      if (this.frameBlocked) {
        this.abortRequest();
        this.destroyFrameConnection();
        this.channel = createChannel();
        this.frameBlocked = false;
        this.frameDocumentLoaded = false;
        this.frameNavigationArmed = false;
        this.frameRuntimeReady = false;
        this.frameKindMode = this.frameKind;
        this.frameProfileSandboxMode = this.frameSandbox;
        this.frameSandboxMode = this.frameSandbox;
        this.frameHandshakePhase = this.initialFrameHandshakePhase(this.frameKindMode);
        this.error = null;
        return;
      }

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
        || this.connectedFrameKind !== this.frameKind
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
          geo: this.connectedFrameKind === EPUB_FRAME_KIND ? undefined : geo,
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
      if (!frame || event.source !== frame.contentWindow) {
        return;
      }

      if (
        event.origin !== this.expectedFrameMessageOrigin()
        || !isFrameMessage(event.data, this.channel)
      ) {
        this.closeTransferredPorts(event);
        return;
      }

      if (this.framePort) {
        this.closeTransferredPorts(event);
        return;
      }

      if (
        this.frameKindMode === EPUB_FRAME_KIND
        && event.data.type === EPUB_BOOTSTRAP_READY_MESSAGE
      ) {
        this.handleEpubBootstrapReady(frame, event);
        return;
      }

      if (
        this.frameKindMode === EPUB_FRAME_KIND
        && event.data.type === EPUB_RENDERER_GATE_READY_MESSAGE
      ) {
        this.handleEpubRendererGateReady(frame, event);
        return;
      }

      if (event.data.type === FRAME_READY_MESSAGE) {
        const expectedPhase = this.frameKindMode === EPUB_FRAME_KIND
          ? 'epub-renderer'
          : 'viewer';
        if (this.frameHandshakePhase !== expectedPhase) {
          this.closeTransferredPorts(event);
          return;
        }

        const ports = Array.from(event.ports || []);
        const port = ports.length === 1 ? ports[0] : null;
        if (!port) {
          ports.forEach(transferredPort => transferredPort.close());
          this.handleError('The sandboxed file viewer did not provide a secure communication channel.');
          return;
        }

        this.attachFramePort(port);
        return;
      }

      if (event.data.type === FRAME_ERROR_MESSAGE) {
        const reason = event.data.error || 'The sandboxed file viewer failed to initialize.';
        if (this.frameKindMode === EPUB_FRAME_KIND && this.frameHandshakePhase !== 'connected') {
          this.blockFrame(reason);
          return;
        }
        this.handleError(reason);
      }
    },
    expectedFrameMessageOrigin() {
      if (this.frameKindMode === EPUB_FRAME_KIND) {
        return 'null';
      }

      const tokens = new Set(String(this.frameSandboxMode || '').split(/\s+/).filter(Boolean));
      return tokens.has('allow-same-origin') ? window.location.origin : 'null';
    },
    closeTransferredPorts(event) {
      for (const port of event.ports || []) {
        port.close();
      }
    },
    handleEpubBootstrapReady(frame, event) {
      if (this.frameHandshakePhase !== 'epub-bootstrap') {
        this.closeTransferredPorts(event);
        return;
      }
      if ((event.ports || []).length !== 0) {
        this.closeTransferredPorts(event);
        this.blockFrame('The EPUB bootstrap sent an invalid security handshake.');
        return;
      }

      this.frameSandboxMode = this.rendererSandbox;
      frame.setAttribute('sandbox', this.frameSandboxMode);
      if (frame.getAttribute('sandbox') !== this.frameSandboxMode) {
        this.blockFrame('The EPUB renderer sandbox could not be prepared.');
        return;
      }

      this.frameHandshakePhase = 'epub-gate';
      frame.contentWindow.postMessage({
        type: EPUB_BOOTSTRAP_NAVIGATE_MESSAGE,
        channel: this.channel,
      }, '*');
    },
    handleEpubRendererGateReady(frame, event) {
      const ports = Array.from(event.ports || []);
      if (this.frameHandshakePhase !== 'epub-gate') {
        this.closeTransferredPorts(event);
        return;
      }
      if (ports.length !== 1) {
        this.closeTransferredPorts(event);
        this.blockFrame('The EPUB renderer did not provide a secure communication channel.');
        return;
      }

      // The Blob committed with the renderer sandbox. Restore the strict
      // attribute before loading Flyfish or transferring file bytes, then
      // verify that this engine still lets EPUB.js create readable chapters.
      this.frameSandboxMode = this.frameProfileSandboxMode;
      frame.setAttribute('sandbox', this.frameSandboxMode);
      if (frame.getAttribute('sandbox') !== this.frameSandboxMode) {
        ports[0].close();
        this.blockFrame('The EPUB viewer sandbox could not be restored.');
        return;
      }

      this.attachFramePort(ports[0], false);
      this.frameHandshakePhase = 'epub-sandbox-probe';
      this.postEpubGateCommand(EPUB_SANDBOX_PROBE_MESSAGE);
    },
    handleEpubSandboxProbeResult(data) {
      if (
        this.frameHandshakePhase !== 'epub-sandbox-probe'
        || typeof data.readable !== 'boolean'
      ) {
        return;
      }

      if (data.readable) {
        this.frameHandshakePhase = 'epub-renderer';
        this.postEpubGateCommand(EPUB_RENDERER_START_MESSAGE);
        return;
      }

      this.blockFrame('This browser cannot render EPUB files without weakening Nextcloud origin isolation.');
    },
    postEpubGateCommand(type) {
      if (!this.framePort) {
        this.blockFrame('The EPUB security handshake was disconnected.');
        return;
      }

      this.framePort.postMessage({
        type,
        channel: this.channel,
      });
    },
    onFrameLoad() {
      if (!this.frameNavigationArmed) {
        return;
      }

      this.blockFrame('The sandboxed file viewer navigated unexpectedly and was disconnected.');
    },
    blockFrame(reason) {
      this.abortRequest();
      this.destroyFrameConnection();
      this.frameBlocked = true;
      this.frameHandshakePhase = 'blocked';
      this.handleError(reason);
    },
    onFramePortMessage(event) {
      if (event.target !== this.framePort || !isFrameMessage(event.data, this.channel)) {
        return;
      }

      if (
        this.frameKindMode === EPUB_FRAME_KIND
        && event.data.type === EPUB_SANDBOX_PROBE_RESULT_MESSAGE
      ) {
        this.handleEpubSandboxProbeResult(event.data);
        return;
      }

      if (
        this.frameKindMode === EPUB_FRAME_KIND
        && event.data.type === FRAME_RUNTIME_READY_MESSAGE
        && this.frameHandshakePhase === 'epub-renderer'
      ) {
        this.frameRuntimeReady = true;
        this.completeEpubFrameConnectionIfReady();
        return;
      }

      if (event.data.type === FRAME_DOCUMENT_LOADED_MESSAGE) {
        const expectedPhase = this.frameKindMode === EPUB_FRAME_KIND
          ? 'epub-renderer'
          : 'connected';
        if (this.frameHandshakePhase !== expectedPhase) {
          return;
        }
        this.frameDocumentLoaded = true;
        if (this.frameKindMode === EPUB_FRAME_KIND) {
          this.completeEpubFrameConnectionIfReady();
        } else {
          this.frameNavigationArmed = true;
        }
        return;
      }

      if (event.data.type === FRAME_ERROR_MESSAGE) {
        if (this.frameHandshakePhase !== 'connected') {
          this.blockFrame(event.data.error || 'The sandboxed file viewer failed to initialize.');
          return;
        }
        this.handleError(event.data.error || 'The sandboxed file viewer failed to load the file.');
        return;
      }

      if (this.frameHandshakePhase !== 'connected') {
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
    },
    completeEpubFrameConnectionIfReady() {
      if (
        this.frameKindMode !== EPUB_FRAME_KIND
        || this.frameHandshakePhase !== 'epub-renderer'
        || !this.frameRuntimeReady
        || !this.frameDocumentLoaded
      ) {
        return;
      }

      this.frameNavigationArmed = true;
      this.completeFrameConnection();
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
    const children = [];
    if (!this.frameBlocked) {
      children.push(h('iframe', {
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
        on: {
          load: this.onFrameLoad,
        },
      }));
    }

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
