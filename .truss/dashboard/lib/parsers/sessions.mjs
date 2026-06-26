import { parseFrontmatter } from '../../../lib/md.mjs';
export function parseSession(lines, filename) {
  const { data } = parseFrontmatter(lines);
  const done = [];
  let next = null;
  let inDone = false;
  for (const line of lines) {
    if (line.match(/^##\s+Done/i)) { inDone = true; continue; }
    if (line.match(/^##\s+Next/i)) {
      inDone = false;
      continue;
    }
    if (inDone && line.trim().startsWith('-')) {
      done.push(line.replace(/^\s*-\s*/, '').trim());
    }
  }
  let inNext = false;
  for (const line of lines) {
    if (line.match(/^##\s+Next/i)) { inNext = true; continue; }
    if (inNext && line.trim()) { next = line.trim(); break; }
  }
  
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = m ? m[1] : null;
  
  return { filename, date, phase: data.phase || null, done, next };
}
