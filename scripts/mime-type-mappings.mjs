import { lookup } from 'mime-types';

// These overrides either fill gaps in mime-db or resolve extensions whose
// generic database meaning differs from the format rendered by Flyfish.
const MIME_OVERRIDES = new Map([
	['3dm', ['model/vnd.3dm']],
	['3ds', ['model/x-3ds']],
	['amf', ['application/x-amf']],
	['ar', ['application/x-archive']],
	['avro', ['application/avro']],
	['bash', ['text/x-shellscript']],
	['bdl', ['text/x-bdl']],
	['brep', ['model/x-brep']],
	['bundle', ['application/x-git-bundle']],
	['bzip2', ['application/x-bzip2']],
	['cbr', ['application/comicbook+rar']],
	['cbz', ['application/comicbook+zip']],
	['cc', ['text/x-c++src']],
	['cjs', ['text/javascript']],
	['cpp', ['text/x-c++src']],
	['cs', ['text/x-csharp']],
	['diff', ['text/x-diff']],
	['dio', ['application/vnd.jgraph.mxfile']],
	['dotm', ['application/vnd.ms-word.template.macroEnabled.12']],
	['dra', ['application/x-orcad-drawing']],
	['drawio', ['application/vnd.jgraph.mxfile']],
	['dwfx', ['model/vnd.dwfx']],
	['excalidraw', ['application/vnd.excalidraw+json']],
	['flac', ['audio/flac']],
	['fods', ['application/vnd.oasis.opendocument.spreadsheet-flat-xml']],
	['gds', ['application/x-gdsii']],
	['go', ['text/x-go']],
	['gzip', ['application/gzip']],
	['h', ['text/x-h']],
	['hcl', ['text/x-hcl']],
	['hpp', ['text/x-c++hdr']],
	['http', ['text/x-http']],
	['ifc', ['application/p21']],
	['jsonc', ['application/jsonc']],
	['kt', ['text/x-kotlin']],
	['lzma', ['application/x-lzma']],
	['mermaid', ['application/vnd.mermaid', 'text/plain']],
	['mmd', ['application/vnd.mermaid', 'text/plain']],
	['oas', ['application/x-oasis-layout']],
	['oasis', ['application/x-oasis-layout']],
	['ofd', ['application/ofd']],
	['olb', ['application/x-orcad-library']],
	['parquet', ['application/vnd.apache.parquet']],
	['patch', ['text/x-patch']],
	['pcd', ['model/x-pcd']],
	['plantuml', ['text/x-plantuml', 'text/plain']],
	['ply', ['model/ply']],
	['proto', ['application/x-protobuf']],
	['puml', ['text/x-plantuml', 'text/plain']],
	['py', ['text/x-python']],
	['rb', ['text/x-ruby']],
	['react', ['text/x-react']],
	['rs', ['text/x-rust']],
	['sh', ['text/x-shellscript']],
	['shp', ['application/vnd.shp']],
	['sqlite', ['application/vnd.sqlite3']],
	['swift', ['text/x-swift']],
	['tbz', ['application/x-bzip-compressed-tar']],
	['tbz2', ['application/x-bzip-compressed-tar']],
	['tgz', ['application/gzip']],
	['ts', ['text/x-typescript']],
	['tsx', ['text/tsx']],
	['txz', ['application/x-xz-compressed-tar']],
	['typ', ['text/vnd.typst', 'text/plain']],
	['typst', ['text/x-typst', 'text/plain']],
	['tzst', ['application/x-zstd-compressed-tar']],
	['umd', ['application/x-umd']],
	['usd', ['model/vnd.usd']],
	['usdc', ['model/vnd.usdc']],
	['vtk', ['model/vnd.vtk']],
	['vtp', ['model/vnd.vtk']],
	['vue', ['text/x-vue']],
	['webarchive', ['application/x-webarchive']],
	['xar', ['application/x-xar']],
	['xmind', ['application/vnd.xmind.workbook']],
	['xyz', ['model/x-xyz']],
	['yaml', ['application/yaml', 'text/plain']],
	['yml', ['application/yaml', 'text/plain']],
	['zipx', ['application/zip']],
	['zst', ['application/zstd']],
]);

const SECURE_MIME_ALTERNATIVES = new Map([
	['application/javascript', 'text/plain'],
	['application/json', 'text/plain'],
	['application/wasm', 'application/octet-stream'],
	['application/xml', 'text/plain'],
	['image/svg+xml', 'text/plain'],
	['text/html', 'text/plain'],
	['text/javascript', 'text/plain'],
]);

/**
 * Return one canonical Nextcloud extension mapping for every supported format.
 * Runtime registration only installs entries that neither Nextcloud core nor an
 * administrator already defines.
 *
 * @param {string[]} extensions
 * @return {Map<string, string[]>}
 */
export function createMimeTypeMappings(extensions) {
	const mappings = new Map();

	for (const extension of [...extensions].sort()) {
		const override = MIME_OVERRIDES.get(extension);
		const detectedMime = override ? null : lookup(extension);
		const mapping = override
			? [...override]
			: detectedMime
				? [detectedMime]
				: null;

		if (mapping === null) {
			throw new Error(`No MIME type mapping is defined for supported extension: ${extension}`);
		}

		const [mime] = mapping;
		if (typeof mime !== 'string' || !mime.includes('/')) {
			throw new Error(`Invalid MIME type mapping for supported extension ${extension}: ${mime}`);
		}

		if (mapping.length === 1) {
			const secureMime = secureMimeFor(mime);
			if (secureMime !== null && secureMime !== mime) {
				mapping.push(secureMime);
			}
		}

		mappings.set(extension, mapping);
	}

	return mappings;
}

function secureMimeFor(mime) {
	if (SECURE_MIME_ALTERNATIVES.has(mime)) {
		return SECURE_MIME_ALTERNATIVES.get(mime);
	}
	if (mime.endsWith('+json') || mime === 'application/json5' || mime === 'application/jsonc') {
		return 'text/plain';
	}

	return null;
}
