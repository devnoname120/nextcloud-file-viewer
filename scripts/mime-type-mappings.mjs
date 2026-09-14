import { lookup } from 'mime-types';

// These overrides either fill gaps in mime-db or resolve extensions whose
// generic database meaning differs from the format rendered by Flyfish.
const MIME_OVERRIDES = new Map([
		['3dm', ['model/vnd.3dm']],
		['3ds', ['model/x-3ds']],
		['abr', ['application/x-photoshop-brush']],
		['aco', ['application/x-photoshop-color-swatch']],
		['ait', ['application/illustrator']],
		['amf', ['application/x-amf']],
		['ar', ['application/x-archive']],
		['ase', ['application/x-adobe-swatch-exchange']],
		['asice', ['application/vnd.etsi.asic-e+zip']],
		['asics', ['application/vnd.etsi.asic-s+zip']],
		['asl', ['application/x-photoshop-style']],
		['avro', ['application/avro']],
	['bash', ['text/x-shellscript']],
		['bdl', ['text/x-bdl']],
		['bin', ['application/x-binary-file', 'application/octet-stream']],
		['brep', ['model/x-brep']],
	['bundle', ['application/x-git-bundle']],
	['bzip2', ['application/x-bzip2']],
	['cbr', ['application/comicbook+rar']],
	['cbz', ['application/comicbook+zip']],
	['cc', ['text/x-c++src']],
		['cjs', ['text/javascript']],
		['cms', ['application/pkcs7-mime']],
		['cmsc', ['application/pkcs7-mime']],
		['cpp', ['text/x-c++src']],
		['cs', ['text/x-csharp']],
		['csh', ['application/x-photoshop-custom-shape']],
		['dcm', ['application/dicom']],
		['dicom', ['application/dicom']],
		['diff', ['text/x-diff']],
	['dio', ['application/vnd.jgraph.mxfile']],
	['dotm', ['application/vnd.ms-word.template.macroEnabled.12']],
	['dra', ['application/x-orcad-drawing']],
	['drawio', ['application/vnd.jgraph.mxfile']],
		['dwfx', ['model/vnd.dwfx']],
		['elf', ['application/x-elf', 'application/octet-stream']],
		['ers', ['application/ers']],
		['exe', ['application/vnd.microsoft.portable-executable', 'application/octet-stream']],
		['excalidraw', ['application/vnd.excalidraw+json']],
	['fb2', ['application/x-fictionbook+xml', 'text/plain']],
	['flac', ['audio/flac']],
		['fods', ['application/vnd.oasis.opendocument.spreadsheet-flat-xml']],
		['fla', ['application/vnd.adobe.flash']],
		['gds', ['application/x-gdsii']],
		['gpg', ['application/pgp-encrypted']],
		['go', ['text/x-go']],
		['grd', ['application/x-photoshop-gradient']],
		['gzip', ['application/gzip']],
	['h', ['text/x-h']],
	['hcl', ['text/x-hcl']],
		['hpp', ['text/x-c++hdr']],
		['hex', ['application/x-binary-hex', 'application/octet-stream']],
	['http', ['text/x-http']],
	['hwp', ['application/x-hwp']],
	['hwpx', ['application/x-hwpx']],
		['ifc', ['application/p21']],
		['icml', ['application/vnd.adobe.incopy-icml+xml']],
		['idml', ['application/vnd.adobe.indesign-idml-package']],
		['idms', ['application/vnd.adobe.indesign-snippet+xml']],
		['indd', ['application/x-indesign']],
		['indt', ['application/x-indesign-template']],
		['inx', ['application/vnd.adobe.indesign-interchange+xml']],
		['jsonc', ['application/jsonc']],
		['jws', ['application/jose']],
	['kt', ['text/x-kotlin']],
		['lzma', ['application/x-lzma']],
		['macho', ['application/x-mach-binary', 'application/octet-stream']],
	['mermaid', ['application/vnd.mermaid', 'text/plain']],
	['mmd', ['application/vnd.mermaid', 'text/plain']],
	['oas', ['application/x-oasis-layout']],
	['oasis', ['application/x-oasis-layout']],
	['ofd', ['application/ofd']],
	['olb', ['application/x-orcad-library']],
	['parquet', ['application/vnd.apache.parquet']],
		['patch', ['text/x-patch']],
		['pat', ['application/x-photoshop-pattern']],
		['pdd', ['image/vnd.adobe.photoshop']],
	['pcd', ['model/x-pcd']],
	['plantuml', ['text/x-plantuml', 'text/plain']],
	['ply', ['model/ply']],
	['proto', ['application/x-protobuf']],
		['puml', ['text/x-plantuml', 'text/plain']],
		['pkcs7', ['application/pkcs7-mime']],
		['psb', ['image/vnd.adobe.photoshop']],
		['psdt', ['image/vnd.adobe.photoshop']],
	['py', ['text/x-python']],
	['rb', ['text/x-ruby']],
	['react', ['text/x-react']],
		['rs', ['text/x-rust']],
		['sce', ['application/vnd.etsi.asic-e+zip']],
		['scs', ['application/vnd.etsi.asic-s+zip']],
	['sh', ['text/x-shellscript']],
	['shp', ['application/vnd.shp']],
	['sqlite', ['application/vnd.sqlite3']],
		['swift', ['text/x-swift']],
	['tbz', ['application/x-bzip-compressed-tar']],
	['tbz2', ['application/x-bzip-compressed-tar']],
	['tgz', ['application/gzip']],
		['ts', ['text/x-typescript']],
		['tsq', ['application/timestamp-query']],
		['tsr', ['application/timestamp-reply']],
		['tst', ['application/timestamp-reply']],
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
	['wp', ['application/vnd.wordperfect']],
	['wp5', ['application/vnd.wordperfect']],
	['wp6', ['application/vnd.wordperfect']],
		['xar', ['application/x-xar']],
		['xd', ['application/vnd.adobe.xd']],
		['xfl', ['application/vnd.adobe.xfl+xml']],
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
