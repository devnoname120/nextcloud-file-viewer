#!/usr/bin/env python3

import hashlib
import posixpath
import sys
import tarfile


def normalized_member_name(name: str) -> str:
    if not name or name.startswith('/'):
        raise ValueError(f'Archive contains an invalid absolute or empty path: {name!r}')

    normalized = posixpath.normpath(name)
    if normalized == '..' or normalized.startswith('../'):
        raise ValueError(f'Archive path escapes its root: {name!r}')
    return normalized


def archive_manifest(path: str) -> dict[str, tuple[str, int, int, str]]:
    manifest: dict[str, tuple[str, int, int, str]] = {}
    with tarfile.open(path, mode='r:*') as archive:
        for member in archive.getmembers():
            name = normalized_member_name(member.name)
            if name in manifest:
                raise ValueError(f'Archive contains a duplicate path: {name!r}')

            if member.isdir():
                manifest[name] = ('directory', member.mode, 0, '')
                continue
            if not member.isfile():
                raise ValueError(f'Archive contains an unsupported non-file entry: {name!r}')

            source = archive.extractfile(member)
            if source is None:
                raise ValueError(f'Archive file cannot be read: {name!r}')
            digest = hashlib.sha256()
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
            manifest[name] = ('file', member.mode, member.size, digest.hexdigest())

    if not manifest:
        raise ValueError('Archive is empty.')
    return manifest


def compare_archives(expected_path: str, existing_path: str) -> None:
    expected = archive_manifest(expected_path)
    existing = archive_manifest(existing_path)
    if expected == existing:
        return

    expected_names = set(expected)
    existing_names = set(existing)
    missing = sorted(expected_names - existing_names)
    unexpected = sorted(existing_names - expected_names)
    changed = sorted(
        name for name in expected_names & existing_names
        if expected[name] != existing[name]
    )
    details = []
    if missing:
        details.append(f'missing paths: {", ".join(missing[:5])}')
    if unexpected:
        details.append(f'unexpected paths: {", ".join(unexpected[:5])}')
    if changed:
        details.append(f'changed paths: {", ".join(changed[:5])}')
    raise ValueError('Archive payloads differ; ' + '; '.join(details))


def main() -> int:
    if len(sys.argv) != 3:
        print('Usage: compare-release-archives.py EXPECTED.tar.gz EXISTING.tar.gz', file=sys.stderr)
        return 2

    try:
        compare_archives(sys.argv[1], sys.argv[2])
    except (OSError, tarfile.TarError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
