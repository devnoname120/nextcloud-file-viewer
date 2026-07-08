import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DEFAULT_SUPPORTED_EXTENSIONS } from '@file-viewer/core';
import { lookup } from 'mime-types';

const manualMimeOverrides = new Map([
  ['3dm', ['model/vnd.3dm']],
  ['3ds', ['image/x-3ds', 'application/x-3ds']],
  ['3mf', ['model/3mf']],
  ['7z', ['application/x-7z-compressed']],
  ['ai', ['application/postscript', 'application/illustrator']],
  ['amf', ['application/x-amf']],
  ['ar', ['application/x-archive', 'application/x-unix-archive']],
  ['avro', ['application/avro', 'application/x-avro']],
  ['bash', ['application/x-sh', 'text/x-shellscript', 'text/x-sh']],
  ['bdl', ['text/x-bdl', 'text/plain']],
  ['brep', ['model/x-brep']],
  ['bundle', ['text/x-git-bundle']],
  ['bzip2', ['application/x-bzip2']],
  ['cab', ['application/vnd.ms-cab-compressed']],
  ['cbr', ['application/x-cbr', 'application/vnd.comicbook-rar', 'application/comicbook+rar']],
  ['cbz', ['application/x-cbz', 'application/vnd.comicbook+zip', 'application/comicbook+zip']],
  ['cs', ['text/x-csharp']],
  ['dae', ['model/vnd.collada+xml']],
  ['diff', ['text/x-diff', 'text/x-patch']],
  ['dio', ['application/vnd.jgraph.mxfile', 'application/x-drawio']],
  ['drawio', ['application/vnd.jgraph.mxfile', 'application/x-drawio']],
  ['dwf', ['model/vnd.dwf', 'application/x-dwf']],
  ['dwfx', ['model/vnd.dwfx', 'application/x-dwfx']],
  ['dwg', ['image/vnd.dwg', 'image/x-dwg', 'application/acad', 'application/autocad_dwg', 'application/x-acad', 'application/x-dwg']],
  ['dxf', ['image/vnd.dxf', 'image/x-dxf', 'application/dxf', 'application/x-dxf']],
  ['eml', ['message/rfc822']],
  ['eps', ['application/postscript', 'image/x-eps']],
  ['excalidraw', ['application/vnd.excalidraw+json', 'application/x-excalidraw']],
  ['fbx', ['application/octet-fbx', 'model/fbx', 'application/x-fbx']],
  ['fods', ['application/vnd.oasis.opendocument.spreadsheet-flat-xml']],
  ['gds', ['application/x-gdsii']],
  ['geojson', ['application/geo+json', 'application/vnd.geo+json']],
  ['glb', ['model/gltf-binary']],
  ['gltf', ['model/gltf+json']],
  ['go', ['text/x-go']],
  ['gzip', ['application/gzip']],
  ['hcl', ['text/x-hcl']],
  ['heic', ['image/heic']],
  ['heif', ['image/heif']],
  ['hpp', ['text/x-c++hdr', 'text/x-c++src']],
  ['http', ['message/http', 'application/http']],
  ['ifc', ['application/x-ifc', 'model/ifc']],
  ['iges', ['model/iges']],
  ['igs', ['model/iges']],
  ['ipynb', ['application/x-ipynb+json']],
  ['jsonc', ['application/jsonc', 'application/json']],
  ['kt', ['text/x-kotlin']],
  ['lzma', ['application/x-lzma']],
  ['m3u8', ['application/vnd.apple.mpegurl', 'audio/mpegurl']],
  ['markdown', ['text/markdown', 'text/x-markdown']],
  ['mbox', ['application/mbox']],
  ['md', ['text/markdown', 'text/x-markdown']],
  ['mermaid', ['text/vnd.mermaid', 'text/x-mermaid']],
  ['mmd', ['text/vnd.mermaid', 'text/x-mermaid']],
  ['msg', ['application/vnd.ms-outlook', 'application/x-ole-storage']],
  ['numbers', ['application/vnd.apple.numbers']],
  ['oas', ['application/x-oasis-layout']],
  ['oasis', ['application/x-oasis-layout']],
  ['ofd', ['application/ofd', 'application/vnd.ofd']],
  ['olb', ['application/x-orcad-library']],
  ['parquet', ['application/vnd.apache.parquet']],
  ['patch', ['text/x-patch', 'text/x-diff']],
  ['pcd', ['application/x-pointcloud']],
  ['plantuml', ['text/x-plantuml']],
  ['ply', ['model/ply', 'application/x-ply']],
  ['proto', ['application/x-protobuf', 'text/x-protobuf']],
  ['psd', ['image/vnd.adobe.photoshop', 'image/x-photoshop', 'application/photoshop', 'application/x-photoshop']],
  ['puml', ['text/x-plantuml']],
  ['py', ['text/x-python', 'application/x-python-code']],
  ['rar', ['application/vnd.rar', 'application/x-rar-compressed']],
  ['rb', ['text/x-ruby']],
  ['react', ['text/x-react', 'text/jsx']],
  ['shp', ['application/x-esri-shape', 'application/x-shapefile', 'application/vnd.shp']],
  ['sqlite', ['application/vnd.sqlite3', 'application/x-sqlite3']],
  ['step', ['model/step']],
  ['stp', ['model/step']],
  ['stl', ['model/stl', 'application/vnd.ms-pki.stl']],
  ['swift', ['text/x-swift']],
  ['tbz', ['application/x-bzip-compressed-tar']],
  ['tbz2', ['application/x-bzip-compressed-tar']],
  ['tex', ['application/x-tex', 'text/x-tex']],
  ['tgz', ['application/gzip', 'application/x-compressed-tar']],
  ['ts', ['text/x-typescript', 'application/typescript']],
  ['tsx', ['text/tsx', 'text/x-typescript']],
  ['txz', ['application/x-xz-compressed-tar']],
  ['typ', ['text/x-typst']],
  ['typst', ['text/x-typst']],
  ['tzst', ['application/x-zstd-compressed-tar']],
  ['umd', ['application/x-umd']],
  ['usda', ['model/vnd.usda']],
  ['usdc', ['model/vnd.usdc']],
  ['usd', ['model/vnd.usd']],
  ['usdz', ['model/vnd.usdz+zip']],
  ['vtk', ['model/vnd.vtk']],
  ['vtp', ['model/vnd.vtk']],
  ['vue', ['text/x-vue', 'application/x-vue']],
  ['webarchive', ['application/x-webarchive']],
  ['xmind', ['application/vnd.xmind.workbook', 'application/x-xmind']],
  ['xps', ['application/vnd.ms-xpsdocument']],
  ['zipx', ['application/x-zip-compressed', 'application/zip']],
  ['zst', ['application/zstd', 'application/x-zstd']],
]);

