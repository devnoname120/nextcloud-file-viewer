export const FORMAT_GROUPS = Object.freeze([
  group('word', 'Word', ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot']),
  group('compatible-documents', 'Compatible documents', ['rtf', 'odt']),
  group('excel', 'Excel', ['xlsx', 'xltx']),
  group('excel-compatible', 'Excel-compatible', ['xlsm', 'xlsb', 'xls', 'xlt', 'xltm', 'csv', 'ods', 'fods', 'numbers']),
  group('powerpoint', 'PowerPoint', ['pptx', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm', 'odp']),
  group('pdf', 'PDF', ['pdf']),
  group('ofd', 'OFD', ['ofd']),
  group('typst', 'Typst', ['typ', 'typst']),
  group('archives', 'Archives', [
    'zip',
    'zipx',
    '7z',
    'rar',
    'tar',
    'gz',
    'gzip',
    'tgz',
    'bz2',
    'bzip2',
    'xz',
    'zst',
    'cab',
    'iso',
    'jar',
    'apk',
    'cbz',
    'cbr',
    'ar',
    'cpio',
    'ear',
    'lha',
    'lzh',
    'lzma',
    'tbz',
    'tbz2',
    'txz',
    'tzst',
    'war',
    'xar',
  ]),
  group('email', 'Email', ['eml', 'msg', 'mbox']),
  group('eda', 'EDA', ['olb', 'dra', 'gds', 'oas', 'oasis']),
  group('cad', 'CAD', ['dwg', 'dxf', 'dwf', 'dwfx', 'xps']),
  group('geospatial-data', 'Geospatial data', ['geojson', 'kml', 'gpx', 'shp']),
  group('3d-models', '3D models', [
    'glb',
    'gltf',
    'obj',
    'stl',
    'ply',
    'fbx',
    'dae',
    '3ds',
    '3mf',
    'amf',
    'usd',
    'usda',
    'usdc',
    'usdz',
    'kmz',
    'pcd',
    'wrl',
    'vrml',
    'xyz',
    'vtk',
    'vtp',
    'step',
    'stp',
    'iges',
    'igs',
    'ifc',
    '3dm',
    'brep',
  ]),
  group('xmind-mind-maps', 'XMind mind maps', ['xmind']),
  group('excalidraw', 'Excalidraw', ['excalidraw']),
  group('drawio', 'draw.io', ['drawio', 'dio']),
  group('mermaid', 'Mermaid', ['mermaid', 'mmd']),
  group('plantuml', 'PlantUML', ['plantuml', 'puml']),
  group('epub', 'EPUB', ['epub']),
  group('umd-ebook', 'UMD ebook', ['umd']),
  group('markdown', 'Markdown', ['md', 'markdown']),
  group('images', 'Images', ['gif', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'png', 'svg', 'webp', 'avif', 'ico', 'heic', 'heif', 'jxl']),
  group('source-and-text', 'Source and text', [
    'txt',
    'json',
    'jsonc',
    'json5',
    'ipynb',
    'js',
    'mjs',
    'cjs',
    'css',
    'java',
    'py',
    'html',
    'htm',
    'jsx',
    'ts',
    'tsx',
    'xml',
    'log',
    'vue',
    'yaml',
    'yml',
    'toml',
    'ini',
    'proto',
    'hcl',
    'tex',
    'gv',
    'http',
    'sh',
    'bash',
    'sql',
    'go',
    'rs',
    'rb',
    'swift',
    'kt',
    'react',
    'php',
    'c',
    'cpp',
    'cc',
    'h',
    'hpp',
    'cs',
    'diff',
    'patch',
    'bundle',
    'bdl',
  ]),
  group('audio', 'Audio', ['mp3', 'mpeg', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba', 'midi', 'mid']),
  group('video', 'Video', ['mp4', 'webm', 'm3u8']),
  group('fonts-design-assets-and-data', 'Fonts, design assets, and data', [
    'ttf',
    'otf',
    'woff',
    'woff2',
    'psd',
    'ai',
    'eps',
    'sqlite',
    'wasm',
    'parquet',
    'avro',
    'webarchive',
    'xara',
  ]),
]);

export function createMimeGroups(supportedMimes, mimesByExtension) {
  const supportedMimeSet = new Set(supportedMimes);
  const assignedMimes = new Set();
  const mimeGroups = FORMAT_GROUPS
    .map(formatGroup => {
      const mimes = unique(
        formatGroup.extensions.flatMap(extension => mimesByExtension[extension] || []),
      )
        .filter(mime => supportedMimeSet.has(mime))
        .filter(mime => {
          if (assignedMimes.has(mime)) {
            return false;
          }
          assignedMimes.add(mime);
          return true;
        });

      return {
        ...formatGroup,
        mimes,
      };
    })
    .filter(formatGroup => formatGroup.mimes.length > 0);

  const fallbackMimes = supportedMimes.filter(mime => !assignedMimes.has(mime));
  if (fallbackMimes.length > 0) {
    mimeGroups.push({
      id: 'generic-fallback',
      label: 'Generic fallback',
      extensions: [],
      extensionText: 'MIME types registered without a specific extension mapping',
      searchText: 'generic fallback MIME types registered without a specific extension mapping',
      mimes: fallbackMimes,
    });
  }

  return mimeGroups;
}

export function filterMimeGroups(mimeGroups, filter) {
  const normalizedFilter = filter.trim().toLowerCase();
  if (normalizedFilter === '') {
    return mimeGroups;
  }

  return mimeGroups
    .map(formatGroup => {
      if (formatGroup.searchText.includes(normalizedFilter)) {
        return formatGroup;
      }

      return {
        ...formatGroup,
        mimes: formatGroup.mimes.filter(mime => mime.toLowerCase().includes(normalizedFilter)),
      };
    })
    .filter(formatGroup => formatGroup.mimes.length > 0);
}

export function flattenMimeGroups(mimeGroups) {
  return mimeGroups.flatMap(formatGroup => formatGroup.mimes);
}

function group(id, label, extensions) {
  const extensionText = extensions.map(extension => `.${extension}`).join(', ');

  return {
    id,
    label,
    extensions,
    extensionText,
    searchText: `${label} ${extensions.join(' ')} ${extensionText}`.toLowerCase(),
  };
}

function unique(values) {
  return [...new Set(values)];
}
