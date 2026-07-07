/**
 * Node embedding-text composer (f-overlays t-1) — assembles the text that represents a facilitation
 * map node for embedding. Pure: a `MapNode` carries no `label`/`description` (only `key`, `type`, and
 * optional `stage`/`region`/`meta`), so the descriptive signal for a `module` node lives on the
 * registered module (`name` + `description`), read the way `modules/context.ts` reads it. The caller
 * (`embed-sync`) resolves the module info from the registry and passes it in, keeping this function
 * pure and unit-testable without the registry or a DB.
 */

import type { MapNode } from '@/lib/framework/facilitation/map/schema';

/** The registered-module fields that carry a module node's descriptive text. */
export interface NodeModuleInfo {
  name: string;
  description: string;
}

/**
 * Compose the embedding source text for one map node. For a `module` node, `module` supplies the
 * registered module's name + description (the bulk of the signal); every node also contributes its
 * key, type, stage/region, and any string-valued `meta` entries. Returns a newline-joined block.
 */
export function composeNodeText(node: MapNode, module?: NodeModuleInfo): string {
  const parts: string[] = [];

  if (node.type === 'module' && module) {
    parts.push(`Module: ${module.name}`);
    if (module.description.trim().length > 0) parts.push(module.description);
  }

  parts.push(`Node: ${node.key}`);
  parts.push(`Type: ${node.type}`);
  if (node.stage) parts.push(`Stage: ${node.stage}`);
  if (node.region) parts.push(`Region: ${node.region}`);

  // Authored meta is an opaque bag; surface only string values (numbers/objects aren't prose signal).
  if (node.meta) {
    for (const [key, value] of Object.entries(node.meta)) {
      if (typeof value === 'string' && value.trim().length > 0) parts.push(`${key}: ${value}`);
    }
  }

  return parts.join('\n');
}
