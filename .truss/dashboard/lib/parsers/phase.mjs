import { parsePhases as mdParsePhases, parsePhaseList } from '../../../lib/md.mjs';
import { parseExitItems } from '../../../lib/render.mjs';
export function parsePhase(lines) {
  const parsed = mdParsePhases(lines);
  const currentId = parsed.frontmatter?.current;
  if (!currentId) return null;
  const def = parsed.defs.get(currentId);
  if (!def) return { current: currentId, position: 0, total: parsed.ordered.length };
  
  const position = parsed.ordered.indexOf(currentId) + 1;
  const exitStr = def.exit || '';
  const exitItems = parseExitItems ? parseExitItems(exitStr) : exitStr.split('\n').filter(Boolean);

  return {
    current: currentId,
    label: def.label || currentId,
    position,
    total: parsed.ordered.length,
    purpose: def.purpose || '',
    behavior: def.behavior || '',
    allowed: def.allowed || '',
    forbidden: def.forbidden || '',
    forbiddenGlobs: parsePhaseList(def['forbidden-globs']),
    exit: exitItems,
    prompts: parsePhaseList(def.prompts)
  };
}
