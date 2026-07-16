import { parseTableRow } from '../../../lib/md.mjs';

// Parse a rendered "~Tokens" cell (`~340`, `~1.2k`, `~12k`) back to a number
// for totals. `—` (map.md itself, bulk-data / overflow rows) and old-format
// maps without the column yield null.
export function parseTokenCell(cell) {
  if (!cell) return null;
  const m = cell.trim().match(/^~([\d.]+)(k?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2] ? n * 1000 : n);
}

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
        currentCat.files.push({
          file: row[0],
          title: row[1],
          description: row[2] || '',
          // 4th column since the V-02 read-cost feature; absent in older maps.
          tokensRaw: row[3] || null,
          tokens: parseTokenCell(row[3]),
        });
      }
    }
  }
  return { categories };
}
