# Flyfish File Viewer 3.1.1 Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Nextcloud app to Flyfish File Viewer 3.1.1, enable CHM plus every 3.1.1 opt-in renderer, validate the integration, and publish patch release 0.5.5.

**Architecture:** Preserve the existing `@file-viewer/web-full` lazy IIFE for established formats. Bundle CHM, Binary Inspector, Design, DICOM, and Signature plugins into project-local lazy ESM entrypoints, load only the specialist matching the current extension in `viewer/frame.js`, and extend the Full preset through `rendererMode: 'extend'`. Keep all renderer code, Workers, WASM, fonts, and support files under the existing self-hosted `viewer/file-viewer` asset route.

**Tech Stack:** Node.js 24, npm 11, Vite 8, Flyfish File Viewer 3.1.1, Node test runner, Playwright, PHP/Nextcloud app packaging, GitHub Actions.

---

### Task 1: Lock the new format and dependency contract with failing tests

**Files:**
- Modify: `tests/supportedFormats.test.mjs`
- Modify: `tests/mimeTypeMappings.test.mjs`
- Modify: `tests/dependencyIntegrity.test.mjs`
- Create: `tests/specialistRenderers.test.mjs`

- [ ] Add representative assertions for `chm`, `bin`, `elf`, `psb`, `idml`, `dcm`, and `p7m` in the generated JavaScript/PHP format inventories.
- [ ] Add canonical MIME assertions for the new specialist families and retain the invariant that Binary Inspector does not create an `application/octet-stream` wildcard registration.
- [ ] Extend the dependency fixture so core, web-full, CHM, binary, design, DICOM, and signature direct packages are all version-locked and verified.
- [ ] Add a static wiring test defining the specialist extension groups, the expected lazy module paths, `rendererMode: 'extend'`, and per-extension lazy routing contract.
- [ ] Run the focused tests and confirm failure because 3.1.1 formats/dependencies/routing are not implemented yet:
  `node --test tests/supportedFormats.test.mjs tests/mimeTypeMappings.test.mjs tests/dependencyIntegrity.test.mjs tests/specialistRenderers.test.mjs`.

### Task 2: Upgrade Flyfish and generate complete format metadata

**Files:**
- Modify: `package.json`
- Regenerate: `package-lock.json`
- Modify: `scripts/verify-dependencies.mjs`
- Modify: `scripts/mime-type-mappings.mjs`
- Modify: `scripts/generate-supported-formats.mjs`
- Regenerate: `src/supportedFormats.generated.js`
- Regenerate: `lib/Generated/SupportedFormats.php`
- Regenerate: `lib/Generated/MimeTypeMappings.php`

- [ ] Install `@file-viewer/core@3.1.1`, `@file-viewer/web-full@3.1.1`, `@file-viewer/renderer-chm@3.1.1`, `@file-viewer/renderer-binary@3.1.1`, `@file-viewer/renderer-design@3.1.1`, `@file-viewer/renderer-dicom@3.1.1`, and `@file-viewer/renderer-signature@3.1.1` as direct production dependencies, refreshing transitive resolutions.
- [ ] Make dependency verification cover all seven direct Flyfish packages while continuing to validate the web-full manifest/copy.
- [ ] Add exact-extension MIME mappings for every newly registered format that `mime-types` cannot resolve or resolves ambiguously. For binary formats, allow `application/octet-stream` only as an exact fallback alternative attached to a specific extension, never as a wildcard.
- [ ] Add friendly category labels for the new medical/signature groups.
- [ ] Run `npm run generate:formats` until the complete Flyfish 3.1.1 registered inventory generates without an unmapped extension.
- [ ] Re-run the focused format/dependency tests and make them pass.

### Task 3: Build and lazily integrate specialist renderer bundles

**Files:**
- Create: `src/specialistRenderers/binary.js`
- Create: `src/specialistRenderers/chm.js`
- Create: `src/specialistRenderers/design.js`
- Create: `src/specialistRenderers/dicom.js`
- Create: `src/specialistRenderers/signature.js`
- Create: `vite.specialist.config.js`
- Modify: `package.json`
- Modify: `scripts/copy-viewer-assets.mjs`
- Modify: `viewer/frame.js`
- Modify: `tests/specialistRenderers.test.mjs`

- [ ] Export exactly one Flyfish renderer plugin from each specialist entry.
- [ ] Add a Vite library build that emits stable entry filenames under `viewer/file-viewer/specialists/` while allowing hashed shared chunks/assets/Workers.
- [ ] Run this build after copying upstream web-full assets so `copy-viewer-assets` cannot delete specialist output.
- [ ] In `viewer/frame.js`, map the exact specialist extensions to their entry module, cache import promises by family, and load the plugin before assigning `viewer.source`.
- [ ] For specialist previews, merge `{ rendererMode: 'extend', renderers: [plugin] }` into the existing viewer options. Do not change ordinary Full-format options.
- [ ] Extend sandbox Worker preparation only for specialist Worker URLs actually emitted/used by the bundles. Keep Worker loading self-hosted through the asset controller.
- [ ] Run `node --test tests/specialistRenderers.test.mjs tests/securityWiring.test.mjs` and iterate to green.

### Task 4: Update demo fixtures and browser regression coverage

**Files:**
- Modify: `blueprint.json`
- Modify: `tests/e2e/iframe-smoke.spec.mjs`
- Modify: `tests/e2e/nextcloud-samples.spec.mjs` when suitable upstream fixtures exist
- Modify: `tests/e2e/upstream-examples.spec.mjs` when suitable upstream fixtures exist

- [ ] Move Flyfish sample URLs from v2.3.7 to v3.1.1.
- [ ] Add small deterministic upstream fixtures representing CHM, binary, design, DICOM, and signature families where available in v3.1.1.
- [ ] Add browser smoke assertions for representative specialist renderers that can run in the existing opaque sandbox.
- [ ] Run the focused Playwright iframe suite and fix any CSP/Worker/asset-path regressions before proceeding.

### Task 5: Run complete local validation

**Files:** none unless failures expose a regression.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:browser:iframe`.
- [ ] Run `npm run verify:dependencies` and `npm run verify:copied-assets`.
- [ ] Run `npm run audit:production` and address actionable production dependency failures caused by this update.
- [ ] If any verification exposes a behavioral defect, add a failing regression test first, implement the minimal fix, and rerun the affected plus full suites.

### Task 6: Prepare and publish Universal File Viewer 0.5.5

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `appinfo/info.xml`
- Modify: `CHANGELOG.md`
- Modify: `blueprint.json`
- Modify: any other release-version reference found by repository search

- [ ] Set the app/package version to `0.5.5`, including screenshot tag metadata and Playground install URL.
- [ ] Add a dated `0.5.5` changelog section describing Flyfish 3.1.1, CHM/Binary/Design/DICOM/Signature support, and the updated lazy self-hosted renderer integration; advance compare links.
- [ ] Rerun `npm test`, `npm run build`, and the focused browser iframe suite on the exact release tree.
- [ ] Present the aggregate project diff with `show_diff`, inspect `git status`, and commit the implementation/release changes intentionally.
- [ ] Push `main`, create annotated/lightweight tag `v0.5.5` consistent with prior releases, and push the tag.
- [ ] Use `gh` to follow the `Release appstore` workflow to a terminal success state. Verify the `v0.5.5` GitHub release exists, contains exactly the expected `fileviewer-0.5.5.tar.gz` asset, and that the workflow's `Push to Nextcloud appstore` step succeeded before reporting completion.