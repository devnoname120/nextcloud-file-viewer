# File Viewer

File Viewer is a Nextcloud app that registers [Flyfish File Viewer](https://github.com/flyfish-dev/file-viewer) as a handler for
the 200+ file types supported by Flyfish.

The app renders files in a sandboxed iframe. The parent Nextcloud Viewer component
fetches the selected file with the authenticated Viewer URL and transfers the file
Blob over a document-bound `MessageChannel`. The default sandbox intentionally does
not include `allow-same-origin` for most file types. The outer EPUB viewer adds
`allow-same-origin` because EPUB.js must read its nested chapter iframe to finish
layout. EPUB chapter content remains inside that nested iframe, which allows its
origin but deliberately does not allow scripts.

## Supported Formats

File Viewer uses [Flyfish Viewer](https://github.com/flyfish-dev/file-viewer) and thus supports 200+ formats:
[supported formats](https://github.com/flyfish-dev/file-viewer/blob/main/README.en.md#supported-formats)
matrix.

| Category | Extensions |
| --- | --- |
| Word | `docx`, `docm`, `dotx`, `dotm` |
| Legacy Word | `doc`, `dot` |
| Compatible documents | `rtf`, `odt` |
| Excel | `xlsx`, `xltx` |
| Excel-compatible | `xlsm`, `xlsb`, `xls`, `xlt`, `xltm`, `csv`, `ods`, `fods`, `numbers` |
| PowerPoint | `pptx`, `pptm`, `potx`, `potm`, `ppsx`, `ppsm`, `odp` |
| PDF | `pdf` |
| OFD | `ofd` |
| Typst | `typ`, `typst` |
| Archives | `zip`, `zipx`, `7z`, `rar`, `tar`, `gz`, `tgz`, `bz2`, `xz`, `zst`, `cab`, `iso`, `jar`, `apk`, `cbz`, `cbr`, and more |
| Email | `eml`, `msg`, `mbox` |
| EDA | `olb`, `dra`, `gds`, `oas`, `oasis` |
| CAD | `dwg`, `dxf`, `dwf`, `dwfx`, `xps` |
| Geospatial data | `geojson`, `kml`, `gpx`, `shp` |
| 3D models | `glb`, `gltf`, `obj`, `stl`, `ply`, `fbx`, `dae`, `3ds`, `3mf`, `amf`, `usd`, `usda`, `usdc`, `usdz`, `kmz`, `pcd`, `wrl`, `vrml`, `xyz`, `vtk`, `vtp`, `step`, `stp`, `iges`, `igs`, `ifc`, `3dm` |
| XMind mind maps | `xmind` |
| Excalidraw | `excalidraw` |
| draw.io | `drawio`, `dio` |
| Mermaid | `mermaid`, `mmd` |
| PlantUML | `plantuml`, `puml` |
| EPUB | `epub` |
| UMD ebook | `umd` |
| Markdown | `md`, `markdown` |
| Images | `gif`, `jpg`, `jpeg`, `bmp`, `tiff`, `tif`, `png`, `svg`, `webp`, `avif`, `ico`, `heic`, `heif`, `jxl` |
| Source and text | `txt`, `json`, `jsonc`, `json5`, `ipynb`, `js`, `mjs`, `cjs`, `css`, `java`, `py`, `html`, `htm`, `jsx`, `ts`, `tsx`, `xml`, `log`, `vue`, `yaml`, `yml`, `toml`, `ini`, `proto`, `hcl`, `tex`, `gv`, `http`, `sh`, `bash`, `sql`, `go`, `rs`, `rb`, `swift`, `kt`, `react`, `php`, `c`, `cpp`, `cc`, `h`, `hpp`, `cs`, `diff`, `patch`, `bundle`, `bdl` |
| Audio | `mp3`, `mpeg`, `wav`, `ogg`, `oga`, `opus`, `m4a`, `aac`, `flac`, `weba`, `midi`, `mid` |
| Video | `mp4`, `webm`, `m3u8` |
| Fonts, design assets, and data | `ttf`, `otf`, `woff`, `woff2`, `psd`, `ai`, `eps`, `sqlite`, `wasm`, `parquet`, `avro`, `webarchive` |

## Build

```bash
npm ci --strict-allow-scripts
npm run build
```

The build requires Node.js 24 or later and npm 11.16.0 or later. The npm policy
fails closed if a dependency adds an unreviewed lifecycle script.

The build generates `src/supportedFormats.generated.js`, bundles the Viewer
registration script into `js/fileviewer-main.mjs`, and copies Flyfish runtime
assets into `viewer/file-viewer/`. It also verifies that every locked package
comes from the npm registry with an integrity hash and that the copied Flyfish
manifest matches the locked version. `make dist` additionally fails on known
production dependency advisories and runs the Chromium sandbox security suite.
Run `npx playwright install chromium` once before building a release package on
a new development machine.

## Sandbox

The default sandbox is:

```text
allow-scripts allow-downloads allow-forms allow-modals allow-popups allow-presentation
```

For `.epub` files the app adds `allow-same-origin` to the outer viewer sandbox at
runtime. Because the outer viewer URL is served by Nextcloud, its document is then
same-origin with the parent Nextcloud page. Flyfish and EPUB.js render the untrusted
chapter content in a second, nested iframe whose sandbox contains
`allow-same-origin` but not `allow-scripts`. Chapter scripts and event handlers
therefore cannot run. The browser test suite checks this invariant with a scripted
EPUB; Flyfish and EPUB.js upgrades should be treated as security-sensitive changes.
Other file types keep the configured outer sandbox unchanged. Switching across the
EPUB boundary closes the old channel, rotates its token, and replaces the iframe so
the browser applies the new origin policy to a fresh document.

Parser workers do not run in the parent Nextcloud page. For PDF, DOCX-family,
PPTX-family, DWG, and spreadsheet files of at least 1 MiB, the frame fetches the
exact configured bundled worker without credentials, creates a frame-owned `blob:`
URL, and starts the worker from inside the sandbox. Under the default sandbox these
workers have the opaque `null` origin. Libarchive formats use the same frame-owned
`blob:` isolation model. Smaller spreadsheet files parse on the iframe's main
thread, which is also sandboxed.

The only default-page CSP addition is `frame-src 'self'`, and it is added only to
responses that dispatch Nextcloud's Viewer-loading event. The app does not add
instance-wide worker, connection, blob, WebAssembly-eval, style, image, font, or
media allowances. The iframe response has its own scoped CSP for its local assets,
frame-owned `blob:` workers, renderer-required evaluation and WebAssembly, and the
configured geospatial tile origin.

If a deployment needs to trade isolation for compatibility with specific browser
worker or WASM behavior, administrators can override it:

```bash
occ config:app:set fileviewer sandbox --value="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups allow-presentation"
```
