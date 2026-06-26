export function parseCurrent(lines) {
  const result = { focus: null, next: [], blockers: 'none', recentlyDone: [], updated: null, staleDays: null };
  let currentList = null;
  for (const line of lines) {
    const m = line.match(/^([a-z-]+):\s*(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2].trim();
      if (key === 'focus') { result.focus = val || null; currentList = null; }
      else if (key === 'next') { if (val) result.next.push(val); currentList = result.next; }
      else if (key === 'blockers') { result.blockers = val || 'none'; currentList = null; }
      else if (key === 'recently-done') { if (val) result.recentlyDone.push(val); currentList = result.recentlyDone; }
      else if (key === 'updated') { 
        result.updated = val || null; 
        currentList = null;
        if (val) {
          const t = new Date(val).getTime();
          if (!isNaN(t)) {
            result.staleDays = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
          }
        }
      }
    } else if (currentList && line.startsWith('  - ')) {
      currentList.push(line.replace(/^\s*-\s*/, '').trim());
    } else if (currentList && line.startsWith('- ')) {
      currentList.push(line.replace(/^-\s*/, '').trim());
    }
  }
  return result;
}
