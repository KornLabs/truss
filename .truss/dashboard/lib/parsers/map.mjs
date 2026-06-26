import { parseTableRow } from '../../../lib/md.mjs';
export function parseMap(lines) {
  const categories = [];
  let currentCat = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      currentCat = { name: m[1].trim(), files: [] };
      categories.push(currentCat);
    } else if (currentCat) {
      const row = parseTableRow(line);
      if (row && row.length >= 2 && row[0].toLowerCase() !== 'file') {
        currentCat.files.push({ file: row[0], title: row[1], description: row[2] || '' });
      }
    }
  }
  return { categories };
}
