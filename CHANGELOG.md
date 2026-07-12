# Changelog

All notable changes to Universal File Viewer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devnoname120/nextcloud-file-viewer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devnoname120/nextcloud-file-viewer/releases/tag/v0.1.0
