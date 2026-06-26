import { parsePhases as mdParsePhases } from '../../../lib/md.mjs';
export function parsePhases(lines) {
  const parsed = mdParsePhases(lines);
  const phasesList = [];
  for (const id of parsed.ordered) {
    phasesList.push({ id, label: parsed.defs.get(id)?.label || id, current: parsed.frontmatter?.current === id });
  }
  return phasesList;
}
