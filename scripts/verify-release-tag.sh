#!/bin/sh
set -eu

release_tag="${1:?A release tag is required}"
approved_branch="${2:-refs/remotes/origin/main}"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
trusted_key="${3:-$script_dir/../.github/release-signing-key.asc}"

if ! printf '%s\n' "$release_tag" | LC_ALL=C grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo 'Release tags must use vMAJOR.MINOR.PATCH.' >&2
  exit 1
fi
tag_ref="refs/tags/$release_tag"
if [ "$(git cat-file -t "$tag_ref")" != tag ]; then
  echo 'Release tags must be signed annotated tags.' >&2
  exit 1
fi

release_keyring="$(mktemp -d)"
trap 'rm -rf "$release_keyring"' EXIT HUP INT TERM
chmod 700 "$release_keyring"
gpg --batch --homedir "$release_keyring" --import "$trusted_key" >&2
GNUPGHOME="$release_keyring" git verify-tag "$tag_ref" >&2

release_commit="$(git rev-parse "$tag_ref^{commit}")"
if ! git merge-base --is-ancestor "$release_commit" "$approved_branch"; then
  echo 'The release commit must belong to protected main.' >&2
  exit 1
fi

printf 'tag_object=%s\ncommit=%s\n' "$(git rev-parse "$tag_ref")" "$release_commit"
