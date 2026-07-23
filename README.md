# Universal File Viewer

Universal File Viewer is a Nextcloud app that registers [Flyfish File Viewer](https://github.com/flyfish-dev/file-viewer) as a handler for
the 200+ file types supported by Flyfish.

The app renders files in a sandboxed iframe. The parent Nextcloud Viewer component
fetches the selected file with the authenticated Viewer URL and transfers the file
Blob over a document-bound `MessageChannel`. The default sandbox intentionally does
not include `allow-same-origin`. EPUB files use a two-stage bootstrap that commits
the renderer to an opaque `blob:null` document before any file bytes are transferred.
The renderer cannot read the parent Nextcloud document, while EPUB chapter content
stays in a nested iframe that allows its own origin but deliberately does not allow
scripts.

## Supported Formats

Universal File Viewer uses [Flyfish Viewer](https://github.com/flyfish-dev/file-viewer) and thus supports 200+ formats:
[supported formats](https://github.com/flyfish-dev/file-viewer/blob/main/README.en.md#supported-formats)
matrix.

| Category | Extensions |
| --- | --- |
| Word | `docx`, `docm`, `dotx`, `dotm` |
| Legacy Word | `doc`, `dot` |
| Compatible documents | `rtf`, `odt` |
| Excel | `xlsx`, `xltx` |
| Excel-compatible | `xlsm`, `xlsb`, `xls`, `xlt`, `xltm`, `csv`, `tsv`, `ods`, `fods`, `numbers` |
| PowerPoint | `ppt`, `pptx`, `pptm`, `potx`, `potm`, `ppsx`, `ppsm`, `odp` |
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

## File format settings

The administration page exposes human-readable format groups such as JPEG (`.jpg`,
`.jpeg`), Markdown (`.md`, `.markdown`), and EPUB (`.epub`). It does not expose raw
MIME type strings.

Universal File Viewer keeps Flyfish's supported-extension inventory, then resolves
those extensions through Nextcloud's effective extension-to-MIME mapping using
`OCP\Files\IMimeTypeDetector::getAllMappings()`. During installation, upgrades, and
re-enabling, the app adds fallback mappings for supported extensions that are absent
from both Nextcloud core and the administrator's `mimetypemapping.json`.
Administrator entries always win. The app tracks its exact additions, yields when
Nextcloud later gains a core mapping, and removes only unchanged app-owned entries during uninstall. The
resulting deduplicated MIME types are used internally when registering the Viewer
handler.

When several supported extensions resolve to the same MIME type, Nextcloud Viewer
cannot dispatch them independently. The settings page therefore combines them into
one option and lists every affected extension. Shared aliases keep their format name,
such as JPEG, while distinct formats use an explicit label such as `DOC/DOT`. Saved
preferences use stable app-specific format identifiers; existing `disabled_mimes`
preferences are migrated against the current Nextcloud mapping.

## Build

```bash
npm ci --strict-allow-scripts
npm run build
```

The build requires Node.js 24 or later and npm 11.16.0 or later. The npm policy
fails closed if a dependency adds an unreviewed lifecycle script.

The build generates `src/supportedFormats.generated.js`,
`lib/Generated/SupportedFormats.php`, and `lib/Generated/MimeTypeMappings.php` from
Flyfish's renderer definitions, bundles the Viewer registration script into
`js/fileviewer-main.mjs`, and copies Flyfish runtime assets into
`viewer/file-viewer/`. It also verifies that every locked package
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

For `.epub` files, an HTTP bootstrap starts with the stricter `allow-scripts`
sandbox and creates the final renderer Blob from a fixed application template. The
parent briefly grants `allow-same-origin` only while that already-opaque bootstrap
navigates to its `blob:null` URL. A small renderer gate establishes a
document-bound `MessageChannel`; the parent then restores the strict sandbox before
loading Flyfish or transferring the EPUB. The gate probes whether the browser can
still create the readable nested chapter iframe EPUB.js requires. Chromium and
Firefox pass this probe. Current WebKit/Safari fails closed with an explanatory
error instead of retaining an outer sandbox configuration that could become
same-origin after a later navigation.

Flyfish and EPUB.js render untrusted chapter content in a nested iframe whose
sandbox contains `allow-same-origin` but not `allow-scripts`, so chapter scripts and
event handlers cannot run. The outer renderer remains opaque and cannot read the
parent Nextcloud document. Once its final load is confirmed over the bound channel,
any later outer-frame navigation disconnects and removes the viewer. The browser
test suite checks the origin boundary, publisher styling, script isolation,
fail-closed behavior, and unexpected-navigation handling; Flyfish and EPUB.js
upgrades should be treated as security-sensitive changes.

Other file types keep the configured outer sandbox unchanged. Switching across the
EPUB boundary closes the old channel, rotates its token, and replaces the iframe so
the browser applies the new origin policy to a fresh document.

Parser workers do not run in the parent Nextcloud page. For PDF, DOCX-family,
PPTX-family, DWG, STEP/IGES/BREP, and spreadsheet files of at least 1 MiB, the frame fetches the
exact configured bundled worker without credentials, creates a frame-owned `blob:`
URL, and starts the worker from inside the sandbox. Under the default sandbox these
workers have the opaque `null` origin. Libarchive formats use the same frame-owned
`blob:` isolation model. Legacy PPT uses Flyfish's asynchronous direct path because
its integrity-verifying Worker requires Web Crypto, which Chromium does not expose
to an opaque `blob:null` Worker. Smaller spreadsheet files and legacy PPT parse on
the iframe's main thread, which is also sandboxed.

The only default-page CSP additions are `frame-src 'self' blob:`, and they are added
only to responses that dispatch Nextcloud's Viewer-loading event. The app does not
add instance-wide worker, connection, WebAssembly-eval, style, image, font, or media
allowances. The direct iframe response has its own scoped CSP for local assets,
frame-owned `blob:` workers, renderer-required evaluation and WebAssembly, and the
configured geospatial tile origin. The EPUB bootstrap uses a separate, narrower CSP
without geospatial origins.

If a deployment needs to trade isolation for non-EPUB compatibility with specific
browser worker or WASM behavior, administrators can override the general sandbox.
EPUB always uses the hardened bootstrap and does not fall back to a same-origin
Nextcloud document:

```bash
occ config:app:set fileviewer sandbox --value="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups allow-presentation"
```
