import { DEFAULT_RENDERER_DEFINITIONS, DEFAULT_SUPPORTED_EXTENSIONS } from '@file-viewer/core';

// Flyfish 3.1.2 advertises BPMN in its global inventory, but its experimental
// plugin is a separate opt-in entry and is not included in our Full bundle.
const unshippedRendererIds = new Set(['bpmn']);

export const VIEWER_RENDERER_DEFINITIONS = Object.freeze(
  DEFAULT_RENDERER_DEFINITIONS.filter(definition => !unshippedRendererIds.has(definition.id)),
);
const enabledExtensions = new Set(VIEWER_RENDERER_DEFINITIONS.flatMap(definition => definition.extensions));
export const VIEWER_SUPPORTED_EXTENSIONS = Object.freeze(
  DEFAULT_SUPPORTED_EXTENSIONS.filter(extension => enabledExtensions.has(extension)),
);
