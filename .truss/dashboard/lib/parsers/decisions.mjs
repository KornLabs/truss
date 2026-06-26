export function parseDecisions(lines) {
  const recent = [];
  let totalCount = 0;
  let currentId = null;
  for (const line of lines) {
    // Tolerant separator: em-dash, en-dash or plain hyphen (humans type "-").
    const m = line.match(/^##\s+(D-\d{3})\s+[—–-]\s+(.*)$/);
    if (m) {
      currentId = m[1];
      totalCount++;
      recent.push({ id: currentId, title: m[2].trim(), date: null, supersededBy: null });
    } else if (currentId) {
      const entry = recent[recent.length - 1];
      const d = line.match(/^Date:\s*(.*)$/i);
      if (d) entry.date = d[1].trim();
      const s = line.match(/^Superseded-by:\s*(.*)$/i);
      if (s) entry.supersededBy = s[1].trim();
    }
  }
  recent.sort((a, b) => b.id.localeCompare(a.id));
  return { recent: recent.slice(0, 5), totalCount };
}
