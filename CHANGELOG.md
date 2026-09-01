# Changelog

All notable changes to Universal File Viewer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.4] - 2026-09-01

### Fixed

- Added canonical MIME mappings for Flyfish 2.3.7's new FB2, HWP/HWPX, and WordPerfect extensions so supported-format generation succeeds.
- Added regression coverage against Flyfish's live supported-extension inventory so future dependency updates fail in unit tests before generated format files become stale.

## [0.5.3] - 2026-09-01

### Changed

- Updated Flyfish File Viewer from core 2.2.9/web-full 2.2.9 to core 2.3.0/web-full 2.3.7 and aligned dependency verification with Flyfish's independently versioned direct packages.
- Updated `@nextcloud/vue` from 9.9.0 to 9.10.0 and Vite from 8.2.1 to 8.2.2, with refreshed transitive dependency resolutions.
- Updated the Nextcloud Playground demo to install version 0.5.3 and use Flyfish 2.3.7 samples.

## [0.5.2] - 2026-08-25

### Changed

- Updated the Nextcloud Vue integration from 9.8.2 to 9.9.0 and Vue from 3.5.39 to 3.5.41.
- Updated the development toolchain to Playwright 1.62.1, TypeScript 7.0.2, and Vite 8.2.1.
- Updated the Nextcloud Playground demo to install version 0.5.2.

## [0.5.1] - 2026-08-18

### Changed

- Updated the bundled Flyfish File Viewer packages from 2.2.3 to 2.2.9.
- Use Flyfish CAD 0.8.0's versioned DWG and DWF runtime paths and resolve Flyfish's CAD/DOCX version queries to the already-prepared opaque worker assets.
- Updated the Nextcloud Playground demo to install version 0.5.1 and use Flyfish 2.2.9 samples.

## [0.5.0] - 2026-07-24

### Added

- Added legacy PowerPoint (`.ppt`) and tab-separated value (`.tsv`) previews to the generated format settings and Nextcloud MIME mappings.

### Changed

- Updated the bundled Flyfish File Viewer packages from 2.1.23 to 2.2.3, including the self-hosted PPT, OCCT model, PDF font, CAD, and EPUB runtime updates.
- Run the new STEP/IGES/BREP parser worker inside the existing opaque sandbox worker boundary.
- Use the legacy PPT renderer's asynchronous direct path inside the opaque iframe because its integrity-verifying Worker requires Web Crypto, which is unavailable to opaque Chromium workers.

## [0.4.0] - 2026-07-12

### Changed

- Replaced raw MIME controls with human-readable extension groups backed by stable app format identifiers.
- Resolve Viewer registrations from Nextcloud's effective extension-to-MIME mapping, including administrator overrides, and migrate existing disabled-MIME preferences.
- Register fallback extension-to-MIME mappings for every Flyfish-supported format while preserving administrator and future Nextcloud core mappings.
- Label MIME-colliding format groups with explicit extensions such as `DOC/DOT` and `C/CC` instead of generic MIME descriptions.
- Show Markdown alongside source and text formats in the `Code and text` section.
- Sort format names alphabetically within each settings section.
- Remove MIME-registration bookkeeping when the app is disabled or uninstalled while preserving administrator mappings and user format preferences.
- Avoid racing Nextcloud's queued Viewer registration when promoting Universal File Viewer ahead of built-in handlers.

## [0.3.1] - 2026-07-12

### Added

- Added source repository, user, administrator, developer, and discussion metadata.
- Added a complete AGPL-3.0-or-later licence file to the source and release archive.
- Added App Store and user-facing release changelogs from one canonical source file.
- Added an optimized App Store banner thumbnail.
- Added Composer homepage, documentation, issue tracker, and source support metadata.

### Changed

- Replaced the deprecated `agpl` licence alias with the exact `AGPL-3.0-or-later` SPDX identifier.
- Removed the obsolete raster app icon so Nextcloud consistently uses the maintained SVG glyphs.

## [0.3.0] - 2026-07-11

### Added

- Renamed the app to Universal File Viewer and refreshed its App Store artwork.
- Added automatic saving for geospatial basemap settings.
- Added request-scoped content security policies and sandbox-local parser workers.

### Security

- Hardened viewer communication with document-bound message channels and navigation fail-closed behavior.
- Moved EPUB rendering to an opaque `blob:null` bootstrap while preserving publisher styling and blocking chapter scripts.

## [0.2.0] - 2026-07-10

### Added

- Added Nextcloud 33 support, Vue 3 administration settings, release automation, and App Store artwork.

## [0.1.0] - 2026-07-09

### Added

- Initial App Store release with Flyfish-powered previews and grouped MIME settings.

[Unreleased]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.4...HEAD
[0.5.4]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devnoname120/nextcloud-file-viewer/releases/tag/v0.1.0
