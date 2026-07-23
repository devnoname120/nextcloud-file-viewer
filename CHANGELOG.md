# Changelog

All notable changes to Universal File Viewer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devnoname120/nextcloud-file-viewer/releases/tag/v0.1.0
