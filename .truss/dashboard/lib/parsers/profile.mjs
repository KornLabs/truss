export function parseProfile(lines) {
  const result = { name: null, language: null, pmMethod: null, tools: [], style: null };
  let currentSection = null;
  let styleLines = [];
  for (const line of lines) {
    const mKey = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (mKey && (!currentSection || currentSection === 'project')) {
      const k = mKey[1].toLowerCase();
      if (k === 'name') result.name = mKey[2].trim();
      if (k === 'language') result.language = mKey[2].trim();
      if (k === 'pm-method') result.pmMethod = mKey[2].trim();
    }
    
    const mSec = line.match(/^##\s+(.*)$/);
    if (mSec) {
      currentSection = mSec[1].toLowerCase();
      continue;
    }
    
    if (currentSection && currentSection.includes('tools')) {
      if (line.trim().startsWith('-')) result.tools.push(line.replace(/^\s*-\s*/, '').trim());
    } else if (currentSection && (currentSection.includes('style') || currentSection.includes('moral'))) {
      if (line.trim() !== '') styleLines.push(line);
    }
  }
  if (styleLines.length > 0) result.style = styleLines.join('\n').trim();
  return result;
}