const ignoredMimes = new Set(['application/octet-stream']);
const ignoredMimesByExtension = new Map([
  ['ts', new Set(['video/mp2t'])],
]);
const alwaysRegisteredMimes = [
  // Nextcloud's default MIME map does not know several extension-driven
  // Flyfish formats, so existing files can be stored as octet-stream.
  'application/octet-stream',
];

const extensions = [...DEFAULT_SUPPORTED_EXTENSIONS].sort();
const mimeByExtension = new Map();
const mimeSet = new Set();
const unregisteredExtensions = [];

for (const extension of extensions) {
  const candidates = [
    lookup(extension),
    ...(manualMimeOverrides.get(extension) || []),
  ].filter(Boolean);
  const ignoredForExtension = ignoredMimesByExtension.get(extension) || new Set();
  const mimes = [...new Set(candidates)]
    .filter(mime => !ignoredMimes.has(mime) && !ignoredForExtension.has(mime));

  if (mimes.length === 0) {
    unregisteredExtensions.push(extension);
    continue;
  }

  mimeByExtension.set(extension, mimes);
  mimes.forEach(mime => mimeSet.add(mime));
}

alwaysRegisteredMimes.forEach(mime => mimeSet.add(mime));

const supportedMimes = [...mimeSet].sort();

const output = `// Generated by scripts/generate-supported-formats.mjs. Do not edit by hand.
export const SUPPORTED_EXTENSIONS = ${formatArray(extensions)};

export const SUPPORTED_MIMES = ${formatArray(supportedMimes)};

export const UNREGISTERED_EXTENSIONS = ${formatArray(unregisteredExtensions)};

export const MIMES_BY_EXTENSION = ${formatObject(Object.fromEntries(mimeByExtension))};
`;

await writeFile(resolve('src/supportedFormats.generated.js'), output);

const phpOutput = `<?php

declare(strict_types=1);

namespace OCA\\FileViewer\\Service;

/**
 * Generated by scripts/generate-supported-formats.mjs. Do not edit by hand.
 */
final class SupportedMimes {
	/**
	 * @return list<string>
	 */
	public static function all(): array {
		return [
${supportedMimes.map(mime => `			'${escapePhpString(mime)}',`).join('\n')}
		];
	}
}
`;

await writeFile(resolve('lib/Service/SupportedMimes.php'), phpOutput);

function formatArray(values) {
  return `Object.freeze(${JSON.stringify(values, null, 2)})`;
}

function formatObject(value) {
  return `Object.freeze(${JSON.stringify(value, null, 2)})`;
}

function escapePhpString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
