# Flyfish File Viewer 3.1.1 renderer integration

## Goal

Upgrade Universal File Viewer from Flyfish 2.3.x to 3.1.1 and expose every newly available renderer family without regressing the existing sandboxed, offline-first viewer path.

## Scope

The app will continue using `@file-viewer/web-full` for the established Full renderer set and will explicitly add the 3.1.1 specialist renderers that are not reliably covered by the current prebuilt IIFE path:

- `@file-viewer/renderer-chm`
- `@file-viewer/renderer-binary`
- `@file-viewer/renderer-design`
- `@file-viewer/renderer-dicom`
- `@file-viewer/renderer-signature`

This enables CHM, binary inspection (`bin`, `hex`, `elf`, `exe`, `dll`, `class`, `macho`), Adobe/design formats, DICOM, and supported signature/evidence containers in addition to the existing Full formats.

## Architecture

Keep the upstream `web-full` IIFE and its lazy renderer loading unchanged for existing formats. Build the specialist renderer packages as project-local ESM entries and place their emitted modules, chunks, Workers, WASM, fonts, and other runtime assets under the existing `viewer/file-viewer` asset root.

`viewer/frame.js` will classify the incoming extension before assigning `viewer.source`. For specialist extensions it will dynamically import only the matching specialist renderer module, then pass that plugin through the source options with `rendererMode: 'extend'`. Existing extensions will not load specialist modules.

The specialist loader will cache module promises by renderer family so repeat previews do not refetch or re-evaluate the same renderer.

## Asset and sandbox handling

All specialist code and assets must remain self-hosted through the existing Nextcloud asset controller. No renderer may require a network fetch outside the configured app asset origin.

Where a specialist renderer starts a Worker from a package-relative URL, the build must emit that Worker into the copied asset tree. The existing opaque iframe Worker interception/preparation layer will be extended only where the new renderer actually needs a same-origin Worker URL prepared as a blob. Worker and WASM behavior will remain bounded by Flyfish's own renderer limits.

The Binary Inspector remains extension-scoped. The app must not register a generic `application/octet-stream` wildcard that would steal files from dedicated renderers.

## Format registration

Supported-format generation will use Flyfish 3.1.1's registered renderer inventory plus the explicitly enabled specialist renderer set. Every newly enabled extension must have a canonical Nextcloud MIME mapping, including safe fallback alternatives where Nextcloud may return a generic MIME.

Stable app format IDs remain `format:<extension>`, so existing administrator settings continue to survive the dependency upgrade.

## Playground and samples

The Playground blueprint will move to Flyfish 3.1.1 fixtures. Add representative samples for each newly enabled family when upstream provides a small deterministic fixture suitable for the repository's existing demo flow. Avoid adding large or ambiguous fixtures solely to exercise every extension alias.

## Verification

Add or update tests to cover:

- dependency and copied-asset version alignment at 3.1.1;
- generated format inventory containing representative extensions for CHM, binary, design, DICOM, and signatures;
- canonical MIME mappings for every newly registered extension;
- specialist extension-to-renderer routing and `rendererMode: 'extend'` wiring;
- copied specialist entry modules and required runtime assets;
- representative browser smoke coverage where the repository already has a suitable fixture and the renderer can run inside the existing sandbox.

Existing test suites remain the regression boundary for the established Full formats and iframe security behavior.

## Release shape

The implementation should update dependency metadata and generated/versioned artifacts consistently. The functional change should be committed separately from any subsequent release/version bump unless the user explicitly requests a release.