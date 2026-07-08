# File Viewer

File Viewer is a Nextcloud app that registers Flyfish File Viewer as a handler for
the file types supported by Flyfish.

The app renders files in a sandboxed iframe. The parent Nextcloud Viewer component
fetches the selected file with the authenticated Viewer URL and posts the file Blob
to the iframe. The default sandbox intentionally does not include `allow-same-origin`
for most file types. EPUB previews add `allow-same-origin` automatically because
EPUB.js renders chapters in a nested iframe and must read that child document to
finish layout.

## Build

```bash
npm install
npm run build
```

The build generates `src/supportedFormats.generated.js`, bundles the Viewer
registration script into `js/fileviewer-main.mjs`, and copies Flyfish runtime
assets into `viewer/file-viewer/`.

## Sandbox

The default sandbox is:

```text
allow-scripts allow-downloads allow-forms allow-modals allow-popups allow-presentation
```

For `.epub` files the app adds `allow-same-origin` to that sandbox at runtime.
Other file types keep the configured sandbox unchanged.

If a deployment needs to trade isolation for compatibility with specific browser
worker or WASM behavior, administrators can override it:

```bash
occ config:app:set fileviewer sandbox --value="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups allow-presentation"
```
