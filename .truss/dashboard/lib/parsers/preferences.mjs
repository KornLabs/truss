import { parseBlocks } from '../../../lib/md.mjs';
import { parsePrefsRows } from '../../../lib/render.mjs';

// Single source of truth for the directives format: parsePrefsRows handles both
// the agent-optimized list (`- key=value :: directive`) and the legacy table.
export function parsePreferences(lines) {
  const blocks = parseBlocks(lines);
  const prefBlock = blocks.get('preferences');
  if (!prefBlock) return [];
  return parsePrefsRows(prefBlock.innerLines);
}
