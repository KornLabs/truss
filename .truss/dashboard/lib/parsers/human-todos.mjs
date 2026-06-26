export function parseHumanTodos(lines) {
  const open = [];
  let openCount = 0;
  let closedCount = 0;
  for (const line of lines) {
    // Tolerant separator: em-dash, en-dash or plain hyphen.
    const m = line.match(/^[*-]\s+\[([ x])\]\s+(HT-\d{3})\s*[—–-]\s*(.*)$/i);
    if (m) {
      const checked = m[1].toLowerCase() === 'x';
      if (checked) {
        closedCount++;
      } else {
        openCount++;
        open.push({ id: m[2], text: m[3].trim(), checked: false });
      }
    } else {
      const m2 = line.match(/^[*-]\s+(HT-\d{3})\s*[—–-]\s*(.*)$/i);
      if (m2) {
        openCount++;
        open.push({ id: m2[1], text: m2[2].trim(), checked: false });
      }
    }
  }
  return { open, openCount, closedCount, total: openCount + closedCount };
}
